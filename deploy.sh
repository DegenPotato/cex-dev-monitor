#!/bin/bash

# Deploy script for CEX Monitor
echo "Starting deployment..."
# Navigate to project directory
cd /var/www/cex-monitor || exit 1

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
npm install

# Build project
echo "Building project..."
npm run build

# Check if build succeeded
if [ $? -eq 0 ]; then
  echo "Build successful"
else
  echo "Build failed"
  exit 1
fi
echo "🔄 Restarting application..."
pm2 restart cex-monitor || pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Show status
echo "✅ Deployment complete!"
echo ""
pm2 status
echo ""
echo "📊 To view logs: pm2 logs cex-monitor"
echo "📈 To monitor: pm2 monit"
