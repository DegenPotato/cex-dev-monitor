#!/bin/bash

# Secure Trading System Deployment Script
# Ensures all security requirements are met before deployment

set -e  # Exit on error

echo "🚀 Sniff Agency Trading System - Secure Deployment"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_ENV="${1:-production}"
SERVER_IP="139.59.237.215"
SERVER_PATH="/var/www/cex-monitor"

# Security checks
CHECKS_PASSED=true

echo "🔐 Security Pre-flight Checks..."
echo ""

# Check 1: Encryption key exists
check_encryption_key() {
    if [ -z "$PRIVATE_KEY_ENCRYPTION_KEY" ]; then
        if [ -f .env.local ]; then
            source .env.local
        elif [ -f .env ]; then
            source .env
        fi
    fi
    
    if [ -z "$PRIVATE_KEY_ENCRYPTION_KEY" ]; then
        echo -e "${RED}❌ PRIVATE_KEY_ENCRYPTION_KEY not set${NC}"
        echo "   Run: node scripts/generate-encryption-key.mjs"
        CHECKS_PASSED=false
        return 1
    fi
    
    # Validate key format (64 hex chars)
    if [[ ! "$PRIVATE_KEY_ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
        echo -e "${RED}❌ Invalid encryption key format${NC}"
        echo "   Key must be 64 hexadecimal characters (256-bit)"
        CHECKS_PASSED=false
        return 1
    fi
    
    echo -e "${GREEN}✅ Encryption key configured (${PRIVATE_KEY_ENCRYPTION_KEY:0:8}...)${NC}"
    return 0
}

# Check 2: API keys (optional but recommended)
check_api_keys() {
    local has_keys=false
    
    if [ ! -z "$HELIUS_API_KEY" ]; then
        echo -e "${GREEN}✅ Helius API key configured${NC}"
        has_keys=true
    else
        echo -e "${YELLOW}⚠️  Helius API key not set (using public RPC - slower)${NC}"
    fi
    
    if [ ! -z "$JITO_API_KEY" ]; then
        echo -e "${GREEN}✅ Jito API key configured (MEV protection enabled)${NC}"
        has_keys=true
    else
        echo -e "${YELLOW}⚠️  Jito API key not set (no MEV protection)${NC}"
    fi
    
    if [ "$has_keys" = false ]; then
        echo -e "${YELLOW}   Consider adding API keys for better performance${NC}"
    fi
}

# Check 3: Database migrations
check_migrations() {
    if [ -f "src/backend/database/migrations/019_trading_wallets.sql" ]; then
        echo -e "${GREEN}✅ Trading wallet migration found${NC}"
    else
        echo -e "${RED}❌ Trading wallet migration missing${NC}"
        CHECKS_PASSED=false
    fi
}

# Check 4: Dependencies
check_dependencies() {
    local missing_deps=""
    
    # Check required packages
    for pkg in "@solana/web3.js" "@solana/spl-token" "bs58"; do
        if ! grep -q "\"$pkg\"" package.json; then
            missing_deps="$missing_deps $pkg"
        fi
    done
    
    if [ -z "$missing_deps" ]; then
        echo -e "${GREEN}✅ All required dependencies installed${NC}"
    else
        echo -e "${RED}❌ Missing dependencies:$missing_deps${NC}"
        echo "   Run: npm install$missing_deps"
        CHECKS_PASSED=false
    fi
}

# Check 5: Environment validation
check_environment() {
    if [ "$DEPLOY_ENV" = "production" ]; then
        if [ ! -z "$NODE_ENV" ] && [ "$NODE_ENV" != "production" ]; then
            echo -e "${YELLOW}⚠️  NODE_ENV is not 'production'${NC}"
        else
            echo -e "${GREEN}✅ Production environment configured${NC}"
        fi
    fi
}

# Run all checks
echo "1. Checking encryption key..."
check_encryption_key
echo ""

echo "2. Checking API keys..."
check_api_keys
echo ""

echo "3. Checking database migrations..."
check_migrations
echo ""

echo "4. Checking dependencies..."
check_dependencies
echo ""

echo "5. Checking environment..."
check_environment
echo ""

# Summary
echo "=================================================="
if [ "$CHECKS_PASSED" = false ]; then
    echo -e "${RED}❌ Security checks failed. Please fix issues above.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All critical security checks passed!${NC}"
echo ""

# Deployment options
echo "📦 Deployment Options:"
echo "  1. Deploy to production server"
echo "  2. Generate secure config file"
echo "  3. Test encryption locally"
echo "  4. Exit"
echo ""
read -p "Select option (1-4): " option

case $option in
    1)
        echo ""
        echo "🚀 Deploying to production..."
        
        # Create secure config for server
        cat > .env.production <<EOF
# Generated on $(date)
# Trading System Configuration
PRIVATE_KEY_ENCRYPTION_KEY=$PRIVATE_KEY_ENCRYPTION_KEY
HELIUS_API_KEY=$HELIUS_API_KEY
JITO_API_KEY=$JITO_API_KEY
NODE_ENV=production
EOF
        
        # Deploy
        echo "📤 Uploading to server..."
        scp -i ~/.ssh/id_ed25519_new .env.production root@$SERVER_IP:$SERVER_PATH/.env.trading
        
        echo "🔄 Running deployment..."
        ssh -i ~/.ssh/id_ed25519_new root@$SERVER_IP <<ENDSSH
            cd $SERVER_PATH
            
            # Backup existing env
            if [ -f .env ]; then
                cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
            fi
            
            # Merge trading env
            if [ -f .env.trading ]; then
                cat .env.trading >> .env
                rm .env.trading
            fi
            
            # Pull latest code
            git pull
            
            # Install dependencies
            npm install
            
            # Run migrations
            node run-all-migrations.mjs
            
            # Restart service
            pm2 restart cex-monitor
            
            echo "✅ Deployment complete!"
ENDSSH
        
        # Clean up
        rm .env.production
        
        echo ""
        echo -e "${GREEN}✅ Trading system deployed successfully!${NC}"
        echo ""
        echo "Test endpoints:"
        echo "  curl https://api.sniff.agency/api/trading/health"
        echo "  curl https://api.sniff.agency/api/trading/wallets"
        ;;
        
    2)
        echo ""
        echo "📝 Generating secure config..."
        
        if [ -z "$PRIVATE_KEY_ENCRYPTION_KEY" ]; then
            echo "Generating new encryption key..."
            NEW_KEY=$(openssl rand -hex 32)
            PRIVATE_KEY_ENCRYPTION_KEY=$NEW_KEY
        fi
        
        cat > .env.trading <<EOF
