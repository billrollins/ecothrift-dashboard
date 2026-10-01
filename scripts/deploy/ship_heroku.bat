@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - SHIP TO HEROKU (ship-heroku.md step 6)
echo   App: ecothrift-dashboard
echo ========================================
echo.
echo GitHub first, always: this refuses unless HEAD == origin/main.
echo Usage: ship_heroku.bat [--called]   (pushes HEAD to heroku main)
echo.

for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"

call heroku auth:whoami >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: Not logged into Heroku CLI. Run: heroku login
    if "%~1"=="" pause
    exit /b 1
)

git remote get-url heroku >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: No 'heroku' git remote. Run: heroku git:remote -a ecothrift-dashboard
    if "%~1"=="" pause
    exit /b 1
)

echo [1/3] git fetch origin...
git fetch origin
if !errorlevel! neq 0 (
    echo ERROR: git fetch origin failed.
    if "%~1"=="" pause
    exit /b 1
)

for /f "delims=" %%h in ('git rev-parse HEAD') do set "HEAD_SHA=%%h"
for /f "delims=" %%h in ('git rev-parse origin/main') do set "ORIGIN_SHA=%%h"
if not "!HEAD_SHA!"=="!ORIGIN_SHA!" (
    echo ERROR: HEAD is not origin/main. Run ship-git.md first.
    echo   HEAD        !HEAD_SHA!
    echo   origin/main !ORIGIN_SHA!
    if "%~1"=="" pause
    exit /b 1
)
echo [OK] HEAD == origin/main  ^(!HEAD_SHA:~0,8!^)
echo.

if /I "%~1" neq "--called" (
    echo Heroku will build both front ends, collect static files and run
    echo migrations in the release phase. Take the backup first:
    echo   scripts\db\backup_prod.bat
    echo.
    set /p "CONFIRM=Push HEAD to Heroku now? (Y/N): "
    if /I not "!CONFIRM!"=="Y" (
        echo Skipped.
        pause
        exit /b 0
    )
)

echo [2/3] git push heroku HEAD:main...
git push heroku HEAD:main
if !errorlevel! neq 0 (
    echo ERROR: Heroku push failed. Check: heroku logs --tail -a ecothrift-dashboard
    if "%~1"=="" pause
    exit /b 1
)

echo [3/3] Latest releases:
call heroku releases -a ecothrift-dashboard -n 3
echo.
echo Smoke: https://dash.ecothrift.us/api/core/system/version/
if "%~1"=="" pause
exit /b 0
