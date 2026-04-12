@echo off
echo ========================================
echo   ECOTHRIFT - PRODUCTION BACKFILL CHAIN
echo ========================================
echo.
echo This runs phases 2-5, populate_item_retail_value, and recompute_cost_pipeline
echo against the PRODUCTION database in sequence.
echo.

cd /d "%~dp0..\.."

echo [Phase 2] Products and manifests...
python manage.py backfill_phase2_products_manifests --database production --no-input
if %errorlevel% neq 0 (
    echo ERROR: Phase 2 failed. Check output above.
    pause
    exit /b 1
)

echo [Phase 3] Items...
python manage.py backfill_phase3_items --database production --no-input
if %errorlevel% neq 0 (
    echo ERROR: Phase 3 failed. Check output above.
    pause
    exit /b 1
)

echo [Phase 4] Sales...
python manage.py backfill_phase4_sales --database production --no-input
if %errorlevel% neq 0 (
    echo ERROR: Phase 4 failed. Check output above.
    pause
    exit /b 1
)

echo [Phase 5] Categories (map-v1 + recompute-pricing)...
python manage.py backfill_phase5_categories --database production --no-input --map-v1 --recompute-pricing
if %errorlevel% neq 0 (
    echo ERROR: Phase 5 failed. Check output above.
    pause
    exit /b 1
)

echo [Populate] Item retail_value...
python manage.py populate_item_retail_value --database production --no-input
if %errorlevel% neq 0 (
    echo ERROR: populate_item_retail_value failed. Check output above.
    pause
    exit /b 1
)

echo [Cost] Recompute cost pipeline...
python manage.py recompute_cost_pipeline --database production --no-input
if %errorlevel% neq 0 (
    echo ERROR: recompute_cost_pipeline failed. Check output above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BACKFILL CHAIN COMPLETE
echo ========================================
echo.
pause
