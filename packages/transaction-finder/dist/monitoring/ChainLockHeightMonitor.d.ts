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
import { TransactionTracker } from './TransactionTracker.js';
import { DAPIClientLike } from '../types/index.js';
export declare class ChainLockHeightMonitor extends EventEmitter {
    private dapiClient;
    private tracker;
    private lastChainLockedHeight;
    private isRunning;
    private pollInterval;
    private basePollIntervalMs;
    private currentPollIntervalMs;
    private maxPollIntervalMs;
    private adaptivePollingEnabled;
    private onChainLock?;
    private logger;
    private consecutiveFailures;
    private readonly MAX_CONSECUTIVE_FAILURES;
    constructor(dapiClient: DAPIClientLike, tracker: TransactionTracker, onChainLock?: (txids: string[], height: number) => void, basePollIntervalMs?: number, maxPollIntervalMs?: number, adaptivePolling?: boolean);
    /**
     * Start monitoring ChainLock heights with retry logic
     * @param maxRetries Maximum retry attempts for initial connection (default: 5)
     */
    start(maxRetries?: number): Promise<void>;
    /**
     * Poll Platform DAPI for current ChainLock height
     */
    private poll;
    /**
     * Adjust polling interval based on success/failure (adaptive polling)
     * - On success: reduce to base interval
     * - On failure: increase interval (up to max)
     */
    private adjustPollInterval;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Get current ChainLock height
     */
    getCurrentHeight(): number;
    /**
     * Check if monitor is running
     */
    running(): boolean;
}
//# sourceMappingURL=ChainLockHeightMonitor.d.ts.map