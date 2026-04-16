@echo off
setlocal EnableExtensions
REM ============================================================================
REM  Eco-Thrift — local parity for Heroku-style scheduled buying jobs
REM
REM  Production (Heroku Scheduler) today:
REM    Daily ~03:00 UTC:  python manage.py compute_daily_category_stats
REM    Hourly:             python manage.py scheduled_sweep
REM
REM  This script runs the same management commands against your DEFAULT database
REM  (local .env). It does NOT run on `runserver`; run it manually or via Task
REM  Scheduler when you want fresh CategoryStats, discovery, and watchlist poll.
REM
REM  NOT included (not production-daily; run only when needed):
REM    - recompute_all_item_costs  (backfill / PO est_shrink fixes)
REM    - sweep_auctions as separate step (scheduled_sweep does discovery without JWT)
REM
REM  Manifest pulls are NOT in this batch (time-budget script instead). Use:
REM    scripts\dev\pull_manifests_budget.bat
REM  or  python manage.py pull_manifests_nightly  (10 PM–5 AM window only).
REM
REM  Maintenance: when Heroku Scheduler jobs change, update this file AND:
REM    - .ai/extended/development.md  (Heroku Scheduler table + Quick Scripts)
REM    - .ai/context.md               (file map under scripts/dev/)
REM    - .ai/consultant_context.md    (local dev note, if present)
REM
REM  Option: set SKIP_BSTOCK=1 before running to only run compute_daily_category_stats
REM  (no HTTP to B-Stock — useful offline).
REM ============================================================================

set "ROOT=%~dp0..\.."
cd /d "%ROOT%" || (
  echo ERROR: could not cd to repo root.
  exit /b 1
)

if exist "%ROOT%\venv\Scripts\activate.bat" (
  call "%ROOT%\venv\Scripts\activate.bat"
)

if /I "%SKIP_BSTOCK%"=="1" goto :stats_only

echo.
echo === [1/3] compute_daily_category_stats  (production: daily^) ===
echo     Refreshes CategoryStats, need_score_1to99, category-need cache;
echo     full recompute for open/closing auctions with future end_time.
python manage.py compute_daily_category_stats
if errorlevel 1 goto :fail

echo.
echo === [2/3] scheduled_sweep  (production: hourly^) ===
echo     Discovery POST search, optional AI estimates for new IDs,
echo     recompute_active_auctions_lightweight. Requires network.
python manage.py scheduled_sweep
if errorlevel 1 goto :fail

echo.
echo === [3/3] watch_auctions  (watchlist poll — when you have watched lots^) ===
echo     Anonymous auction state GET; snapshots + lightweight valuation per poll.
echo     No-ops quickly if nothing due per poll_interval_seconds.
python manage.py watch_auctions
if errorlevel 1 goto :fail

goto :done

:stats_only
echo SKIP_BSTOCK=1 — only refreshing CategoryStats / valuations (no B-Stock HTTP^).
python manage.py compute_daily_category_stats
if errorlevel 1 goto :fail
goto :done

:done
echo.
echo === daily_scheduled_tasks: finished OK ===
endlocal
exit /b 0

:fail
echo.
echo === daily_scheduled_tasks: FAILED (see messages above^) ===
endlocal
exit /b 1
