@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%..\.."
cd /d "%ROOT%"

echo Stopping listeners on ports 8000 and 5173...
powershell -NoProfile -Command "foreach ($p in 8000,5173) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
timeout /t 2 /nobreak >nul

if exist "%ROOT%\venv\Scripts\activate.bat" (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && call venv\Scripts\activate.bat && python manage.py runserver"
) else (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && python manage.py runserver"
)
start "EcoThrift Vite (staff)" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"

echo.
echo Started staff dashboard in new windows:
echo   API:              http://localhost:8000/
echo   Staff dashboard:  http://localhost:5173/
echo.
echo Phone / LAN testing:  scripts\dev\start_mobile_dashboard.bat
echo.
endlocal
