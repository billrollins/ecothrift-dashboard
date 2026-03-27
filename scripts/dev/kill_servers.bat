@echo off
setlocal
echo Stopping processes listening on ports 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do (
  taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
  taskkill /F /PID %%a 2>nul
)
echo Done.
endlocal
