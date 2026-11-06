@echo off
cd /d "%~dp0"

echo Starting application services...

pm2 start ecosystem.config.cjs

echo.
pm2 status

pause