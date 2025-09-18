@echo off
echo Stopping Continuous Sync Process...
echo =====================================

REM Kill any running Node.js processes
taskkill /f /im node.exe 2>nul
if %errorlevel% equ 0 (
    echo ✅ Stopped running Node.js processes
) else (
    echo ℹ️  No Node.js processes were running
)

REM Remove continuous sync from startup
if exist "start-continuous-sync.bat" (
    ren "start-continuous-sync.bat" "start-continuous-sync.bat.disabled"
    echo ✅ Disabled continuous sync startup script
)

REM Remove from Windows startup if it was added
reg delete "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run" /v "TallyContinuousSync" /f 2>nul
if %errorlevel% equ 0 (
    echo ✅ Removed continuous sync from Windows startup
) else (
    echo ℹ️  Continuous sync was not in Windows startup
)

echo.
echo 🛑 Continuous Sync Process Disabled
echo ====================================
echo The continuous sync will not start automatically.
echo To re-enable later, rename start-continuous-sync.bat.disabled back to start-continuous-sync.bat
echo.
pause
