@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - PULL PRODUCTION DB TO LOCAL
echo   Full dump - restores ALL schemas into ecothrift_v3
echo ========================================
echo.
echo   Django (.env DATABASE_*): same DB — ORM uses schema ecothrift (search_path).
echo   Legacy / V2 data lives in schema public (same database^) — used for category
echo   extracts (Bins 1-2^), not for Django models.
echo.
echo This will OVERWRITE local schemas: public, darkhorse, ecothrift
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
:: Step 2: Dump full production database
:: -------------------------------------------------------
echo [Step 2] Dumping full production database...
set "DUMP_FILE=%~dp0temp_prod_full_backup.dump"

set "TEMP_DUMP=%~dp0temp_dump.bat"
echo @pg_dump --no-owner --no-acl -F c -f "%DUMP_FILE%" "!PROD_DB_URL!"> "!TEMP_DUMP!"
call "!TEMP_DUMP!"
set "DUMP_RC=!errorlevel!"
del "!TEMP_DUMP!" 2>nul
if !DUMP_RC! neq 0 (
    echo ERROR: pg_dump from production failed.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo        Production dump saved to: %DUMP_FILE%
echo.

:: -------------------------------------------------------
:: Step 3: Confirm before dropping local schemas
:: -------------------------------------------------------
echo ----------------------------------------
echo   WARNING: This will drop ALL data in these
echo   local schemas and replace with production:
echo.
echo     - public
echo     - darkhorse
echo     - ecothrift
echo     - heroku_ext (Heroku extensions schema — must drop or pg_restore fails^)
echo.
echo   Local DB: ecothrift_v3 (localhost)
echo ----------------------------------------
echo.
set /p "CONFIRM=Type YES to confirm local database reset: "
if /I not "!CONFIRM!"=="YES" (
    echo Aborted by user.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo.

:: -------------------------------------------------------
:: Step 4: Drop local schemas (order: app schemas first, then public)
:: -------------------------------------------------------
echo [Step 4] Dropping local schemas...
set PGPASSWORD=password
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "DROP SCHEMA IF EXISTS darkhorse CASCADE;"
if !errorlevel! neq 0 (
    echo ERROR: Failed to drop local darkhorse schema.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "DROP SCHEMA IF EXISTS ecothrift CASCADE;"
if !errorlevel! neq 0 (
    echo ERROR: Failed to drop local ecothrift schema.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "DROP SCHEMA IF EXISTS public CASCADE;"
if !errorlevel! neq 0 (
    echo ERROR: Failed to drop local public schema.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "DROP SCHEMA IF EXISTS heroku_ext CASCADE;"
if !errorlevel! neq 0 (
    echo ERROR: Failed to drop local heroku_ext schema.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo        Local schemas dropped.
echo.
:: After CASCADE, the database may have NO public schema. pg_restore can replay
:: constraints before CREATE SCHEMA public in the archive, causing hundreds of
:: "schema public does not exist" errors. Recreate empty public before restore.
echo [Step 4b] Recreating empty schema public (required for clean pg_restore^)...
psql -h localhost -p 5432 -U postgres -d ecothrift_v3 -c "CREATE SCHEMA IF NOT EXISTS public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO PUBLIC;"
if !errorlevel! neq 0 (
    echo ERROR: Failed to recreate public schema.
    del "%DUMP_FILE%" 2>nul
    pause
    exit /b 1
)
echo        Schema public ready.
echo.

:: -------------------------------------------------------
:: Step 5: Restore production dump to local
:: -------------------------------------------------------
echo [Step 5] Restoring production dump to local dev...
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
echo   PULL COMPLETE
echo ========================================
echo.
echo   Local ecothrift_v3 now reflects production (all schemas^).
echo.
pause
