@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%..\.."
cd /d "%ROOT%"

call "%SCRIPT_DIR%kill_servers.bat"
timeout /t 2 /nobreak >nul

if exist "%ROOT%\venv\Scripts\activate.bat" (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && call venv\Scripts\activate.bat && python manage.py runserver"
) else (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && python manage.py runserver"
)
start "EcoThrift Vite" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"

echo Started Django (port 8000) and Vite (port 5173) in new windows.
endlocal
