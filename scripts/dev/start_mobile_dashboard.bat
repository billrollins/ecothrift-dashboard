@echo off
setlocal EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%..\.."

REM Child window entry: start_mobile_dashboard.bat --vite-mobile [LAN_IP]
if /i "%~1"=="--vite-mobile" goto :vite_mobile

cd /d "%ROOT%"

echo Stopping listeners on ports 8000 and 5173...
powershell -NoProfile -Command "foreach ($p in 8000,5173) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
timeout /t 2 /nobreak >nul

REM Detect a LAN IPv4 (skip loopback / APIPA) for the phone URL.
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object { if ($_.InterfaceAlias -match 'Wi-?Fi|Wireless') { 0 } elseif ($_.InterfaceAlias -match 'Ethernet') { 1 } else { 2 } }, IPAddress; if ($addrs) { $addrs[0].IPAddress }"`) do set "LAN_IP=%%i"

if exist "%ROOT%\venv\Scripts\activate.bat" (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && call venv\Scripts\activate.bat && python manage.py runserver 127.0.0.1:8000"
) else (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && python manage.py runserver 127.0.0.1:8000"
)

REM Self-reinvoke so ECOTHRIFT_MOBILE_* env vars survive nested quotes.
start "EcoThrift Vite (mobile HTTPS)" cmd /k ""%~f0" --vite-mobile %LAN_IP%"

echo.
echo Started mobile-ready staff dashboard in new windows:
echo   API (this PC only):  http://127.0.0.1:8000/
echo   PC browser:          https://localhost:5173/
if defined LAN_IP (
  echo   Phone ^(same Wi-Fi^):  https://!LAN_IP!:5173/
  echo   Field deliveries:      https://!LAN_IP!:5173/pos/deliveries
) else (
  echo   Phone ^(same Wi-Fi^):  https://^<your-pc-lan-ip^>:5173/
  echo   ^(Could not auto-detect LAN IP — run ipconfig and use your Wi-Fi IPv4.^)
)
echo.
echo First phone visit: accept the local development certificate warning once.
echo Phone and PC must be on the same Wi-Fi. Allow Node.js / port 5173 through
echo Windows Firewall ^(Private networks^) if the page does not load.
echo.
endlocal
exit /b 0

:vite_mobile
cd /d "%ROOT%\frontend"
set "ECOTHRIFT_MOBILE_HTTPS=1"
if not "%~2"=="" set "ECOTHRIFT_MOBILE_LAN_IP=%~2"
echo ECOTHRIFT_MOBILE_HTTPS=%ECOTHRIFT_MOBILE_HTTPS%
if defined ECOTHRIFT_MOBILE_LAN_IP echo ECOTHRIFT_MOBILE_LAN_IP=%ECOTHRIFT_MOBILE_LAN_IP%
echo Starting Vite with HTTPS on 0.0.0.0:5173 ...
echo.
call npm run dev:mobile
endlocal
exit /b %ERRORLEVEL%
