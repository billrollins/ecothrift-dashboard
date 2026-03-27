@echo off
:: Print the first 3 labels from the retag E2E fixture (thermal, 3x2 — pass --preset 1.5x1 for small stock).
:: Data: workspace\testing\data\retag_e2e_10_items.json
:: Add --dry-run to write PNGs under printserver\output\e2e_retag\ instead of printing.
:: Extra args are passed through (e.g. --printer "Other Name", --preset 3x2).

setlocal
set "PSDIR=%~dp0"
cd /d "%PSDIR%"

if exist "%PSDIR%..\venv\Scripts\python.exe" (
  set "PY=%PSDIR%..\venv\Scripts\python.exe"
) else if exist "%PSDIR%..\env\Scripts\python.exe" (
  set "PY=%PSDIR%..\env\Scripts\python.exe"
) else (
  set "PY=python"
)

set "DATA=%PSDIR%..\workspace\testing\data\retag_e2e_10_items.json"
if not exist "%DATA%" (
  echo ERROR: Missing %DATA%
  echo Generate with: python workspace\testing\data\generate_retag_e2e_sample.py
  exit /b 1
)

echo Using %PY%
echo Data: %DATA%
echo.

"%PY%" "%PSDIR%scripts\print_labels_from_json.py" --file "%DATA%" --limit 3 %*
set "EC=%ERRORLEVEL%"
if %EC% neq 0 pause
endlocal & exit /b %EC%
