@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  Local Field/Desk QA seed — wipe + reload for TODAY
REM  Drag this .bat into a terminal and press Enter.
REM  Local only — never touches Heroku/production.
REM ============================================================
REM
REM  Creates (relative to today's local date):
REM    Past   — 2 deliveries (1 good completed, 1 failed/returned)
REM    Today  — 4 deliveries with 1 / 2 / 3 / 4 items
REM    Future — 3 deliveries (2 on one day, 1 on another)
REM
REM  Optional flags (after the path):
REM    --with-active-run --stage load
REM    --key other-key
REM    --test-phone 402-555-0142

for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"

set "DATASET_KEY=phase2-phone"
set "EXTRA_ARGS="

:parse
if "%~1"=="" goto after_parse
REM Ignore a dragged/re-passed .bat path so ExtraArgs stay clean.
if /I "%~x1"==".bat" (
  shift
  goto parse
)
if /I "%~1"=="--prod" (
  echo ERROR: production seeding is disabled. This script is local-only.
  exit /b 1
)
if /I "%~1"=="--prod-only" (
  echo ERROR: production seeding is disabled. This script is local-only.
  exit /b 1
)
if /I "%~1"=="--key" (
  set "DATASET_KEY=%~2"
  shift
  shift
  goto parse
)
set "EXTRA_ARGS=!EXTRA_ARGS! %~1"
shift
goto parse

:after_parse

echo ========================================
echo   ECOTHRIFT - SEED DELIVERY QA DATA
echo   key: !DATASET_KEY!   target: LOCAL / TODAY
echo   ^(local/DEBUG only — never seeds production^)
echo ========================================
echo.

if exist "!PROJECT_ROOT!\venv\Scripts\activate.bat" (
  call "!PROJECT_ROOT!\venv\Scripts\activate.bat"
)

echo [1/3] Migrating local DB...
python manage.py migrate --noinput
if errorlevel 1 (
  echo ERROR: local migrate failed.
  exit /b 1
)

echo [2/3] Dropping all local delivery test datasets...
python manage.py reset_delivery_test_dataset --all-local --execute
if errorlevel 1 (
  echo WARNING: bulk reset failed — trying primary key only.
  python manage.py reset_delivery_test_dataset --key "!DATASET_KEY!" --execute
)

echo [3/3] Loading fresh QA data for TODAY...
python manage.py seed_delivery_test_dataset --key "!DATASET_KEY!" !EXTRA_ARGS!
if errorlevel 1 (
  echo ERROR: local seed failed.
  exit /b 1
)

echo.
echo Summary:
python manage.py show_delivery_test_dataset --key "!DATASET_KEY!"
if errorlevel 1 exit /b 1

echo.
echo Done. Morning QA pack ready ^(relative to today^):
echo   Past   = 2 deliveries ^(1 good, 1 bad^)
echo   Today  = 4 deliveries ^(1 / 2 / 3 / 4 items^)
echo   Future = 3 deliveries ^(2 same day + 1 later day^)
echo.
echo Field phone: scripts\dev\start_mobile_dashboard.bat
echo Then open Field Days — seeded stops look like normal deliveries.
echo.
endlocal
