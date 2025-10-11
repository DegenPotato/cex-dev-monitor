# GitHub Setup & Deployment Guide

## 🚀 **Quick Setup**

### **1. Security Check - Remove Sensitive Files**
```bash
# Ensure these are NOT in your repo
ls -la | grep -E "(id_rsa|\.pem|\.key|proxies\.txt)"

# If found, delete them
rm -f id_rsa* *.pem *.key proxies.txt

# Verify .gitignore is correct
cat .gitignore
```

### **2. Initialize Git (if not already)**
```bash
git init
git add .
git commit -m "Initial commit: CEX Dev Monitor"
```

### **3. Create GitHub Repository**
1. Go to https://github.com/new
2. Repository name: `cex-dev-monitor`
3. **Keep it PRIVATE** (you have proxies and sensitive data)
4. Do NOT initialize with README (we have one)
5. Click "Create repository"

### **4. Add Remote & Push**
```bash
# Add remote
git remote add origin git@github.com:YOUR_USERNAME/cex-dev-monitor.git

# Or with HTTPS
git remote add origin https://github.com/YOUR_USERNAME/cex-dev-monitor.git

# Push to main branch
git branch -M main
git push -u origin main
```

---

## 🔒 **Security Verification**

### **Check for Leaked Secrets**
```bash
# Search git history for sensitive files
git log --all --full-history -- "*id_rsa*"
git log --all --full-history -- "*.pem"
git log --all --full-history -- "proxies.txt"
git log --all --full-history -- "*.key"

# If any found, they were committed! Need to remove from history
```

### **If Secrets Found in History**
```bash
# Install BFG Repo-Cleaner
# Download from: https://rtyley.github.io/bfg-repo-cleaner/

# Remove file from entire history
java -jar bfg.jar --delete-files id_rsa
java -jar bfg.jar --delete-files "*.pem"
java -jar bfg.jar --delete-files proxies.txt

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (CAUTION)
git push origin --force --all
```

---

## 📁 **Repository Structure**

### **Committed Files (Safe)**
```
src/                    # All source code
public/                 # Frontend assets
dist/                   # Build output (gitignored)
node_modules/           # Dependencies (gitignored)
README.md               # Project overview
DEPLOYMENT.md           # Deployment guide
FINAL_RATE_LIMIT_SOLUTION.md  # Core documentation
SOURCE_WALLETS_GUIDE.md        # Feature documentation
RPC_SERVER_ROTATION_GUIDE.md  # Technical guide
package.json            # Dependencies
tsconfig.json           # TypeScript config
vite.config.ts          # Vite config
ecosystem.config.js     # PM2 config
deploy.sh               # Deployment script
.env.example            # Environment template
.gitignore              # Git exclusions
```

### **Excluded Files (Gitignored)**
```
*.db                    # Database (contains your data)
.env                    # Environment variables (secrets)
proxies.txt             # 10,000 proxies (sensitive)
id_rsa*                 # SSH keys (CRITICAL)
*.pem, *.key            # SSL/SSH keys (CRITICAL)
node_modules/           # Dependencies (huge)
dist/                   # Build artifacts
logs/                   # Runtime logs
*_FIXES.md              # Debug documents
*_DEBUG.md              # Development notes
```

---

## 🌐 **Vercel Deployment**

### **1. Connect Repository**
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import `cex-dev-monitor` repository
5. Vercel auto-detects Vite configuration

### **2. Configure Build**
```yaml
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Root Directory: ./
```

### **3. Environment Variables**
Add in Vercel dashboard → Settings → Environment Variables:

```env
VITE_API_URL=https://your-vps-domain.com
VITE_WS_URL=wss://your-vps-domain.com
```

**Important:** 
- `VITE_` prefix required for Vite to include in build
- Use your VPS domain (setup in next section)

### **4. Deploy**
- Push to `main` branch → Auto-deploys
- Manual deploy: Vercel dashboard → Deployments → Redeploy

### **5. Custom Domain (Optional)**
1. Vercel dashboard → Settings → Domains
2. Add your domain: `monitor.yourdomain.com`
3. Configure DNS:
   ```
   Type: CNAME
   Name: monitor
   Value: cname.vercel-dns.com
   ```

---

## 🖥️ **VPS Deployment (Ubuntu)**

### **1. Initial VPS Setup**
```bash
# Connect to VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify
node --version  # Should be 18+
npm --version

# Install PM2
npm install -g pm2

# Install nginx
apt install -y nginx

# Install certbot for SSL
apt install -y certbot python3-certbot-nginx

# Setup firewall
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

### **2. Clone Repository**
```bash
# Create directory
mkdir -p /var/www/cex-monitor
cd /var/www/cex-monitor

