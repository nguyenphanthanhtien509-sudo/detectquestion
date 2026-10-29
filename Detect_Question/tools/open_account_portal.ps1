$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$uri = 'http://127.0.0.1:4173'
try { Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 1 | Out-Null } catch {
  Start-Process -FilePath 'node.exe' -ArgumentList 'account-portal/local-server.js' -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Milliseconds 700
}
Start-Process $uri
