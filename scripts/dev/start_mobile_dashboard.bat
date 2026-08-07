@echo off
REM Kept for muscle memory - dev.bat -Mobile is the real entry point now.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Mobile %*
exit /b %ERRORLEVEL%
