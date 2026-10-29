@echo off
for %%I in ("%~dp0..") do set "EXT_DIR=%%~fI"

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" set "CHROME=chrome.exe"

echo ================================================================
echo   [1/3] DONG BO CAU HINH TU .ENV (REASONING & MODELS)...
echo ================================================================
if exist "%EXT_DIR%\tools\sync_env.js" (
  node "%EXT_DIR%\tools\sync_env.js"
)

echo ================================================================
echo   [2/3] DANG DONG TAT CA TIEN TRINH CHROME CU...
echo ================================================================
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo ================================================================
echo   [3/3] DANG MO LAI CHROME VOI EXTENSION VA KHOI PHUC TAB...
echo ================================================================
start "" "%CHROME%" --load-extension="%EXT_DIR%" --restore-last-session "https://utexlms.hcmute.edu.vn"

timeout /t 1 /nobreak >nul
exit
