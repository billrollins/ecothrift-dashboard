@echo off
REM Forwarding wrapper — use scripts\deploy\env\sync_to_heroku.bat
call "%~dp0env\sync_to_heroku.bat" %*
