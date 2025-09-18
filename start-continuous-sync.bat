@echo off
echo ========================================
echo  Start Continuous 5-Minute Sync
echo ========================================
echo.

echo 🔄 Tally Continuous Sync
echo Company: SKM IMPEX-CHENNAI-(24-25)
echo Frequency: Every 5 minutes
echo Target: Railway SQLite Database
echo.

echo Starting continuous sync...
echo Press Ctrl+C to stop
echo.

node continuous-sync.js

echo.
echo Continuous sync stopped.
pause
