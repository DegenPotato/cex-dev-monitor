module.exports = {
  apps: [{
    name: 'cex-monitor',
    script: 'dist/backend/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_file: '.env',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }],
  
  deploy: {
    production: {
      user: 'root',  // Change this to your VPS username
      host: 'YOUR_VPS_IP',  // Change this to your VPS IP
      ref: 'origin/main',
      repo: 'git@github.com:DegenPotato/cex-dev-monitor.git',
      path: '/var/www/cex-monitor',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
