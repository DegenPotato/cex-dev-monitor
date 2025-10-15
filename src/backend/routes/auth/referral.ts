import express from 'express';
import SecureAuthService from '../../../lib/auth/SecureAuthService.js';
import ReferralTrackingProvider from '../../../lib/auth/ReferralTrackingProvider.js';

const router = express.Router();
const authService = new SecureAuthService();
const referralProvider = new ReferralTrackingProvider();

/**
 * GET /api/auth/referral/stats
 * Get referral statistics for authenticated user
 */
router.get('/stats', authService.requireSecureAuth(), async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const stats = await referralProvider.getReferralStats(req.user.id);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    return res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('[Referral API] Error getting stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get referral statistics',
    });
  }
});

/**
 * POST /api/auth/referral/validate
 * Validate a referral code
 */
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Referral code is required',
      });
    }

    const result = await referralProvider.validateReferralCode(code);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[Referral API] Error validating code:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate referral code',
    });
  }
});

/**
 * GET /api/auth/referral/chain
 * Get referral chain for authenticated user
 */
router.get('/chain', authService.requireSecureAuth(), async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const chain = await referralProvider.getReferralChain(req.user.id);

    return res.json({
      success: true,
      chain,
      levels: chain.length,
    });
  } catch (error: any) {
    console.error('[Referral API] Error getting chain:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get referral chain',
    });
  }
});

export default router;
