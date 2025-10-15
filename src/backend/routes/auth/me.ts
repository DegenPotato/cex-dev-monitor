import express from 'express';
import SecureAuthService from '../../../lib/auth/SecureAuthService.js';

const router = express.Router();
const authService = new SecureAuthService();

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/', authService.requireSecureAuth(), async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    // Get fresh user data
    const user = await authService.getUserByWallet(req.user.walletAddress);

    if (!user) {
      authService.clearSecureCookies(res);
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    return res.json({
      success: true,
      user: authService.sanitizeUser(user),
    });
  } catch (error: any) {
    console.error('[Me API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user data',
    });
  }
});

export default router;
