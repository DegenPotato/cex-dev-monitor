import { queryOne, execute, getLastInsertId } from '../database/helpers.js';
/**
 * AuthChallenge Provider for managing authentication nonces and challenges
 * Used for wallet signature verification flow
 */
export class AuthChallengeProvider {
    /**
     * Initialize auth_challenges table
     */
    async initialize() {
        try {
            // Create table if it doesn't exist
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS auth_challenges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    wallet_address TEXT NOT NULL UNIQUE,
                    nonce TEXT NOT NULL,
                    message TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            `;
            await execute(createTableQuery);
            // Create indexes for faster lookups
            await execute(`CREATE INDEX IF NOT EXISTS idx_auth_challenges_wallet ON auth_challenges(wallet_address)`);
            await execute(`CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at)`);
            console.log('[AuthChallengeProvider] ✅ Table and indexes initialized');
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Initialization error:', error);
            // Don't fail if table already exists
            if (error.message?.includes('already exists')) {
                console.log('[AuthChallengeProvider] Table already exists');
            }
        }
    }
    /**
     * Store a new challenge, replacing any existing one for the wallet
     */
    async storeChallenge(walletAddress, nonce, message, expiresAt) {
        try {
            // SQLite: Delete then insert (REPLACE doesn't return id reliably)
            await this.deleteByWallet(walletAddress);
            await execute(`INSERT INTO auth_challenges (wallet_address, nonce, message, expires_at) VALUES (?, ?, ?, ?)`, [walletAddress, nonce, message, expiresAt.toISOString()]);
            const id = await getLastInsertId();
            console.log(`[AuthChallengeProvider] ✅ Challenge stored for: ${walletAddress}`);
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
            const now = new Date().toISOString();
            const result = await queryOne(`SELECT * FROM auth_challenges WHERE wallet_address = ? AND expires_at > ? LIMIT 1`, [walletAddress, now]);
            if (!result) {
                console.log(`[AuthChallengeProvider] ⚠️ No valid challenge found for: ${walletAddress}`);
                return null;
            }
            return result;
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error getting challenge:', error);
            return null;
        }
    }
    /**
     * Delete challenge by wallet address
     */
    async deleteByWallet(walletAddress) {
        try {
            await execute(`DELETE FROM auth_challenges WHERE wallet_address = ?`, [walletAddress]);
            console.log(`[AuthChallengeProvider] ✅ Challenge deleted for: ${walletAddress}`);
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
            await execute(`DELETE FROM auth_challenges WHERE expires_at < ?`, [now]);
            console.log(`[AuthChallengeProvider] 🧹 Cleaned up expired challenges`);
        }
        catch (error) {
            console.error('[AuthChallengeProvider] Error cleaning up expired challenges:', error);
        }
    }
}
