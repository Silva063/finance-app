@echo off
chcp 65001 >nul
cd /d "%~dp0.."
node testsun.js
if errorlevel 1 (echo. & echo Проверки не прошли. & pause & exit /b 1)
echo.
pause
