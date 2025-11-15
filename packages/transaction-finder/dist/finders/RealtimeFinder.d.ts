/**
 * RealtimeFinder - Real-time InstantSend/ChainLock monitoring
 *
 * Monitors addresses for incoming transactions and tracks confirmation
 * through InstantLock and ChainLock stages.
 *
 * Features:
 * - InstantLock detection (~1-3 seconds)
 * - ChainLock confirmation (~1-3 minutes)
 * - Automatic reconnection on stream failures
 * - Transaction state tracking
 */
import { EventEmitter } from 'events';
import { RealtimeFinderConfig, ConfirmationOptions, ConfirmationResult, TransactionEvent, InstantLockEvent, ChainLockEvent, BlockInclusionEvent } from '../types/index.js';
export interface RealtimeFinderCallbacks {
    /** Called when transaction is detected in DAPI stream */
    onTransaction?: (tx: TransactionEvent) => void;
    /** Called when InstantLock is received */
    onInstantLock?: (lock: InstantLockEvent) => void;
    /** Called when ChainLock confirms transaction */
    onChainLock?: (cl: ChainLockEvent) => void;
    /** Called when block inclusion is detected */
    onBlockInclusion?: (block: BlockInclusionEvent) => void;
}
export declare class RealtimeFinder extends EventEmitter {
    private config;
    private tracker;
    private chainLockMonitor;
    private stream;
    private isActive;
    private logger;
    private monitoredAddresses;
    private currentCallbacks;
    constructor(config: RealtimeFinderConfig);
    /**
     * Monitor specific addresses for incoming transactions
     * @param addresses Address or array of addresses to monitor
     * @param callbacks Event callbacks for transactions, locks, etc.
     * @returns Cleanup function to stop monitoring
     */
    monitorAddresses(addresses: string | string[], callbacks: RealtimeFinderCallbacks): Promise<() => void>;
    /**
     * Process stream messages
     * @private
     */
    private processStream;
    /**
     * Check if transaction involves any of the monitored addresses
     * @private
     */
    private transactionInvolvesAddresses;
    /**
     * Wait for a specific transaction to be confirmed
     * @param txid Transaction ID to wait for
     * @param options Confirmation requirements and timeout
     * @returns Confirmation result
     */
    waitForConfirmation(txid: string, options?: ConfirmationOptions): Promise<ConfirmationResult>;
    /**
     * Stop all monitoring
     */
    stop(): void;
    /**
     * Get tracked transaction state
     */
    getTransaction(txid: string): import("../types/transaction-types.js").TrackedTransaction | undefined;
    /**
     * Clear a specific transaction from tracking
     */
    clearTransaction(txid: string): void;
    /**
     * Clear all confirmed transactions
     */
    clearAllConfirmed(): void;
    /**
     * Get current monitoring status
     */
    getStatus(): {
        active: boolean;
        trackedTransactions: number;
        chainLockHeight: number;
    };
    /**
     * Get the configured network
     */
    getNetwork(): string;
}
//# sourceMappingURL=RealtimeFinder.d.ts.map