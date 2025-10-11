# Deployment Guide - VPS + Vercel

## 🎯 Architecture

```
Frontend (Vercel)                Backend (VPS)
┌─────────────────┐            ┌──────────────────┐
│  React App      │  ────────> │  Node.js Server  │
│  Static Assets  │  API Calls │  WebSocket       │
│  Auto-deployed  │            │  Database        │
└─────────────────┘            └──────────────────┘
```

**Frontend:** Vercel (auto-deploy from GitHub)  
**Backend:** VPS (manual deployment, PM2 for process management)

---

## 🚀 Part 1: VPS Setup (Backend)

### SSH Connection

```bash
ssh -i "C:\Users\User\.ssh\id_ed25519_hq" root@165.22.58.208
```

### Initial Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install Git
apt install -y git

# Verify installations
node --version
npm --version
pm2 --version
```

### Clone and Setup Project

```bash
# Create app directory
mkdir -p /root/apps
cd /root/apps

# Clone your repo (you'll need to create this)
git clone https://github.com/YOUR_USERNAME/cex-monitor.git
cd cex-monitor

# Install dependencies
npm install

# Create environment file
nano .env
```

### Environment Configuration (.env)

```bash
# Server
PORT=3001
NODE_ENV=production

# Database
DB_PATH=/root/apps/cex-monitor/monitor.db

# CORS (allow Vercel domain)
ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:3000

# Proxies (if using)
PROXY_FILE=/root/apps/cex-monitor/proxies.txt
```

### Build Backend

```bash
# Build TypeScript
npm run build

# Or if you don't have a build script, run directly with tsx
npm install -g tsx
```

### Start with PM2

```bash
# Start backend
pm2 start src/backend/server.ts --name cex-monitor --interpreter tsx

# Or if built:
pm2 start dist/backend/server.js --name cex-monitor

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs

# Check status
pm2 status
pm2 logs cex-monitor
```

### Firewall Setup

```bash
# Allow SSH
ufw allow 22/tcp

# Allow backend port
ufw allow 3001/tcp

# Enable firewall
ufw enable
```

### Nginx Reverse Proxy (Optional, Recommended)

```bash
# Install Nginx
apt install -y nginx

