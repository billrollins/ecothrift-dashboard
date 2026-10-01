@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   BACKUP PRODUCTION DB (Heroku capture)
echo   Add-on app: ecothrift-database (shared by ecothrift + darkhorse)
echo ========================================
echo.
echo Takes a Heroku Postgres backup on the shared add-on. The backup stays on
echo Heroku (heroku pg:backups -a ecothrift-database lists them). Nothing is
echo downloaded here, and no URL or credential is printed.
echo.

call heroku auth:whoami >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: Not logged into Heroku CLI. Run: heroku login
    if "%~1"=="" pause
    exit /b 1
)

if /I "%~1" neq "--called" (
    set /p "CONFIRM=Capture a production backup now? (Y/N): "
    if /I not "!CONFIRM!"=="Y" (
        echo Skipped.
        pause
        exit /b 0
    )
)

call heroku pg:backups:capture -a ecothrift-database
if !errorlevel! neq 0 (
    echo ERROR: backup capture failed.
    if "%~1"=="" pause
    exit /b 1
)

echo.
echo [OK] Backup captured. Latest:
call heroku pg:backups -a ecothrift-database | findstr /N "^" | findstr /B "1: 2: 3: 4: 5: 6:"
echo.
if "%~1"=="" pause
exit /b 0
