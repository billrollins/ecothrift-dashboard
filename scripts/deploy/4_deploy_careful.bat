@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - DEPLOY TO PRODUCTION
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
    pause
    exit /b 1
)
echo [OK] Heroku login verified.
echo.

git remote get-url heroku >nul 2>&1
set "GIT_RC=!errorlevel!"
if !GIT_RC! neq 0 (
    echo ERROR: No 'heroku' git remote. Run: heroku git:remote -a ecothrift-dashboard
    pause
    exit /b 1
)
echo [OK] Heroku remote verified.
echo.

:: -------------------------------------------------------
:: Step 0: Backup production DB before deploy
:: -------------------------------------------------------
echo ========================================
echo   STEP 0: Backup Production DB (full)
echo ========================================
echo.
set /p "BACKUP_CONFIRM=Backup production DB before deploying? (Y/N): "
if /I "!BACKUP_CONFIRM!"=="Y" (
    call "%~dp01_backup_prod.bat" --called
    if !errorlevel! neq 0 (
        echo.
        echo ERROR: Backup failed. Aborting deploy.
        pause
        exit /b 1
    )
    echo [OK] Production DB backed up.
    echo.
) else (
    echo Skipping backup. Proceeding without safety net...
    echo.
)

:: -------------------------------------------------------
:: Read commit message
:: -------------------------------------------------------
set "COMMIT_MSG_FILE=%~dp0commit_message.txt"
if not exist "!COMMIT_MSG_FILE!" (
    echo ERROR: Commit message file not found at: !COMMIT_MSG_FILE!
    pause
    exit /b 1
)

set "COMMIT_MSG="
for /f "usebackq delims=" %%m in ("!COMMIT_MSG_FILE!") do (
    if not defined COMMIT_MSG set "COMMIT_MSG=%%m"
)

if not defined COMMIT_MSG (
    echo ERROR: Commit message file is empty.
    echo Update scripts\deploy\commit_message.txt
    pause
    exit /b 1
)

if "!COMMIT_MSG!"=="---" (
    echo ERROR: Commit message is still the placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    pause
    exit /b 1
)

if "!COMMIT_MSG!"=="update this with your next commit message" (
    echo ERROR: Commit message is still the old placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    pause
    exit /b 1
)

echo ----------------------------------------
echo   Commit message: !COMMIT_MSG!
echo ----------------------------------------
echo.

:: -------------------------------------------------------
:: Push to GitHub
:: -------------------------------------------------------
set /p "CONFIRM_GH=Push to GitHub? (Y/N): "
if /I not "!CONFIRM_GH!"=="Y" (
    echo Skipped GitHub push.
    goto :AFTER_GITHUB
)

echo.
echo ========================================
echo   STEP 1: Push to GitHub
echo ========================================
echo.
call "%~dp02_push_github.bat" --called
if !errorlevel! neq 0 (
    echo ERROR: Push to GitHub failed.
    pause
    exit /b 1
)
echo [OK] Pushed to GitHub.
echo.

:AFTER_GITHUB

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
set /p "CONFIRM_HK=Push to Heroku? (Y/N): "
if /I not "!CONFIRM_HK!"=="Y" (
    echo Skipped Heroku push. You can push manually: git push heroku main
    goto :SKIP_HEROKU
)

call "%~dp03_push_heroku.bat" --called
if !errorlevel! neq 0 (
    echo ERROR: Heroku push failed.
    pause
    exit /b 1
)
echo [OK] Heroku deploy triggered.
echo.

:SKIP_HEROKU

:: -------------------------------------------------------
:: Cleanup
:: -------------------------------------------------------
(echo ---)> "!COMMIT_MSG_FILE!"

:: -------------------------------------------------------
:: Verify
:: -------------------------------------------------------
echo [Verify] Checking Heroku status...
call heroku ps -a ecothrift-dashboard
echo.

echo.
echo ========================================
echo   DEPLOY COMPLETE
echo ========================================
echo.
echo   GitHub:  origin/main (if you chose Y above^)
echo   Heroku:  https://dash.ecothrift.us
echo   Commit:  !COMMIT_MSG!
echo.
echo   Heroku runs migrations and builds automatically.
echo   Update scripts\deploy\commit_message.txt for next deploy.
echo.
pause
