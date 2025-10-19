# Auto-Deployment Setup

This guide will set up automatic deployment of your backend server whenever you push to GitHub.

## How It Works

1. You push code to GitHub
2. GitHub sends a webhook to your VPS
3. Your VPS automatically pulls the latest code and restarts the server
4. **Zero downtime** with PM2 reload

## Setup Instructions

### 1. SSH into your VPS
```bash
ssh root@YOUR_VPS_IP
cd /var/www/cex-monitor
```

### 2. Pull the latest code
```bash
git pull origin main
```

### 3. Run the setup script
```bash
sudo bash scripts/setup-webhook.sh
```

This script will:
- Install dependencies
- Generate a webhook secret (SAVE THIS!)
- Start the webhook server with PM2
- Show you the next steps

### 4. Configure GitHub Webhook

1. Go to: https://github.com/DegenPotato/cex-dev-monitor/settings/hooks
2. Click **"Add webhook"**
3. Configure:
   - **Payload URL**: `http://YOUR_VPS_IP:9001/webhook`
   - **Content type**: `application/json`
   - **Secret**: *(paste the secret from setup script)*
   - **Events**: Select "Just the push event"
4. Click **"Add webhook"**

### 5. Test It!

Push any change to GitHub:
```bash
git commit -m "test: auto-deployment"
git push
```

Your backend should automatically update within 10 seconds!

## Monitoring

Check webhook server logs:
```bash
pm2 logs cex-webhook
```

Check deployment logs:
```bash
pm2 logs cex-monitor
```

Check webhook health:
```bash
curl http://localhost:9001/health
```

## Security Notes

- The webhook secret prevents unauthorized deployments
- Only pushes to `main` branch trigger deployment
- GitHub's IP is verified via signature
- PM2 reload ensures zero downtime

## Troubleshooting

**Webhook not receiving:**
- Check firewall: `sudo ufw allow 9001`
- Check PM2: `pm2 status cex-webhook`

**Deployment failing:**
- Check permissions: `ls -la scripts/`
- Check logs: `pm2 logs cex-webhook --lines 50`

**PM2 issues:**
- Restart: `pm2 restart cex-webhook`
- Check status: `pm2 status`

## Manual Deployment (Fallback)

If auto-deploy isn't working, you can always deploy manually:
```bash
ssh root@YOUR_VPS_IP
cd /var/www/cex-monitor
bash scripts/deploy.sh
```
