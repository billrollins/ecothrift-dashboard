@echo off
setlocal enabledelayedexpansion
:: ship.md steps 9-10: git add -A, commit from commit_message.txt, push to origin main.
:: Run by the coder. Asks nothing. Usage: ship.bat [branch]   (branch = local branch to push to main; default main)
set "BRANCH=%~1"
if "!BRANCH!"=="" set "BRANCH=main"
set "COMMIT_MSG_FILE=%~dp0commit_message.txt"
if not exist "!COMMIT_MSG_FILE!" (
    echo ERROR: commit message file not found: !COMMIT_MSG_FILE!
    exit /b 1
)
set "FIRST_LINE="
for /f "usebackq delims=" %%m in ("!COMMIT_MSG_FILE!") do (
    if not defined FIRST_LINE set "FIRST_LINE=%%m"
)
if not defined FIRST_LINE (
    echo ERROR: commit_message.txt is empty.
    exit /b 1
)
if "!FIRST_LINE!"=="---" (
    echo ERROR: commit_message.txt still holds the placeholder.
    exit /b 1
)
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"
echo [1/3] git add -A
git add -A
if !errorlevel! neq 0 exit /b 1
echo [2/3] git commit
git commit -F "!COMMIT_MSG_FILE!"
if !errorlevel! neq 0 (
    echo ERROR: git commit failed ^(nothing to commit, or a hook^).
    exit /b 1
)
echo [3/3] git push origin !BRANCH!:main
git push origin !BRANCH!:main
if !errorlevel! neq 0 (
    echo ERROR: push to origin failed.
    exit /b 1
)
echo SHIPPED: !FIRST_LINE!
exit /b 0
