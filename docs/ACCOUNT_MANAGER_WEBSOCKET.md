# Account Manager WebSocket Extensions

## Overview
The Account Manager requires real-time bidirectional communication for secure operations, live status updates, and immediate security alerts.

## Required WebSocket Events

### 📡 Server → Client Events

#### 1. Account Status Updates
```typescript
// Event: 'account:status_changed'
{
  userId: string;
  accountType: 'telegram' | 'x_twitter' | 'discord' | 'github';
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  timestamp: Date;
  metadata?: {
    errorMessage?: string;
    lastSynced?: Date;
  }
}
```

#### 2. Security Alerts
```typescript
// Event: 'security:alert'
{
  userId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'suspicious_login' | 'new_device' | 'token_expired' | 'failed_2fa';
  message: string;
  timestamp: Date;
  requiresAction: boolean;
}
```

#### 3. 2FA Verification Request
```typescript
// Event: 'security:2fa_required'
{
  userId: string;
  sessionId: string;
  expiresIn: number; // seconds
  method: 'totp' | 'sms' | 'email';
}
```

#### 4. Real-time Notifications (from connected platforms)
```typescript
// Event: 'notification:incoming'
{
  userId: string;
  platform: 'telegram' | 'x_twitter' | 'discord';
  type: 'mention' | 'message' | 'follow' | 'reply';
  content: string;
  sender: string;
  timestamp: Date;
}
```

#### 5. Session Timeout Warning
```typescript
// Event: 'security:session_warning'
{
  userId: string;
  expiresIn: number; // seconds until logout
  canExtend: boolean;
}
```

### 📤 Client → Server Events

#### 1. Connect Account Request
```typescript
// Event: 'account:connect'
{
  userId: string;
  accountType: 'telegram' | 'x_twitter' | 'discord' | 'github';
  oauthCode: string; // From OAuth callback
  redirectUri: string;
}

// Response: 'account:connect_response'
{
  success: boolean;
  account?: UserAccount;
  error?: string;
}
```

#### 2. Disconnect Account
```typescript
// Event: 'account:disconnect'
{
  userId: string;
  accountType: string;
}

// Response: 'account:disconnect_response'
{
  success: boolean;
  accountType: string;
}
```

#### 3. Verify 2FA Token
```typescript
// Event: 'security:verify_2fa'
{
  userId: string;
  sessionId: string;
  token: string; // 6-digit TOTP code
}

// Response: 'security:2fa_verified'
{
  success: boolean;
  sessionExtended?: boolean;
  expiresAt?: Date;
}
```

#### 4. Revoke All Access
```typescript
// Event: 'security:revoke_all'
{
  userId: string;
  confirmationToken: string; // Additional security measure
}

// Response: 'security:revoke_complete'
{
  success: boolean;
  accountsDisconnected: number;
}
```

#### 5. Update Security Settings
```typescript
// Event: 'security:update_settings'
{
  userId: string;
  settings: {
    sessionTimeout?: number;
    twoFactorEnabled?: boolean;
  }
}
```

#### 6. Request Account Sync
```typescript
// Event: 'account:sync'
{
  userId: string;
  accountType: string;
}

// Response: 'account:sync_complete'
{
  success: boolean;
  lastSynced: Date;
  data?: any; // Platform-specific sync data
}
```

## WebSocket Server Implementation

### Server-side Handler Extensions

```typescript
// src/websocket/accountManagerHandler.ts

import { Server, Socket } from 'socket.io';
import { accountManager } from '../services/AccountManagerService';
import { AccountType } from '../types/AccountManager';

export function setupAccountManagerHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId; // From authentication middleware

  // Connect account
  socket.on('account:connect', async (data) => {
    try {
      const result = await accountManager.connectAccount(
        data.userId,
        data.accountType as AccountType,
        data.oauthCode,
        data.redirectUri
      );

      socket.emit('account:connect_response', result);

      // Broadcast status change to all user's connected clients
      io.to(`user:${data.userId}`).emit('account:status_changed', {
        userId: data.userId,
        accountType: data.accountType,
        status: result.success ? 'connected' : 'error',
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('account:connect_response', {
        success: false,
        error: 'Connection failed'
      });
    }
  });

  // Disconnect account
  socket.on('account:disconnect', async (data) => {
    try {
      const result = await accountManager.disconnectAccount(
        data.userId,
        data.accountType as AccountType
      );

      socket.emit('account:disconnect_response', {
        success: result.success,
        accountType: data.accountType
      });

      // Broadcast status change
      io.to(`user:${data.userId}`).emit('account:status_changed', {
        userId: data.userId,
        accountType: data.accountType,
        status: 'disconnected',
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('account:disconnect_response', {
        success: false,
        accountType: data.accountType
      });
    }
  });

  // Verify 2FA
  socket.on('security:verify_2fa', async (data) => {
    try {
      const verified = await accountManager.verify2FA(
        data.userId,
        data.token
      );

      socket.emit('security:2fa_verified', {
        success: verified,
        sessionExtended: verified,
        expiresAt: verified ? new Date(Date.now() + 30 * 60 * 1000) : undefined
      });

      if (!verified) {
        // Log failed 2FA attempt
        io.to(`user:${data.userId}`).emit('security:alert', {
          userId: data.userId,
          severity: 'medium',
          type: 'failed_2fa',
          message: 'Failed 2FA verification attempt',
          timestamp: new Date(),
          requiresAction: false
        });
      }
    } catch (error) {
      socket.emit('security:2fa_verified', {
        success: false
      });
    }
  });

  // Revoke all access
  socket.on('security:revoke_all', async (data) => {
    try {
      const success = await accountManager.revokeAllAccess(data.userId);
      
      socket.emit('security:revoke_complete', {
        success,
        accountsDisconnected: success ? 4 : 0 // Based on number of accounts
      });

      if (success) {
        // Log security action
        io.to(`user:${data.userId}`).emit('security:alert', {
          userId: data.userId,
          severity: 'high',
          type: 'revoke_all',
          message: 'All account access has been revoked',
          timestamp: new Date(),
          requiresAction: false
        });
      }
    } catch (error) {
      socket.emit('security:revoke_complete', {
        success: false,
        accountsDisconnected: 0
      });
    }
  });

  // Update security settings
  socket.on('security:update_settings', async (data) => {
    try {
      const updated = await accountManager.updateSecuritySettings(
        data.userId,
        data.settings
      );

      if (updated) {
        io.to(`user:${data.userId}`).emit('security:settings_updated', {
          userId: data.userId,
          settings: updated
        });
      }
    } catch (error) {
      console.error('Failed to update security settings:', error);
    }
  });

  // Join user-specific room for targeted broadcasts
  socket.join(`user:${userId}`);
}
```

