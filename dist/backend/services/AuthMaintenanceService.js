import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import YouTubeOAuthService from '../../lib/auth/YouTubeOAuthService.js';
/**
 * Maintenance service for authentication system
 * Runs periodic cleanup tasks
 */
class AuthMaintenanceService {
    constructor() {
        this.cleanupInterval = null;
        this.authService = new SecureAuthService();
        this.youtubeService = new YouTubeOAuthService();
    }
    /**
     * Start periodic maintenance tasks
     */
    start(intervalMinutes = 30) {
        if (this.cleanupInterval) {
            console.log('⚠️ Auth maintenance already running');
            return;
        }
        console.log(`🔧 Starting auth maintenance service (every ${intervalMinutes} minutes)`);
        // Run immediately
        this.runCleanup();
        // Then run periodically
        this.cleanupInterval = setInterval(() => this.runCleanup(), intervalMinutes * 60 * 1000);
    }
    /**
     * Stop maintenance service
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🛑 Auth maintenance service stopped');
        }
    }
    /**
     * Run all cleanup tasks
     */
    async runCleanup() {
        try {
            console.log('🧹 Starting auth system cleanup...');
            // Clean expired sessions and challenges
            await this.authService.cleanupExpiredRecords();
            // Clean expired YouTube tokens
            await this.youtubeService.cleanupExpiredTokens();
            console.log('✅ Auth system cleanup complete');
        }
        catch (error) {
            console.error('❌ Auth cleanup error:', error.message);
        }
    }
    /**
     * Force run cleanup (for manual trigger)
     */
    async forceCleanup() {
        await this.runCleanup();
    }
}
export default AuthMaintenanceService;
