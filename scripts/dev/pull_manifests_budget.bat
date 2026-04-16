@echo off
setlocal EnableExtensions
REM ============================================================================
REM  Anonymous manifest pulls with a wall-clock budget (seconds).
REM  Does NOT use the overnight time window — use for local testing with a limit.
REM
REM  Example: 120 seconds, batch 20, 2s delay between auctions:
REM    pull_manifests_budget.bat 120
REM
REM  See: python manage.py pull_manifests_budget --help
REM  Scheduled overnight window (10 PM–5 AM): pull_manifests_nightly
REM  Daily parity batch (stats + sweep + watch only): daily_scheduled_tasks.bat
REM ============================================================================

set "ROOT=%~dp0..\.."
cd /d "%ROOT%" || (
  echo ERROR: could not cd to repo root.
  exit /b 1
)

if "%~1"=="" (
  echo Usage: %~n0 ^<seconds^>
  echo Example: %~n0 120
  echo Optional env: BATCH_SIZE DELAY_SECONDS FORCE=1
  exit /b 1
)

if exist "%ROOT%\venv\Scripts\activate.bat" (
  call "%ROOT%\venv\Scripts\activate.bat"
)

set "EXTRA="
if not "%~2"=="" set "EXTRA=%EXTRA% --batch-size %2"
if not "%~3"=="" set "EXTRA=%EXTRA% --delay %3"
if /I "%FORCE_MANIFEST%"=="1" set "EXTRA=%EXTRA% --force"

python manage.py pull_manifests_budget --seconds %1 %EXTRA%
if errorlevel 1 (
  endlocal
  exit /b 1
)
endlocal
exit /b 0
