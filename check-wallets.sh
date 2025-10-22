#!/bin/bash
cd /var/www/cex-monitor
echo "=== Checking Trading Wallets ==="
mysql -u root -pChopstick88! cex_monitor << EOF
SELECT id, user_id, wallet_name, public_key, LEFT(private_key, 10) as private_key_start, sol_balance, created_at 
FROM trading_wallets 
WHERE is_deleted = 0;

SELECT COUNT(*) as total_wallets FROM trading_wallets WHERE is_deleted = 0;
EOF

echo ""
echo "=== Checking wallet_token_holdings table ==="
mysql -u root -pChopstick88! cex_monitor << EOF
SHOW TABLES LIKE 'wallet_token_holdings';
EOF

echo ""
echo "=== Checking for PM2 logs ==="
pm2 logs cex-monitor --lines 5 --nostream | grep -E "(portfolio|trading|wallet)" || echo "No recent trading logs"
