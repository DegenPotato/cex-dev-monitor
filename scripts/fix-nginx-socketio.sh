#!/bin/bash

# Fix nginx Socket.IO configuration for WebSocket support
# This adds the missing /socket.io/ location block

echo "🔧 Fixing nginx Socket.IO configuration..."

# SSH to server and update nginx config
ssh -i "C:\Users\Potato\.ssh\id_ed25519_new" root@139.59.237.215 << 'EOF'

# Backup existing config
cp /etc/nginx/sites-enabled/api.sniff.agency /etc/nginx/sites-enabled/api.sniff.agency.backup

# Check if Socket.IO location already exists
if grep -q "location /socket.io/" /etc/nginx/sites-enabled/api.sniff.agency; then
    echo "✅ Socket.IO location already exists"
else
    echo "📝 Adding Socket.IO location block..."
    
    # Add Socket.IO location block after the /ws location
    sed -i '/location \/ws\//,/^    }$/ {
        /^    }$/ a\
\n    # Socket.IO endpoint (for trading/fetcher WebSocket)\n    location /socket.io/ {\n        proxy_pass http://localhost:3001/socket.io/;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_buffering off;\n        proxy_read_timeout 86400;\n        proxy_send_timeout 86400;\n    }
    }' /etc/nginx/sites-enabled/api.sniff.agency
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Configuration valid. Reloading nginx..."
    systemctl reload nginx
    echo "✅ Nginx reloaded successfully!"
else
    echo "❌ Configuration invalid. Restoring backup..."
    cp /etc/nginx/sites-enabled/api.sniff.agency.backup /etc/nginx/sites-enabled/api.sniff.agency
    echo "❌ Failed to update nginx configuration"
    exit 1
fi

EOF

echo "✅ Socket.IO configuration fixed!"
