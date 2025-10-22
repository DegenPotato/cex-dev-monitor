@echo off
echo Deploying with database migrations...
echo WARNING: This will stop the server temporarily!
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul
ssh -i "C:\Users\Potato\.ssh\id_ed25519_new" root@139.59.237.215 "cd /var/www/cex-monitor && pm2 stop cex-monitor && git pull && npm install && npm run migrate && npm run build && pm2 start cex-monitor && pm2 save && echo 'Deployment with migrations complete!'"
echo.
echo Press any key to exit...
pause >nul
