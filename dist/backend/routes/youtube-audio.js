import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
const router = express.Router();
const execAsync = promisify(exec);
/**
 * Stream YouTube audio through backend proxy
 * This bypasses CORS restrictions and allows Web Audio API processing
 */
router.get('/stream/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid YouTube video ID' });
    }
    try {
        console.log(`[YouTube Audio] Streaming audio for video: ${videoId}`);
        // Get the best audio stream URL using yt-dlp
        const { stdout } = await execAsync(`yt-dlp -f "bestaudio[ext=m4a]/bestaudio" --get-url "https://www.youtube.com/watch?v=${videoId}"`, { timeout: 10000 });
        const audioUrl = stdout.trim();
        if (!audioUrl) {
            return res.status(404).json({ error: 'Audio stream not found' });
        }
        // Redirect to the direct audio stream URL
        // YouTube's audio URLs are time-limited but valid for several hours
        res.redirect(audioUrl);
    }
    catch (error) {
        console.error('[YouTube Audio] Stream error:', error);
        res.status(500).json({
            error: 'Failed to stream audio',
            details: error.message
        });
    }
});
/**
 * Get audio stream URL without redirecting (for frontend to fetch)
 */
router.get('/url/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'Invalid YouTube video ID' });
    }
    try {
        console.log(`[YouTube Audio] Getting audio URL for video: ${videoId}`);
        // Get the best audio stream URL using yt-dlp
        const { stdout } = await execAsync(`yt-dlp -f "bestaudio[ext=m4a]/bestaudio" --get-url "https://www.youtube.com/watch?v=${videoId}"`, { timeout: 10000 });
        const audioUrl = stdout.trim();
        if (!audioUrl) {
            return res.status(404).json({ error: 'Audio stream not found' });
        }
        // Return the URL for the frontend to use
        res.json({
            success: true,
            videoId,
            audioUrl,
            expiresIn: 21600 // YouTube URLs typically valid for 6 hours
        });
    }
    catch (error) {
        console.error('[YouTube Audio] URL fetch error:', error);
        res.status(500).json({
            error: 'Failed to get audio URL',
            details: error.message
        });
    }
});
export default router;
