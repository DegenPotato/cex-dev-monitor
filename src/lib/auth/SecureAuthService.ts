import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { queryOne, execute } from '../../backend/database/helpers.js';
import type { Request, Response, NextFunction } from 'express';

interface UserData {
  id: number;
  wallet_address?: string;
  solana_wallet_address?: string;
  walletAddress?: string;
  username: string;
  role: string;
  email?: string;
  referral_code?: string;
  last_login?: string;
  login_count?: number;
  google_account_linked?: number;
  created_at?: string;
}

interface JWTPayload {
  userId: number;
  wallet: string;
  username: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

interface AuthRequest extends Request {
  user?: {
    id: number;
    walletAddress: string;
    username: string;
    role: string;
  };
}

/**
 * Secure Authentication Service with HttpOnly cookies and refresh tokens
 * Adapted for SQLite and TypeScript
 */
class SecureAuthService {
  private jwtSecret: string;
  private refreshSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.refreshSecret = this.jwtSecret + '_refresh';

    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  JWT_SECRET not set in environment, using default (INSECURE!)');
    }

    console.log('🔐 SecureAuthService initialized with short-lived tokens');
  }

  /**
   * Generate short-lived access token (15 minutes)
   */
  generateAccessToken(userData: UserData): string {
    try {
      const wallet = userData.wallet_address || userData.solana_wallet_address || userData.walletAddress || '';

      const payload: JWTPayload = {
        userId: userData.id,
        wallet,
        username: userData.username,
        role: userData.role,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
      };

      const token = jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
      console.log('✅ Access token generated for user:', userData.username, '(15 min)');

      return token;
    } catch (error) {
      console.error('❌ Access token generation error:', error);
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Generate long-lived refresh token (7 days, HttpOnly cookie)
   */
  generateRefreshToken(userData: UserData): string {
    try {
      const wallet = userData.wallet_address || userData.solana_wallet_address || userData.walletAddress || '';

      const payload: Omit<JWTPayload, 'username' | 'role'> = {
        userId: userData.id,
        wallet,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
      };

      const refreshToken = jwt.sign(payload, this.refreshSecret, { algorithm: 'HS256' });
      console.log('✅ Refresh token generated for user:', userData.username, '(7 days)');

      return refreshToken;
    } catch (error) {
      console.error('❌ Refresh token generation error:', error);
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;

      if (decoded.type !== 'access') {
        console.log('❌ Invalid token type:', decoded.type);
        return null;
      }

      console.log('✅ Access token verified for user:', decoded.userId);
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        console.log('⏰ Access token expired, needs refresh');
      } else {
        console.log('❌ Access token verification failed:', error.message);
      }
      return null;
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<Partial<JWTPayload> | null> {
    try {
      const decoded = jwt.verify(token, this.refreshSecret, { algorithms: ['HS256'] }) as JWTPayload;

      if (decoded.type !== 'refresh') {
        console.log('❌ Invalid refresh token type:', decoded.type);
        return null;
      }

      console.log('✅ Refresh token verified for user:', decoded.userId);
      return decoded;
    } catch (error: any) {
      console.log('❌ Refresh token verification failed:', error.message);
      return null;
    }
  }

  /**
   * Set secure HTTP-only cookies for authentication
   */
  setSecureCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = process.env.NODE_ENV === 'production';

    // Set cookies using Express
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log('🍪 Secure cookies set:', {
      accessToken: '15 min',
      refreshToken: '7 days',
      secure: isProduction,
    });
  }

  /**
   * Clear authentication cookies
   */
  clearSecureCookies(res: Response): void {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    console.log('🗑️ Authentication cookies cleared');
  }

  /**
   * Extract tokens from request cookies
   */
  extractTokensFromCookies(req: Request): { accessToken: string | null; refreshToken: string | null } {
    const accessToken = req.cookies?.access_token || null;
    const refreshToken = req.cookies?.refresh_token || null;

    console.log('[SecureAuth] Cookie extraction result:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Hash token for storage (SHA-256)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create session record in database
   */
  async createSession(
    userId: number,
    refreshToken: string,
    req: Request,
    expiresAt: Date
  ): Promise<void> {
    try {
      const tokenHash = this.hashToken(refreshToken);
      const deviceInfo = req.headers['user-agent'] || 'Unknown';
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                       req.socket.remoteAddress ||
                       'Unknown';

      await execute(
        `INSERT INTO user_sessions (user_id, token_hash, device_info, ip_address, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, tokenHash, deviceInfo, ipAddress, expiresAt.toISOString()]
      );

      console.log('[SecureAuth] ✅ Session created for user:', userId);
    } catch (error: any) {
      console.error('[SecureAuth] ⚠️ Failed to create session:', error.message);
      // Don't fail auth if session creation fails
    }
  }

  /**
   * Update login tracking (last_login, login_count)
   */
  async updateLoginTracking(userId: number): Promise<void> {
    try {
      await execute(
        `UPDATE users 
         SET last_login = CURRENT_TIMESTAMP,
             login_count = COALESCE(login_count, 0) + 1,
             last_activity = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId]
      );
      console.log('[SecureAuth] ✅ Updated login tracking for user:', userId);
    } catch (error: any) {
      console.error('[SecureAuth] ⚠️ Failed to update login tracking:', error.message);
    }
  }

  /**
   * Revoke session by token hash
   */
  async revokeSession(tokenHash: string): Promise<void> {
    try {
      await execute(
        'DELETE FROM user_sessions WHERE token_hash = ?',
        [tokenHash]
      );
      console.log('[SecureAuth] ✅ Session revoked');
    } catch (error: any) {
      console.error('[SecureAuth] ⚠️ Failed to revoke session:', error.message);
    }
  }

  /**
   * Clean up expired sessions and challenges
   */
  async cleanupExpiredRecords(): Promise<void> {
    try {
      // Clean expired sessions
      await execute(
        `DELETE FROM user_sessions WHERE expires_at < datetime('now')`
      );
      
      // Clean expired and used challenges
      await execute(
        `DELETE FROM auth_challenges WHERE expires_at < datetime('now') OR used = 1`
      );

      console.log('[SecureAuth] 🧹 Cleanup complete');
    } catch (error: any) {
      console.error('[SecureAuth] ⚠️ Cleanup failed:', error.message);
    }
  }

  /**
   * Get user by wallet address
   */
  async getUserByWallet(walletAddress: string, updateLastLogin = false): Promise<UserData | null> {
    try {
      if (!walletAddress) {
        console.log('[SecureAuth] ❌ No wallet address provided');
        return null;
      }

      // Determine if this is a Solana wallet (case-sensitive) or EVM wallet (case-insensitive)
      const isSolana = walletAddress.length >= 32 && walletAddress.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(walletAddress);
      
      console.log('[SecureAuth] 🔍 Searching for wallet:', isSolana ? walletAddress : walletAddress.toLowerCase());

      // Check both wallet_address and solana_wallet_address 
      // EVM wallets are case-insensitive, Solana wallets are case-sensitive
      const user = await queryOne<UserData>(
        `SELECT * FROM users 
         WHERE LOWER(wallet_address) = ? OR solana_wallet_address = ?`,
        [walletAddress.toLowerCase(), walletAddress]  // Solana uses exact case
      );

      if (!user) {
        console.log('[SecureAuth] ❌ User not found for wallet:', walletAddress);
        return null;
      }

      console.log('[SecureAuth] ✅ User found:', { id: user.id, username: user.username, role: user.role });

      // Update login tracking if requested
      if (updateLastLogin) {
        await this.updateLoginTracking(user.id);
      }

      return user;
    } catch (error: any) {
      console.error('[SecureAuth] ❌ Database error:', error.message);
      return null;
    }
  }

  /**
   * Middleware for secure authentication with auto-refresh
   */
  requireSecureAuth() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        // Skip auth for OPTIONS requests (CORS preflight)
        if (req.method === 'OPTIONS') {
          return next();
        }

        console.log('🔐 Secure auth middleware called for:', req.method, req.url);

        // Extract tokens from cookies
        const { accessToken, refreshToken } = this.extractTokensFromCookies(req);

        // Try to verify access token first
        let decoded = await this.verifyAccessToken(accessToken || '');

        if (!decoded && refreshToken) {
          // Access token expired/invalid, try to refresh
          console.log('🔄 Attempting token refresh...');

          const refreshDecoded = await this.verifyRefreshToken(refreshToken);
          if (refreshDecoded && refreshDecoded.wallet) {
            // Get user data and generate new tokens
            const user = await this.getUserByWallet(refreshDecoded.wallet);
            if (user) {
              const newAccessToken = this.generateAccessToken(user);
              const newRefreshToken = this.generateRefreshToken(user);

              // Set new cookies
              this.setSecureCookies(res, newAccessToken, newRefreshToken);

              decoded = await this.verifyAccessToken(newAccessToken);
              console.log('✅ Token refreshed successfully');
            }
          }
        }

        if (!decoded) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            needsReauth: true,
          });
        }

        // Get fresh user data from database
        const user = await this.getUserByWallet(decoded.wallet);
        if (!user) {
          this.clearSecureCookies(res);
          return res.status(403).json({
            success: false,
            error: 'User not found',
            needsReauth: true,
          });
        }

        req.user = {
          id: user.id,
          walletAddress: user.wallet_address || user.solana_wallet_address || '',
          username: user.username,
          role: user.role,
        };

        next();
      } catch (error: any) {
        console.error('❌ Secure auth middleware error:', error);
        this.clearSecureCookies(res);
        return res.status(500).json({
          success: false,
          error: 'Authentication failed',
          needsReauth: true,
        });
      }
    };
  }

  /**
   * Middleware to require admin role
   */
  requireAdmin() {
    const authMiddleware = this.requireSecureAuth();
    
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      authMiddleware(req, res, () => {
        if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
          next();
        } else {
          res.status(403).json({
            success: false,
            error: 'Admin access required',
          });
        }
      });
    };
  }

  /**
   * Middleware to require super_admin role (strictest access)
   */
  requireSuperAdmin() {
    const authMiddleware = this.requireSecureAuth();
    
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      authMiddleware(req, res, () => {
        if (req.user && req.user.role === 'super_admin') {
          next();
        } else {
          res.status(403).json({
            success: false,
            error: 'Super admin access required',
          });
        }
      });
    };
  }

  /**
   * Generate unique referral code
   */
  async generateReferralCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code: string;
    let exists = true;

    while (exists) {
      // Generate DEGEN + 6 random characters
      code = 'DEGEN' + Array.from({ length: 6 }, () => 
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');

      // Check if code exists
      const existing = await queryOne('SELECT id FROM users WHERE referral_code = ?', [code]);
      exists = !!existing;
    }

    return code!;
  }

  /**
   * Sanitize user data for client
   */
  sanitizeUser(user: UserData) {
    return {
      id: user.id,
      walletAddress: user.wallet_address || user.solana_wallet_address,
      username: user.username,
      role: user.role,
      email: user.email,
      referralCode: user.referral_code,
    };
  }
}

export default SecureAuthService;
