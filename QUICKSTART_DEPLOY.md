# Quick Start - Deploy to VPS + Vercel

## 📋 Prerequisites

- VPS with Ubuntu (165.22.58.208)
- SSH key: `C:\Users\User\.ssh\your_private_key`
- GitHub account
- Vercel account

---

## 🚀 Step-by-Step Deployment

### 1️⃣ Connect to VPS

```bash
ssh -i "C:\Users\User\.ssh\your_private_key" root@165.22.58.208
```

### 2️⃣ Initial VPS Setup

```bash
# Update system
apt update && apt upgrade -y

# One-line setup (installs Node.js, PM2, Nginx, etc.)
curl -o- https://raw.githubusercontent.com/YOUR_REPO/main/setup-vps.sh | bash

# OR manual installation:
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx git
npm install -g pm2 tsx
```

### 3️⃣ Clone Repository

```bash
# Create directory
mkdir -p /root/apps && cd /root/apps

# Clone (replace with your repo URL)
git clone https://github.com/YOUR_USERNAME/cex-monitor.git
cd cex-monitor
```

### 4️⃣ Install Dependencies

```bash
npm install
```

### 5️⃣ Configure Environment

```bash
# Create .env file
cp .env.example .env
nano .env
```

Edit `.env`:
```bash
PORT=3001
NODE_ENV=production
DB_PATH=/root/apps/cex-monitor/monitor.db
ALLOWED_ORIGINS=https://your-app.vercel.app
```

### 6️⃣ Add Proxies (Optional)

```bash
nano proxies.txt
# Paste your proxy list
```

### 7️⃣ Setup Nginx

```bash
# Copy Nginx config
cp nginx.conf /etc/nginx/sites-available/cex-monitor

# Enable site
ln -sf /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and restart
nginx -t
systemctl restart nginx
```

### 8️⃣ Start Application

```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Enable PM2 on boot
pm2 startup
# Run the command it outputs

# Check status
pm2 status
pm2 logs cex-monitor
```

### 9️⃣ Configure Firewall

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 3001/tcp
ufw --force enable
ufw status
```

---

## ☁️ Vercel Setup

### 1️⃣ Push to GitHub

```bash
# On your local machine
cd c:/Users/User/OneDrive/Desktop/tg-scanner/degenville/CEX-DEV-MONITOR

# Create .gitignore
echo "node_modules/
dist/
*.db
*.log
.env
proxies.txt" > .gitignore

# Initialize Git (if not already)
git init
git add .
git commit -m "Initial commit"

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/cex-monitor.git
git push -u origin main
```

### 2️⃣ Deploy to Vercel

1. Go to https://vercel.com
2. Click **"Add New Project"**
3. Import your `cex-monitor` repository
4. Configure:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3️⃣ Add Environment Variables in Vercel

In Vercel dashboard → Settings → Environment Variables:

```
VITE_API_URL = http://165.22.58.208
VITE_WS_URL = ws://165.22.58.208/ws
```

### 4️⃣ Update Frontend Code

Create `src/config.ts`:
```typescript
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
```

Update all API calls:
```typescript
// Before:
fetch('/api/transactions')

// After:
import { API_URL } from './config';
fetch(`${API_URL}/api/transactions`)
```

### 5️⃣ Deploy

```bash
git add .
git commit -m "Configure for production"
git push
```

Vercel will auto-deploy! 🎉

---

## ✅ Verify Deployment

### Backend (VPS)

```bash
# Check if running
pm2 status

# View logs
pm2 logs cex-monitor

# Test API
curl http://localhost:3001/health
```

### Frontend (Vercel)

Open: `https://your-app.vercel.app`

---

## 🔄 Update Workflow

### Update Backend

```bash
# SSH into VPS
ssh -i "C:\Users\User\.ssh\your_private_key" root@165.22.58.208

# Navigate to app
cd /root/apps/cex-monitor

# Run deployment script
./deploy.sh

# OR manually:
git pull
npm install
pm2 restart cex-monitor
```

### Update Frontend

```bash
# Just push to GitHub
git add .
git commit -m "Update frontend"
git push

# Vercel auto-deploys! ✨
```

---

## 📊 Monitoring Commands

```bash
# View real-time logs
pm2 logs cex-monitor

# Monitor resources
pm2 monit

# Check status
pm2 status

# View recent logs
pm2 logs cex-monitor --lines 100

# Server resources
htop
df -h
free -h
```

---

## 🐛 Troubleshooting

### Backend won't start

```bash
pm2 logs cex-monitor --err
pm2 restart cex-monitor
```

### Port already in use

```bash
netstat -tulpn | grep 3001
# Kill the process if needed
kill -9 <PID>
```

### Nginx issues

```bash
nginx -t
systemctl status nginx
systemctl restart nginx
```

### Database issues

```bash
ls -lh /root/apps/cex-monitor/monitor.db
chmod 644 /root/apps/cex-monitor/monitor.db
```

---

## 🎯 Your URLs

**Frontend:** `https://your-app.vercel.app`  
**Backend API:** `http://165.22.58.208`  
**WebSocket:** `ws://165.22.58.208/ws`

---

## 📝 Checklist

Backend Setup:
- [ ] SSH access working
- [ ] Node.js installed
- [ ] PM2 installed
- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] .env configured
- [ ] Nginx configured
- [ ] Firewall configured
- [ ] Application running
- [ ] Logs looking good

Frontend Setup:
- [ ] Code pushed to GitHub
- [ ] Vercel connected to GitHub
- [ ] Environment variables set
- [ ] Build successful
- [ ] Can access frontend URL
- [ ] Frontend can connect to backend

---

**Need help?** Check the full guide: `DEPLOYMENT_GUIDE.md`
