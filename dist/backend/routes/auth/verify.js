import express from 'express';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import AuthChallengeProvider from '../../../lib/auth/AuthChallengeProvider.js';
import SecureAuthService from '../../../lib/auth/SecureAuthService.js';
import ReferralTrackingProvider from '../../../lib/auth/ReferralTrackingProvider.js';
import { execute, getLastInsertId } from '../../database/helpers.js';
const router = express.Router();
const authService = new SecureAuthService();
const challengeProvider = new AuthChallengeProvider();
const referralProvider = new ReferralTrackingProvider();
/**
 * POST /api/auth/verify
 * Verify wallet signature and authenticate user
 */
router.post('/', async (req, res) => {
    try {
        const { walletAddress, signature } = req.body;
        console.log('[Verify API] Verification requested for:', walletAddress);
        if (!walletAddress || !signature) {
            return res.status(400).json({
                success: false,
                error: 'Wallet address and signature are required',
            });
        }
        // Get challenge from database
        const challenge = await challengeProvider.getChallengeByWallet(walletAddress);
        if (!challenge) {
            return res.status(401).json({
                success: false,
                error: 'No active challenge found. Please request a new challenge.',
            });
        }
        // Verify the signature (support both EVM and Solana)
        try {
            let isValid = false;
            // Check if it's a Solana wallet (base58, typically 44 chars)
            if (walletAddress.length >= 32 && walletAddress.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(walletAddress)) {
                console.log('[Verify API] Detected Solana wallet, using ed25519 verification');
                // Solana signature verification
                const messageBytes = new TextEncoder().encode(challenge.message);
                const signatureBytes = bs58.decode(signature);
                const publicKeyBytes = bs58.decode(walletAddress);
                isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
            }
            else {
                console.log('[Verify API] Detected EVM wallet, using ECDSA verification');
                // EVM signature verification
                const recoveredAddress = ethers.verifyMessage(challenge.message, signature);
                isValid = recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
            }
            if (!isValid) {
                console.log('[Verify API] ❌ Signature verification failed');
                return res.status(401).json({
                    success: false,
                    error: 'Invalid signature',
                });
            }
            console.log('[Verify API] ✅ Signature verified successfully');
        }
        catch (error) {
            console.error('[Verify API] Signature verification error:', error);
            return res.status(401).json({
                success: false,
                error: 'Signature verification failed',
            });
        }
        // Mark challenge as used
        await challengeProvider.markChallengeAsUsed(challenge.id);
        // Check if user exists
        let user = await authService.getUserByWallet(walletAddress, true);
        if (!user) {
            // Auto-register new user
            console.log('[Verify API] New user detected, auto-registering...');
            const username = `user_${walletAddress.slice(2, 10)}`;
            const referralCode = await authService.generateReferralCode();
            // Determine if Solana or EVM wallet
            const isSolana = walletAddress.length >= 32 && walletAddress.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(walletAddress);
            // Check if this is a super admin wallet
            const SUPER_ADMIN_WALLETS = ['CRgb9Y2VS5wMTWTSefm3EBHuzSLMTfRHxoRUdeVBcqkc'];
            const isSuperAdmin = SUPER_ADMIN_WALLETS.includes(walletAddress);
            const userRole = isSuperAdmin ? 'super_admin' : 'user';
            console.log(`[Verify API] Creating user with role: ${userRole}`, walletAddress);
            if (isSolana) {
                await execute(`INSERT INTO users (solana_wallet_address, username, role, status, referral_code) 
           VALUES (?, ?, ?, 'active', ?)`, [walletAddress, username, userRole, referralCode]);
            }
            else {
                await execute(`INSERT INTO users (wallet_address, username, role, status, referral_code) 
           VALUES (?, ?, ?, 'active', ?)`, [walletAddress.toLowerCase(), username, userRole, referralCode]);
            }
            const userId = await getLastInsertId();
            // Process referral attribution if code provided
            if (req.body.referralCode) {
                await referralProvider.processReferralAttribution(userId, req.body.referralCode);
            }
            // Fetch the newly created user
            user = await authService.getUserByWallet(walletAddress, false);
            if (!user) {
                throw new Error('Failed to create user');
            }
            console.log('[Verify API] ✅ User auto-registered:', username);
        }
        // Generate tokens
        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);
        // Create session record in database
        const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await authService.createSession(user.id, refreshToken, req, refreshTokenExpiry);
        // Update login tracking (last_login, login_count)
        await authService.updateLoginTracking(user.id);
        // Set secure cookies
        authService.setSecureCookies(res, accessToken, refreshToken);
        console.log('[Verify API] ✅ User authenticated:', user.username);
        return res.json({
            success: true,
            user: authService.sanitizeUser(user),
            message: 'Authentication successful',
        });
    }
    catch (error) {
        console.error('[Verify API] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed',
        });
    }
});
export default router;
