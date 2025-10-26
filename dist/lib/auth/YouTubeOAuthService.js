import { queryOne, execute } from '../../backend/database/helpers.js';
/**
 * Service for managing YouTube/Google OAuth integration
 * Links Google accounts to users and manages tokens
 */
class YouTubeOAuthService {
    /**
     * Link Google account to user
     */
    async linkGoogleAccount(userId, googleUserInfo, tokenData) {
        try {
            // Calculate token expiration
            const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
            // Check if this Google account is already linked to this user
            const existing = await queryOne(`SELECT * FROM user_youtube_accounts 
         WHERE user_id = ? AND google_user_id = ?`, [userId, googleUserInfo.id]);
            if (existing) {
                // Update existing account
                await execute(`UPDATE user_youtube_accounts 
           SET access_token = ?,
               refresh_token = COALESCE(?, refresh_token),
               expires_at = ?,
               scope = ?,
               is_active = 1,
               last_used_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`, [
                    tokenData.access_token,
                    tokenData.refresh_token,
                    expiresAt.toISOString(),
                    tokenData.scope,
                    existing.id
                ]);
                console.log('[YouTube OAuth] ✅ Updated existing Google account link for user:', userId);
            }
            else {
                // Create new account link
                await execute(`INSERT INTO user_youtube_accounts 
           (user_id, google_user_id, email, access_token, refresh_token, expires_at, scope, token_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    userId,
                    googleUserInfo.id,
                    googleUserInfo.email,
                    tokenData.access_token,
                    tokenData.refresh_token || null,
                    expiresAt.toISOString(),
                    tokenData.scope,
                    tokenData.token_type
                ]);
                console.log('[YouTube OAuth] ✅ Linked new Google account for user:', userId);
            }
            // Update user's google_account_linked flag
            await execute(`UPDATE users 
         SET google_account_linked = 1
         WHERE id = ?`, [userId]);
            console.log('[YouTube OAuth] ✅ User', userId, 'now has Google account linked');
        }
        catch (error) {
            console.error('[YouTube OAuth] ❌ Failed to link Google account:', error.message);
            throw error;
        }
    }
    /**
     * Get user's active YouTube account
     */
    async getActiveYouTubeAccount(userId) {
        try {
            const account = await queryOne(`SELECT * FROM user_youtube_accounts 
         WHERE user_id = ? AND is_active = 1 
         ORDER BY last_used_at DESC 
         LIMIT 1`, [userId]);
            if (account) {
                console.log('[YouTube OAuth] ✅ Found active YouTube account for user:', userId);
                return account;
            }
            return null;
        }
        catch (error) {
            console.error('[YouTube OAuth] ❌ Error fetching YouTube account:', error.message);
            return null;
        }
    }
    /**
     * Check if user's token is expired
     */
    isTokenExpired(account) {
        const expiresAt = new Date(account.expires_at);
        const now = new Date();
        const bufferMinutes = 5; // Refresh 5 minutes before expiry
        return expiresAt.getTime() - bufferMinutes * 60 * 1000 < now.getTime();
    }
    /**
     * Update access token
     */
    async updateAccessToken(accountId, accessToken, expiresIn) {
        try {
            const expiresAt = new Date(Date.now() + expiresIn * 1000);
            await execute(`UPDATE user_youtube_accounts 
         SET access_token = ?,
             expires_at = ?,
             last_used_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [accessToken, expiresAt.toISOString(), accountId]);
            console.log('[YouTube OAuth] ✅ Updated access token for account:', accountId);
        }
        catch (error) {
            console.error('[YouTube OAuth] ❌ Failed to update access token:', error.message);
            throw error;
        }
    }
    /**
     * Unlink Google account from user
     */
    async unlinkGoogleAccount(userId, googleUserId) {
        try {
            await execute(`UPDATE user_youtube_accounts 
         SET is_active = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND google_user_id = ?`, [userId, googleUserId]);
            // Check if user has any other active accounts
            const hasOtherAccounts = await queryOne(`SELECT COUNT(*) as count FROM user_youtube_accounts 
         WHERE user_id = ? AND is_active = 1`, [userId]);
            if (!hasOtherAccounts || hasOtherAccounts.count === 0) {
                // No more active accounts, update user flag
                await execute(`UPDATE users 
           SET google_account_linked = 0
           WHERE id = ?`, [userId]);
            }
            console.log('[YouTube OAuth] ✅ Unlinked Google account for user:', userId);
        }
        catch (error) {
            console.error('[YouTube OAuth] ❌ Failed to unlink Google account:', error.message);
            throw error;
        }
    }
    /**
     * Get all YouTube accounts for user
     */
    async getAllYouTubeAccounts(userId) {
        try {
            const db = await import('../../backend/database/helpers.js');
            const result = await db.queryAll(`SELECT * FROM user_youtube_accounts 
         WHERE user_id = ? 
         ORDER BY is_active DESC, last_used_at DESC`, [userId]);
            return result || [];
        }
        catch (error) {
            console.error('[YouTube OAuth] ❌ Error fetching all YouTube accounts:', error.message);
            return [];
        }
    }
    /**
     * Clean up expired tokens
     */
    async cleanupExpiredTokens() {
        try {
            await execute(`UPDATE user_youtube_accounts 
         SET is_active = 0 
         WHERE expires_at < datetime('now') AND refresh_token IS NULL`);
            console.log('[YouTube OAuth] 🧹 Cleanup: Deactivated accounts with expired tokens');
        }
        catch (error) {
            console.error('[YouTube OAuth] ⚠️ Cleanup failed:', error.message);
        }
    }
}
export default YouTubeOAuthService;
