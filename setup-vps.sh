#!/bin/bash

# VPS Initial Setup Script
# Run this ONCE on a fresh VPS

set -e  # Exit on error

echo "🚀 CEX Monitor - VPS Setup"
echo "========================================="

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js v20
echo "📦 Installing Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# Install tsx (TypeScript executor)
echo "📦 Installing tsx..."
npm install -g tsx

# Install Git
echo "📦 Installing Git..."
apt install -y git

# Install Nginx
echo "📦 Installing Nginx..."
apt install -y nginx

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /root/apps
cd /root/apps

# Clone repository (user will need to provide URL)
echo ""
echo "⚠️  Manual step required:"
echo "Run: git clone https://github.com/YOUR_USERNAME/cex-monitor.git"
echo "Then: cd cex-monitor"
echo ""

# Configure firewall
echo "🔒 Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3001/tcp
ufw --force enable

# Configure Nginx
echo "🌐 Setting up Nginx..."
if [ -f "/root/apps/cex-monitor/nginx.conf" ]; then
    cp /root/apps/cex-monitor/nginx.conf /etc/nginx/sites-available/cex-monitor
    ln -sf /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
    echo "✅ Nginx configured"
else
    echo "⚠️  Copy nginx.conf manually after cloning repo"
fi

# Display versions
echo ""
echo "✅ Setup complete!"
echo "========================================="
echo "Installed versions:"
node --version
npm --version
pm2 --version
nginx -v
echo ""
echo "🔍 Next steps:"
echo "1. Clone your repository: git clone https://github.com/YOUR_USERNAME/cex-monitor.git"
echo "2. cd /root/apps/cex-monitor"
echo "3. npm install"
echo "4. Copy .env.example to .env and configure"
echo "5. Add your proxies.txt file (if using proxies)"
echo "6. Start with PM2: pm2 start ecosystem.config.js"
echo "7. Save PM2 config: pm2 save"
echo "8. Setup PM2 startup: pm2 startup"
echo ""
echo "📊 Useful commands:"
echo "  pm2 status              - Check app status"
echo "  pm2 logs cex-monitor    - View logs"
echo "  pm2 restart cex-monitor - Restart app"
echo "  ./deploy.sh             - Deploy updates"
