# Deployment Guide - CEX Monitor

## 🚀 **Architecture**

### **Frontend (Vercel)**
- React + Vite app
- Deployed to Vercel
- Environment: Production build

### **Backend (VPS Ubuntu)**
- Node.js Express server
- WebSocket server
- SQLite database
- PM2 process manager

---

## 📋 **Prerequisites**

### **Local**
- Node.js 18+
- npm or yarn

### **VPS**
- Ubuntu 20.04+ LTS
- Root or sudo access
- SSH access configured

---

## 🔧 **Step 1: Prepare Repository**

### **1.1 Create GitHub Repository**
```bash
# On GitHub, create new repository: cex-dev-monitor
# Don't initialize with README (we have one)
```

### **1.2 Initialize Git (if not already)**
```bash
git init
git add .
git commit -m "Initial commit - CEX Monitor"
```

### **1.3 Add Remote & Push**
```bash
git remote add origin git@github.com:YOUR_USERNAME/cex-dev-monitor.git
git branch -M main
git push -u origin main
```

### **1.4 Verify No Secrets Committed**
```bash
# Check for sensitive files
git log --all --full-history -- "*id_rsa*"
git log --all --full-history -- "*.pem"
git log --all --full-history -- "proxies.txt"

# If found, use git-filter-branch or BFG Repo-Cleaner to remove
```

---

## 🌐 **Step 2: Deploy Frontend (Vercel)**

### **2.1 Connect to Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click "Add New Project"
4. Import `cex-dev-monitor` repository

### **2.2 Configure Build Settings**
```yaml
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### **2.3 Environment Variables**
```env
# Add in Vercel dashboard
VITE_API_URL=https://your-vps-domain.com
VITE_WS_URL=wss://your-vps-domain.com
```

### **2.4 Deploy**
- Vercel will auto-deploy on every push to `main`
- Production URL: `https://your-project.vercel.app`

---

## 🖥️ **Step 3: Deploy Backend (VPS)**

### **3.1 Connect to VPS**
```bash
ssh root@your-vps-ip
# or
ssh -i ~/.ssh/your_key.pem ubuntu@your-vps-ip
```

### **3.2 Install Dependencies**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install nginx (for reverse proxy)
sudo apt install -y nginx

# Install certbot (for SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### **3.3 Create Application Directory**
```bash
sudo mkdir -p /var/www/cex-monitor
sudo chown -R $USER:$USER /var/www/cex-monitor
cd /var/www/cex-monitor
```

### **3.4 Clone Repository**
```bash
git clone https://github.com/YOUR_USERNAME/cex-dev-monitor.git .
```

### **3.5 Install Node Modules**
```bash
npm install
```

### **3.6 Create Environment File**
```bash
nano .env
```

```env
# Production environment
PORT=3001
NODE_ENV=production

# Database
DB_PATH=/var/www/cex-monitor/monitor.db

# CORS (your Vercel domain)
ALLOWED_ORIGINS=https://your-project.vercel.app,https://www.your-domain.com

# Proxies (if using)
PROXY_FILE=/var/www/cex-monitor/proxies.txt
```

### **3.7 Upload Proxies (if using)**
```bash
# From local machine
scp proxies.txt user@your-vps:/var/www/cex-monitor/proxies.txt
```

### **3.8 Build Backend**
```bash
npm run build
```

### **3.9 Start with PM2**
```bash
# Start application
pm2 start dist/backend/server.js --name cex-monitor

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd
# Follow the command it outputs
```

### **3.10 PM2 Commands**
```bash
# View logs
pm2 logs cex-monitor

# Restart
pm2 restart cex-monitor

# Stop
pm2 stop cex-monitor

# Monitor
pm2 monit
```

---

## 🔒 **Step 4: Configure Nginx & SSL**

### **4.1 Create Nginx Config**
```bash
sudo nano /etc/nginx/sites-available/cex-monitor
```

