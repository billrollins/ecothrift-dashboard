@echo off
REM Full local stack: Django + staff dashboard + public site.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Target All %*
exit /b %ERRORLEVEL%
