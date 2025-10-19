import express from 'express';
import crypto from 'crypto';
import SecureAuthService from '../../../lib/auth/SecureAuthService.js';

const router = express.Router();
const authService = new SecureAuthService();

/**
 * POST /api/auth/logout
 * Clear authentication cookies and revoke session
 */
router.post('/', async (req, res) => {
  try {
    // Get refresh token from cookies
    const refreshToken = req.cookies?.refresh_token;
    
    // Revoke session if refresh token exists
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await authService.revokeSession(tokenHash);
      console.log('[Logout API] Session revoked');
    }

    // Clear cookies
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
