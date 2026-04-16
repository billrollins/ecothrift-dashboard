@echo off
setlocal
cd /d "%~dp0..\.."
python scripts\deploy\sync_env_to_heroku.py %*
exit /b %ERRORLEVEL%
