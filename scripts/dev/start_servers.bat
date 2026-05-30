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
start "EcoThrift Vite (staff)" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"
start "EcoThrift Vite (public)" cmd /k "cd /d "%ROOT%\frontend-public" && npm run dev"

echo.
echo Started Django + staff dashboard + public storefront in new windows:
echo   API:              http://localhost:8000/
echo   Staff dashboard:  http://localhost:5173/
echo   Public site:      http://localhost:5174/
echo.
endlocal
