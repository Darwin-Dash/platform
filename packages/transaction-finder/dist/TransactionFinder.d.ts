/**
 * TransactionFinder - Unified transaction finding facade
 *
 * Factory pattern that creates the appropriate finder based on mode:
 * - HISTORIC: HistoricFinder for blockchain scanning
 * - REALTIME: RealtimeFinder for InstantSend/ChainLock monitoring
 * - HYBRID: HybridFinder for combined historic + realtime
 *
 * This is the main entry point for the @dashevo/transaction-finder package.
 *
 * @example
 * ```typescript
 * // Historic mode - find UTXOs from blockchain history
 * const historicFinder = new TransactionFinder({
 *   mode: FinderMode.HISTORIC,
 *   network: 'testnet',
 *   addresses: ['yX3CJJ42...'],
 *   fromHeight: 1,
 *   dapiClient: myDapiClient,
 * });
 * const utxos = await historicFinder.findUTXOs();
 *
 * // Realtime mode - monitor for new transactions
 * const realtimeFinder = new TransactionFinder({
 *   mode: FinderMode.REALTIME,
 *   network: 'testnet',
 *   addresses: ['yX3CJJ42...'],
 *   dapiClient: myDapiClient,
 * });
 * await realtimeFinder.monitorAddresses({
 *   onTransaction: (tx) => console.log('New transaction:', tx.txid),
 *   onInstantLock: (lock) => console.log('InstantLocked!'),
 * });
 *
 * // Hybrid mode - sync history then monitor
 * const hybridFinder = new TransactionFinder({
 *   mode: FinderMode.HYBRID,
 *   network: 'testnet',
 *   addresses: ['yX3CJJ42...'],
 *   historic: { fromHeight: 1 },
 *   realtime: { autoPruneOnConfirmation: true },
 *   dapiClient: myDapiClient,
 * });
 * const { utxos, stopMonitoring } = await hybridFinder.syncAndMonitor({
 *   onTransaction: (tx) => console.log('New transaction:', tx.txid),
 * });
 * ```
 */
import { EventEmitter } from 'events';
import { RealtimeFinderCallbacks } from './finders/RealtimeFinder.js';
import { TransactionFinderConfig, FinderMode, UTXO, ConfirmationOptions, ConfirmationResult } from './types/index.js';
export declare class TransactionFinder extends EventEmitter {
    private finder;
    private mode;
    constructor(config: TransactionFinderConfig);
    /**
     * Set up event forwarding from underlying finder
     * @private
     */
    private setupEventForwarding;
    /**
     * Get the current operating mode
     */
    getMode(): FinderMode;
    /**
     * Get the configured network
     */
    getNetwork(): string;
    /**
     * Find all UTXOs for configured addresses (Historic/Hybrid mode only)
     * @returns Array of UTXOs discovered
     * @throws Error if not in Historic or Hybrid mode
     */
    findUTXOs(): Promise<UTXO[]>;
    /**
     * Find latest spendable UTXO (Historic/Hybrid mode only)
     * @returns Latest spendable UTXO
     * @throws Error if not in Historic or Hybrid mode
     */
    findLatestSpendableUTXO(): Promise<UTXO>;
    /**
     * Monitor addresses for incoming transactions (Realtime/Hybrid mode only)
     * @param callbacks Event callbacks for transactions, locks, etc.
     * @returns Cleanup function to stop monitoring (Realtime mode) or addresses parameter (Hybrid mode compatibility)
     * @throws Error if not in Realtime or Hybrid mode
     */
    monitorAddresses(addressesOrCallbacks: string | string[] | RealtimeFinderCallbacks, callbacks?: RealtimeFinderCallbacks): Promise<(() => void) | void>;
    /**
     * Wait for a specific transaction to be confirmed (Realtime/Hybrid mode only)
     * @param txid Transaction ID to wait for
     * @param options Confirmation requirements and timeout
     * @returns Confirmation result
     * @throws Error if not in Realtime or Hybrid mode
     */
    waitForConfirmation(txid: string, options?: ConfirmationOptions): Promise<ConfirmationResult>;
    /**
     * Get tracked transaction state (Realtime/Hybrid mode only)
     * @param txid Transaction ID
     * @returns Transaction state or undefined
     * @throws Error if not in Realtime or Hybrid mode
     */
    getTransaction(txid: string): import("./types/transaction-types.js").TrackedTransaction | undefined;
    /**
     * Clear a specific transaction from tracking (Realtime/Hybrid mode only)
     * @param txid Transaction ID to clear
     * @throws Error if not in Realtime or Hybrid mode
     */
    clearTransaction(txid: string): void;
    /**
     * Clear all confirmed transactions (Realtime/Hybrid mode only)
     * @throws Error if not in Realtime or Hybrid mode
     */
    clearAllConfirmed(): void;
    /**
     * Sync history and start monitoring (Hybrid mode only)
     * @param callbacks Event callbacks for realtime monitoring phase
     * @returns Object containing discovered UTXOs and cleanup function
     * @throws Error if not in Hybrid mode
     */
    syncAndMonitor(callbacks?: RealtimeFinderCallbacks): Promise<{
        utxos: UTXO[];
        stopMonitoring: () => void;
    }>;
    /**
     * Get current status
     * Returns mode-specific status information
     */
    getStatus(): any;
    /**
     * Stop all operations
     * Applicable to Realtime and Hybrid modes
     */
    stop(): void;
}
//# sourceMappingURL=TransactionFinder.d.ts.map