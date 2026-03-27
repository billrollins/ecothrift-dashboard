@echo off
setlocal EnableDelayedExpansion
echo Eco-Thrift — remove legacy print stacks (V2 Python + V3 frozen) — best-effort
echo Primary path: run ecothrift-printserver-setup.exe Install — it runs the same cleanup in Python.
echo.
echo This batch may need "Run as administrator" to delete C:\DashPrintServer or C:\PrintServer.
pause

echo Stopping ecothrift-printserver.exe...
taskkill /F /IM ecothrift-printserver.exe >nul 2>&1

echo Killing PIDs listening on port 8888...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8888 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Eco-Thrift Print Server.vbs"
if exist "%VBS%" (
  echo Removing V2 Startup VBS...
  del /f /q "%VBS%"
)

call :TryRemoveV2 "C:\DashPrintServer"
call :TryRemoveV2 "C:\PrintServer"

echo Removing HKCU Run EcoThriftPrintServer...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v EcoThriftPrintServer /f >nul 2>&1

if defined LOCALAPPDATA (
  if exist "%LOCALAPPDATA%\EcoThrift\PrintServer" (
    echo Removing V3 install dir...
    rd /s /q "%LOCALAPPDATA%\EcoThrift\PrintServer" 2>nul
  )
)

echo Done.
pause
goto :eof

:TryRemoveV2
set "ROOT=%~1"
if not exist "%ROOT%\print_server.py" goto :eof
if not exist "%ROOT%\venv\" (
  echo Skip %ROOT% — no venv\ next to print_server.py
  goto :eof
)
echo Removing legacy V2 tree %ROOT% ...
rd /s /q "%ROOT%" 2>nul
if exist "%ROOT%" echo Failed %ROOT% — try Run as administrator
goto :eof
