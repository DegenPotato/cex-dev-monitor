import crypto from 'crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { AuthChallengeProvider } from './AuthChallengeProvider.js';
import { JWTAuthService } from './JWTAuthService.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { execute, getLastInsertId } from '../database/helpers.js';

interface AuthResult {
    user: any;
    accessToken: string;
    refreshToken: string;
}

/**
 * Solana Wallet Authentication Service
 * Handles nonce-based message signing for Solana wallets
 * Note: This is a utility service - the main auth flow uses /api/auth/challenge and /api/auth/verify endpoints
 */
export class SolanaAuthService {
    private challengeProvider: AuthChallengeProvider;
    private jwtService: JWTAuthService;
    private secureAuthService: SecureAuthService;

    constructor() {
        this.challengeProvider = new AuthChallengeProvider();
        this.jwtService = new JWTAuthService();
        this.secureAuthService = new SecureAuthService();
        
        // Initialize challenge provider
        this.initializeProvider();
    }
    
    async initializeProvider() {
        try {
            await this.challengeProvider.initialize();
        } catch (error) {
            console.error('[Solana Auth] Challenge provider init error:', error);
        }
    }

    /**
     * Generate authentication challenge for Solana wallet
     * @param walletAddress - Base58 encoded Solana public key (44 chars)
     * @returns Challenge object with nonce and message
     */
    async generateAuthChallenge(walletAddress: string) {
        const nonce = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        const expiresAt = new Date(timestamp + (5 * 60 * 1000)); // 5 minutes
        
        const message = `Sign this message to authenticate with Sniff Agency.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;
        
        // Store challenge in database
        await this.challengeProvider.storeChallenge(
            walletAddress,
            nonce,
            message,
            expiresAt
        );

        console.log(`[Solana Auth] ✅ Generated challenge for ${walletAddress}`);
        
        return {
            nonce,
            timestamp,
            walletAddress,
            message
        };
    }

    /**
     * Verify Solana wallet signature using ed25519
     * @param walletAddress - Base58 encoded public key
     * @param signatureBase58 - Base58 encoded signature
     * @param nonce - Challenge nonce
     * @param referralCode - Optional referral code for new users
     * @returns User object and JWT tokens
     */
    async verifySolanaSignature(
        walletAddress: string, 
        signatureBase58: string, 
        nonce: string
    ): Promise<AuthResult> {
        try {
            console.log('[Solana Auth] 🔐 Verifying signature for wallet:', walletAddress);
            
            // Get challenge from database
            const challenge = await this.challengeProvider.getChallengeByWallet(walletAddress);
            if (!challenge) {
                throw new Error('Challenge not found or expired');
            }
            
            // Verify nonce matches
            if (challenge.nonce !== nonce) {
                throw new Error('Invalid nonce');
            }
            
            // Verify signature using ed25519
            const messageBytes = new TextEncoder().encode(challenge.message);
            const signatureBytes = bs58.decode(signatureBase58);
            const publicKeyBytes = bs58.decode(walletAddress);
            
            const isValid = nacl.sign.detached.verify(
                messageBytes,
                signatureBytes,
                publicKeyBytes
            );
            
            if (!isValid) {
                console.error('[Solana Auth] ❌ Signature verification failed');
                throw new Error('Invalid signature');
            }
            
            console.log('[Solana Auth] ✅ Signature verified successfully');
            
            // Delete used challenge
            await this.challengeProvider.deleteByWallet(walletAddress);
            
            // Get or create user (use SecureAuthService)
            let user = await this.secureAuthService.getUserByWallet(walletAddress, true);
            
            if (!user) {
                console.log('[Solana Auth] 🆕 New user - creating account for:', walletAddress);
                
                const username = `user_${walletAddress.substring(0, 8)}`;
                const referralCode = await this.secureAuthService.generateReferralCode();
                
                await execute(
                    `INSERT INTO users (solana_wallet_address, username, role, status, referral_code) 
                     VALUES (?, ?, 'user', 'active', ?)`,
                    [walletAddress, username, referralCode]
                );
                
                const userId = await getLastInsertId();
                console.log(`[Solana Auth] ✅ Created user ID: ${userId}`);
                
                // Fetch newly created user
                user = await this.secureAuthService.getUserByWallet(walletAddress, false);
                
                if (!user) {
                    throw new Error('Failed to create user');
                }
            } else {
                console.log('[Solana Auth] ✅ Existing user found:', user.username);
            }
            
            // Generate JWT tokens
            const accessToken = this.jwtService.generateAccessToken({
                id: user.id,
                solana_wallet_address: walletAddress,
                username: user.username,
                role: user.role || 'user'
            });
            
            const refreshToken = this.jwtService.generateRefreshToken({
                id: user.id,
                solana_wallet_address: walletAddress,
                username: user.username,
                role: user.role || 'user'
            });
            
            return {
                user,
                accessToken,
                refreshToken
            };
            
        } catch (error) {
            console.error('[Solana Auth] ❌ Verification error:', error);
            throw error;
        }
    }

    /**
     * Generate referral code with DEGEN prefix
     */
    generateReferralCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'DEGEN';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
}
