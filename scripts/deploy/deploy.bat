@echo off
setlocal enabledelayedexpansion
:: deploy.md step 4: push the origin/main commit to Heroku and show the release.
:: Run by the coder. Asks nothing. App: ecothrift-dashboard.
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"
git remote get-url heroku >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: no 'heroku' git remote.
    exit /b 1
)
echo [1/3] git fetch origin
git fetch origin
if !errorlevel! neq 0 exit /b 1
for /f "delims=" %%h in ('git rev-parse origin/main') do set "ORIGIN_SHA=%%h"
echo [2/3] git push heroku origin/main ^(!ORIGIN_SHA:~0,8!^)
git push heroku origin/main:refs/heads/main
if !errorlevel! neq 0 (
    echo ERROR: Heroku push failed.
    exit /b 1
)
echo [3/3] releases
call heroku releases -a ecothrift-dashboard -n 3
exit /b 0
