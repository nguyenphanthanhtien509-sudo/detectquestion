using System;
using System.IO;
using System.IO.Ports;
using System.Threading;

// Windows CDC bridge. Use bounded synchronous SerialPort reads instead of
// the native addon's overlapped read path which stalls this S3/Windows pair.
internal static class SerialBridge
{
    private static int Main(string[] args)
    {
        if (args.Length != 1) return 2;
        using (var port = new SerialPort(args[0], 115200))
        {
            port.DtrEnable = true;
            port.RtsEnable = false;
            port.Handshake = Handshake.None;
            port.ReadTimeout = 250;
            port.WriteTimeout = 3000;
            port.ReadBufferSize = 32768;
            port.WriteBufferSize = 32768;
            try
            {
                port.Open();
                var output = Console.OpenStandardOutput();
                Console.WriteLine("{\"serialBridge\":\"ready\"}");
                Console.Out.Flush();
                var receive = new Thread(() =>
                {
                    var buffer = new byte[4096];
                    try
                    {
                        while (port.IsOpen)
                        {
                            try
                            {
                                var count = port.Read(buffer, 0, Math.Max(1, Math.Min(buffer.Length, port.BytesToRead)));
                                output.Write(buffer, 0, count);
                                output.Flush();
                            }
                            catch (TimeoutException) { }
                        }
                    }
                    catch (Exception)
                    {
                        // Unplugged USB must close the helper so the parent
                        // rejects pending requests and can reconnect later.
                        Environment.Exit(3);
                    }
                });
                receive.IsBackground = true;
                receive.Start();
                var input = Console.OpenStandardInput();
                var bytes = new byte[4096];
                int length;
                while ((length = input.Read(bytes, 0, bytes.Length)) > 0)
                {
                    // The firmware drains each ACK and has a bounded RX
                    // queue. One protocol frame is in flight at a time;
                    // USB backpressure can pace these writes without sleeps.
                    port.Write(bytes, 0, length);
                }
                port.Close();
                return 0;
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.Message);
                return 1;
            }
        }
    }
}
