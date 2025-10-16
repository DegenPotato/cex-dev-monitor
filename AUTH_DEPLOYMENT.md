# Authentication System Deployment Guide

This guide covers deploying the Solana wallet authentication system with JWT tokens.

## Architecture Overview

- **Frontend**: Vercel (Static React) - `https://cex-dev-monitor.vercel.app` or `https://alpha.sniff.agency`
- **Backend**: VPS Express Server - `http://139.59.237.215:3001`
- **Auth Flow**: Frontend → VPS Backend (NOT Vercel serverless)

## Backend Setup (VPS - 139.59.237.215)

### 1. Environment Variables

Create `.env` file on the VPS server:

```bash
# Navigate to project directory
cd /path/to/CEX-DEV-MONITOR

# Create .env from example
cp .env.example .env

# Edit with secure values
nano .env
```

**Required `.env` configuration:**

```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# JWT Authentication (REQUIRED!)
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your-actual-64-character-hex-string-here

# Database
DB_PATH=./monitor.db

# CORS - Allow Vercel domains
ALLOWED_ORIGINS=https://cex-dev-monitor.vercel.app,https://alpha.sniff.agency,https://sniff.agency

# Optional: Telegram notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 2. Generate Secure JWT Secret

Run this on the VPS to generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and paste it as `JWT_SECRET` in your `.env` file.

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Backend Server

```bash
# Development
npm run dev

# Production (with PM2)
pm2 start src/backend/server.ts --name cex-monitor --interpreter tsx
pm2 save
pm2 startup
```

### 5. Verify Backend is Running

Test auth endpoints:

```bash
# Health check
curl http://139.59.237.215:3001/api/health

# Test challenge endpoint
curl -X POST http://139.59.237.215:3001/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"YourSolanaWalletAddressHere"}'
```

## Frontend Setup (Vercel)

### Environment Variables in Vercel Dashboard

Go to your Vercel project settings → Environment Variables:

**Add these variables:**

```
VITE_BACKEND_URL=http://139.59.237.215:3001
```

Or if using SSL proxy (recommended):

```
VITE_BACKEND_URL=https://assets.sniff.agency
```

### Deploy to Vercel

```bash
# From project root
git push origin main

# Vercel will auto-deploy
```

## SSL/HTTPS Setup (Recommended)

For production, use your existing Nginx SSL setup for `assets.sniff.agency`:

**Nginx config:**

```nginx
# /etc/nginx/sites-available/assets.sniff.agency
server {
    listen 443 ssl http2;
    server_name assets.sniff.agency;
    
    ssl_certificate /etc/letsencrypt/live/assets.sniff.agency/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/assets.sniff.agency/privkey.pem;
    
    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Serve static files (hdri, assets)
    location / {
        root /path/to/CEX-DEV-MONITOR/public;
        try_files $uri $uri/ =404;
    }
}
```

Then update frontend env:

```
VITE_BACKEND_URL=https://assets.sniff.agency
```

## Testing Authentication Flow

### 1. Connect Wallet
- Open `https://alpha.sniff.agency`
- Click "ENTER" to trigger vortex
- Billboard appears with "Connect Wallet" button
- Click button and select Phantom/Solflare

### 2. Sign Message
- Wallet prompts to sign authentication message
- Message includes wallet address and nonce
- No gas fees required

### 3. Verification
- Frontend sends signature to VPS backend
- Backend verifies ed25519 signature
- Creates/retrieves user account
- Sets HTTP-only cookies
- Returns user data

### 4. Authenticated State
- User is now authenticated
- Access token valid for 15 minutes
- Refresh token valid for 7 days
- Auto-refresh before expiry

## Troubleshooting

### CORS Errors

**Problem**: `Access-Control-Allow-Origin` errors

**Solution**: Verify `ALLOWED_ORIGINS` in `.env` includes your Vercel domain

```bash
# Backend .env
ALLOWED_ORIGINS=https://cex-dev-monitor.vercel.app,https://alpha.sniff.agency
```

### Cookie Not Set

**Problem**: Cookies not being saved in browser

**Solutions**:
- Ensure `credentials: 'include'` in frontend fetch calls ✅ (already done)
- Use HTTPS in production (Vercel → VPS SSL)
- Check `sameSite: 'none'` for cross-origin in production

### Authentication Fails

**Problem**: Signature verification fails

**Check**:
1. Frontend is using correct backend URL
2. Challenge was generated within 5 minutes
3. Wallet supports `signMessage()` (Phantom/Solflare do)
4. Signature is base58 encoded

## Security Checklist

- [ ] JWT_SECRET is 64+ characters random hex
- [ ] NODE_ENV=production on VPS
- [ ] HTTPS enabled (via Nginx)
- [ ] CORS limited to known domains
- [ ] Database backed up regularly
- [ ] PM2 running with auto-restart
- [ ] Firewall allows only ports 80, 443, 22

## Monitoring

```bash
# Check backend logs
pm2 logs cex-monitor

# Check auth-specific logs
pm2 logs cex-monitor | grep "\[Auth\]"

# Monitor server health
pm2 monit
```
