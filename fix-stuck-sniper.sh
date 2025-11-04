#!/bin/bash

# This script fixes the stuck sniper by:
# 1. Stopping the sniper gracefully
# 2. Waiting for it to clean up
# 3. Starting it fresh

echo "🛑 Stopping Pumpfun sniper..."
curl -X POST http://localhost:3001/api/test-lab/pumpfun-sniper/stop \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie-here"

echo "⏳ Waiting 5 seconds for cleanup..."
sleep 5

echo "🚀 Starting Pumpfun sniper fresh..."
curl -X POST http://localhost:3001/api/test-lab/pumpfun-sniper/start \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie-here" \
  -d '{
    "mode": "single",
    "buyAmount": 0.0001,
    "stopLoss": -10,
    "takeProfits": [20, 50, 100],
    "wallet": "GgCF6zt1yS4znkVrEtKQQ443Ta7UHEyDqefCJFSuuxQc"
  }'

echo "✅ Sniper restarted with new code!"
