@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo [%~nx0] Project: %CD%
echo.

if exist "venv\Scripts\activate.bat" (
  echo venv already exists — skipping python -m venv.
) else (
  echo Creating venv...
  python -m venv venv
  if errorlevel 1 (
    echo Failed to create venv. Is Python on PATH?
    pause
    exit /b 1
  )
)

call venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
  echo pip install failed.
  pause
  exit /b 1
)

echo.
echo Done. Use pip_install_requirements.bat after editing requirements.txt.
echo Use start_jupyter.bat to open the notebook.
pause
