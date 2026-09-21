@echo off
where /q pwsh.exe
if errorlevel 1 (
    echo PowerShell 7 is required. Install it and make pwsh.exe available in PATH.
    pause
    exit /b 1
)
pwsh.exe -NoProfile -File "%~dp0run.ps1" -Disk %*
set result=%errorlevel%
if not "%result%"=="0" pause
exit /b %result%
