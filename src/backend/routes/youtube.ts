/**
 * YouTube Integration API Routes
 * Handles YouTube preferences, playlists, and history for authenticated users
 * Note: Uses sql.js (not better-sqlite3) - requires different query syntax
 */

import express, { Request, Response } from 'express';
import { getDatabase, saveDatabase } from '../database/connection.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const router = express.Router();
const authService = new SecureAuthService();

// Helper to execute UPDATE/INSERT/DELETE queries with sql.js
function runQuery(query: string) {
  const db = getDatabase();
  db.run(query);
  saveDatabase();
}

// Helper to execute SELECT queries with sql.js
function execQuery(query: string) {
  const db = getDatabase();
  return db.exec(query);
}

// Get user's YouTube preferences
router.get('/preferences', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const db = getDatabase();
    
    const result = db.exec(`
      SELECT youtube_enabled, youtube_email, youtube_preferences 
      FROM users 
      WHERE id = ${userId}
    `);

    const user = result.length > 0 && result[0].values.length > 0 
      ? {
          youtube_enabled: result[0].values[0][0],
          youtube_email: result[0].values[0][1],
          youtube_preferences: result[0].values[0][2]
        }
      : null;

    const preferences = user?.youtube_preferences 
      ? JSON.parse(user.youtube_preferences as string) 
      : { volume: 75, shuffle: false, repeat: 'off' };

    res.json({
      enabled: user?.youtube_enabled === 1,
      email: user?.youtube_email || null,
      preferences
    });
  } catch (error) {
    console.error('Error fetching YouTube preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update YouTube preferences
router.post('/preferences', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { enabled, email, preferences } = req.body;

    const prefJson = JSON.stringify(preferences).replace(/'/g, "''");
    const emailEsc = email ? `'${email.replace(/'/g, "''")}''` : 'NULL';
    
    runQuery(`
      UPDATE users 
      SET youtube_enabled = ${enabled ? 1 : 0},
          youtube_email = ${emailEsc},
          youtube_preferences = '${prefJson}',
          last_youtube_sync = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
    `);

    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    console.error('Error updating YouTube preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get user's YouTube playlists
router.get('/playlists', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const result = execQuery(`
      SELECT id, playlist_name, playlist_data, is_favorite, play_count, last_played, created_at
      FROM youtube_playlists
      WHERE user_id = ${userId}
      ORDER BY is_favorite DESC, last_played DESC, created_at DESC
    `);

    const playlists = result.length > 0 ? result[0].values : [];
    const formatted = playlists.map((row: any) => ({
      id: row[0],
      name: row[1],
      videos: JSON.parse(row[2]),
      isFavorite: row[3] === 1,
      playCount: row[4],
      lastPlayed: row[5],
      createdAt: row[6]
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.json([]);
  }
});

// Save/Update playlist
router.post('/playlists', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id, name, videos, isFavorite } = req.body;

    const nameEsc = name.replace(/'/g, "''");
    const videosJson = JSON.stringify(videos).replace(/'/g, "''");

    if (id) {
      // Update existing playlist
      runQuery(`
        UPDATE youtube_playlists
        SET playlist_name = '${nameEsc}',
            playlist_data = '${videosJson}',
            is_favorite = ${isFavorite ? 1 : 0},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND user_id = ${userId}
      `);
      res.json({ success: true, message: 'Playlist updated' });
    } else {
      // Create new playlist
      runQuery(`
        INSERT INTO youtube_playlists (user_id, playlist_name, playlist_data, is_favorite)
        VALUES (${userId}, '${nameEsc}', '${videosJson}', ${isFavorite ? 1 : 0})
      `);
      res.json({ success: true, message: 'Playlist created' });
    }
  } catch (error) {
    console.error('Error saving playlist:', error);
    res.status(500).json({ error: 'Failed to save playlist' });
  }
});

// Delete playlist
router.delete('/playlists/:id', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const playlistId = parseInt(req.params.id);

    runQuery(`
      DELETE FROM youtube_playlists
      WHERE id = ${playlistId} AND user_id = ${userId}
    `);

    res.json({ success: true, message: 'Playlist deleted' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Update play count
router.post('/playlists/:id/play', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const playlistId = parseInt(req.params.id);

    runQuery(`
      UPDATE youtube_playlists
      SET play_count = play_count + 1,
          last_played = CURRENT_TIMESTAMP
      WHERE id = ${playlistId} AND user_id = ${userId}
    `);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating play count:', error);
    res.status(500).json({ error: 'Failed to update play count' });
  }
});

// Add to playback history
router.post('/history', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { videoId, title, thumbnail, channelTitle, duration } = req.body;

    const titleEsc = title.replace(/'/g, "''");
    const thumbEsc = thumbnail.replace(/'/g, "''");
    const chanEsc = channelTitle.replace(/'/g, "''");

    runQuery(`
      INSERT INTO youtube_history (user_id, video_id, video_title, video_thumbnail, channel_title, duration)
      VALUES (${userId}, '${videoId}', '${titleEsc}', '${thumbEsc}', '${chanEsc}', ${duration})
    `);

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding to history:', error);
    res.status(500).json({ error: 'Failed to add to history' });
  }
});

// Get playback history
router.get('/history', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = execQuery(`
      SELECT video_id, video_title, video_thumbnail, channel_title, played_at, duration
      FROM youtube_history
      WHERE user_id = ${userId}
      ORDER BY played_at DESC
      LIMIT ${limit}
    `);

    const history = result.length > 0 ? result[0].values.map((row: any) => ({
      videoId: row[0],
      title: row[1],
      thumbnail: row[2],
      channelTitle: row[3],
      playedAt: row[4],
      duration: row[5]
    })) : [];

    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.json([]);
  }
});

export default router;
