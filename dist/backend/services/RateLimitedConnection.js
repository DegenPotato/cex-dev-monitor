import { Connection } from '@solana/web3.js';
import { globalRateLimiter } from './RateLimiter.js';
/**
 * Rate-Limited Solana Connection Wrapper
 * Wraps all RPC method calls with rate limiting
 */
export class RateLimitedConnection extends Connection {
    constructor(endpoint, config) {
        super(endpoint, config);
        this._rateLimitEnabled = false;
    }
    /**
     * Enable rate limiting for this connection
     */
    enableRateLimiting() {
        this._rateLimitEnabled = true;
    }
    /**
     * Disable rate limiting for this connection
     */
    disableRateLimiting() {
        this._rateLimitEnabled = false;
    }
    /**
     * Override getSignaturesForAddress with rate limiting
     */
    async getSignaturesForAddress(address, options, commitment) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getSignaturesForAddress(address, options, commitment), 'getSignaturesForAddress');
        }
        return await super.getSignaturesForAddress(address, options, commitment);
    }
    /**
     * Override getTransaction with rate limiting
     */
    async getTransaction(signature, options) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getTransaction(signature, options), 'getTransaction');
        }
        return await super.getTransaction(signature, options);
    }
    /**
     * Override getParsedTransaction with rate limiting
     */
    async getParsedTransaction(signature, commitmentOrConfig) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getParsedTransaction(signature, commitmentOrConfig), 'getParsedTransaction');
        }
        return await super.getParsedTransaction(signature, commitmentOrConfig);
    }
    /**
     * Override getBalance with rate limiting
     */
    async getBalance(publicKey, commitmentOrConfig) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getBalance(publicKey, commitmentOrConfig), 'getBalance');
        }
        return await super.getBalance(publicKey, commitmentOrConfig);
    }
    /**
     * Override getAccountInfo with rate limiting
     */
    async getAccountInfo(publicKey, commitmentOrConfig) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getAccountInfo(publicKey, commitmentOrConfig), 'getAccountInfo');
        }
        return await super.getAccountInfo(publicKey, commitmentOrConfig);
    }
    /**
     * Override getParsedAccountInfo with rate limiting
     */
    async getParsedAccountInfo(publicKey, commitmentOrConfig) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getParsedAccountInfo(publicKey, commitmentOrConfig), 'getParsedAccountInfo');
        }
        return await super.getParsedAccountInfo(publicKey, commitmentOrConfig);
    }
    /**
     * Override getMultipleAccountsInfo with rate limiting
     */
    async getMultipleAccountsInfo(publicKeys, commitmentOrConfig) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getMultipleAccountsInfo(publicKeys, commitmentOrConfig), 'getMultipleAccountsInfo');
        }
        return await super.getMultipleAccountsInfo(publicKeys, commitmentOrConfig);
    }
    /**
     * Override getTokenAccountBalance with rate limiting
     */
    async getTokenAccountBalance(tokenAddress, commitment) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getTokenAccountBalance(tokenAddress, commitment), 'getTokenAccountBalance');
        }
        return await super.getTokenAccountBalance(tokenAddress, commitment);
    }
    /**
     * Override confirmTransaction with rate limiting
     */
    async confirmTransaction(strategy, commitment) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.confirmTransaction(strategy, commitment), 'confirmTransaction');
        }
        return await super.confirmTransaction(strategy, commitment);
    }
    /**
     * Override getLatestBlockhash with rate limiting
     */
    async getLatestBlockhash(commitment) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getLatestBlockhash(commitment), 'getLatestBlockhash');
        }
        return await super.getLatestBlockhash(commitment);
    }
    /**
     * Override getSlot with rate limiting
     */
    async getSlot(commitment) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getSlot(commitment), 'getSlot');
        }
        return await super.getSlot(commitment);
    }
    /**
     * Override getBlock with rate limiting
     */
    async getBlock(slot, opts) {
        if (this._rateLimitEnabled) {
            return await globalRateLimiter.execute(() => super.getBlock(slot, opts), 'getBlock');
        }
        return await super.getBlock(slot, opts);
    }
}
