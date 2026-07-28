@echo off
setlocal EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%..\.."
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

REM Bind Vite on all interfaces so phones on the same Wi-Fi can reach it.
REM API calls still go through the Vite proxy to Django on this PC.
REM HTTPS is required by Android/iOS browsers for the live barcode camera.
REM Use a helper bat so nested quotes do not drop ECOTHRIFT_MOBILE_HTTPS.
start "EcoThrift Vite (mobile HTTPS)" cmd /k ""%SCRIPT_DIR%start_mobile_vite.bat" %LAN_IP%"

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
echo This makes the page a secure camera context; Scan then opens one live viewfinder.
echo.
echo Phone and PC must be on the same Wi-Fi. If the page does not load, allow
echo Node.js / port 5173 through Windows Firewall ^(Private networks^).
echo.
echo Delivery QA data ^(local DB only — never production^):
echo   scripts\dev\seed_delivery_test_dataset.bat
echo   Then open Field Days — seeded stops look like normal deliveries.
echo.
endlocal
