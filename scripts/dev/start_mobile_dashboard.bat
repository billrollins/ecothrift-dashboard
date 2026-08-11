@echo off
REM Staff dashboard only (LAN HTTPS default). Use start_all.bat for www too.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Target Staff -Mobile %*
exit /b %ERRORLEVEL%
