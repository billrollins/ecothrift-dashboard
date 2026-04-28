@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - DEPLOY (YOLO)
echo   No confirmations — same as:
echo     2_push_github.bat then 3_push_heroku.bat
echo ========================================
echo.

call "%~dp02_push_github.bat" --called
set "RC=!errorlevel!"
if !RC! neq 0 exit /b !RC!

call "%~dp03_push_heroku.bat" --called
set "RC=!errorlevel!"
if !RC! neq 0 exit /b !RC!

:: 2_push_github.bat --called does not reset the file; match standalone success behavior.
set "COMMIT_MSG_FILE=%~dp0commit_message.txt"
(echo ---)> "!COMMIT_MSG_FILE!"

echo.
echo ========================================
echo   YOLO DEPLOY COMPLETE
echo ========================================
echo   commit_message.txt reset to --- for next deploy.
echo.
