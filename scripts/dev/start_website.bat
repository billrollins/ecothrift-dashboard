@echo off
REM Public storefront only (Django API + frontend-public on :5174).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Target Public %*
exit /b %ERRORLEVEL%
