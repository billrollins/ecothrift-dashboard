@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - DEPLOY TO PRODUCTION (YOLO)
echo   No confirmations
echo   dash.ecothrift.us (ecothrift-dashboard)
echo ========================================
echo.

:: -------------------------------------------------------
:: Pre-flight: Heroku CLI
:: -------------------------------------------------------
echo [Pre-flight] Checking Heroku CLI...
call heroku auth:whoami
set "HEROKU_RC=!errorlevel!"
if !HEROKU_RC! neq 0 (
    echo ERROR: Not logged into Heroku CLI. Run: heroku login
    exit /b 1
)
echo [OK] Heroku login verified.
echo.

git remote get-url heroku >nul 2>&1
set "GIT_RC=!errorlevel!"
if !GIT_RC! neq 0 (
    echo ERROR: No 'heroku' git remote. Run: heroku git:remote -a ecothrift-dashboard
    exit /b 1
)
echo [OK] Heroku remote verified.
echo.

:: -------------------------------------------------------
:: Step 0: Backup production DB before deploy (always)
:: -------------------------------------------------------
echo ========================================
echo   STEP 0: Backup Production DB (full)
echo ========================================
echo.
call "%~dp01_backup_prod.bat" --called
if !errorlevel! neq 0 (
    echo.
    echo ERROR: Backup failed. Aborting deploy.
    exit /b 1
)
echo [OK] Production DB backed up.
echo.

:: -------------------------------------------------------
:: Read commit message
:: -------------------------------------------------------
set "COMMIT_MSG_FILE=%~dp0commit_message.txt"
if not exist "!COMMIT_MSG_FILE!" (
    echo ERROR: Commit message file not found at: !COMMIT_MSG_FILE!
    exit /b 1
)

set "COMMIT_MSG="
for /f "usebackq delims=" %%m in ("!COMMIT_MSG_FILE!") do (
    if not defined COMMIT_MSG set "COMMIT_MSG=%%m"
)

if not defined COMMIT_MSG (
    echo ERROR: Commit message file is empty.
    echo Update scripts\deploy\commit_message.txt
    exit /b 1
)

if "!COMMIT_MSG!"=="---" (
    echo ERROR: Commit message is still the placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    exit /b 1
)

if "!COMMIT_MSG!"=="update this with your next commit message" (
    echo ERROR: Commit message is still the old placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    exit /b 1
)

echo   Message: !COMMIT_MSG!
echo.

:: -------------------------------------------------------
:: Push to GitHub
:: -------------------------------------------------------
echo ========================================
echo   STEP 1: Push to GitHub
echo ========================================
echo.
call "%~dp02_push_github.bat" --called
if !errorlevel! neq 0 (
    echo ERROR: Push to GitHub failed.
    exit /b 1
)
echo [OK] Pushed to GitHub.
echo.

:: -------------------------------------------------------
:: Push to Heroku
:: -------------------------------------------------------
echo ========================================
echo   STEP 2: Deploy to Heroku
echo ========================================
echo.
echo Heroku will automatically:
echo   - Build frontend (heroku-postbuild)
echo   - Collect static files
echo   - Run migrations (release phase)
echo.
call "%~dp03_push_heroku.bat" --called
if !errorlevel! neq 0 (
    echo ERROR: Heroku push failed. Check: heroku logs --tail -a ecothrift-dashboard
    exit /b 1
)
echo [OK] Heroku deploy triggered.
echo.

:: -------------------------------------------------------
:: Verify
:: -------------------------------------------------------
echo [Verify] Checking Heroku status...
call heroku ps -a ecothrift-dashboard
echo.

:: -------------------------------------------------------
:: Cleanup
:: -------------------------------------------------------
(echo ---)> "!COMMIT_MSG_FILE!"

echo ========================================
echo   DEPLOY COMPLETE
echo ========================================
echo.
echo   GitHub:  pushed to origin/main
echo   Heroku:  https://dash.ecothrift.us
echo   Commit:  !COMMIT_MSG!
echo.
echo   Heroku runs migrations and builds automatically.
echo   Update scripts\deploy\commit_message.txt for next deploy.
echo.
