#!/bin/bash

echo "========================================"
echo "GitHub Webhook Setup for Auto-Deployment"
echo "========================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run as root (use sudo)"
   exit 1
fi

# Install webhook dependencies
echo "[1/5] Installing webhook dependencies..."
cd /var/www/cex-monitor
npm install express

# Generate webhook secret
echo "[2/5] Generating webhook secret..."
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET" >> .env
echo ""
echo "IMPORTANT: Save this webhook secret for GitHub:"
echo "========================================"
echo "$WEBHOOK_SECRET"
echo "========================================"
echo ""

# Make scripts executable
echo "[3/5] Making scripts executable..."
chmod +x scripts/deploy.sh
chmod +x scripts/webhook-deploy.js

# Create PM2 app for webhook server
echo "[4/5] Setting up PM2 for webhook server..."
pm2 start scripts/webhook-deploy.js --name "cex-webhook" --env production
pm2 save
pm2 startup

# Configure nginx (optional)
echo "[5/5] Nginx configuration (optional)..."
cat << 'EOF'

Add this to your nginx configuration if you want to proxy the webhook:

location /github-webhook {
    proxy_pass http://localhost:9001/webhook;
    proxy_http_version 1.1;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Hub-Signature-256 $http_x_hub_signature_256;
    proxy_set_header X-GitHub-Event $http_x_github_event;
}

EOF

echo "========================================"
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Go to GitHub: https://github.com/DegenPotato/cex-dev-monitor/settings/hooks"
echo "2. Click 'Add webhook'"
echo "3. Payload URL: http://YOUR_VPS_IP:9001/webhook"
echo "4. Content type: application/json"
echo "5. Secret: (use the secret shown above)"
echo "6. Select: Just the push event"
echo "7. Click 'Add webhook'"
echo ""
echo "Your backend will now auto-deploy when you push to GitHub!"
echo "========================================
