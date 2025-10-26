import { queryOne, queryAll, execute, getLastInsertId } from '../../backend/database/helpers.js';
/**
 * Provider for managing authentication challenges (nonce-based signature verification)
 */
class AuthChallengeProvider {
    /**
     * Initialize the auth_challenges table
     */
    async initialize() {
        try {
            // Table is created by migration, just verify it exists
            const tableExists = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_challenges'");
            if (tableExists) {
                console.log('[AuthChallengeProvider] Table exists, ready to use');
            }
            else {
                console.warn('[AuthChallengeProvider] Table does not exist, run migrations first');
            }
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Initialization error:', error);
        }
    }
    /**
     * Store a new challenge, replacing any existing one for the wallet
     */
    async storeChallenge(walletAddress, nonce, message, expiresAt) {
        try {
            const cleanAddress = walletAddress.toLowerCase();
            // Delete any existing challenges for this wallet
            await this.deleteByWallet(cleanAddress);
            // Insert new challenge
            await execute(`INSERT INTO auth_challenges (wallet_address, nonce, message, expires_at, used) 
         VALUES (?, ?, ?, ?, 0)`, [cleanAddress, nonce, message, expiresAt.toISOString()]);
            const id = await getLastInsertId();
            console.log('[AuthChallengeProvider] Challenge stored for:', cleanAddress, 'ID:', id);
            return id;
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error storing challenge:', error);
            throw error;
        }
    }
    /**
     * Get challenge by wallet address
     */
    async getChallengeByWallet(walletAddress) {
        try {
            const cleanAddress = walletAddress.toLowerCase();
            const now = new Date().toISOString();
            // Get non-expired, unused challenge
            const challenge = await queryOne(`SELECT * FROM auth_challenges 
         WHERE wallet_address = ? 
         AND expires_at > ?
         AND used = 0
         ORDER BY created_at DESC
         LIMIT 1`, [cleanAddress, now]);
            if (!challenge) {
                console.log('[AuthChallengeProvider] No valid challenge found for:', cleanAddress);
                return null;
            }
            return challenge;
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error getting challenge:', error);
            return null;
        }
    }
    /**
     * Mark challenge as used
     */
    async markChallengeAsUsed(challengeId) {
        try {
            await execute('UPDATE auth_challenges SET used = 1 WHERE id = ?', [challengeId]);
            console.log('[AuthChallengeProvider] Challenge marked as used:', challengeId);
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error marking challenge as used:', error);
        }
    }
    /**
     * Delete challenge by wallet address
     */
    async deleteByWallet(walletAddress) {
        try {
            const cleanAddress = walletAddress.toLowerCase();
            await execute('DELETE FROM auth_challenges WHERE wallet_address = ?', [cleanAddress]);
            console.log('[AuthChallengeProvider] Challenges deleted for:', cleanAddress);
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error deleting challenge:', error);
        }
    }
    /**
     * Clean up expired challenges
     */
    async cleanupExpired() {
        try {
            const now = new Date().toISOString();
            // First, get count of expired challenges
            const countResult = await queryOne('SELECT COUNT(*) as count FROM auth_challenges WHERE expires_at < ?', [now]);
            const count = countResult?.count || 0;
            if (count > 0) {
                await execute('DELETE FROM auth_challenges WHERE expires_at < ?', [now]);
                console.log('[AuthChallengeProvider] Cleaned up expired challenges:', count);
            }
            return count;
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error cleaning up expired challenges:', error);
            return 0;
        }
    }
    /**
     * Get all active challenges (for debugging)
     */
    async getAllActiveChallenges() {
        try {
            const now = new Date().toISOString();
            const challenges = await queryAll('SELECT * FROM auth_challenges WHERE expires_at > ? AND used = 0', [now]);
            return challenges;
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error getting active challenges:', error);
            return [];
        }
    }
}
export default AuthChallengeProvider;
