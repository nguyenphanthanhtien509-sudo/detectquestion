# Script tu dong tai va cai dat Extension Detect_Question sieu toc
$ErrorActionPreference = 'Stop'

# Chon thu muc Desktop cua nguoi dung de luon co quyen ghi va de tim
$targetBase = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $targetBase)) {
    $targetBase = $env:USERPROFILE
}

Set-Location $targetBase

Write-Host ">>> Dang tai Extension moi nhat tu GitHub..." -ForegroundColor Cyan

$zipUrl = "https://github.com/buitanphat247/Question_Detect/archive/refs/heads/main.zip"
$tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "detect_qa_temp.zip"

Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip
Expand-Archive -Path $tempZip -DestinationPath $targetBase -Force

$finalDir = Join-Path $targetBase "Detect_Question"
$extractedDir = Join-Path $targetBase "Question_Detect-main"

if (Test-Path $finalDir) {
    Remove-Item $finalDir -Recurse -Force
}

if (Test-Path $extractedDir) {
    Rename-Item $extractedDir "Detect_Question"
}

if (Test-Path $tempZip) {
    Remove-Item $tempZip -Force
}

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host "TAI THANH CONG RA MAN HINH DESKTOP: $finalDir" -ForegroundColor Green
Write-Host "Mo chrome://extensions -> Bat Developer mode -> Chon Load Unpacked" -ForegroundColor Yellow
Write-Host "=======================================================`n" -ForegroundColor Green

# Tu dong mo thu muc ra tren man hinh
explorer.exe $finalDir
