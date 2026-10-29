$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$backend = Join-Path $release 'DetectQuestionBackend.exe'
$config = Join-Path $root '.env'
$launcherSource = Join-Path $root 'desktop\DetectQuestionLauncher.cs'
$output = Join-Path $release 'DetectQuestion.exe'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $backend)) { throw 'Build DetectQuestionBackend.exe first.' }
if (-not (Test-Path -LiteralPath $config)) { throw 'A configured root .env is required.' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows C# compiler was not found.' }

& $compiler /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:$output "/resource:$backend,DetectQuestionBackend.exe" "/resource:$config,AppConfig.env" $launcherSource
if ($LASTEXITCODE -ne 0) { throw 'One-file launcher build failed.' }
# The launcher embeds the backend as a resource. Keep release/ genuinely
# one-file so the user only ever needs to distribute DetectQuestion.exe.
Remove-Item -LiteralPath $backend -Force
Write-Output "Built $output"
