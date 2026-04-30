@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

if not exist "venv\Scripts\activate.bat" (
  echo No venv found. Run setup_initial.bat first.
  pause
  exit /b 1
)

call venv\Scripts\activate.bat
pip install -r requirements.txt
if errorlevel 1 (
  echo pip install failed.
  pause
  exit /b 1
)

echo Done.
pause
