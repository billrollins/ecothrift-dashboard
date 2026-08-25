@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0helpers\0_pull_prod_to_local.ps1"
exit /b %ERRORLEVEL%
