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
import { HistoricFinder } from './finders/HistoricFinder.js';
import { RealtimeFinder } from './finders/RealtimeFinder.js';
import { HybridFinder } from './finders/HybridFinder.js';
import { FinderMode, } from './types/index.js';
export class TransactionFinder extends EventEmitter {
    constructor(config) {
        super();
        this.mode = config.mode;
        // Factory pattern: create appropriate finder based on mode
        switch (config.mode) {
            case FinderMode.HISTORIC:
                this.finder = new HistoricFinder(config);
                break;
            case FinderMode.REALTIME:
                this.finder = new RealtimeFinder(config);
                break;
            case FinderMode.HYBRID:
                this.finder = new HybridFinder(config);
                break;
            default:
                throw new Error(`Invalid finder mode: ${config.mode}`);
        }
        // Forward all events from the underlying finder
        this.setupEventForwarding();
    }
    /**
     * Set up event forwarding from underlying finder
     * @private
     */
    setupEventForwarding() {
        // Forward all events (catch-all)
        const originalEmit = this.finder.emit.bind(this.finder);
        this.finder.emit = (event, ...args) => {
            // Emit on child finder
            const result = originalEmit(event, ...args);
            // Also emit on parent TransactionFinder
            super.emit(event, ...args);
            return result;
        };
    }
    /**
     * Get the current operating mode
     */
    getMode() {
        return this.mode;
    }
    /**
     * Get the configured network
     */
    getNetwork() {
        return this.finder.getNetwork();
    }
    // ==================== Historic Mode Methods ====================
    /**
     * Find all UTXOs for configured addresses (Historic/Hybrid mode only)
     * @returns Array of UTXOs discovered
     * @throws Error if not in Historic or Hybrid mode
     */
    async findUTXOs() {
        if (this.finder instanceof HistoricFinder || this.finder instanceof HybridFinder) {
            return await this.finder.findUTXOs();
        }
        throw new Error(`findUTXOs() is only available in HISTORIC or HYBRID mode, current mode: ${this.mode}`);
    }
    /**
     * Find latest spendable UTXO (Historic/Hybrid mode only)
     * @returns Latest spendable UTXO
     * @throws Error if not in Historic or Hybrid mode
     */
    async findLatestSpendableUTXO() {
        if (this.finder instanceof HistoricFinder || this.finder instanceof HybridFinder) {
            return await this.finder.findLatestSpendableUTXO();
        }
        throw new Error(`findLatestSpendableUTXO() is only available in HISTORIC or HYBRID mode, current mode: ${this.mode}`);
    }
    // ==================== Realtime Mode Methods ====================
    /**
     * Monitor addresses for incoming transactions (Realtime/Hybrid mode only)
     * @param callbacks Event callbacks for transactions, locks, etc.
     * @returns Cleanup function to stop monitoring (Realtime mode) or addresses parameter (Hybrid mode compatibility)
     * @throws Error if not in Realtime or Hybrid mode
     */
    async monitorAddresses(addressesOrCallbacks, callbacks) {
        if (this.finder instanceof RealtimeFinder) {
            // Realtime mode: needs both addresses and callbacks
            if (typeof addressesOrCallbacks === 'string' || Array.isArray(addressesOrCallbacks)) {
                return await this.finder.monitorAddresses(addressesOrCallbacks, callbacks || {});
            }
            throw new Error('RealtimeFinder.monitorAddresses() requires addresses parameter');
        }
        if (this.finder instanceof HybridFinder) {
            // Hybrid mode: addresses are in config, just needs callbacks
            if (typeof addressesOrCallbacks === 'object' && !Array.isArray(addressesOrCallbacks)) {
                return await this.finder.monitorAddresses(addressesOrCallbacks);
            }
            throw new Error('HybridFinder.monitorAddresses() takes only callbacks parameter (addresses from config)');
        }
        throw new Error(`monitorAddresses() is only available in REALTIME or HYBRID mode, current mode: ${this.mode}`);
    }
    /**
     * Wait for a specific transaction to be confirmed (Realtime/Hybrid mode only)
     * @param txid Transaction ID to wait for
     * @param options Confirmation requirements and timeout
     * @returns Confirmation result
     * @throws Error if not in Realtime or Hybrid mode
     */
    async waitForConfirmation(txid, options) {
        if (this.finder instanceof RealtimeFinder || this.finder instanceof HybridFinder) {
            return await this.finder.waitForConfirmation(txid, options);
        }
        throw new Error(`waitForConfirmation() is only available in REALTIME or HYBRID mode, current mode: ${this.mode}`);
    }
    /**
     * Get tracked transaction state (Realtime/Hybrid mode only)
     * @param txid Transaction ID
     * @returns Transaction state or undefined
     * @throws Error if not in Realtime or Hybrid mode
     */
    getTransaction(txid) {
        if (this.finder instanceof RealtimeFinder || this.finder instanceof HybridFinder) {
            return this.finder.getTransaction(txid);
        }
        throw new Error(`getTransaction() is only available in REALTIME or HYBRID mode, current mode: ${this.mode}`);
    }
    /**
     * Clear a specific transaction from tracking (Realtime/Hybrid mode only)
     * @param txid Transaction ID to clear
     * @throws Error if not in Realtime or Hybrid mode
     */
    clearTransaction(txid) {
        if (this.finder instanceof RealtimeFinder || this.finder instanceof HybridFinder) {
            return this.finder.clearTransaction(txid);
        }
        throw new Error(`clearTransaction() is only available in REALTIME or HYBRID mode, current mode: ${this.mode}`);
    }
    /**
     * Clear all confirmed transactions (Realtime/Hybrid mode only)
     * @throws Error if not in Realtime or Hybrid mode
     */
    clearAllConfirmed() {
        if (this.finder instanceof RealtimeFinder || this.finder instanceof HybridFinder) {
            return this.finder.clearAllConfirmed();
        }
        throw new Error(`clearAllConfirmed() is only available in REALTIME or HYBRID mode, current mode: ${this.mode}`);
    }
    // ==================== Hybrid Mode Methods ====================
    /**
     * Sync history and start monitoring (Hybrid mode only)
     * @param callbacks Event callbacks for realtime monitoring phase
     * @returns Object containing discovered UTXOs and cleanup function
     * @throws Error if not in Hybrid mode
     */
    async syncAndMonitor(callbacks) {
        if (this.finder instanceof HybridFinder) {
            return await this.finder.syncAndMonitor(callbacks);
        }
        throw new Error(`syncAndMonitor() is only available in HYBRID mode, current mode: ${this.mode}`);
    }
    // ==================== Common Methods ====================
    /**
     * Get current status
     * Returns mode-specific status information
     */
    getStatus() {
        if (this.finder instanceof RealtimeFinder || this.finder instanceof HybridFinder) {
            return this.finder.getStatus();
        }
        // Historic finder doesn't have status
        return { mode: this.mode };
    }
    /**
     * Stop all operations
     * Applicable to Realtime and Hybrid modes
     */
    stop() {
        if (this.finder instanceof RealtimeFinder || this.finder instanceof HybridFinder) {
            this.finder.stop();
        }
        // Historic finder is stateless, no cleanup needed
    }
}
//# sourceMappingURL=TransactionFinder.js.map