@echo off
REM Stops this project's dev servers only: ports 8000 / 5173 / 5174 (house port registry).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helpers\dev.ps1" -Stop
exit /b %ERRORLEVEL%
