@echo off
setlocal
title AutoWork Stopper
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0tools\AutoWork.ps1" -Action stop
if errorlevel 1 (
  echo.
  pause
)
endlocal
