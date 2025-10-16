import express from 'express';
import crypto from 'crypto';
import AuthChallengeProvider from '../../../lib/auth/AuthChallengeProvider.js';

const router = express.Router();
let challengeProvider: AuthChallengeProvider | null = null;

async function getChallengeProvider() {
  if (!challengeProvider) {
    challengeProvider = new AuthChallengeProvider();
    try {
      await challengeProvider.initialize();
    } catch (error: any) {
      console.warn('[Challenge API] Provider initialization failed:', error.message);
    }
  }
  return challengeProvider;
}

/**
 * POST /api/auth/challenge
 * Generate a nonce-based challenge for wallet signature
 */
router.post('/', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    console.log('[Challenge API] Challenge requested for wallet:', walletAddress);

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      });
    }

    // Initialize provider
    const provider = await getChallengeProvider();

    // Generate challenge components
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const message = `Welcome to Sniff Agency!\n\nPlease sign this message to authenticate your wallet.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    // Store in database with 5 minute expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await provider.storeChallenge(walletAddress, nonce, message, expiresAt);

    console.log('[Challenge API] Challenge stored for:', walletAddress);

    return res.json({
      success: true,
      challenge: {
        message,
        nonce,
      },
    });
  } catch (error: any) {
    console.error('[Challenge API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate challenge',
    });
  }
});

export default router;
