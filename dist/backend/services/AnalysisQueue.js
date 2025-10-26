/**
 * Analysis Queue - Processes wallet analyses sequentially
 * Prevents parallel analysis that overwhelms RPC servers
 */
export class AnalysisQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.currentWallet = null;
        this.processCallback = null;
        this.stopped = false;
    }
    /**
     * Set the callback function to process each queued analysis
     */
    setProcessor(callback) {
        this.processCallback = callback;
    }
    /**
     * Stop the queue and clear all pending analyses
     */
    stop() {
        this.stopped = true;
        this.queue = [];
        console.log(`🛑 [Queue] Stopped and cleared (was processing: ${this.processing})`);
    }
    /**
     * Resume the queue
     */
    resume() {
        this.stopped = false;
        console.log(`▶️  [Queue] Resumed`);
    }
    /**
     * Add wallet to analysis queue
     */
    enqueue(walletAddress, source, amount, priority = 0) {
        // Don't add if queue is stopped
        if (this.stopped) {
            console.log(`⏸️  [Queue] Stopped, not adding ${walletAddress.slice(0, 8)}...`);
            return;
        }
        // Check if already in queue
        const exists = this.queue.some(item => item.walletAddress === walletAddress);
        if (exists) {
            console.log(`⏭️  [Queue] ${walletAddress.slice(0, 8)}... already queued, skipping`);
            return;
        }
        // Check if currently processing
        if (this.currentWallet === walletAddress) {
            console.log(`⏭️  [Queue] ${walletAddress.slice(0, 8)}... currently processing, skipping`);
            return;
        }
        this.queue.push({
            walletAddress,
            source,
            amount,
            priority,
            addedAt: Date.now()
        });
        console.log(`📋 [Queue] Added ${walletAddress.slice(0, 8)}... (queue size: ${this.queue.length})`);
        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }
    }
    /**
     * Process queue sequentially
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0 || this.stopped) {
            return;
        }
        this.processing = true;
        while (this.queue.length > 0 && !this.stopped) {
            // Sort by priority (higher first), then by addedAt (older first)
            this.queue.sort((a, b) => {
                if (b.priority !== a.priority) {
                    return b.priority - a.priority;
                }
                return a.addedAt - b.addedAt;
            });
            const analysis = this.queue.shift();
            this.currentWallet = analysis.walletAddress;
            console.log(`🔄 [Queue] Processing ${analysis.walletAddress.slice(0, 8)}... (${this.queue.length} remaining)`);
            try {
                if (this.processCallback) {
                    await this.processCallback(analysis);
                }
            }
            catch (error) {
                console.error(`❌ [Queue] Error processing ${analysis.walletAddress.slice(0, 8)}...`, error);
            }
            this.currentWallet = null;
            // Check if stopped after processing
            if (this.stopped) {
                console.log(`🛑 [Queue] Stopped during processing`);
                break;
            }
        }
        this.processing = false;
        if (this.stopped) {
            console.log(`🛑 [Queue] Processing stopped`);
        }
        else {
            console.log(`✅ [Queue] All analyses complete`);
        }
    }
    /**
     * Get queue status
     */
    getStatus() {
        return {
            queueSize: this.queue.length,
            processing: this.processing,
            currentWallet: this.currentWallet
        };
    }
    /**
     * Get queue length
     */
    size() {
        return this.queue.length;
    }
    /**
     * Check if processing
     */
    isProcessing() {
        return this.processing;
    }
}
// Global analysis queue singleton
export const globalAnalysisQueue = new AnalysisQueue();
