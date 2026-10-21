@echo off
rem House env sync (push) - vendored from {master}/packages/env-sync. Do not edit here.
setlocal
set "PY=%~dp0..\..\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=%~dp0..\..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=py -3"
%PY% "%~dp0env_sync.py" push %*
exit /b %ERRORLEVEL%
