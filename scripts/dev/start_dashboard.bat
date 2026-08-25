@echo off
REM Staff dashboard only: Django API + localhost Vite on :5173.
REM No public site, no LAN/mobile HTTPS. Use start_mobile_dashboard.bat or start_website.bat for those.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Target Staff -Http %*
exit /b %ERRORLEVEL%
