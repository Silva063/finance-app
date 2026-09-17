@echo off
cd /d "%~dp0"

start "" python -m http.server 3000
timeout /t 2 >nul
start http://localhost:3000