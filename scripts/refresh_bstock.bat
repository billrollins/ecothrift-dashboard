@echo off
echo Opening B-Stock...
start https://bstock.com/buy/seller/target
echo.
echo Click the "B-Stock Token" bookmarklet in your browser.
echo Waiting for token update...
echo.

set TOKEN_FILE=%~dp0..\workspace\.bstock_token
for %%F in ("%TOKEN_FILE%") do set BEFORE=%%~tF

:wait_loop
timeout /t 2 /nobreak >nul
for %%F in ("%TOKEN_FILE%") do set AFTER=%%~tF
if "%BEFORE%"=="%AFTER%" goto wait_loop

echo Token updated! Running sweep...
cd /d %~dp0..
python manage.py sweep_auctions
echo.
echo Sweep complete. Run pull_manifests manually if needed.
pause
