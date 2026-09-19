@echo off
setlocal
title AutoWork Live Link
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\live_link.ps1"
if errorlevel 1 (
    echo.
    pause
)
endlocal
