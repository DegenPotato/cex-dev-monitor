#!/bin/bash

# Deploy script for VPS (to be copied to /var/www/cex-monitor/deploy.sh)
# Usage: ./deploy.sh [--migrate]

set -e  # Exit on error

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ "$1" == "--migrate" ]; then
    echo -e "${YELLOW}🚨 Deploying with database migrations...${NC}"
    echo -e "${RED}⚠️  Server will be stopped temporarily!${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 1
    fi
    
    echo "Stopping server..."
    pm2 stop cex-monitor
    
    echo "Pulling latest code..."
    git pull
    
    echo "Installing dependencies..."
    npm install
    
    echo "Running database migrations..."
    npm run migrate || echo "⚠️  No migrations to run"
    
    echo "Building TypeScript..."
    npm run build
    
    echo "Starting server..."
    pm2 start cex-monitor
    pm2 save
    
    echo -e "${GREEN}✅ Deployed with migrations!${NC}"
else
    echo -e "${GREEN}🚀 Deploying to production...${NC}"
    
    echo "Pulling latest code..."
    git pull
    
    echo "Installing dependencies..."
    npm install
    
    echo "Building TypeScript..."
    npm run build
    
    echo "Restarting server..."
    pm2 restart cex-monitor
    pm2 save
    
    echo -e "${GREEN}✅ Deployed!${NC}"
fi

# Show status
echo ""
echo "Server status:"
pm2 status cex-monitor