# Clone (HTTPS or SSH)
git clone https://github.com/YOUR_USERNAME/cex-dev-monitor.git .

# Or if using SSH key
git clone git@github.com:YOUR_USERNAME/cex-dev-monitor.git .
```

### **3. Configure Environment**
```bash
# Copy example
cp .env.example .env

# Edit configuration
nano .env
```

```env
PORT=3001
NODE_ENV=production
DB_PATH=/var/www/cex-monitor/monitor.db
ALLOWED_ORIGINS=https://your-project.vercel.app
```

### **4. Upload Proxies**
```bash
# From local machine
scp proxies.txt root@your-vps:/var/www/cex-monitor/proxies.txt

# Set permissions
chmod 600 /var/www/cex-monitor/proxies.txt
```

### **5. Install & Build**
```bash
cd /var/www/cex-monitor
npm install
npm run build
```

### **6. Start with PM2**
```bash
# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 list
pm2 save

# Setup startup script
pm2 startup systemd
# Run the command it outputs

# Verify running
pm2 status
pm2 logs cex-monitor
```

### **7. Configure Nginx**
```bash
nano /etc/nginx/sites-available/cex-monitor
```

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/cex-monitor /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### **8. Setup SSL**
```bash
certbot --nginx -d your-domain.com
# Select option 2: Redirect HTTP to HTTPS
```

---

## 🔄 **Update Workflow**

### **Local Development**
```bash
# Make changes
git add .
git commit -m "Feature: description"
git push origin main
```

### **Frontend (Vercel)**
- Auto-deploys on push to main
- Check: https://vercel.com/dashboard

### **Backend (VPS)**
```bash
# SSH to VPS
ssh root@your-vps

# Run deployment script
cd /var/www/cex-monitor
./deploy.sh
```

**Or one-liner from local:**
```bash
ssh root@your-vps 'cd /var/www/cex-monitor && ./deploy.sh'
```

---

## 📊 **Monitoring**

### **Logs**
```bash
# PM2 logs
pm2 logs cex-monitor

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Real-time monitoring
pm2 monit
```

### **Health Checks**
```bash
# Check API
curl https://your-domain.com/api/health

# Check WebSocket
wscat -c wss://your-domain.com/ws
```

---

## ✅ **Pre-Deployment Checklist**

- [ ] `.gitignore` includes all sensitive files
- [ ] No `id_rsa`, `.pem`, `.key` files in repo
- [ ] No `proxies.txt` in repo
- [ ] `.env` is gitignored
- [ ] `.env.example` exists with placeholders
- [ ] `README.md` updated with project info
- [ ] Repository is **PRIVATE** on GitHub
- [ ] Verified no secrets in git history
- [ ] Build works locally (`npm run build`)
- [ ] All TypeScript compiles without errors

---

## 🚨 **Important Notes**

### **Keep Repository Private**
Your repo contains:
- Business logic for tracking dev wallets
- RPC pool server addresses
- Monitoring strategies
- **Do NOT make it public!**

### **Sensitive Data Never Commit**
- Database files (*.db)
- Proxy lists (proxies.txt)
- SSH keys (id_rsa*, *.pem)
- Environment files (.env)
- API keys or credentials

### **Git History**
Once pushed to GitHub, data is in history even if deleted. Use BFG Repo-Cleaner if you accidentally commit secrets.

---

## 📞 **Quick Commands**

```bash
# Local: Push changes
git add . && git commit -m "Update" && git push

# VPS: Deploy
ssh root@vps 'cd /var/www/cex-monitor && ./deploy.sh'

# VPS: View logs
ssh root@vps 'pm2 logs cex-monitor'

# VPS: Restart
ssh root@vps 'pm2 restart cex-monitor'

# Local: Check what will be committed
git status
git diff

# Local: See gitignored files
git status --ignored
```

---

## 🎯 **Result**

After setup:
- ✅ Frontend: https://your-project.vercel.app
- ✅ Backend: https://your-domain.com
- ✅ WebSocket: wss://your-domain.com/ws
- ✅ Auto-deploy: Push to main → Vercel rebuilds
- ✅ Manual deploy: Run `deploy.sh` on VPS
- ✅ Monitoring: PM2 + Nginx logs
- ✅ SSL: Free with Let's Encrypt
- ✅ Backups: Automated database backups

**You're production-ready! 🚀**