# Create config
nano /etc/nginx/sites-available/cex-monitor
```

Nginx config:
```nginx
server {
    listen 80;
    server_name 165.22.58.208;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable and start:
```bash
ln -s /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## 🌐 Part 2: GitHub Repo Setup

### Create New Repository

1. Go to: https://github.com/new
2. Name: `cex-monitor`
3. Private repository
4. Don't initialize with README

### Prepare Project Structure

Create two separate folders:
```
cex-monitor/
├── backend/           # Backend only (runs on VPS)
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── .gitignore
│
└── frontend/          # Frontend only (deploys to Vercel)
    ├── src/
    ├── package.json
    ├── vite.config.ts
    └── .gitignore
```

### Split Your Project

```bash
# In your current project folder
cd c:/Users/User/OneDrive/Desktop/tg-scanner/degenville/CEX-DEV-MONITOR

# Initialize git
git init
git remote add origin https://github.com/YOUR_USERNAME/cex-monitor.git

# Create .gitignore
```

**.gitignore:**
```
# Backend
node_modules/
dist/
*.db
*.log
.env
proxies.txt

# Frontend  
node_modules/
dist/
.vite/
```

### Push to GitHub

```bash
git add .
git commit -m "Initial commit: CEX Monitor"
git branch -M main
git push -u origin main
```

---

## ☁️ Part 3: Vercel Deployment (Frontend)

### Connect to Vercel

1. Go to: https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your `cex-monitor` repository

### Configure Build Settings

**Framework Preset:** Vite  
**Root Directory:** `./` (or `frontend/` if you split)  
**Build Command:** `npm run build`  
**Output Directory:** `dist`

### Environment Variables

Add in Vercel dashboard:
```
VITE_API_URL=http://165.22.58.208:3001
VITE_WS_URL=ws://165.22.58.208:3001/ws
```

Or with Nginx:
```
VITE_API_URL=http://165.22.58.208
VITE_WS_URL=ws://165.22.58.208/ws
```

### Update Frontend Code

**src/config.ts:**
```typescript
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
```

Update all API calls to use `API_URL`:
```typescript
// Before:
fetch('/api/transactions')

// After:
fetch(`${API_URL}/api/transactions`)
```

### Deploy

```bash
# Vercel will auto-deploy on every push to main
git add .
git commit -m "Update API endpoints for production"
git push
```

Your app will be live at: `https://your-app.vercel.app`

---

## 🔄 Update Backend CORS

On VPS, update your backend to allow Vercel domain:

**src/backend/server.ts:**
```typescript
import cors from 'cors';

app.use(cors({
  origin: [
    'https://your-app.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
```

Restart backend:
```bash
pm2 restart cex-monitor
```

---

## 🛠️ Useful Commands

### VPS (Backend)

```bash
# SSH into server
ssh -i "C:\Users\User\.ssh\id_ed25519_hq" root@165.22.58.208

# Check logs
pm2 logs cex-monitor
pm2 logs cex-monitor --lines 100

# Restart backend
pm2 restart cex-monitor

# Update code
cd /root/apps/cex-monitor
git pull
npm install
pm2 restart cex-monitor

# Check status
pm2 status
pm2 monit

# Database location
ls -lh /root/apps/cex-monitor/monitor.db
```

### Local Development

```bash
# Run backend locally
npm run dev:backend

# Run frontend locally
npm run dev:frontend

# Run both
npm run dev
```

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from local
vercel --prod

# Check deployments
vercel ls

# View logs
vercel logs your-app.vercel.app
```

---

## 📊 Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Resource usage
pm2 status

# Logs
pm2 logs
```

### Server Resources

```bash
# Disk usage
df -h

# Memory usage
free -h

# CPU usage
htop
```

---

## 🔐 Security Checklist

- [ ] SSH key-based authentication only (disable password)
- [ ] UFW firewall enabled
- [ ] Only necessary ports open (22, 80, 3001)
- [ ] Regular security updates: `apt update && apt upgrade`
- [ ] Database backups scheduled
- [ ] Environment variables not committed to Git
- [ ] Proxies file not committed to Git
- [ ] CORS configured correctly
- [ ] Rate limiting enabled on backend

---

## 🐛 Troubleshooting

### Backend won't start
```bash
pm2 logs cex-monitor --lines 50
# Check for port conflicts
netstat -tulpn | grep 3001
```

### Frontend can't connect to backend
- Check CORS settings on backend
- Verify API_URL in Vercel env vars
- Check firewall allows port 3001

### Database issues
```bash
# Check database file
ls -lh /root/apps/cex-monitor/monitor.db

# Check permissions
chmod 644 /root/apps/cex-monitor/monitor.db
```

### High memory usage
```bash
# Check PM2 memory
pm2 status

# Restart if needed
pm2 restart cex-monitor
```

---

## 🔄 Deployment Workflow

### Making Changes

1. **Develop locally**
   ```bash
   npm run dev
   ```

2. **Commit and push**
   ```bash
   git add .
   git commit -m "Description"
   git push
   ```

3. **Frontend auto-deploys** (Vercel)
   - Check: https://vercel.com/dashboard

4. **Update backend manually**
   ```bash
   ssh -i "C:\Users\User\.ssh\id_ed25519_hq" root@165.22.58.208
   cd /root/apps/cex-monitor
   git pull
   pm2 restart cex-monitor
   ```

---

## 📦 Backup Strategy

### Database Backup Script

```bash
#!/bin/bash
# /root/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/backups"
mkdir -p $BACKUP_DIR

cp /root/apps/cex-monitor/monitor.db $BACKUP_DIR/monitor_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "monitor_*.db" -mtime +7 -delete

echo "Backup complete: monitor_$DATE.db"
```

Schedule with cron:
```bash
crontab -e
# Add: 0 */6 * * * /root/backup-db.sh  # Every 6 hours
```

---

## 🚀 Next Steps

1. [ ] Set up VPS with Node.js and PM2
2. [ ] Create GitHub repository
3. [ ] Push code to GitHub
4. [ ] Deploy frontend to Vercel
5. [ ] Configure environment variables
6. [ ] Update CORS settings
7. [ ] Test end-to-end
8. [ ] Set up monitoring
9. [ ] Configure backups

**Your app will be live at:**
- Frontend: `https://your-app.vercel.app`
- Backend: `http://165.22.58.208:3001`
- WebSocket: `ws://165.22.58.208:3001/ws`
