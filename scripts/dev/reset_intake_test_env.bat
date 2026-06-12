@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"

echo ========================================
echo   ECOTHRIFT - RESET INTAKE TEST ENV
echo   1. Overwrite local ecothrift from prod
echo   2. Migrate
echo   3. Reset WLMRT-OJU-3V74 (purge artifacts)
echo ========================================
echo.

set "DO_PULL=1"
if /I "%~1"=="--skip-pull" set "DO_PULL=0"

if "!DO_PULL!"=="1" (
    echo [1/4] Pulling production ecothrift schema to local...
    call "!PROJECT_ROOT!\scripts\deploy\0_pull_prod_to_local.bat"
    if errorlevel 1 (
        echo ERROR: prod pull failed.
        exit /b 1
    )
) else (
    echo [1/4] Skipping prod pull ^(--skip-pull^).
)

if exist "!PROJECT_ROOT!\venv\Scripts\activate.bat" (
    call "!PROJECT_ROOT!\venv\Scripts\activate.bat"
)

echo.
echo [2/4] Applying Django migrations...
python manage.py migrate --noinput
if errorlevel 1 (
    echo ERROR: migrate failed.
    exit /b 1
)

echo.
echo [3/4] Ensuring cache table exists...
python manage.py createcachetable >nul 2>&1

echo.
echo [4/4] Resetting WLMRT-OJU-3V74: purge artifacts, restore post-CSV-upload...
python manage.py reset_intake_test_po --apply --stage after-upload
if errorlevel 1 exit /b 1

echo.
python manage.py reset_intake_test_po --status
echo.
echo Done. Open preprocessing for WLMRT-OJU-3V74 and start at Standardize.
echo   --skip-pull     skip prod overwrite on next run
echo   before-upload   python manage.py reset_intake_test_po --apply --stage before-upload
echo.
