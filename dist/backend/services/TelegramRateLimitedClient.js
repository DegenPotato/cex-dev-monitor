/**
 * Rate-limited wrapper for Telegram client operations
 * Ensures all API calls go through the rate limiter
 */
import { telegramRateLimiter } from './TelegramRateLimiter.js';
import { apiProviderTracker } from './ApiProviderTracker.js';
export class TelegramRateLimitedClient {
    constructor(client, accountId) {
        this.client = client;
        this.accountId = accountId;
    }
    /**
     * Get entity with rate limiting
     * This is one of the most commonly rate-limited operations
     */
    async getEntity(peer) {
        // Determine the method name based on what we're resolving
        let methodName = 'GetEntity';
        // If it's a numeric user ID, it will likely trigger GetUsers
        if (typeof peer === 'string' && /^\d+$/.test(peer)) {
            methodName = 'GetUsers';
        }
        const startTime = Date.now();
        return telegramRateLimiter.executeCall(methodName, async () => {
            try {
                const result = await this.client.getEntity(peer);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', methodName, true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', methodName, false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Get full channel with rate limiting
     */
    async getFullChannel(chatId) {
        const startTime = Date.now();
        return telegramRateLimiter.executeCall('GetFullChannel', async () => {
            try {
                const result = await this.client.invoke(new (await import('telegram')).Api.channels.GetFullChannel({
                    channel: await this.client.getInputEntity(chatId)
                }));
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', 'GetFullChannel', true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', 'GetFullChannel', false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Forward messages with rate limiting
     */
    async forwardMessages(toPeer, options) {
        const startTime = Date.now();
        return telegramRateLimiter.executeCall('ForwardMessages', async () => {
            try {
                const result = await this.client.forwardMessages(toPeer, options);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', 'ForwardMessages', true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', 'ForwardMessages', false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Send message with rate limiting
     */
    async sendMessage(peer, options) {
        const startTime = Date.now();
        return telegramRateLimiter.executeCall('SendMessage', async () => {
            try {
                const result = await this.client.sendMessage(peer, options);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', 'SendMessage', true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', 'SendMessage', false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Get dialogs with rate limiting
     */
    async getDialogs(params) {
        const startTime = Date.now();
        return telegramRateLimiter.executeCall('GetDialogs', async () => {
            try {
                const result = await this.client.getDialogs(params);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', 'GetDialogs', true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', 'GetDialogs', false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Get messages/history with rate limiting
     */
    async getMessages(peer, options) {
        const startTime = Date.now();
        return telegramRateLimiter.executeCall('GetHistory', async () => {
            try {
                const result = await this.client.getMessages(peer, options);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', 'GetHistory', true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', 'GetHistory', false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Get participants with rate limiting
     */
    async getParticipants(channel, params) {
        const startTime = Date.now();
        return telegramRateLimiter.executeCall('GetParticipants', async () => {
            try {
                const result = await this.client.getParticipants(channel, params);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', 'GetParticipants', true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', 'GetParticipants', false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Get input entity (doesn't make API calls, just formatting)
     */
    async getInputEntity(peer) {
        return this.client.getInputEntity(peer);
    }
    /**
     * Invoke raw API method with rate limiting
     */
    async invoke(request) {
        const methodName = request.className || 'UnknownMethod';
        const startTime = Date.now();
        return telegramRateLimiter.executeCall(methodName, async () => {
            try {
                const result = await this.client.invoke(request);
                // Track successful call
                const duration = Date.now() - startTime;
                apiProviderTracker.trackCall('telegram', methodName, true, duration, 200, undefined);
                return result;
            }
            catch (error) {
                // Track failed call
                const duration = Date.now() - startTime;
                const statusCode = error.errorMessage === 'FLOOD' ? 429 : 500;
                apiProviderTracker.trackCall('telegram', methodName, false, duration, statusCode, error.message);
                throw error;
            }
        }, this.accountId);
    }
    /**
     * Get the underlying client for operations that don't need rate limiting
     */
    get rawClient() {
        return this.client;
    }
}
/**
 * Wrap a Telegram client with rate limiting
 */
export function wrapClientWithRateLimiter(client, accountId) {
    return new TelegramRateLimitedClient(client, accountId);
}
