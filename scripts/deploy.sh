#!/bin/bash

# Auto-deployment script for CEX Monitor
# Called by webhook when new code is pushed to GitHub

echo "========================================"
echo "Starting deployment at $(date)"
echo "========================================"

# Navigate to project directory
cd /var/www/cex-monitor

# Pull latest code from GitHub
echo "[1/5] Pulling latest code..."
git pull origin main

# Check if package.json was updated
echo "[2/5] Checking for dependency updates..."
if git diff HEAD~ HEAD --name-only | grep -q "package.json"; then
    echo "package.json changed, running npm install..."
    npm install --production
else
    echo "No dependency changes detected"
fi

# Build the project
echo "[3/5] Building project..."
npm run build

# Migrate database if needed
echo "[4/5] Running migrations..."
npm run migrate 2>/dev/null || echo "No migrations to run"

# Reload PM2 with zero downtime
echo "[5/5] Reloading PM2..."
pm2 reload ecosystem.config.js --env production

# Save PM2 state
pm2 save

echo "========================================"
echo "Deployment completed at $(date)"
echo "========================================"