# Sniff Agency Trading System - Secure Configuration
# Generated: $(date)
# Environment: $DEPLOY_ENV

# REQUIRED - Encryption for wallet private keys
PRIVATE_KEY_ENCRYPTION_KEY=$PRIVATE_KEY_ENCRYPTION_KEY

# OPTIONAL - API Keys for enhanced performance
HELIUS_API_KEY=${HELIUS_API_KEY:-your-helius-key-here}
JITO_API_KEY=${JITO_API_KEY:-your-jito-key-here}
JUPITER_API_KEY=${JUPITER_API_KEY:-your-jupiter-key-here}

# RPC Configuration
RPC_URL=${RPC_URL:-https://api.mainnet-beta.solana.com}

# Security Settings
MAX_WALLET_AGE_DAYS=90
ENABLE_KEY_ROTATION=true
ENABLE_AUDIT_LOG=true

# Performance Settings
ENABLE_CACHE=true
CACHE_TTL_MS=300000
MAX_CONCURRENT_TRADES=5
EOF
        
        echo -e "${GREEN}✅ Config saved to .env.trading${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Review and edit .env.trading"
        echo "  2. Copy to your server"
        echo "  3. Restart the service"
        ;;
        
    3)
        echo ""
        echo "🧪 Testing encryption..."
        
        # Test encryption
        node -e "
            const crypto = require('crypto');
            const key = process.env.PRIVATE_KEY_ENCRYPTION_KEY || '$PRIVATE_KEY_ENCRYPTION_KEY';
            
            if (!key || key.length !== 64) {
                console.error('❌ Invalid key');
                process.exit(1);
            }
            
            // Test encryption
            const testData = 'test-wallet-key-' + Date.now();
            const keyBuffer = Buffer.from(key, 'hex');
            const iv = crypto.randomBytes(16);
            
            const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
            let encrypted = cipher.update(testData, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const tag = cipher.getAuthTag();
            
            // Test decryption
            const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            if (decrypted === testData) {
                console.log('✅ Encryption test passed!');
                console.log('   Algorithm: AES-256-GCM');
                console.log('   Key size: 256-bit');
                console.log('   Test data encrypted and decrypted successfully');
            } else {
                console.error('❌ Encryption test failed');
                process.exit(1);
            }
        "
        
        echo ""
        echo "🔬 Testing performance..."
        
        node -e "
            const crypto = require('crypto');
            const key = Buffer.from('$PRIVATE_KEY_ENCRYPTION_KEY', 'hex');
            
            const times = [];
            for (let i = 0; i < 100; i++) {
                const start = process.hrtime.bigint();
                
                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
                cipher.update('test-data', 'utf8', 'hex');
                cipher.final('hex');
                
                const end = process.hrtime.bigint();
                times.push(Number(end - start) / 1000000); // Convert to ms
            }
            
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            console.log('📊 Performance Results:');
            console.log('   Average encryption time: ' + avg.toFixed(3) + 'ms');
            console.log('   Operations per second: ' + Math.round(1000 / avg));
            
            if (avg < 5) {
                console.log('   ✅ Performance is excellent (<5ms)');
            } else if (avg < 10) {
                console.log('   ⚠️ Performance is acceptable (<10ms)');
            } else {
                console.log('   ❌ Performance is poor (>10ms)');
            }
        "
        ;;
        
    4)
        echo "Exiting..."
        exit 0
        ;;
        
    *)
        echo "Invalid option"
        exit 1
        ;;
esac

echo ""
echo "=================================================="
echo "📚 Documentation: docs/TRADING_SECURITY_SETUP.md"
echo "🆘 Support: https://github.com/DegenPotato/cex-dev-monitor"
echo "=================================================="