### Session Timeout Manager

```typescript
// src/websocket/sessionManager.ts

import { Server } from 'socket.io';

export class SessionManager {
  private sessions: Map<string, NodeJS.Timeout> = new Map();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  startSession(userId: string, timeoutMinutes: number = 30) {
    // Clear existing timeout if any
    this.clearSession(userId);

    // Set warning at 5 minutes before timeout
    const warningTimeout = setTimeout(() => {
      this.io.to(`user:${userId}`).emit('security:session_warning', {
        userId,
        expiresIn: 5 * 60, // 5 minutes in seconds
        canExtend: true
      });
    }, (timeoutMinutes - 5) * 60 * 1000);

    // Set actual timeout
    const sessionTimeout = setTimeout(() => {
      this.io.to(`user:${userId}`).emit('security:session_expired', {
        userId,
        timestamp: new Date()
      });
      
      // Force disconnect all user sockets
      this.io.in(`user:${userId}`).disconnectSockets(true);
    }, timeoutMinutes * 60 * 1000);

    this.sessions.set(userId, sessionTimeout);
  }

  extendSession(userId: string, additionalMinutes: number = 30) {
    this.startSession(userId, additionalMinutes);
  }

  clearSession(userId: string) {
    const timeout = this.sessions.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessions.delete(userId);
    }
  }
}
```

## Security Considerations

### 1. Authentication Middleware
```typescript
// Verify user before processing account manager events
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (verifyJWT(token)) {
    socket.data.userId = extractUserId(token);
    next();
  } else {
    next(new Error('Authentication failed'));
  }
});
```

### 2. Rate Limiting
```typescript
// Limit sensitive operations (e.g., 2FA attempts)
const rateLimiter = new Map<string, number>();

function checkRateLimit(userId: string, limit: number): boolean {
  const attempts = rateLimiter.get(userId) || 0;
  if (attempts >= limit) {
    return false;
  }
  rateLimiter.set(userId, attempts + 1);
  setTimeout(() => rateLimiter.delete(userId), 60000); // Reset after 1 min
  return true;
}
```

### 3. Encrypted Channel
- All WebSocket connections MUST use WSS (WebSocket Secure)
- TLS 1.3 or higher required
- Certificate pinning for production

### 4. Session Validation
- Validate session token on every event
- Auto-disconnect on token expiry
- Implement heartbeat to detect zombie connections

## Integration with Existing WebSocket Server

Add to your main WebSocket server setup:

```typescript
import { setupAccountManagerHandlers } from './websocket/accountManagerHandler';
import { SessionManager } from './websocket/sessionManager';

const sessionManager = new SessionManager(io);

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  
  // Start session timeout
  sessionManager.startSession(userId, 30);
  
  // Set up account manager handlers
  setupAccountManagerHandlers(io, socket);
  
  // Extend session on activity
  socket.onAny(() => {
    sessionManager.extendSession(userId, 30);
  });
  
  socket.on('disconnect', () => {
    sessionManager.clearSession(userId);
  });
});
```

## Testing

### Real-time Status Test
```typescript
// Client-side test
socket.emit('account:connect', {
  userId: 'GEN-001',
  accountType: 'telegram',
  oauthCode: 'test_code_123',
  redirectUri: 'http://localhost:3000/callback'
});

socket.on('account:status_changed', (data) => {
  console.log('Account status:', data);
});
```

### Security Alert Test
```typescript
// Trigger security alert (server-side)
io.to('user:GEN-001').emit('security:alert', {
  userId: 'GEN-001',
  severity: 'high',
  type: 'suspicious_login',
  message: 'Login from new device detected',
  timestamp: new Date(),
  requiresAction: true
});
```

## Performance Considerations

1. **Connection Pooling** - Reuse WebSocket connections across components
2. **Message Batching** - Batch non-critical updates every 5 seconds
3. **Compression** - Enable per-message deflate for large payloads
4. **Room Optimization** - Use user-specific rooms to avoid broadcast storms

## Deployment Checklist

- [ ] Enable WSS with valid TLS certificate
- [ ] Configure rate limiting per user
- [ ] Set up session timeout middleware
- [ ] Implement heartbeat mechanism (30s interval)
- [ ] Add connection monitoring and alerts
- [ ] Test OAuth callback handling
- [ ] Verify 2FA flow end-to-end
- [ ] Load test with 1000+ concurrent connections
