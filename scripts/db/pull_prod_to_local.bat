@echo off
REM Production schema ecothrift ONLY -> local_shared (other schemas untouched). Dumps: workspace\db\backups\
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helpers\pull_prod_to_local.ps1"
exit /b %ERRORLEVEL%
