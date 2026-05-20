@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_local_worker_windows.ps1"

echo.
echo Tena Forge local worker window can be closed now.
pause
