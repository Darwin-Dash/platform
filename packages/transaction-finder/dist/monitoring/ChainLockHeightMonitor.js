/**
 * ChainLockHeightMonitor
 *
 * Polls Platform DAPI for the latest core chain locked height.
 * When new ChainLock height is detected, notifies TransactionTracker
 * to confirm all transactions in blocks up to that height.
 *
 * Uses Platform DAPI getEpochsInfo() endpoint which returns:
 * - Current epoch information
 * - Core blockchain sync status
 * - Core chain locked height (highest block confirmed by LLMQ)
 */
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
const CHAINLOCK_POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const MIN_POLL_INTERVAL_MS = 1000; // Minimum to prevent DAPI abuse
export class ChainLockHeightMonitor extends EventEmitter {
    constructor(dapiClient, tracker, onChainLock, basePollIntervalMs = CHAINLOCK_POLL_INTERVAL_MS, maxPollIntervalMs = 30000, adaptivePolling = true) {
        super();
        this.MAX_CONSECUTIVE_FAILURES = 10;
        // Rate limiting validation
        if (basePollIntervalMs < MIN_POLL_INTERVAL_MS) {
            throw new Error(`Poll interval must be >= ${MIN_POLL_INTERVAL_MS}ms to prevent DAPI abuse. ` +
                `Got: ${basePollIntervalMs}ms`);
        }
        this.dapiClient = dapiClient;
        this.tracker = tracker;
        this.lastChainLockedHeight = 0;
        this.isRunning = false;
        this.pollInterval = null;
        this.basePollIntervalMs = basePollIntervalMs;
        this.currentPollIntervalMs = basePollIntervalMs;
        this.maxPollIntervalMs = maxPollIntervalMs;
        this.adaptivePollingEnabled = adaptivePolling;
        this.onChainLock = onChainLock;
        this.logger = createLogger('ChainLockHeightMonitor');
        this.consecutiveFailures = 0;
    }
    /**
     * Start monitoring ChainLock heights with retry logic
     * @param maxRetries Maximum retry attempts for initial connection (default: 5)
     */
    async start(maxRetries = 5) {
        this.isRunning = true;
        // Retry initial poll with exponential backoff
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await this.poll();
                this.logger.info('✅ ChainLock monitor started successfully');
                // Set up interval polling with current interval
                this.pollInterval = setInterval(async () => {
                    if (this.isRunning) {
                        await this.poll();
                    }
                }, this.currentPollIntervalMs);
                return; // Success!
            }
            catch (error) {
                lastError = error;
                if (attempt < maxRetries - 1) {
                    const delay = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s, 24s, 48s
                    this.logger.warn(`⚠️  ChainLock monitor start failed (attempt ${attempt + 1}/${maxRetries}): ${error.message}`);
                    this.logger.warn(`   Retrying in ${delay / 1000}s...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        // All retries exhausted - this is a CRITICAL FAILURE
        const errorMsg = `ChainLock monitor initialization failed after ${maxRetries} attempts: ${lastError.message}`;
        this.logger.error('❌ CRITICAL:', errorMsg);
        throw new Error(errorMsg);
    }
    /**
     * Poll Platform DAPI for current ChainLock height
     */
    async poll() {
        try {
            // Use Platform DAPI getEpochsInfo to get core chain locked height
            const platform = this.dapiClient.platform;
            if (!platform) {
                throw new Error('DAPI client does not have platform namespace');
            }
            const response = await platform.getEpochsInfo(0, 1, { prove: false });
            const metadata = response.getMetadata();
            const coreChainLockedHeight = metadata.getCoreChainLockedHeight();
            // Reset failure counter on success
            this.consecutiveFailures = 0;
            this.logger.debug(`📊 ChainLock poll: ${coreChainLockedHeight} (last: ${this.lastChainLockedHeight})`);
            if (coreChainLockedHeight > this.lastChainLockedHeight) {
                this.logger.info(`🔗 New ChainLock: ${coreChainLockedHeight}`);
                this.logger.debug(`   blockHeightMap.size: ${this.tracker.getBlockHeightMapSize()}`);
                // Record ChainLock for all transactions up to this height
                const timestamp = Date.now();
                const confirmedTxids = this.tracker.recordChainLock(coreChainLockedHeight, timestamp);
                this.logger.debug(`   Confirmed: ${confirmedTxids.length} txs`);
                // Notify callback
                if (confirmedTxids.length > 0 && this.onChainLock) {
                    this.onChainLock(confirmedTxids, coreChainLockedHeight);
                }
                this.lastChainLockedHeight = coreChainLockedHeight;
            }
            // Adaptive polling: reduce interval on success
            this.adjustPollInterval();
        }
        catch (error) {
            this.consecutiveFailures++;
            this.logger.error(`❌ ChainLock poll failed (${this.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${error.message}`);
            // Adaptive polling: increase interval on failure
            this.adjustPollInterval();
            // CRITICAL: If we hit the limit, this is a real problem
            if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
                const criticalError = new Error(`ChainLock polling failed ${this.MAX_CONSECUTIVE_FAILURES} consecutive times - Platform DAPI unavailable`);
                this.logger.error('❌ CRITICAL FAILURE: ChainLock polling failed', this.MAX_CONSECUTIVE_FAILURES, 'consecutive times');
                this.logger.error('   Platform DAPI is unavailable - cannot confirm ChainLocks');
                this.emit('criticalFailure', criticalError);
                this.stop(); // Stop polling
                throw criticalError; // Propagate to caller
            }
        }
    }
    /**
     * Adjust polling interval based on success/failure (adaptive polling)
     * - On success: reduce to base interval
     * - On failure: increase interval (up to max)
     */
    adjustPollInterval() {
        if (!this.adaptivePollingEnabled) {
            return; // Adaptive polling disabled
        }
        const oldInterval = this.currentPollIntervalMs;
        if (this.consecutiveFailures === 0) {
            // Success - reduce to base interval
            this.currentPollIntervalMs = this.basePollIntervalMs;
        }
        else {
            // Failure - increase interval exponentially
            // Formula: base * (2 ^ failures), capped at maxPollInterval
            const multiplier = Math.pow(2, Math.min(this.consecutiveFailures, 5));
            this.currentPollIntervalMs = Math.min(this.basePollIntervalMs * multiplier, this.maxPollIntervalMs);
        }
        // Restart interval if changed
        if (oldInterval !== this.currentPollIntervalMs && this.pollInterval) {
            this.logger.debug(`Adjusting poll interval: ${oldInterval}ms → ${this.currentPollIntervalMs}ms`);
            clearInterval(this.pollInterval);
            this.pollInterval = setInterval(async () => {
                if (this.isRunning) {
                    await this.poll();
                }
            }, this.currentPollIntervalMs);
        }
    }
    /**
     * Stop monitoring
     */
    stop() {
        this.isRunning = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    /**
     * Get current ChainLock height
     */
    getCurrentHeight() {
        return this.lastChainLockedHeight;
    }
    /**
     * Check if monitor is running
     */
    running() {
        return this.isRunning;
    }
}
//# sourceMappingURL=ChainLockHeightMonitor.js.map