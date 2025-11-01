#!/bin/bash

# Fix Socket.IO in nginx configuration

cat << 'EOF'
========================================
SOCKET.IO NGINX FIX
========================================

Add this to /etc/nginx/sites-enabled/api.sniff.agency
Right AFTER the /ws location block:

    # Socket.IO endpoint
    location /socket.io/ {
        proxy_pass http://localhost:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        
        # Socket.IO specific
        proxy_set_header Origin $http_origin;
        proxy_pass_request_headers on;
    }

Then run:
  sudo nginx -t && sudo systemctl reload nginx

========================================
EOF

echo ""
echo "To apply this fix, SSH to the server:"
echo "ssh -i \"C:\\Users\\Potato\\.ssh\\id_ed25519_new\" root@139.59.237.215"
echo ""
echo "Then edit the nginx config:"
echo "sudo nano /etc/nginx/sites-enabled/api.sniff.agency"
echo ""
echo "Add the Socket.IO location block shown above, then reload nginx."
