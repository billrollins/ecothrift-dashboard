@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - FINISH PRODUCTION BACKFILL
echo   Remaining: Phase 5, populate retail, item cost backfill
echo ========================================
echo.

cd /d "%~dp0..\.."

echo [Phase 5] Categories (map-v1 + recompute-pricing)...
python manage.py backfill_phase5_categories --database production --no-input --map-v1 --recompute-pricing
if %errorlevel% neq 0 (
    echo ERROR: Phase 5 failed. Check output above.
    pause
    exit /b 1
)
echo [Phase 5] DONE
echo.

echo [Populate] Item retail_value...
python manage.py populate_item_retail_value --database production --no-input
if %errorlevel% neq 0 (
    echo ERROR: populate_item_retail_value failed. Check output above.
    pause
    exit /b 1
)
echo [Populate] DONE
echo.

echo [Cost] Recompute item costs (est_shrink formula)...
python manage.py recompute_all_item_costs --database production
if %errorlevel% neq 0 (
    echo ERROR: recompute_all_item_costs failed. Check output above.
    pause
    exit /b 1
)
echo [Cost] DONE
echo.

echo ========================================
echo   REMAINING BACKFILL COMPLETE
echo ========================================
echo.
pause
