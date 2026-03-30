@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - PUSH TO HEROKU
echo   App: ecothrift-dashboard
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
    if "%~1"=="" pause
    exit /b 1
)
echo [OK] Heroku login verified.
echo.

git remote get-url heroku >nul 2>&1
set "GIT_RC=!errorlevel!"
if !GIT_RC! neq 0 (
    echo ERROR: No 'heroku' git remote. Run: heroku git:remote -a ecothrift-dashboard
    if "%~1"=="" pause
    exit /b 1
)
echo [OK] Heroku remote verified.
echo.

:: When --called: skip confirmation. When standalone: prompt.
if "%~1" neq "--called" (
    echo Heroku will automatically:
    echo   - Build frontend (heroku-postbuild)
    echo   - Collect static files
    echo   - Run migrations (release phase)
    echo.
    set /p "CONFIRM=Push to Heroku? (Y/N): "
    if /I not "!CONFIRM!"=="Y" (
        echo Skipped Heroku push. You can push manually: git push heroku main
        pause
        exit /b 0
    )
    echo.
)

:: -------------------------------------------------------
:: Push to Heroku
:: -------------------------------------------------------
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"

git push heroku main
set "HPUSH_RC=!errorlevel!"
if !HPUSH_RC! neq 0 (
    echo ERROR: Heroku push failed. Check: heroku logs --tail -a ecothrift-dashboard
    if "%~1"=="" pause
    exit /b 1
)
echo [OK] Heroku deploy triggered.
echo.

if "%~1"=="" pause
