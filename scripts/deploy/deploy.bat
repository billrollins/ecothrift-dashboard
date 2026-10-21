@echo off
setlocal enabledelayedexpansion
:: deploy.md step 4: push the origin/main commit to Heroku and show the release.
:: Run by the coder. Asks nothing. App: ecothrift-dashboard.
:: Before the first deploy of the day (store time) it takes a database backup; later deploys that day skip it
:: (Bill, 2026-10-21). --dry-run: say what would happen (backup or skip, the commit) and push nothing.
set "DRY_RUN="
if /i "%~1"=="--dry-run" set "DRY_RUN=1"
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"
git remote get-url heroku >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: no 'heroku' git remote.
    exit /b 1
)
echo [1/4] git fetch origin
git fetch origin
if !errorlevel! neq 0 exit /b 1
for /f "delims=" %%h in ('git rev-parse origin/main') do set "ORIGIN_SHA=%%h"
set "HEROKU_SHA="
for /f "tokens=1" %%h in ('git ls-remote heroku refs/heads/main') do set "HEROKU_SHA=%%h"
if "!HEROKU_SHA!"=="!ORIGIN_SHA!" (
    echo Nothing new to deploy: Heroku already runs !ORIGIN_SHA:~0,8!.
    exit /b 0
)
echo [2/4] database backup ^(first deploy of the day only^)
if defined DRY_RUN (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helpers\backup_first_today.ps1" -DryRun
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_helpers\backup_first_today.ps1"
)
if !errorlevel! neq 0 exit /b 1
if defined DRY_RUN (
    echo Dry run: would push origin/main ^(!ORIGIN_SHA:~0,8!^) to Heroku. Nothing pushed.
    exit /b 0
)
echo [3/4] git push heroku origin/main ^(!ORIGIN_SHA:~0,8!^)
git push heroku origin/main:refs/heads/main
if !errorlevel! neq 0 (
    echo ERROR: Heroku push failed.
    exit /b 1
)
echo [4/4] releases
call heroku releases -a ecothrift-dashboard -n 3
exit /b 0
