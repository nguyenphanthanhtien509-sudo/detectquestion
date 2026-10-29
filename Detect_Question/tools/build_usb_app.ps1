$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root 'release\usb-preview'
$backendPath = Join-Path $outputDirectory 'DetectQuestionBackend.exe'
$launcherPath = Join-Path $outputDirectory 'DetectQuestion.exe'
$configPath = Join-Path $outputDirectory '.env'
$compilerPath = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
& (Join-Path $PSScriptRoot 'generate_extension_parity_bundle.ps1')
& (Join-Path $PSScriptRoot 'build_serial_bridge.ps1')
& (Join-Path $root 'node_modules\.bin\pkg.cmd') --config (Join-Path $root 'package.json') --no-bytecode --public --public-packages '*' --target node18-win-x64 --output $backendPath (Join-Path $root 'desktop\DetectQuestionBackend.js')
if ($LASTEXITCODE -ne 0) { throw 'USB backend build failed.' }
# This build intentionally embeds no provider, Wi-Fi or Supabase credentials.
# Preserve a locally edited preview config when rebuilding.
if (-not (Test-Path -LiteralPath $configPath)) {
    $token = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $configText = @(
        'AI_TRANSPORT=esp32',
        'ORCHESTRATOR_EMERGENCY_MODEL=gemini-2.5-flash-lite',
        'ORCHESTRATOR_URL=http://127.0.0.1:8787',
        "ORCHESTRATOR_AUTH_TOKEN=$token",
        'ORCHESTRATOR_GLOBAL_TIMEOUT_MS=120000',
        'ORCHESTRATOR_INITIAL_PRIMARY_TIMEOUT_MS=60000',
        'ORCHESTRATOR_INITIAL_MAX_BACKUPS=0',
        'ORCHESTRATOR_CRITIC_PRIMARY_TIMEOUT_MS=60000',
        'ORCHESTRATOR_CRITIC_MAX_BACKUPS=0',
        'ORCHESTRATOR_BACKWARD_PRIMARY_TIMEOUT_MS=30000',
        'ORCHESTRATOR_BACKWARD_BACKUP_TIMEOUT_MS=15000',
        'ORCHESTRATOR_BACKWARD_MAX_BACKUPS=1',
        'ORCHESTRATOR_SINGLE_MODEL_TIMEOUT_MS=60000'
    ) -join "`n"
    [IO.File]::WriteAllText($configPath, $configText, [Text.UTF8Encoding]::new($false))
}
& $compilerPath /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:$launcherPath "/resource:$backendPath,DetectQuestionBackend.exe" "/resource:$configPath,AppConfig.env" (Join-Path $root 'desktop\DetectQuestionLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'USB launcher build failed.' }
& $backendPath --usb-diagnostics
if ($LASTEXITCODE -ne 0) { throw 'Packaged SerialPort native binding failed.' }
Write-Output "Built USB preview: $outputDirectory"
