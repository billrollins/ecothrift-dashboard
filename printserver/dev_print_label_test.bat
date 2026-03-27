@echo off
setlocal
set "PSDIR=%~dp0"
cd /d "%PSDIR%"

if exist "%PSDIR%..\venv\Scripts\python.exe" (
  set "PY=%PSDIR%..\venv\Scripts\python.exe"
) else if exist "%PSDIR%..\env\Scripts\python.exe" (
  set "PY=%PSDIR%..\env\Scripts\python.exe"
) else (
  set "PY=python"
)

"%PY%" "%PSDIR%scripts\print_label_local_test.py" %*
set "EC=%ERRORLEVEL%"
if %EC% neq 0 pause
endlocal & exit /b %EC%
