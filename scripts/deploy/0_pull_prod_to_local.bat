@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - PULL PRODUCTION ecothrift SCHEMA ONLY
echo   Does NOT touch local public, darkhorse, heroku_ext, etc.
echo ========================================
echo.
echo   Django ORM uses schema ecothrift (search_path).
echo   Use this when other local apps share ecothrift_v3 and you only need
echo   Django data from production - not a full DB mirror.
echo.
echo This will OVERWRITE local schema: ecothrift only
echo Local database: ecothrift_v3 (localhost)
echo   Ensure root .env DATABASE_NAME=ecothrift_v3 and host/port/user match below.
echo.

:: -------------------------------------------------------
:: Step 0: Check Heroku CLI login
:: -------------------------------------------------------
echo [Check] Verifying Heroku CLI login...
call heroku auth:whoami >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo ERROR: Not logged into Heroku CLI.
    echo Run: heroku login
    echo Then re-run this script.
    pause
    exit /b 1
)
for /f "delims=" %%u in ('call heroku auth:whoami 2^>nul') do echo        Logged in as: %%u
echo.

:: -------------------------------------------------------
:: Step 1: Get production DATABASE_URL
:: -------------------------------------------------------
echo [Step 1] Fetching production DATABASE_URL...
for /f "delims=" %%u in ('call heroku config:get DATABASE_URL -a ecothrift-dashboard 2^>nul') do set "PROD_DB_URL=%%u"
if not defined PROD_DB_URL (
    echo ERROR: Could not fetch DATABASE_URL from Heroku.
    pause
    exit /b 1
)
echo        Got DATABASE_URL (hidden for security)
echo.

:: -------------------------------------------------------
:: Step 2: Dump production ecothrift schema only
:: -------------------------------------------------------
echo [Step 2] Dumping production schema ecothrift...
set "DUMP_FILE=%~dp0temp_prod_ecothrift_backup.dump"

set "TEMP_DUMP=%~dp0temp_dump.bat"
echo @pg_dump --no-owner --no-acl -F c --schema=ecothrift -f "%DUMP_FILE%" "!PROD_DB_URL!"> "!TEMP_DUMP!"
call "!TEMP_DUMP!"
set "DUMP_RC=!errorlevel!"
del "!TEMP_DUMP!" 2>nul
if !DUMP_RC! neq 0 (
    echo ERROR: pg_dump from production failed.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo        Production ecothrift dump saved to: %DUMP_FILE%
echo.

:: -------------------------------------------------------
:: Step 3: Confirm before dropping local ecothrift only
:: -------------------------------------------------------
echo ----------------------------------------
echo   WARNING: This will drop ALL data in local schema
echo   ecothrift and replace it with production ecothrift.
echo.
echo   Local schemas NOT modified: public, darkhorse, heroku_ext, ...
echo   Local DB: ecothrift_v3 (localhost)
echo ----------------------------------------
echo.
set /p "CONFIRM=Type YES to confirm: "
if /I not "!CONFIRM!"=="YES" (
    echo Aborted by user.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo.

:: -------------------------------------------------------
:: Step 4: Drop local ecothrift schema only
:: -------------------------------------------------------
echo [Step 4] Dropping local schema ecothrift...
set PGPASSWORD=password
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "DROP SCHEMA IF EXISTS ecothrift CASCADE;"
if !errorlevel! neq 0 (
    echo ERROR: Failed to drop local ecothrift schema.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo        Local schema ecothrift dropped.
echo.

:: -------------------------------------------------------
:: Step 5: Restore production ecothrift dump to local
:: -------------------------------------------------------
echo [Step 5] Restoring ecothrift dump to local dev...
set PGPASSWORD=password
pg_restore --no-owner --no-acl -h localhost -p 5432 -U postgres -d ecothrift_v3 "%DUMP_FILE%"
set "RESTORE_RC=!errorlevel!"
if !RESTORE_RC! neq 0 (
    echo WARNING: pg_restore reported warnings or errors - review output above.
    echo          Some messages are normal for object reordering.
) else (
    echo        Restore completed successfully.
)
echo.

:: -------------------------------------------------------
:: Step 6: Cleanup
:: -------------------------------------------------------
echo [Step 6] Cleaning up temp dump file...
del "%DUMP_FILE%" 2>nul
echo        Cleaned up.
echo.

:: -------------------------------------------------------
:: Step 7: Verify local Django
:: -------------------------------------------------------
echo [Step 7] Verifying local Django...
for %%I in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "!PROJECT_ROOT!"
python manage.py check
echo.

echo ========================================
echo   PULL COMPLETE (ecothrift schema only)
echo ========================================
echo.
echo   Local ecothrift_v3: schema ecothrift updated from production.
echo   Other schemas on this database were left unchanged.
echo.
pause
