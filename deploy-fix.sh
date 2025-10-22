#!/bin/bash
# Quick deployment fix for trading wallets schema and rate limiting

echo "🚀 Deploying fixes for trading wallet schema and Telegram rate limiting..."

# Commit and push changes
echo "📦 Committing changes..."
git add -A
git commit -m "Fix: Trading wallet schema compatibility and Telegram rate limiting

- Added WalletStorageServiceCompat for dual schema support
- Migration 020 handles transition from old to new schema
- More conservative Telegram API rate limits
- Handles both wallet_address/encrypted_private_key (old) and public_key/private_key (new)"

echo "📤 Pushing to GitHub..."
git push

echo "🔧 Deploying to server..."
ssh -i "C:\Users\Potato\.ssh\id_ed25519_new" root@139.59.237.215 << 'ENDSSH'
cd /var/www/cex-monitor
echo "📥 Pulling latest code..."
git pull

echo "🗃️ Running database migrations..."
node run-all-migrations.mjs

echo "🔨 Building backend..."
npm run build:backend

echo "🔄 Restarting service..."
pm2 restart cex-monitor

echo "📊 Checking status..."
pm2 status
ENDSSH

echo "✅ Deployment complete! The trading wallets should now work with both old and new schemas."
