$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $root 'desktop\usb\bin'
$sourcePath = Join-Path $root 'desktop\usb\SerialBridge.cs'
$compilerPath = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$outputPath = Join-Path $outputDirectory 'SerialBridge.exe'
& $compilerPath /nologo /target:exe /optimize+ "/out:$outputPath" $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Windows Serial bridge compilation failed.' }
