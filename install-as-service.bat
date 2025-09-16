@echo off
echo ========================================
echo  Install Tally Incremental Sync as Windows Service
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: This script must be run as Administrator
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Installing Tally Incremental Sync as Windows Service...
echo.

REM Install node-windows globally if not already installed
echo Installing node-windows...
npm install -g node-windows

REM Create service installation script
echo Creating service installation script...

(
echo const Service = require('node-windows'^).Service;
echo.
echo // Create a new service object
echo const svc = new Service(^{
echo   name: 'TallyIncrementalSync',
echo   description: 'Tally to Railway SQLite Incremental Sync Service',
echo   script: require('path'^).join(__dirname, 'incremental-sync.js'^),
echo   nodeOptions: [
echo     '--max_old_space_size=4096'
echo   ]
echo }^);
echo.
echo // Listen for the "install" event, which indicates the
echo // process is available as a service.
echo svc.on('install', function(^){
echo   console.log('✅ Tally Incremental Sync service installed successfully');
echo   console.log('🚀 Starting service...');
echo   svc.start(^);
echo }^);
echo.
echo svc.on('start', function(^){
echo   console.log('✅ Tally Incremental Sync service started');
echo   console.log('📊 Service will sync Tally data every 5 minutes');
echo }^);
echo.
echo // Install the service
echo console.log('📦 Installing Tally Incremental Sync service...');
echo svc.install(^);
) > install-service.js

echo.
echo Running service installation...
node install-service.js

echo.
echo ========================================
echo Service Installation Complete
echo ========================================
echo.
echo The Tally Incremental Sync is now installed as a Windows Service:
echo.
echo Service Name: TallyIncrementalSync
echo Description: Tally to Railway SQLite Incremental Sync Service
echo.
echo 🔧 Management Commands:
echo   • Start:   sc start TallyIncrementalSync
echo   • Stop:    sc stop TallyIncrementalSync
echo   • Status:  sc query TallyIncrementalSync
echo.
echo 📊 The service will:
echo   • Monitor Tally for changes every 5 minutes
echo   • Sync new vouchers, accounting, and inventory data
echo   • Run only during business hours (9 AM - 6 PM)
echo   • Maintain all data relationships and linkages
echo.
echo 📋 Logs Location: logs\incremental-sync.log
echo.
pause
