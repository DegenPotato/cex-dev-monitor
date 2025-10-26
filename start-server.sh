#!/bin/bash
# Emergency server start script

echo "Starting server directly without build..."

# Make sure PM2 is stopped
pm2 stop cex-monitor 2>/dev/null

# Start server directly with node (JavaScript files should be in dist/)
pm2 start dist/backend/server.js --name cex-monitor --instances 1 --exec-mode cluster

# If dist doesn't exist or is broken, try with ts-node
if [ $? -ne 0 ]; then
    echo "dist folder not found, starting with ts-node..."
    pm2 start src/backend/server.ts --name cex-monitor --interpreter="npx" --interpreter-args="tsx"
fi

pm2 status
pm2 logs cex-monitor --lines 20
