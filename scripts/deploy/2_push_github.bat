@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - PUSH TO GITHUB
echo ========================================
echo.

:: -------------------------------------------------------
:: Commit message: full file passed to git commit -F
:: First line is validated; must not be placeholder three-dashes.
:: -------------------------------------------------------
set "COMMIT_MSG_FILE=%~dp0commit_message.txt"
if not exist "!COMMIT_MSG_FILE!" (
    echo ERROR: Commit message file not found at: !COMMIT_MSG_FILE!
    if "%~1"=="" pause
    exit /b 1
)

set "FIRST_LINE="
for /f "usebackq delims=" %%m in ("!COMMIT_MSG_FILE!") do (
    if not defined FIRST_LINE set "FIRST_LINE=%%m"
)

if not defined FIRST_LINE (
    echo ERROR: Commit message file has no non-blank lines.
    echo Edit scripts\deploy\commit_message.txt — line 1 must be the subject, not three-dashes.
    if "%~1"=="" pause
    exit /b 1
)

if "!FIRST_LINE!"=="---" (
    echo ERROR: First line is still the placeholder ---.
    echo Replace the ENTIRE file with your message. Subject on line 1; blank line; body.
    echo Do not put --- on line 1 — it breaks this script and hides your subject.
    if "%~1"=="" pause
    exit /b 1
)

if "!FIRST_LINE!"=="update this with your next commit message" (
    echo ERROR: Commit message is still the old placeholder.
    echo Update scripts\deploy\commit_message.txt with your actual message.
    if "%~1"=="" pause
    exit /b 1
)

:: When --called: skip confirmation. When standalone: prompt.
if "%~1" neq "--called" (
    echo ----------------------------------------
    echo   Subject ^(line 1^): !FIRST_LINE!
    echo   ^(Full file, including body, will be used for git commit.^)
    echo ----------------------------------------
    echo.
    set /p "CONFIRM=Proceed with commit and push? Y or N: "
    if /I not "!CONFIRM!"=="Y" (
        echo Aborted.
        pause
        exit /b 0
    )
    echo.
)

:: -------------------------------------------------------
:: Git add, commit, push
:: -------------------------------------------------------
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"

echo [1/3] Staging changes...
git add .

echo [2/3] Committing with full commit_message.txt...
git commit -F "!COMMIT_MSG_FILE!"
set "COMMIT_RC=!errorlevel!"
if !COMMIT_RC! neq 0 (
    echo WARNING: git commit returned !COMMIT_RC! - nothing to commit or hook failure.
    echo commit_message.txt was NOT reset — fix staging or message and retry.
    if "%~1"=="" pause
    exit /b 1
)

echo [3/3] Pushing to origin...
git push origin main
set "PUSH_RC=!errorlevel!"
if !PUSH_RC! neq 0 (
    echo ERROR: Failed to push to origin. commit_message.txt NOT reset.
    if "%~1"=="" pause
    exit /b 1
)

:: Success only: reset placeholder for next push to single-line three-dashes
if "%~1" neq "--called" (
    (echo ---)> "!COMMIT_MSG_FILE!"
)

echo.
echo ========================================
echo   PUSH COMPLETE
echo ========================================
echo.
echo   Pushed to origin/main
echo   Subject: !FIRST_LINE!
echo.
if "%~1" neq "--called" (
    echo   commit_message.txt reset to --- — replace the whole file before next push.
    echo.
    pause
)
