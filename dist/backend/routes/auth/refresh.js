import express from 'express';
import SecureAuthService from '../../../lib/auth/SecureAuthService.js';
const router = express.Router();
const authService = new SecureAuthService();
/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/', async (req, res) => {
    try {
        const { refreshToken } = authService.extractTokensFromCookies(req);
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'No refresh token provided',
            });
        }
        // Verify refresh token
        const decoded = await authService.verifyRefreshToken(refreshToken);
        if (!decoded || !decoded.wallet) {
            authService.clearSecureCookies(res);
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired refresh token',
            });
        }
        // Get user data
        const user = await authService.getUserByWallet(decoded.wallet);
        if (!user) {
            authService.clearSecureCookies(res);
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }
        // Generate new tokens
        const newAccessToken = authService.generateAccessToken(user);
        const newRefreshToken = authService.generateRefreshToken(user);
        // Set new cookies
        authService.setSecureCookies(res, newAccessToken, newRefreshToken);
        console.log('[Refresh API] Tokens refreshed for user:', user.username);
        return res.json({
            success: true,
            user: authService.sanitizeUser(user),
            message: 'Tokens refreshed successfully',
        });
    }
    catch (error) {
        console.error('[Refresh API] Error:', error);
        authService.clearSecureCookies(res);
        return res.status(500).json({
            success: false,
            error: 'Token refresh failed',
        });
    }
});
export default router;
