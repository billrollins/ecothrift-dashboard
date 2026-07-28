@echo off
REM Launched by start_mobile_dashboard.bat — keep HTTPS/env logic here to avoid
REM nested-quote breakage in `start cmd /k "..."`.
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%..\.."
cd /d "%ROOT%\frontend"

set "ECOTHRIFT_MOBILE_HTTPS=1"
if not "%~1"=="" set "ECOTHRIFT_MOBILE_LAN_IP=%~1"

echo ECOTHRIFT_MOBILE_HTTPS=%ECOTHRIFT_MOBILE_HTTPS%
if defined ECOTHRIFT_MOBILE_LAN_IP echo ECOTHRIFT_MOBILE_LAN_IP=%ECOTHRIFT_MOBILE_LAN_IP%
echo Starting Vite with HTTPS on 0.0.0.0:5173 ...
echo.

call npm run dev:mobile
endlocal
