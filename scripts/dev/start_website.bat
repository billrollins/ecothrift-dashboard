@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%..\.."
cd /d "%ROOT%"

echo Stopping processes on ports 8000 and 5174...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do (
  taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do (
  taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak >nul

if exist "%ROOT%\venv\Scripts\activate.bat" (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && call venv\Scripts\activate.bat && python manage.py runserver"
) else (
  start "EcoThrift Django" cmd /k "cd /d "%ROOT%" && python manage.py runserver"
)
start "EcoThrift Vite (public)" cmd /k "cd /d "%ROOT%\frontend-public" && npm run dev"

echo.
echo Started public website in new windows:
echo   API:          http://localhost:8000/
echo   Public site:  http://localhost:5174/
echo.
endlocal
