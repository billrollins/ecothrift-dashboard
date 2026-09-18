@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   PULL HEROKU -^> .envprod
echo   App: ecothrift-dashboard
echo   Also merges shared keys into .env
echo ========================================
echo.
echo This writes the production mirror (.envprod) from Heroku Config Vars.
echo Shared keys (AI, AWS, B-Stock, ...) are copied into .env.
echo Local DEBUG, DATABASE_*, SECRET_KEY, and hosts are not overwritten.
echo.

if /I "%~1"=="--dry-run" (
    python "%~dp0lib\pull_from_heroku.py" --into-local --dry-run
    goto :DONE
)
if /I "%~1"=="--help" (
    python "%~dp0lib\pull_from_heroku.py" --help
    goto :DONE
)

set /p "CONFIRM=Pull Heroku config into .envprod and merge shared keys into .env? (Y/N): "
if /I not "!CONFIRM!"=="Y" (
    echo Skipped.
    pause
    exit /b 0
)
python "%~dp0lib\pull_from_heroku.py" --into-local

:DONE
if errorlevel 1 pause
exit /b %ERRORLEVEL%
