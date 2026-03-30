@echo off
REM Same as workspace/receipt_printer/print_showcase_scale_sweep.bat — run from here with: .\print_showcase_scale_sweep.bat
REM Optional: --sweep-scales 1 2 3 4 5 6 7 8

setlocal
set "PSDIR=%~dp0.."
cd /d "%PSDIR%"

if exist "%PSDIR%\..\venv\Scripts\python.exe" (
  set "PY=%PSDIR%\..\venv\Scripts\python.exe"
) else if exist "%PSDIR%\..\env\Scripts\python.exe" (
  set "PY=%PSDIR%\..\env\Scripts\python.exe"
) else (
  set "PY=python"
)

"%PY%" "%PSDIR%\scripts\print_receipt_template_batch.py" --sweep-third-receipt %*
set "EC=%ERRORLEVEL%"
if %EC% neq 0 pause
endlocal & exit /b %EC%
