import express from 'express';
import SecureAuthService from '../../../lib/auth/SecureAuthService.js';

const router = express.Router();
const authService = new SecureAuthService();

/**
 * POST /api/auth/logout
 * Clear authentication cookies and logout user
 */
router.post('/', async (_req, res) => {
  try {
    authService.clearSecureCookies(res);

    console.log('[Logout API] User logged out successfully');

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('[Logout API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Logout failed',
    });
  }
});

export default router;
