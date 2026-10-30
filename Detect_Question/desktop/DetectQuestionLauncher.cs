using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;

// GUI-subsystem one-file launcher. Its resources are injected at build time:
// the backend executable and its already configured .env file.
internal static class DetectQuestionLauncher
{
    private const string BackendResource = "DetectQuestionBackend.exe";
    private const string ConfigResource = "AppConfig.env";

    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            if (Array.IndexOf(args, "--logs") >= 0)
            {
                OpenLiveLogWindow();
                return;
            }

            var backendBytes = ReadResource(BackendResource);
            var runtimeDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DetectQuestionBackend",
                ShortHash(backendBytes));
            Directory.CreateDirectory(runtimeDirectory);

            var backendPath = Path.Combine(runtimeDirectory, "DetectQuestionBackend.exe");
            var configPath = Path.Combine(runtimeDirectory, ".env");
            WriteBytesIfMissing(backendBytes, backendPath);
            WriteResource(ConfigResource, configPath);

            var stopOnly = Array.IndexOf(args, "--stop") >= 0;
            var profileCount = stopOnly ? 1 : GetProfileCount(args);
            var process = Process.Start(new ProcessStartInfo
            {
                FileName = backendPath,
                Arguments = stopOnly ? "--stop" : "--standalone --profiles " + profileCount,
                WorkingDirectory = runtimeDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            if (stopOnly && process != null) process.WaitForExit(8000);
        }
        catch (Exception error)
        {
            // The launcher intentionally has no visible UI, but failures must
            // remain diagnosable from the same live log used by the backend.
            AppendLauncherError(error);
        }
    }

    private static int GetProfileCount(string[] args)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] == "--profiles" && i + 1 < args.Length)
            {
                int requested;
                if (Int32.TryParse(args[i + 1], out requested)) return Math.Max(1, Math.Min(5, requested));
            }
        }

        return 1;
    }

    private static void OpenLiveLogWindow()
    {
        var logDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DetectQuestionBackend");
        Directory.CreateDirectory(logDirectory);
        var logPath = Path.Combine(logDirectory, "standalone.log");
        if (!File.Exists(logPath)) File.WriteAllText(logPath, "");

        var escapedPath = logPath.Replace("'", "''");
        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoExit -ExecutionPolicy Bypass -Command \"Get-Content -LiteralPath '" + escapedPath + "' -Tail 80 -Wait\"",
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Normal
        });
    }

    private static void AppendLauncherError(Exception error)
    {
        try
        {
            var directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DetectQuestionBackend");
            Directory.CreateDirectory(directory);
            var message = (error.GetType().Name + ": " + error.Message)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", " ")
                .Replace("\n", " ");
            var line = "{\"timestamp\":\"" + DateTime.UtcNow.ToString("o") +
                "\",\"event\":\"launcher.error\",\"message\":\"" + message + "\"}" + Environment.NewLine;
            File.AppendAllText(Path.Combine(directory, "standalone.log"), line);
        }
        catch
        {
            // Logging must not turn a startup failure into a second failure.
        }
    }

    private static string ShortHash(byte[] bytes)
    {
        using (var sha = SHA256.Create())
        {
            var hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "");
            return hash.Substring(0, 16);
        }
    }

    private static byte[] ReadResource(string resourceName)
    {
        using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
        {
            if (source == null) throw new InvalidOperationException("Missing embedded application resource.");
            using (var output = new MemoryStream())
            {
                source.CopyTo(output);
                return output.ToArray();
            }
        }
    }

    private static void WriteBytesIfMissing(byte[] bytes, string destination)
    {
        if (!File.Exists(destination)) File.WriteAllBytes(destination, bytes);
    }

    private static void WriteResource(string resourceName, string destination)
    {
        File.WriteAllBytes(destination, ReadResource(resourceName));
    }
}
