/**
 * YouTube Authentication Service
 * API endpoints for YouTube OAuth persistence
 */

import express, { Request, Response } from 'express';
import { YouTubeAccountProvider } from '../providers/YouTubeAccountProvider';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

/**
 * Save or update YouTube account
 * POST /api/youtube/account/save
 */
router.post('/account/save', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      google_user_id,
      email,
      access_token,
      refresh_token,
      expires_in, // seconds
      scope,
    } = req.body;

    if (!google_user_id || !email || !access_token || !expires_in) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: google_user_id, email, access_token, expires_in',
      });
    }

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const account = YouTubeAccountProvider.saveAccount({
      user_id: userId,
      google_user_id,
      email,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      scope,
      is_active: true,
      is_primary: true,
    });

    console.log(`✅ YouTube account saved for user ${userId}: ${email}`);

    res.json({
      success: true,
      message: 'YouTube account linked successfully',
      account: {
        id: account.id,
        email: account.email,
        expires_at: account.expires_at,
      },
    });
  } catch (error) {
    console.error('❌ Error saving YouTube account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save YouTube account',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get YouTube account for current user
 * GET /api/youtube/account
 */
router.get('/account', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const account = YouTubeAccountProvider.getAccountByUserId(userId);

    if (!account) {
      return res.json({
        success: true,
        account: null,
        message: 'No YouTube account linked',
      });
    }

    // Check if token is expired
    const isExpired = YouTubeAccountProvider.isTokenExpired(account);

    res.json({
      success: true,
      account: {
        id: account.id,
        email: account.email,
        google_user_id: account.google_user_id,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        scope: account.scope,
        is_expired: isExpired,
        last_used_at: account.last_used_at,
      },
    });
  } catch (error) {
    console.error('❌ Error retrieving YouTube account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve YouTube account',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Update access token (for token refresh)
 * POST /api/youtube/account/refresh
 */
router.post('/account/refresh', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { access_token, expires_in } = req.body;

    if (!access_token || !expires_in) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: access_token, expires_in',
      });
    }

    const account = YouTubeAccountProvider.getAccountByUserId(userId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'No YouTube account found',
      });
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    YouTubeAccountProvider.updateToken(account.id!, access_token, expiresAt);

    console.log(`✅ Token refreshed for user ${userId}`);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('❌ Error refreshing token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Revoke YouTube account (sign out)
 * POST /api/youtube/account/revoke
 */
router.post('/account/revoke', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const account = YouTubeAccountProvider.getAccountByUserId(userId);

    if (!account) {
      return res.json({
        success: true,
        message: 'No account to revoke',
      });
    }

    YouTubeAccountProvider.revokeAccount(account.id!);

    console.log(`✅ YouTube account revoked for user ${userId}`);

    res.json({
      success: true,
      message: 'YouTube account disconnected successfully',
    });
  } catch (error) {
    console.error('❌ Error revoking YouTube account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke YouTube account',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Save playlist cache
 * POST /api/youtube/playlists/cache
 */
router.post('/playlists/cache', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { playlists } = req.body;

    if (!Array.isArray(playlists)) {
      return res.status(400).json({
        success: false,
        error: 'playlists must be an array',
      });
    }

    const account = YouTubeAccountProvider.getAccountByUserId(userId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'No YouTube account found',
      });
    }

    // Clear old cache
    YouTubeAccountProvider.clearPlaylists(account.id!);

    // Save new playlists
    for (const playlist of playlists) {
      YouTubeAccountProvider.savePlaylist({
        youtube_account_id: account.id!,
        playlist_id: playlist.id,
        title: playlist.title,
        thumbnail: playlist.thumbnail,
        item_count: playlist.itemCount,
      });
    }

    res.json({
      success: true,
      message: `Cached ${playlists.length} playlists`,
    });
  } catch (error) {
    console.error('❌ Error caching playlists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cache playlists',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get cached playlists
 * GET /api/youtube/playlists/cache
 */
router.get('/playlists/cache', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const account = YouTubeAccountProvider.getAccountByUserId(userId);

    if (!account) {
      return res.json({
        success: true,
        playlists: [],
      });
    }

    const playlists = YouTubeAccountProvider.getPlaylists(account.id!);

    res.json({
      success: true,
      playlists: playlists.map(p => ({
        id: p.playlist_id,
        title: p.title,
        thumbnail: p.thumbnail,
        itemCount: p.item_count,
        lastSynced: p.last_synced_at,
      })),
    });
  } catch (error) {
    console.error('❌ Error retrieving cached playlists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cached playlists',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
