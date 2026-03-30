@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - PUSH TO GITHUB
echo ========================================
echo.

:: -------------------------------------------------------
:: Read commit message
:: -------------------------------------------------------
set "COMMIT_MSG_FILE=%~dp0commit_message.txt"
if not exist "!COMMIT_MSG_FILE!" (
    echo ERROR: Commit message file not found at: !COMMIT_MSG_FILE!
    if "%~1"=="" pause
    exit /b 1
)

set "COMMIT_MSG="
for /f "usebackq delims=" %%m in ("!COMMIT_MSG_FILE!") do (
    if not defined COMMIT_MSG set "COMMIT_MSG=%%m"
)

if not defined COMMIT_MSG (
    echo ERROR: Commit message file is empty.
    echo Update scripts\deploy\commit_message.txt
    if "%~1"=="" pause
    exit /b 1
)

if "!COMMIT_MSG!"=="---" (
    echo ERROR: Commit message is still the placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    if "%~1"=="" pause
    exit /b 1
)

if "!COMMIT_MSG!"=="update this with your next commit message" (
    echo ERROR: Commit message is still the old placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    if "%~1"=="" pause
    exit /b 1
)

:: When --called: skip confirmation. When standalone: prompt.
if "%~1" neq "--called" (
    echo ----------------------------------------
    echo   Commit message: !COMMIT_MSG!
    echo ----------------------------------------
    echo.
    set /p "CONFIRM=Proceed with commit and push? (Y/N): "
    if /I not "!CONFIRM!"=="Y" (
        echo Aborted.
        pause
        exit /b 0
    )
    echo.
)

:: -------------------------------------------------------
:: Git add, commit, push
:: -------------------------------------------------------
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"

echo [1/3] Staging changes...
git add .

echo [2/3] Committing...
set "TEMP_MSG=%~dp0temp_commit_msg.txt"
echo !COMMIT_MSG!> "!TEMP_MSG!"
git commit --file="!TEMP_MSG!"
set "COMMIT_RC=!errorlevel!"
del "!TEMP_MSG!" 2>nul
if !COMMIT_RC! neq 0 (
    echo WARNING: git commit returned !COMMIT_RC! - possibly nothing to commit. Continuing...
)

echo [3/3] Pushing to origin...
git push origin main
set "PUSH_RC=!errorlevel!"
if !PUSH_RC! neq 0 (
    echo ERROR: Failed to push to origin.
    if "%~1"=="" pause
    exit /b 1
)

:: When standalone: reset commit message. When --called: caller does it.
if "%~1" neq "--called" (
    (echo ---)> "!COMMIT_MSG_FILE!"
)

echo.
echo ========================================
echo   PUSH COMPLETE
echo ========================================
echo.
echo   Pushed to origin/main
echo   Commit: !COMMIT_MSG!
echo.
if "%~1" neq "--called" (
    echo   Update scripts\deploy\commit_message.txt for next push.
    echo.
    pause
)
