import express from 'express';
import { ethers } from 'ethers';
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

    // Verify the signature
    try {
      const recoveredAddress = ethers.verifyMessage(challenge.message, signature);

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('[Verify API] Signature verification failed');
        return res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
      }

      console.log('[Verify API] ✅ Signature verified successfully');
    } catch (error: any) {
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

      await execute(
        `INSERT INTO users (wallet_address, username, role, status, referral_code) 
         VALUES (?, ?, 'user', 'active', ?)`,
        [walletAddress.toLowerCase(), username, referralCode]
      );

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

    // Set secure cookies
    authService.setSecureCookies(res, accessToken, refreshToken);

    console.log('[Verify API] ✅ User authenticated:', user.username);

    return res.json({
      success: true,
      user: authService.sanitizeUser(user),
      message: 'Authentication successful',
    });
  } catch (error: any) {
    console.error('[Verify API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
});

export default router;
