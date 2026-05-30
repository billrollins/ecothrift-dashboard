@echo off
setlocal
echo Stopping processes listening on ports 8000, 5173, and 5174...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do (
  taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
  taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do (
  taskkill /F /PID %%a 2>nul
)
echo Done.
endlocal
