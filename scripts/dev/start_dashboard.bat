@echo off
REM Staff dashboard only (Django API + frontend on :5173). Use start_all.bat for www too.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Target Staff %*
exit /b %ERRORLEVEL%
