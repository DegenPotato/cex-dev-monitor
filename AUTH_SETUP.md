# Authentication & Referral System Setup

## Overview

This project now includes a comprehensive **role-based authentication system** with:
- ✅ JWT tokens with nonce-based wallet signature verification
- ✅ HttpOnly cookies for secure token storage
- ✅ Automatic token refresh (15-min access + 7-day refresh)
- ✅ Role-based access control (user, admin, super_admin)
- ✅ 10-level deep referral tracking system
- ✅ Referral commission distribution
- ✅ Admin-only endpoint protection

---

## 1. Database Setup

### Run Migration

The authentication schema includes:
- `users` - User accounts with wallet addresses and roles
- `auth_challenges` - Nonce-based challenge storage for signature verification
- `user_sessions` - JWT token tracking (optional for revocation)
- `referral_config` - 10-tier referral commission rates
- `reward_transactions` - Referral commission history
- `system_config` - System-wide configuration

**Apply the migration:**

```bash
# The migration is in: migrations/001_auth_and_referral_system.sql
# You'll need to execute this against your SQLite database

# Option 1: Using sqlite3 CLI
sqlite3 path/to/your/database.db < migrations/001_auth_and_referral_system.sql

# Option 2: Via the Database Admin Panel
# Go to http://localhost:3000/database (when implemented)
# Execute the SQL from the migration file
```

---

## 2. Environment Variables

### Create `.env` file

```bash
# JWT Secret for token signing (REQUIRED - use a strong random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Node environment
NODE_ENV=development

# Server configuration
PORT=3001
```

**Generate a secure JWT secret:**

```bash
# Option 1: Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Option 2: OpenSSL
openssl rand -hex 64

# Option 3: Online
# Visit: https://randomkeygen.com/
```

⚠️ **CRITICAL**: Never commit your `.env` file! It's already in `.gitignore`.

---

## 3. API Endpoints

### Authentication Flow

#### 1. Request Challenge (No Auth Required)
```bash
POST /api/auth/challenge
Content-Type: application/json

{
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "success": true,
  "challenge": {
    "message": "Welcome to CEX Dev Monitor!\n\nPlease sign this message...",
    "nonce": "a1b2c3d4..."
  }
}
```

#### 2. Verify Signature (Auto-registers new users)
```bash
POST /api/auth/verify
Content-Type: application/json

{
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "signature": "0x123abc...",
  "referralCode": "DEGEN1A2B3C" # Optional
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "walletAddress": "0x742d35cc...",
    "username": "user_742d35cc",
    "role": "user",
    "referralCode": "DEGEN9X8Y7Z"
  },
  "message": "Authentication successful"
}
```

**Note:** Tokens are set as HttpOnly cookies automatically!

#### 3. Get Current User (Requires Auth)
```bash
GET /api/auth/me
Cookie: access_token=...; refresh_token=...
```

#### 4. Logout
```bash
POST /api/auth/logout
Cookie: access_token=...; refresh_token=...
```

#### 5. Refresh Token
```bash
POST /api/auth/refresh
Cookie: refresh_token=...
```

---

### Referral Endpoints

#### Get Referral Stats (Requires Auth)
```bash
GET /api/auth/referral/stats
Cookie: access_token=...
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "userId": 1,
    "username": "user_742d35cc",
    "referralCode": "DEGEN9X8Y7Z",
    "totalReferrals": 5,
    "directReferrals": 5,
    "totalCommissionEarned": 12.50,
    "chainDepth": 2,
    "directReferralsList": [...]
  }
}
```

#### Validate Referral Code
```bash
POST /api/auth/referral/validate
Content-Type: application/json

{
  "code": "DEGEN1A2B3C"
}
```

#### Get Referral Chain (Requires Auth)
```bash
GET /api/auth/referral/chain
Cookie: access_token=...
```

---

## 4. Using Authentication in Backend

### Protect Routes with Middleware

```typescript
import SecureAuthService from '../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();

// Require authentication
app.get('/api/protected', 
  authService.requireSecureAuth(), 
  (req: any, res) => {
    // req.user is available
    console.log('User:', req.user.username);
    res.json({ message: 'Protected data' });
  }
);

// Require admin role
app.get('/api/admin/users', 
  authService.requireAdmin(), 
  (req: any, res) => {
    // Only admins can access this
    res.json({ users: [...] });
  }
);
```

### Manual Auth Check

```typescript
import SecureAuthService from '../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();

app.post('/api/custom', async (req, res) => {
  const { accessToken } = authService.extractTokensFromCookies(req);
  const decoded = await authService.verifyAccessToken(accessToken || '');
  
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // User is authenticated
  const user = await authService.getUserByWallet(decoded.wallet);
  // ...
});
```

---

## 5. Referral System Usage

### Process Referral Attribution

```typescript
import ReferralTrackingProvider from '../lib/auth/ReferralTrackingProvider.js';

const referralProvider = new ReferralTrackingProvider();

// When user registers with referral code
const result = await referralProvider.processReferralAttribution(
  newUserId, 
  'DEGEN1A2B3C' // Referral code
);

if (result.attributed) {
  console.log('User referred by:', result.referrer.username);
}
```

