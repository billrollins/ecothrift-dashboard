@echo off
rem House env sync (pull) - vendored from C:\Coding\.ai\packages\env-sync. Do not edit here.
setlocal
set "PY=%~dp0..\..\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=%~dp0..\..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=py -3"
%PY% "%~dp0env_sync.py" pull %*
exit /b %ERRORLEVEL%
