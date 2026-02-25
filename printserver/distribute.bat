@echo off
:: Eco-Thrift Print Server — Distribute
:: Run this from the printserver\ directory to build and publish a new release.

cd /d "%~dp0"

:: Try to use the project venv first, then fall back to system Python
if exist "..\venv\Scripts\python.exe" (
    set PYTHON=..\venv\Scripts\python.exe
) else if exist "..\env\Scripts\python.exe" (
    set PYTHON=..\env\Scripts\python.exe
) else (
    set PYTHON=python
)

echo.
echo  Using Python: %PYTHON%
echo.

%PYTHON% distribute.py
pause
