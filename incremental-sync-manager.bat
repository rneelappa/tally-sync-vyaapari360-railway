@echo off
echo ========================================
echo  Tally Incremental Sync Manager
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Current Configuration:
echo   Company: SKM IMPEX-CHENNAI-(24-25)
echo   Company ID: 629f49fb-983e-4141-8c48-e1423b39e921
echo   Division ID: 37f3cc0c-58ad-4baf-b309-360116ffc3cd
echo   Railway: tally-sync-vyaapari360-railway-production.up.railway.app
echo.

echo What would you like to do?
echo 1. Test incremental sync setup
echo 2. Run one-time incremental sync
echo 3. Start continuous incremental sync (every 5 minutes)
echo 4. Configure sync schedule
echo 5. View sync logs
echo 6. Stop running sync
echo.
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" (
    echo.
    echo Testing incremental sync setup...
    node incremental-sync.js --test
) else if "%choice%"=="2" (
    echo.
    echo Running one-time incremental sync...
    node incremental-sync.js --once
) else if "%choice%"=="3" (
    echo.
    echo Starting continuous incremental sync...
    echo This will sync new/modified Tally data every 5 minutes
    echo Press Ctrl+C to stop
    echo.
    node incremental-sync.js
) else if "%choice%"=="4" (
    echo.
    echo Opening configuration file...
    notepad incremental-sync-config.json
    echo Configuration updated. Restart sync to apply changes.
) else if "%choice%"=="5" (
    echo.
    echo Viewing sync logs...
    if exist "logs\incremental-sync.log" (
        type logs\incremental-sync.log | more
    ) else (
        echo No log file found. Run sync first.
    )
) else if "%choice%"=="6" (
    echo.
    echo Stopping running sync processes...
    taskkill /f /im node.exe /fi "WINDOWTITLE eq *incremental-sync*" >nul 2>&1
    echo Sync processes stopped.
) else (
    echo Invalid choice. Please run the script again.
)

echo.
echo ========================================
echo Incremental Sync Manager
echo ========================================
echo.
echo 📊 Current Status:
if exist "logs\incremental-sync.log" (
    echo   Last sync activity found in logs
) else (
    echo   No sync activity detected
)
echo.
echo 🔧 Configuration:
echo   • Frequency: 5 minutes (configurable)
echo   • Business hours: 9 AM - 6 PM (configurable)
echo   • Working days: Mon-Sat (configurable)
echo   • AlterID tracking: Enabled
echo.
echo 🎯 Features:
echo   • Detects new vouchers automatically
echo   • Syncs dispatch details and inventory
echo   • Maintains party account relationships
echo   • Tracks GST and tax entries
echo   • Preserves all data linkages
echo.
pause
