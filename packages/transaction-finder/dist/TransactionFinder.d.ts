/**
 * TransactionFinder - Unified transaction finding facade
 *
 * Factory pattern that creates the appropriate finder based on mode:
 * - HISTORIC: HistoricFinder for blockchain scanning
 * - REALTIME: RealtimeFinder for InstantSend/ChainLock monitoring
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
 * await realtimeFinder.monitorAddresses(['yX3CJJ42...'], {
 *   onTransaction: (tx) => console.log('New transaction:', tx.txid),
 *   onInstantLock: (lock) => console.log('InstantLocked!'),
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
     * Find all UTXOs for configured addresses (Historic mode only)
     * @returns Array of UTXOs discovered
     * @throws Error if not in Historic mode
     */
    findUTXOs(): Promise<UTXO[]>;
    /**
     * Find latest spendable UTXO (Historic mode only)
     * @returns Latest spendable UTXO
     * @throws Error if not in Historic mode
     */
    findLatestSpendableUTXO(): Promise<UTXO>;
    /**
     * Monitor addresses for incoming transactions (Realtime mode only)
     * @param addresses Address or array of addresses to monitor
     * @param callbacks Event callbacks for transactions, locks, etc.
     * @returns Cleanup function to stop monitoring
     * @throws Error if not in Realtime mode
     */
    monitorAddresses(addresses: string | string[], callbacks?: RealtimeFinderCallbacks): Promise<() => void>;
    /**
     * Wait for a specific transaction to be confirmed (Realtime mode only)
     * @param txid Transaction ID to wait for
     * @param options Confirmation requirements and timeout
     * @returns Confirmation result
     * @throws Error if not in Realtime mode
     */
    waitForConfirmation(txid: string, options?: ConfirmationOptions): Promise<ConfirmationResult>;
    /**
     * Get tracked transaction state (Realtime mode only)
     * @param txid Transaction ID
     * @returns Transaction state or undefined
     * @throws Error if not in Realtime mode
     */
    getTransaction(txid: string): import("./types/transaction-types.js").TrackedTransaction | undefined;
    /**
     * Clear a specific transaction from tracking (Realtime mode only)
     * @param txid Transaction ID to clear
     * @throws Error if not in Realtime mode
     */
    clearTransaction(txid: string): void;
    /**
     * Clear all confirmed transactions (Realtime mode only)
     * @throws Error if not in Realtime mode
     */
    clearAllConfirmed(): void;
    /**
     * Pre-register a transaction ID before broadcast (Realtime mode only)
     *
     * Call this BEFORE broadcasting a transaction to ensure InstantLocks
     * are captured even if they arrive before waitForConfirmation() is called.
     *
     * @param txid Transaction ID to pre-register
     * @throws Error if not in Realtime mode
     */
    preRegisterTransaction(txid: string): void;
    /**
     * Get current status
     * Returns mode-specific status information
     */
    getStatus(): any;
    /**
     * Stop all operations
     * Applicable to Realtime mode only
     */
    stop(): void;
}
//# sourceMappingURL=TransactionFinder.d.ts.map