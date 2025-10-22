# PowerShell Deploy Script for Sniff Agency
param(
    [switch]$Migration  # Add -Migration flag for database migrations
)

$sshKey = "C:\Users\Potato\.ssh\id_ed25519_new"
$server = "root@139.59.237.215"
$projectPath = "/var/www/cex-monitor"

if ($Migration) {
    Write-Host "🚨 Deploying with database migrations..." -ForegroundColor Yellow
    Write-Host "⚠️  Server will be stopped temporarily!" -ForegroundColor Red
    $confirm = Read-Host "Continue? (y/N)"
    if ($confirm -ne 'y') { exit }
    
    $command = "cd $projectPath && pm2 stop cex-monitor && git pull && npm install && npm run migrate && npm run build && pm2 start cex-monitor && pm2 save && echo '✅ Deployed with migrations!'"
} else {
    Write-Host "🚀 Deploying to production..." -ForegroundColor Green
    $command = "cd $projectPath && git pull && npm install && npm run build && pm2 restart cex-monitor && pm2 save && echo '✅ Deployed!'"
}

ssh -i $sshKey $server $command

Write-Host "🎉 Deployment complete!" -ForegroundColor Green
