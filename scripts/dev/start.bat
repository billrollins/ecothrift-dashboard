@echo off
REM Full local stack: Django + staff dashboard + public site (8000 / 5173 / 5174).
REM Variants: start_dashboard.bat (staff, plain HTTP), start_mobile_dashboard.bat (phone HTTPS), start_website.bat (public).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helpers\dev.ps1" -Target All %*
exit /b %ERRORLEVEL%
