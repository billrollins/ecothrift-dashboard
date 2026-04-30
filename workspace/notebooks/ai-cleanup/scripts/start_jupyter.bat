@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

if not exist "venv\Scripts\activate.bat" (
  echo No venv found. Run setup_initial.bat first.
  pause
  exit /b 1
)

call venv\Scripts\activate.bat
jupyter notebook notebooks\cleanup.ipynb
