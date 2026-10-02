@echo off
rem House env sync (diff) - vendored from C:\Coding\.ai\packages\env-sync. Do not edit here.
setlocal
set "PY=%~dp0..\..\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=%~dp0..\..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=py -3"
%PY% "%~dp0env_sync.py" diff %*
exit /b %ERRORLEVEL%
