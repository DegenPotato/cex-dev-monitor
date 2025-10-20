import jwt from 'jsonwebtoken';
import { Response } from 'express';

interface UserData {
    id: number;
    wallet?: string;
    solana_wallet_address?: string;
    username: string;
    role: string;
}

interface TokenPayload {
    userId: number;
    wallet: string;
    username?: string;
    role?: string;
    type: string;
    iat: number;
    exp: number;
}

/**
 * JWT Authentication Service with HttpOnly cookies
 * Handles access tokens (15 minutes) and refresh tokens (7 days)
 */
export class JWTAuthService {
    private jwtSecret: string;
    private refreshSecret: string;

    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';
        this.refreshSecret = this.jwtSecret + '_refresh';
        
        if (!process.env.JWT_SECRET) {
            console.warn('⚠️ [JWTAuth] Using default JWT_SECRET. Set JWT_SECRET in production!');
        }
        
        console.log('🔐 [JWTAuth] Initialized with short-lived tokens');
    }

    /**
     * Generate short-lived access token (15 minutes)
     */
    generateAccessToken(userData: UserData): string {
        try {
            const wallet = userData.wallet || userData.solana_wallet_address || '';
            
            const payload: TokenPayload = {
                userId: userData.id,
                wallet,
                username: userData.username,
                role: userData.role,
                type: 'access',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
            };
            
            const token = jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
            console.log(`✅ [JWTAuth] Access token generated for: ${userData.username} (15 min)`);
            
            return token;
        } catch (error) {
            console.error('❌ [JWTAuth] Access token generation error:', error);
            throw new Error('Failed to generate access token');
        }
    }

    /**
     * Generate long-lived refresh token (7 days)
     */
    generateRefreshToken(userData: UserData): string {
        try {
            const wallet = userData.wallet || userData.solana_wallet_address || '';
            
            const payload = {
                userId: userData.id,
                wallet,
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
            };
            
            const token = jwt.sign(payload, this.refreshSecret, { algorithm: 'HS256' });
            console.log(`✅ [JWTAuth] Refresh token generated for: ${userData.username} (7 days)`);
            
            return token;
        } catch (error) {
            console.error('❌ [JWTAuth] Refresh token generation error:', error);
            throw new Error('Failed to generate refresh token');
        }
    }

    /**
     * Verify access token
     */
    async verifyAccessToken(token: string): Promise<TokenPayload | null> {
        try {
            const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload;
            
            if (decoded.type !== 'access') {
                console.log('❌ [JWTAuth] Invalid token type:', decoded.type);
                return null;
            }
            
            console.log(`✅ [JWTAuth] Access token verified for user: ${decoded.userId}`);
            return decoded;
        } catch (error: any) {
            if (error.name === 'TokenExpiredError') {
                console.log('⏰ [JWTAuth] Access token expired, needs refresh');
            } else {
                console.log('❌ [JWTAuth] Access token verification failed:', error.message);
            }
            return null;
        }
    }

    /**
     * Verify refresh token
     */
    async verifyRefreshToken(token: string): Promise<TokenPayload | null> {
        try {
            const decoded = jwt.verify(token, this.refreshSecret, { algorithms: ['HS256'] }) as TokenPayload;
            
            if (decoded.type !== 'refresh') {
                console.log('❌ [JWTAuth] Invalid refresh token type:', decoded.type);
                return null;
            }
            
            console.log(`✅ [JWTAuth] Refresh token verified for user: ${decoded.userId}`);
            return decoded;
        } catch (error: any) {
            console.log('❌ [JWTAuth] Refresh token verification failed:', error.message);
            return null;
        }
    }

    /**
     * Set secure HTTP-only cookies for authentication
     */
    setSecureCookies(res: Response, accessToken: string, refreshToken: string) {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Using Express cookie-parser with sameSite: 'none' for cross-site support
        // between alpha.sniff.agency (frontend) and api.sniff.agency (backend)
        res.cookie('access_token', accessToken, {
            httpOnly: true,
            secure: true, // Required for sameSite: 'none'
            sameSite: 'none', // Allow cross-site cookies
            path: '/',
            maxAge: 15 * 60 * 1000 // 15 minutes in milliseconds
        });
        
        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: true, // Required for sameSite: 'none'
            sameSite: 'none', // Allow cross-site cookies
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
        });
        
        console.log('🍪 [JWTAuth] Secure cookies set:', { 
            accessToken: '15 min', 
            refreshToken: '7 days',
            secure: true,
            sameSite: 'none' 
        });
    }

    /**
     * Clear authentication cookies
     */
    clearSecureCookies(res: Response) {
        res.clearCookie('access_token', { 
            path: '/',
            secure: true,
            sameSite: 'none'
        });
        res.clearCookie('refresh_token', { 
            path: '/',
            secure: true,
            sameSite: 'none'
        });
        
        console.log('🗑️ [JWTAuth] Authentication cookies cleared');
    }
}