### Distribute Commissions

```typescript
// When user makes a transaction/purchase
await referralProvider.distributeReferralCommissions(
  userId,          // User who made the transaction
  100.0,           // Transaction amount
  'purchase',      // Activity type
  { orderId: 123 } // Optional metadata
);

// Automatically distributes commissions up to 10 levels deep!
// Level 1: 5%
// Level 2: 3%
// Level 3: 2%
// ... down to Level 10: 0.1%
```

---

## 6. User Roles

### Available Roles

- **`user`** - Default role for all registered users
- **`admin`** - Administrative access
- **`super_admin`** - Full system access

### Manually Set Admin

```sql
-- Update user role in database
UPDATE users 
SET role = 'admin' 
WHERE wallet_address = 'YOUR_WALLET_ADDRESS_HERE';
```

---

## 7. Security Best Practices

### ✅ Implemented

- HttpOnly cookies (no localStorage - immune to XSS)
- Short-lived access tokens (15 minutes)
- Long-lived refresh tokens (7 days)
- Automatic token rotation
- Nonce-based signature verification
- CSRF protection via SameSite cookies
- Case-insensitive wallet address matching

### 🔒 Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS in production (cookies will be `Secure`)
- [ ] Generate strong JWT_SECRET (64+ characters)
- [ ] Enable CORS only for your frontend domain
- [ ] Set up rate limiting on auth endpoints
- [ ] Monitor for suspicious auth patterns
- [ ] Regular security audits

---

## 8. Referral Configuration

### Commission Rates (Default)

| Level | Rate | Example (on $100) |
|-------|------|-------------------|
| 1     | 5%   | $5.00             |
| 2     | 3%   | $3.00             |
| 3     | 2%   | $2.00             |
| 4     | 1.5% | $1.50             |
| 5     | 1%   | $1.00             |
| 6     | 0.8% | $0.80             |
| 7     | 0.6% | $0.60             |
| 8     | 0.4% | $0.40             |
| 9     | 0.2% | $0.20             |
| 10    | 0.1% | $0.10             |

**Total distributed: 14.6% across 10 levels**

### Customize Rates

```sql
-- Update commission rate for a specific tier
UPDATE referral_config 
SET commission_rate = 0.10  -- 10%
WHERE tier_level = 1;

-- Disable a tier
UPDATE referral_config 
SET is_active = 0 
WHERE tier_level = 10;
```

---

## 9. Frontend Integration (Next Steps)

### React Context (To Be Implemented)

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState } from 'react';

interface AuthContextType {
  user: User | null;
  login: (walletAddress: string, signature: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

// Implementation...
```

### Wallet Connection Flow

1. User connects wallet (MetaMask, WalletConnect, etc.)
2. Request challenge from `/api/auth/challenge`
3. Sign message with wallet
4. Submit signature to `/api/auth/verify`
5. Tokens automatically set as cookies
6. Use `/api/auth/me` to fetch user data

---

## 10. Troubleshooting

### Tokens Not Working

**Check cookies in browser:**
```javascript
// In browser console
document.cookie
```

**Should see:**
```
access_token=...; refresh_token=...
```

### "Invalid signature" Error

- Ensure wallet address matches signature signer
- Challenge must not be expired (5 minutes)
- Sign the exact message returned from challenge

### "User not found" After Login

- Check database for user entry
- Verify wallet address is lowercase in DB
- Check `users` table has the wallet

### Database Not Initialized

```bash
# Check if tables exist
sqlite3 your-database.db ".tables"

# Should see: users, auth_challenges, referral_config, etc.
```

---

## 11. Testing

### Test Authentication Flow

```bash
# 1. Request challenge
curl -X POST http://localhost:3001/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'

# 2. Sign message with MetaMask/wallet

# 3. Verify signature
curl -X POST http://localhost:3001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb","signature":"0x..."}'

# 4. Test protected endpoint
curl http://localhost:3001/api/auth/me \
  -H "Cookie: access_token=...; refresh_token=..."
```

---

## 12. Database Schema Reference

### Key Tables

**users:**
- `id`, `wallet_address`, `username`, `email`
- `role` (user/admin/super_admin)
- `referral_code` (unique per user)
- `referred_by` (ID of referrer)
- `total_referrals`, `total_commission_earned`

**auth_challenges:**
- `wallet_address`, `nonce`, `message`
- `expires_at`, `used`

**referral_config:**
- `tier_level`, `commission_rate`
- `min_referrals`, `bonus_multiplier`

**reward_transactions:**
- `user_id`, `wallet_address`
- `transaction_type` (referral_commission, etc.)
- `amount`, `description`, `metadata`

---

## Support

For questions or issues:
1. Check this documentation
2. Review code in `src/lib/auth/`
3. Check API route handlers in `src/backend/routes/auth/`
4. Inspect database schema in `migrations/001_auth_and_referral_system.sql`

**Happy building! 🚀**
