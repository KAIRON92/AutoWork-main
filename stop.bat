@echo off
setlocal
title AutoWork Stopper
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { try { Unblock-File -Path '%~dp0tools\AutoWork.ps1' -ErrorAction SilentlyContinue } catch {}; & '%~dp0tools\AutoWork.ps1' -Action stop }"
if errorlevel 1 (
  echo.
  pause
)
endlocal
