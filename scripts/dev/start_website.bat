@echo off
REM Kept for muscle memory - dev.bat is the real entry point now.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
exit /b %ERRORLEVEL%
