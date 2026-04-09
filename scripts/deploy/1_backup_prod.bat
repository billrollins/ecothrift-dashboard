@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   ECOTHRIFT - BACKUP PRODUCTION DB (FULL)
echo   ecothrift-dashboard Heroku - all schemas
echo ========================================
echo.

:: -------------------------------------------------------
:: Pre-flight: Heroku CLI
:: -------------------------------------------------------
echo [Pre-flight] Checking Heroku CLI...
call heroku auth:whoami >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: Not logged into Heroku CLI. Run: heroku login
    if "%~1"=="" pause
    exit /b 1
)
echo [OK] Heroku login verified.
echo.

:: -------------------------------------------------------
:: Step 1: Get production DATABASE_URL
:: -------------------------------------------------------
echo [Step 1] Fetching production DATABASE_URL...
for /f "delims=" %%u in ('call heroku config:get DATABASE_URL -a ecothrift-dashboard 2^>nul') do set "PROD_DB_URL=%%u"
if not defined PROD_DB_URL (
    echo ERROR: Could not fetch DATABASE_URL from Heroku.
    echo        heroku config:get DATABASE_URL -a ecothrift-dashboard
    if "%~1"=="" pause
    exit /b 1
)
echo          Got DATABASE_URL (shared DB: public, darkhorse, ecothrift)
echo.

:: -------------------------------------------------------
:: Step 2: Create backups directory
:: -------------------------------------------------------
set "BACKUP_DIR=%~dp0backups"
if not exist "!BACKUP_DIR!" mkdir "!BACKUP_DIR!"

:: -------------------------------------------------------
:: Step 3: Generate timestamped filename and full dump
:: -------------------------------------------------------
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "D_DATE=%%c%%a%%b"
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "D_TIME=%%a%%b"
set "D_TIME=!D_TIME: =0!"
set "DUMP_FILE=!BACKUP_DIR!\prod_ecothrift_full_!D_DATE!_!D_TIME!.dump"

echo [Step 2] Dumping full production database (all schemas^)...
echo          Target: !DUMP_FILE!
echo.

set "TEMP_DUMP=%~dp0temp_backup_cmd.bat"
echo @pg_dump --no-owner --no-acl -F c -f "!DUMP_FILE!" "!PROD_DB_URL!"> "!TEMP_DUMP!"
call "!TEMP_DUMP!"
set "DUMP_RC=!errorlevel!"
del "!TEMP_DUMP!" 2>nul

if !DUMP_RC! neq 0 (
    echo ERROR: pg_dump from production failed.
    del "!DUMP_FILE!" 2>nul
    if "%~1"=="" pause
    exit /b 1
)

:: Show file size
for %%F in ("!DUMP_FILE!") do set "FSIZE=%%~zF"
echo [OK] Backup saved: !DUMP_FILE!
echo      Size: !FSIZE! bytes
echo.

:: -------------------------------------------------------
:: Cleanup old backups (keep last 5)
:: -------------------------------------------------------
set "COUNT=0"
for /f "tokens=*" %%f in ('dir /b /o-d "!BACKUP_DIR!\prod_ecothrift_full_*.dump" 2^>nul') do (
    set /a COUNT+=1
    if !COUNT! gtr 5 (
        echo [Cleanup] Deleting old backup: %%f
        del "!BACKUP_DIR!\%%f" 2>nul
    )
)
echo.

echo ========================================
echo   BACKUP COMPLETE
echo ========================================
echo.
echo   File: !DUMP_FILE!
echo.
echo   Full dump includes schemas: public, darkhorse, ecothrift
echo   (and any other objects in the shared production database.)
echo.
echo   Restore examples (pick one):
echo     Full DB into empty local DB:
echo       pg_restore --no-owner --no-acl -h localhost -U postgres -d ecothrift_v3 "!DUMP_FILE!"
echo     Single schema only:
echo       pg_restore --no-owner --no-acl -n public -h localhost -U postgres -d ecothrift_v3 "!DUMP_FILE!"
echo       pg_restore --no-owner --no-acl -n darkhorse -h localhost -U postgres -d ecothrift_v3 "!DUMP_FILE!"
echo       pg_restore --no-owner --no-acl -n ecothrift -h localhost -U postgres -d ecothrift_v3 "!DUMP_FILE!"
echo.

if "%~1"=="" pause
