@echo off
setlocal enabledelayedexpansion
:: Heroku Postgres backup on the shared add-on (app ecothrift-database). Run by the coder; asks nothing.
:: The backup stays on Heroku. Nothing is downloaded, and no URL or credential is printed.
:: Not part of a deploy (deploy.md): the coder takes one before a production data job when it is worth it.
call heroku pg:backups:capture -a ecothrift-database
if !errorlevel! neq 0 (
    echo ERROR: backup capture failed.
    exit /b 1
)
echo [OK] Backup captured. Latest:
call heroku pg:backups -a ecothrift-database | findstr /N "^" | findstr /B "1: 2: 3: 4: 5: 6:"
exit /b 0
