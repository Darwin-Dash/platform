/**
 * HybridFinder - Combined historic scanning + realtime monitoring
 *
 * Coordinates both historic and realtime finders for complete transaction discovery:
 * 1. Historic scan: Discover all past UTXOs from blockchain history
 * 2. Realtime monitoring: Continue monitoring for new transactions
 *
 * Use cases:
 * - Wallet sync: Scan history first, then monitor for new transactions
 * - Payment tracking: Monitor from broadcast through ChainLock confirmation
 * - Full transaction history: Sync past + keep monitoring updates
 */
import { EventEmitter } from 'events';
import { RealtimeFinder, RealtimeFinderCallbacks } from './RealtimeFinder.js';
import { UTXO, HybridFinderConfig } from '../types/index.js';
export declare class HybridFinder extends EventEmitter {
    private historicFinder;
    private realtimeFinder;
    private config;
    private logger;
    private isMonitoring;
    constructor(config: HybridFinderConfig);
    /**
     * Set up event forwarding from child finders to hybrid finder
     * @private
     */
    private setupEventForwarding;
    /**
     * Perform full hybrid operation: historic sync followed by realtime monitoring
     *
     * @param callbacks Event callbacks for realtime monitoring phase
     * @returns Object containing discovered UTXOs and cleanup function
     *
     * @example
     * ```typescript
     * const finder = new HybridFinder({
     *   mode: FinderMode.HYBRID,
     *   network: 'testnet',
     *   addresses: ['yX3CJJ42...'],
     *   historic: { fromHeight: 1 },
     *   realtime: { autoPruneOnConfirmation: true }
     * });
     *
     * const { utxos, stopMonitoring } = await finder.syncAndMonitor({
     *   onTransaction: (tx) => console.log('New transaction:', tx.txid),
     *   onInstantLock: (lock) => console.log('InstantLocked!'),
     *   onChainLock: (cl) => console.log('ChainLocked!'),
     * });
     *
     * console.log('Found', utxos.length, 'UTXOs from history');
     * // ... monitoring continues in background ...
     *
     * // Later: stop monitoring
     * stopMonitoring();
     * ```
     */
    syncAndMonitor(callbacks?: RealtimeFinderCallbacks): Promise<{
        utxos: UTXO[];
        stopMonitoring: () => void;
    }>;
    /**
     * Run historic scan only (without starting realtime monitoring)
     * Useful when you just need historical UTXOs without ongoing monitoring
     *
     * @returns Array of discovered UTXOs
     */
    findUTXOs(): Promise<UTXO[]>;
    /**
     * Find latest spendable UTXO from historic scan
     * Useful for payment operations that need just one UTXO
     *
     * @returns Latest spendable UTXO
     */
    findLatestSpendableUTXO(): Promise<UTXO>;
    /**
     * Start realtime monitoring only (without historic scan)
     * Useful when you've already synced history and just want monitoring
     *
     * @param callbacks Event callbacks for monitoring
     * @returns Cleanup function to stop monitoring
     */
    monitorAddresses(callbacks: RealtimeFinderCallbacks): Promise<() => void>;
    /**
     * Wait for a specific transaction to be confirmed
     * Delegates to realtime finder
     */
    waitForConfirmation(...args: Parameters<RealtimeFinder['waitForConfirmation']>): Promise<import("../types/monitoring-types.js").ConfirmationResult>;
    /**
     * Get tracked transaction state from realtime finder
     */
    getTransaction(txid: string): import("../types/transaction-types.js").TrackedTransaction | undefined;
    /**
     * Clear a specific transaction from realtime tracker
     */
    clearTransaction(txid: string): void;
    /**
     * Clear all confirmed transactions from realtime tracker
     */
    clearAllConfirmed(): void;
    /**
     * Get current status of hybrid finder
     */
    getStatus(): {
        monitoring: boolean;
        realtimeStatus: ReturnType<RealtimeFinder['getStatus']>;
    };
    /**
     * Stop all operations
     */
    stop(): void;
    /**
     * Get the configured network
     */
    getNetwork(): string;
}
//# sourceMappingURL=HybridFinder.d.ts.map