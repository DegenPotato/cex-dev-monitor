# Quick Setup Commands

## 🚀 **Step 1: Security Check**

```bash
# Make verify script executable
chmod +x verify-secrets.sh

# Run security check
./verify-secrets.sh

# If it fails, remove sensitive files before proceeding
```

---

## 📦 **Step 2: GitHub Setup**

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: CEX Dev Monitor"

# Create repo on GitHub (do this in browser):
# https://github.com/new
# Name: cex-dev-monitor
# Privacy: PRIVATE
# Don't initialize with anything

# Add remote (replace YOUR_USERNAME)
git remote add origin git@github.com:YOUR_USERNAME/cex-dev-monitor.git

# Push
git branch -M main
git push -u origin main
```

---

## 🌐 **Step 3: Vercel (Frontend)**

```bash
# Go to https://vercel.com
# 1. Sign in with GitHub
# 2. New Project → Import cex-dev-monitor
# 3. Add Environment Variables:

VITE_API_URL=https://your-vps-domain.com
VITE_WS_URL=wss://your-vps-domain.com

# 4. Deploy
# Result: https://your-project.vercel.app
```

---

## 🖥️ **Step 4: VPS Setup**

```bash
# Connect to VPS
ssh root@YOUR_VPS_IP

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2 & Nginx
npm install -g pm2
apt install -y nginx certbot python3-certbot-nginx

# Create directory
mkdir -p /var/www/cex-monitor
cd /var/www/cex-monitor

# Clone repository (replace YOUR_USERNAME)
git clone https://github.com/YOUR_USERNAME/cex-dev-monitor.git .

# Setup environment
cp .env.example .env
nano .env
# Edit with your settings

# Install & build
npm install
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd
# Run the command it outputs

# Setup Nginx (see DEPLOYMENT.md for config)
nano /etc/nginx/sites-available/cex-monitor
# Copy config from DEPLOYMENT.md

ln -s /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Setup SSL
certbot --nginx -d your-domain.com

# Done! Check status
pm2 status
pm2 logs cex-monitor
```

---

## 📤 **Step 5: Upload Proxies**

```bash
# From local machine
scp proxies.txt root@YOUR_VPS_IP:/var/www/cex-monitor/proxies.txt

# On VPS, set permissions
ssh root@YOUR_VPS_IP
chmod 600 /var/www/cex-monitor/proxies.txt
pm2 restart cex-monitor
```

---

## 🔄 **Deployment Workflow**

### **Update Code**
```bash
# Local: make changes
git add .
git commit -m "Update: feature description"
git push origin main

# Vercel: auto-deploys

# VPS: deploy backend
ssh root@YOUR_VPS_IP 'cd /var/www/cex-monitor && ./deploy.sh'
```

---

## 📊 **Monitoring**

```bash
# View logs
ssh root@YOUR_VPS_IP 'pm2 logs cex-monitor'

# Restart
ssh root@YOUR_VPS_IP 'pm2 restart cex-monitor'

# Monitor
ssh root@YOUR_VPS_IP 'pm2 monit'
```

---

## ✅ **Verification**

```bash
# Check frontend
curl https://your-project.vercel.app

# Check backend API
curl https://your-domain.com/api/config

# Check WebSocket
# Use browser console:
new WebSocket('wss://your-domain.com/ws')
```

---

## 🆘 **Troubleshooting**

### **Can't connect to WebSocket**
```bash
# Check firewall
ssh root@YOUR_VPS_IP 'ufw status'
ssh root@YOUR_VPS_IP 'ufw allow 3001'

# Check Nginx
ssh root@YOUR_VPS_IP 'nginx -t'
ssh root@YOUR_VPS_IP 'systemctl restart nginx'

# Check PM2
ssh root@YOUR_VPS_IP 'pm2 logs cex-monitor'
```

### **CORS errors**
```bash
# Update .env on VPS
ssh root@YOUR_VPS_IP
cd /var/www/cex-monitor
nano .env
# Add: ALLOWED_ORIGINS=https://your-project.vercel.app
pm2 restart cex-monitor
```

### **Database errors**
```bash
# Check permissions
ssh root@YOUR_VPS_IP 'ls -la /var/www/cex-monitor/monitor.db'
ssh root@YOUR_VPS_IP 'chmod 644 /var/www/cex-monitor/monitor.db'
```

---

## 📝 **Environment Variables**

### **Vercel (Frontend)**
```env
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com
```

### **VPS (Backend .env)**
```env
PORT=3001
NODE_ENV=production
DB_PATH=/var/www/cex-monitor/monitor.db
ALLOWED_ORIGINS=https://your-project.vercel.app
PROXY_FILE=/var/www/cex-monitor/proxies.txt
```

---

## 🎯 **Final Result**

- ✅ Frontend: `https://your-project.vercel.app`
- ✅ Backend: `https://your-domain.com`
- ✅ WebSocket: `wss://your-domain.com/ws`
- ✅ Auto-deploy on push to main
- ✅ SSL enabled
- ✅ PM2 monitoring
- ✅ Production ready!

**You're live! 🚀**
