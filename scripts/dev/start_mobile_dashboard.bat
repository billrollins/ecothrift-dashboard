@echo off
REM Staff dashboard on LAN HTTPS so a phone on the same Wi-Fi can hit it. Does not start www.
REM Phone URL to bookmark: https://<hostname>.local:5173/pricescanner (QR code printed at READY).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" -Target Staff %*
exit /b %ERRORLEVEL%
