@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   SYNC .envprod -^> HEROKU
echo   App: ecothrift-dashboard
echo   Source: repo-root .envprod
echo ========================================
echo.

for %%I in ("%~dp0..\..\..") do set "ROOT=%%~fI"
if not exist "!ROOT!\.envprod" (
    echo ERROR: !ROOT!\.envprod not found.
    echo Edit .envprod at the repo root, then run this script again.
    pause
    exit /b 1
)

if /I "%~1"=="--dry-run" (
    python "%~dp0lib\sync_to_heroku.py" --dry-run
    goto :DONE
)
if /I "%~1"=="--check-drift" (
    python "%~dp0lib\sync_to_heroku.py" --check-drift
    goto :DONE
)
if /I "%~1"=="--help" (
    python "%~dp0lib\sync_to_heroku.py" --help
    goto :DONE
)

set /p "CONFIRM=Push .envprod to Heroku? (Y/N): "
if /I not "!CONFIRM!"=="Y" (
    echo Skipped.
    pause
    exit /b 0
)
python "%~dp0lib\sync_to_heroku.py"

:DONE
if errorlevel 1 pause
exit /b %ERRORLEVEL%