```nginx
# WebSocket upgrade map
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # API requests
    location /api {
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

    # WebSocket connections
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

### **4.2 Enable Site**
```bash
sudo ln -s /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### **4.3 Setup SSL with Let's Encrypt**
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Follow prompts
# Select option 2 (Redirect HTTP to HTTPS)
```

### **4.4 Auto-Renewal**
```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up cron job for renewal
```

---

## 🔄 **Step 5: Deployment Workflow**

### **5.1 Update Code**
```bash
# On VPS
cd /var/www/cex-monitor
git pull origin main
npm install
npm run build
pm2 restart cex-monitor
```

### **5.2 Deployment Script**
Create `deploy.sh`:
```bash
#!/bin/bash
cd /var/www/cex-monitor
git pull origin main
npm install
npm run build
pm2 restart cex-monitor
pm2 save
echo "✅ Deployment complete!"
```

```bash
chmod +x deploy.sh
```

### **5.3 Deploy from Local**
```bash
# Push to GitHub
git add .
git commit -m "Update: feature xyz"
git push origin main

# SSH and deploy
ssh user@vps "cd /var/www/cex-monitor && ./deploy.sh"
```

---

## 📊 **Step 6: Monitoring & Maintenance**

### **6.1 View Logs**
```bash
# PM2 logs
pm2 logs cex-monitor

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

### **6.2 Database Backup**
```bash
# Create backup script
nano /var/www/cex-monitor/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/www/cex-monitor/backups"
mkdir -p $BACKUP_DIR

# Backup database
cp /var/www/cex-monitor/monitor.db $BACKUP_DIR/monitor_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "monitor_*.db" -mtime +7 -delete

echo "✅ Backup complete: monitor_$DATE.db"
```

```bash
chmod +x backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /var/www/cex-monitor/backup.sh
```

### **6.3 Resource Monitoring**
```bash
# Install htop
sudo apt install htop

# Monitor
htop

# PM2 monitoring
pm2 monit

# Disk usage
df -h

# Check logs size
du -sh /var/log/nginx/
du -sh ~/.pm2/logs/
```

---

## 🔧 **Troubleshooting**

### **WebSocket Connection Issues**
```bash
# Check if port 3001 is open
sudo ufw status
sudo ufw allow 3001

# Check Nginx config
sudo nginx -t

# Check WebSocket in logs
pm2 logs cex-monitor | grep WebSocket
```

### **CORS Issues**
```env
# In .env, ensure Vercel domain is listed
ALLOWED_ORIGINS=https://your-project.vercel.app
```

### **Database Permissions**
```bash
# Ensure writable
sudo chown -R $USER:$USER /var/www/cex-monitor
chmod 644 /var/www/cex-monitor/monitor.db
```

### **PM2 Not Starting on Boot**
```bash
pm2 unstartup systemd
pm2 startup systemd
# Run the command it outputs
pm2 save
```

---

## 📝 **Environment Variables Summary**

### **Vercel (Frontend)**
```env
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com
```

### **VPS (Backend)**
```env
PORT=3001
NODE_ENV=production
DB_PATH=/var/www/cex-monitor/monitor.db
ALLOWED_ORIGINS=https://your-project.vercel.app
PROXY_FILE=/var/www/cex-monitor/proxies.txt
```

---

## ✅ **Checklist**

- [ ] GitHub repository created and pushed
- [ ] No secrets in repository (check .gitignore)
- [ ] Vercel project connected to GitHub
- [ ] Vercel environment variables configured
- [ ] VPS dependencies installed (Node, PM2, Nginx)
- [ ] Backend code deployed to VPS
- [ ] .env file created on VPS
- [ ] Proxies uploaded (if using)
- [ ] PM2 running and configured for startup
- [ ] Nginx configured with SSL
- [ ] WebSocket connections working
- [ ] Database backups automated
- [ ] Deployment script created

---

## 🚀 **Quick Deploy Commands**

### **Initial Setup**
```bash
# On VPS
cd /var/www/cex-monitor
git clone <repo> .
npm install
cp .env.example .env
nano .env  # Configure
npm run build
pm2 start dist/backend/server.js --name cex-monitor
pm2 save
pm2 startup
```

### **Update Deployment**
```bash
cd /var/www/cex-monitor
git pull
npm install
npm run build
pm2 restart cex-monitor
```

---

**You're live! 🎉**
- Frontend: https://your-project.vercel.app
- Backend: https://your-domain.com
- WebSocket: wss://your-domain.com/ws
