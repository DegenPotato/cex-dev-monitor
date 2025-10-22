#!/bin/bash

echo "🚀 Deploying Trading Bot Fix..."
echo "================================"

# Navigate to project
cd /var/www/cex-monitor

# Stop the service
echo "⏹️ Stopping service..."
pm2 stop cex-monitor

# Pull latest code
echo "📥 Pulling latest changes..."
git pull

# Install dependencies (including socket.io)
echo "📦 Installing dependencies..."
npm install

# Build backend (with TypeScript)
echo "🔨 Building backend..."
npm run build:backend

# Restart service
echo "▶️ Starting service..."
pm2 start cex-monitor

echo "✅ Deployment complete!"
pm2 logs cex-monitor --lines 20
