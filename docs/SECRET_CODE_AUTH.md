# Secret Code Authentication - VR Testing Access

## Overview
Alternative authentication method for testing Matrix Skynet in VR without wallet connection.

## Access Code
```
SNIFFAGENCY
```

## How It Works

### 1. Entry Point
- On the BlackHole entry portal, users see two options:
  - **Connect Wallet** (traditional blockchain auth)
  - **Enter Access Code** (secret code for testing)

### 2. Authentication Flow

**Standard Wallet Flow:**
1. Connect Solana wallet
2. Sign authentication message
3. Backend verifies signature
4. User receives role-based access

**Secret Code Flow:**
1. Click "🔑 ENTER ACCESS CODE"
2. Enter secret code: `SNIFFAGENCY`
3. Press Enter or click "✅ VERIFY & ENTER"
4. Instant super_admin access granted

### 3. User Profile Created

When authenticated with code, a temporary super_admin user is created:

```typescript
{
  id: 0,                          // Special ID for code-based auth
  username: 'SUPER_ADMIN_VR',     // Identifies VR testing session
  wallet_address: undefined,       // No wallet connected
  solana_wallet_address: undefined,
  role: 'super_admin',            // Full access
  referral_code: 'GENESIS'        // Genesis user designation
}
```

### 4. Access Granted
- Full access to Matrix Skynet scene
- Can navigate all 7 nodes including Account Manager
- All super_admin features unlocked
- No blockchain connection required

## UI Features

### Code Entry Form
- **Password input field** (masked characters)
- **Monospace font** with wide letter spacing
- **Auto-focus** on mount
- **Enter key** support for quick submission
- **Real-time validation** feedback

### Error Handling
- ❌ Invalid code shows red border
- **Shake animation** on error (0.4s)
- Error message: "❌ INVALID ACCESS CODE"
- Auto-clears error after 2 seconds
- No rate limiting (testing only)

### Visual Design
- **Purple/pink gradient** theme (different from wallet connect)
- Glowing shadow effects
- Smooth transitions
- Loading spinner during verification
- Back button to return to wallet connect

## Security Considerations

### Current Implementation
- ⚠️ Code is **hardcoded in frontend** for testing
- ⚠️ No backend validation
- ⚠️ Session persists until logout
- ⚠️ No rate limiting
- ⚠️ No audit logging

### Production Recommendations
1. **Move code to backend environment variable**
2. **Add rate limiting** (max 3 attempts per IP)
3. **Log all code authentication attempts** with IP/timestamp
4. **Add expiry time** for code-based sessions (e.g., 1 hour)
5. **Rotate code periodically** or make it time-based (TOTP)
6. **Add 2FA** for code-based access
7. **Restrict by IP whitelist** if possible

## Use Cases

### Primary: VR Testing
- Test Matrix Skynet in VR headset
- No wallet extension support in VR browsers
- Quick access for development/testing
- Demo to stakeholders without wallet setup

### Secondary: Quick Access
- Development environment testing
- CI/CD automated tests
- Emergency access if wallet issues
- Non-technical user demos

## Code Location

### Frontend
- **AuthContext**: `src/contexts/AuthContext.tsx`
  - `authenticateWithCode(code: string)` method
  - Creates super_admin user object
  
- **BlackholeScene**: `src/components/landing/BlackholeScene.tsx`
  - UI for code entry form
  - `handleCodeSubmit()` function
  - Toggle between wallet/code modes

### Backend
- ❌ **No backend validation currently**
- ⚠️ Consider adding endpoint: `POST /api/auth/verify-code`

## Future Enhancements

### Time-Based Codes (TOTP)
```typescript
// Generate time-based codes that change every 30 seconds
import speakeasy from 'speakeasy';

const secret = 'YOUR_SECRET_KEY';
const token = speakeasy.totp({
  secret: secret,
  encoding: 'base32'
});

// Verify
const verified = speakeasy.totp.verify({
  secret: secret,
  encoding: 'base32',
  token: userInput,
  window: 2 // Allow 2 time steps variance
});
```

### QR Code Generation
- Generate QR code for mobile scanning
- Encode access link with temporary token
- Expires after single use

### Role-Based Codes
```typescript
const CODE_ROLES = {
  'SNIFFAGENCY': 'super_admin',    // Full access
  'T3stC0d3': 'admin',                 // Limited admin
  'Gu3stC0d3': 'agent'                 // Read-only
};
```

## Testing

### Manual Test
1. Navigate to landing page
2. Click "🔑 ENTER ACCESS CODE"
3. Enter: `SNIFFAGENCY`
4. Verify access granted with super_admin role
5. Check all Matrix nodes are accessible
6. Test Account Manager node

### Invalid Code Test
1. Enter wrong code: `WrongCode123`
2. Verify error message appears
3. Verify shake animation plays
4. Verify can retry immediately

### Switch Between Methods
1. Click "🔑 ENTER ACCESS CODE"
2. Click "← Back to Wallet Connect"
3. Verify wallet connect button appears
4. Verify state is properly reset

## Removal Instructions

If you need to remove this feature for production:

1. **Remove from AuthContext:**
```typescript
// Delete authenticateWithCode method
// Remove from AuthContextType interface
```

2. **Remove from BlackholeScene:**
```typescript
// Delete showCodeEntry state
// Delete accessCode state
// Delete codeError state
// Delete handleCodeSubmit function
// Remove "ENTER ACCESS CODE" button
// Remove code entry form UI
```

3. **Update documentation** to reflect removal

## Monitoring

Recommended metrics to track:
- Number of code authentications per day
- Failed code attempts
- Sessions created via code
- Average session duration for code users
- Feature usage by code users vs wallet users
