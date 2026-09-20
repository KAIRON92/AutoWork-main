@echo off
setlocal
title AutoWork Control Center
cd /d "%~dp0"
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\AutoWork.ps1" -Action run
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\AutoWork.ps1" -Action %*
)
if errorlevel 1 (
  echo.
  pause
)
endlocal
