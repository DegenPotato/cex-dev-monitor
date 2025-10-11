# 🚀 START HERE - VPS + Vercel Deployment

## 📝 What We're Doing

**Frontend:** Deploy to Vercel (auto-deploy on git push)  
**Backend:** Deploy to VPS at 165.22.58.208 (manual deploy)

---

## ⚡ Quick Commands

### Connect to VPS
```bash
ssh -i "C:\Users\User\.ssh\your_private_key" root@165.22.58.208
```

### Install Dependencies Locally
```bash
npm install
```

---

## 🎯 Complete Setup (Choose One)

### Option A: Follow Quick Start (Recommended)
Read: **`QUICKSTART_DEPLOY.md`** - Step-by-step with copy-paste commands

### Option B: Detailed Guide
Read: **`DEPLOYMENT_GUIDE.md`** - Full explanations and troubleshooting

---

## 📦 Files Created For You

| File | Purpose |
|------|---------|
| `ecosystem.config.js` | PM2 process configuration |
| `nginx.conf` | Nginx reverse proxy config |
| `setup-vps.sh` | VPS initial setup script |
| `deploy.sh` | Update backend on VPS |
| `.env.example` | Environment variables template |
| `QUICKSTART_DEPLOY.md` | Step-by-step deployment guide |
| `DEPLOYMENT_GUIDE.md` | Detailed deployment documentation |

---

## 🏃 Express Setup (15 minutes)

### 1. Setup VPS Backend

```bash
# Connect
ssh -i "C:\Users\User\.ssh\your_private_key" root@165.22.58.208

# Run setup script
apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx git
npm install -g pm2 tsx

# Clone repo (create on GitHub first)
mkdir -p /root/apps && cd /root/apps
git clone https://github.com/YOUR_USERNAME/cex-monitor.git
cd cex-monitor

# Install & configure
npm install
cp .env.example .env
nano .env  # Add: ALLOWED_ORIGINS=https://your-app.vercel.app

# Setup Nginx
cp nginx.conf /etc/nginx/sites-available/cex-monitor
ln -sf /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Start app
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Run the command it outputs

# Configure firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 3001/tcp
ufw --force enable
```

### 2. Deploy Frontend to Vercel

```bash
# On local machine
cd c:/Users/User/OneDrive/Desktop/tg-scanner/degenville/CEX-DEV-MONITOR

# Create .gitignore
echo "node_modules/
dist/
*.db
*.log
.env
proxies.txt" > .gitignore

# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/cex-monitor.git
git push -u origin main
```

Then:
1. Go to https://vercel.com
2. Import your repo
3. Add environment variables:
   - `VITE_API_URL` = `http://165.22.58.208`
   - `VITE_WS_URL` = `ws://165.22.58.208/ws`
4. Deploy!

### 3. Update .env on VPS

```bash
# SSH into VPS again
ssh -i "C:\Users\User\.ssh\your_private_key" root@165.22.58.208
cd /root/apps/cex-monitor

# Edit .env
nano .env
```

Update `ALLOWED_ORIGINS` with your Vercel URL:
```
ALLOWED_ORIGINS=https://your-app-name.vercel.app,http://localhost:3000
```

Restart:
```bash
pm2 restart cex-monitor
```

---

## ✅ Verify It Works

### Check Backend
```bash
# On VPS
pm2 status
pm2 logs cex-monitor

# Test API
curl http://localhost:3001/health
```

### Check Frontend
Open: `https://your-app.vercel.app`

Should connect to backend and show data!

---

## 🔄 Daily Workflow

### Update Backend
```bash
ssh -i "C:\Users\User\.ssh\your_private_key" root@165.22.58.208
cd /root/apps/cex-monitor
./deploy.sh
```

### Update Frontend
```bash
git add .
git commit -m "Update"
git push
# Vercel auto-deploys! ✨
```

---

## 📚 Documentation

- **`QUICKSTART_DEPLOY.md`** - Copy-paste commands to get started
- **`DEPLOYMENT_GUIDE.md`** - Full guide with explanations
- **`RATE_LIMIT_ANALYSIS.md`** - Why you're hitting rate limits
- **`DEV_DETECTION_BUG_FIX.md`** - Dev wallet detection fix
- **`RPC_SERVER_ROTATION_GUIDE.md`** - How RPC rotation works

---

## 🆘 Need Help?

### Backend Issues
```bash
pm2 logs cex-monitor --err
pm2 restart cex-monitor
```

### Frontend Issues
Check Vercel deployment logs at: https://vercel.com/dashboard

### CORS Errors
Make sure `ALLOWED_ORIGINS` in VPS `.env` includes your Vercel URL

---

## 🎯 Your URLs

Once deployed:
- **Frontend:** `https://your-app.vercel.app`
- **Backend:** `http://165.22.58.208`
- **WebSocket:** `ws://165.22.58.208/ws`

---

**Ready? Start with `QUICKSTART_DEPLOY.md`! 🚀**
