@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-local-development.ps1" %*
set "PS_UPDATE_EXIT=%ERRORLEVEL%"
if not "%PS_UPDATE_EXIT%"=="0" echo Local update FAILED. Exit code: %PS_UPDATE_EXIT%
pause
exit /b %PS_UPDATE_EXIT%
