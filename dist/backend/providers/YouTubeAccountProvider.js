/**
 * YouTube Account Provider
 * Handles CRUD operations for YouTube OAuth persistence
 */
import { execute, queryOne, queryAll } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';
export class YouTubeAccountProvider {
    /**
     * Save or update YouTube account data
     */
    static async saveAccount(account) {
        await execute(`
      INSERT INTO user_youtube_accounts (
        user_id, google_user_id, email, access_token, refresh_token,
        token_type, expires_at, scope, is_primary, is_active, last_used_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, google_user_id) 
      DO UPDATE SET
        email = excluded.email,
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, refresh_token),
        token_type = excluded.token_type,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        is_active = excluded.is_active,
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [
            account.user_id,
            account.google_user_id,
            account.email,
            account.access_token,
            account.refresh_token || null,
            account.token_type || 'Bearer',
            account.expires_at,
            account.scope || null,
            account.is_primary !== undefined ? account.is_primary : 1,
            account.is_active !== undefined ? account.is_active : 1
        ]);
        saveDatabase();
        // Get the saved account
        const result = await queryOne(`
      SELECT * FROM user_youtube_accounts 
      WHERE user_id = ? AND google_user_id = ?
    `, [account.user_id, account.google_user_id]);
        return result;
    }
    /**
     * Get YouTube account for a user
     */
    static async getAccountByUserId(userId) {
        const result = await queryOne(`
      SELECT * FROM user_youtube_accounts 
      WHERE user_id = ? AND is_active = 1
      ORDER BY is_primary DESC, last_used_at DESC
      LIMIT 1
    `, [userId]);
        return result || null;
    }
    /**
     * Get account by Google user ID
     */
    static async getAccountByGoogleId(googleUserId) {
        const result = await queryOne(`
      SELECT * FROM user_youtube_accounts 
      WHERE google_user_id = ? AND is_active = 1
      LIMIT 1
    `, [googleUserId]);
        return result || null;
    }
    /**
     * Update access token and expiry
     */
    static async updateToken(accountId, accessToken, expiresAt) {
        await execute(`
      UPDATE user_youtube_accounts 
      SET access_token = ?, expires_at = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [accessToken, expiresAt, accountId]);
        saveDatabase();
    }
    /**
     * Check if token is expired
     */
    static isTokenExpired(account) {
        const expiresAt = new Date(account.expires_at);
        const now = new Date();
        // Consider expired if less than 5 minutes remaining
        return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
    }
    /**
     * Revoke account (soft delete)
     */
    static async revokeAccount(accountId) {
        await execute(`
      UPDATE user_youtube_accounts 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [accountId]);
        saveDatabase();
    }
    /**
     * Delete account permanently
     */
    static async deleteAccount(accountId) {
        await execute('DELETE FROM user_youtube_accounts WHERE id = ?', [accountId]);
        saveDatabase();
    }
    /**
     * Save playlist cache
     */
    static async savePlaylist(playlist) {
        await execute(`
      INSERT INTO user_youtube_playlists (
        youtube_account_id, playlist_id, title, thumbnail, item_count, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(youtube_account_id, playlist_id)
      DO UPDATE SET
        title = excluded.title,
        thumbnail = excluded.thumbnail,
        item_count = excluded.item_count,
        last_synced_at = CURRENT_TIMESTAMP
    `, [
            playlist.youtube_account_id,
            playlist.playlist_id,
            playlist.title,
            playlist.thumbnail || null,
            playlist.item_count || 0
        ]);
        saveDatabase();
    }
    /**
     * Get cached playlists
     */
    static async getPlaylists(youtubeAccountId) {
        return await queryAll(`
      SELECT * FROM user_youtube_playlists 
      WHERE youtube_account_id = ?
      ORDER BY last_synced_at DESC
    `, [youtubeAccountId]);
    }
    /**
     * Clear playlist cache
     */
    static async clearPlaylists(youtubeAccountId) {
        await execute('DELETE FROM user_youtube_playlists WHERE youtube_account_id = ?', [youtubeAccountId]);
        saveDatabase();
    }
}
