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
import { HistoricFinder } from './finders/HistoricFinder.js';
import { RealtimeFinder, RealtimeFinderCallbacks } from './finders/RealtimeFinder.js';
import {
  TransactionFinderConfig,
  FinderMode,
  HistoricFinderConfig,
  RealtimeFinderConfig,
  UTXO,
  ConfirmationOptions,
  ConfirmationResult,
} from './types/index.js';

type FinderInstance = HistoricFinder | RealtimeFinder;

export class TransactionFinder extends EventEmitter {
  private finder: FinderInstance;
  private mode: FinderMode;

  constructor(config: TransactionFinderConfig) {
    super();

    this.mode = config.mode;

    // Factory pattern: create appropriate finder based on mode
    switch (config.mode) {
      case FinderMode.HISTORIC:
        this.finder = new HistoricFinder(config as HistoricFinderConfig);
        break;

      case FinderMode.REALTIME:
        this.finder = new RealtimeFinder(config as RealtimeFinderConfig);
        break;

      default:
        throw new Error(`Invalid finder mode: ${(config as any).mode}. Valid modes are: HISTORIC, REALTIME`);
    }

    // Forward all events from the underlying finder
    this.setupEventForwarding();
  }

  /**
   * Set up event forwarding from underlying finder
   * @private
   */
  private setupEventForwarding(): void {
    // Forward all events (catch-all)
    const originalEmit = this.finder.emit.bind(this.finder);
    this.finder.emit = (event: string, ...args: any[]) => {
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
  getMode(): FinderMode {
    return this.mode;
  }

  /**
   * Get the configured network
   */
  getNetwork(): string {
    return this.finder.getNetwork();
  }

  // ==================== Historic Mode Methods ====================

  /**
   * Find all UTXOs for configured addresses (Historic mode only)
   * @returns Array of UTXOs discovered
   * @throws Error if not in Historic mode
   */
  async findUTXOs(): Promise<UTXO[]> {
    if (this.finder instanceof HistoricFinder) {
      return await this.finder.findUTXOs();
    }
    throw new Error(`findUTXOs() is only available in HISTORIC mode, current mode: ${this.mode}`);
  }

  /**
   * Find latest spendable UTXO (Historic mode only)
   * @returns Latest spendable UTXO
   * @throws Error if not in Historic mode
   */
  async findLatestSpendableUTXO(): Promise<UTXO> {
    if (this.finder instanceof HistoricFinder) {
      return await this.finder.findLatestSpendableUTXO();
    }
    throw new Error(`findLatestSpendableUTXO() is only available in HISTORIC mode, current mode: ${this.mode}`);
  }

  // ==================== Realtime Mode Methods ====================

  /**
   * Monitor addresses for incoming transactions (Realtime mode only)
   * @param addresses Address or array of addresses to monitor
   * @param callbacks Event callbacks for transactions, locks, etc.
   * @returns Cleanup function to stop monitoring
   * @throws Error if not in Realtime mode
   */
  async monitorAddresses(
    addresses: string | string[],
    callbacks?: RealtimeFinderCallbacks
  ): Promise<() => void> {
    if (this.finder instanceof RealtimeFinder) {
      return await this.finder.monitorAddresses(addresses, callbacks || {});
    }

    throw new Error(`monitorAddresses() is only available in REALTIME mode, current mode: ${this.mode}`);
  }

  /**
   * Wait for a specific transaction to be confirmed (Realtime mode only)
   * @param txid Transaction ID to wait for
   * @param options Confirmation requirements and timeout
   * @returns Confirmation result
   * @throws Error if not in Realtime mode
   */
  async waitForConfirmation(
    txid: string,
    options?: ConfirmationOptions
  ): Promise<ConfirmationResult> {
    if (this.finder instanceof RealtimeFinder) {
      return await this.finder.waitForConfirmation(txid, options);
    }
    throw new Error(`waitForConfirmation() is only available in REALTIME mode, current mode: ${this.mode}`);
  }

  /**
   * Get tracked transaction state (Realtime mode only)
   * @param txid Transaction ID
   * @returns Transaction state or undefined
   * @throws Error if not in Realtime mode
   */
  getTransaction(txid: string) {
    if (this.finder instanceof RealtimeFinder) {
      return this.finder.getTransaction(txid);
    }
    throw new Error(`getTransaction() is only available in REALTIME mode, current mode: ${this.mode}`);
  }

  /**
   * Clear a specific transaction from tracking (Realtime mode only)
   * @param txid Transaction ID to clear
   * @throws Error if not in Realtime mode
   */
  clearTransaction(txid: string): void {
    if (this.finder instanceof RealtimeFinder) {
      return this.finder.clearTransaction(txid);
    }
    throw new Error(`clearTransaction() is only available in REALTIME mode, current mode: ${this.mode}`);
  }

  /**
   * Clear all confirmed transactions (Realtime mode only)
   * @throws Error if not in Realtime mode
   */
  clearAllConfirmed(): void {
    if (this.finder instanceof RealtimeFinder) {
      return this.finder.clearAllConfirmed();
    }
    throw new Error(`clearAllConfirmed() is only available in REALTIME mode, current mode: ${this.mode}`);
  }

  /**
   * Pre-register a transaction ID before broadcast (Realtime mode only)
   *
   * Call this BEFORE broadcasting a transaction to ensure InstantLocks
   * are captured even if they arrive before waitForConfirmation() is called.
   *
   * @param txid Transaction ID to pre-register
   * @throws Error if not in Realtime mode
   */
  preRegisterTransaction(txid: string): void {
    if (this.finder instanceof RealtimeFinder) {
      return this.finder.preRegisterTransaction(txid);
    }
    throw new Error(`preRegisterTransaction() is only available in REALTIME mode, current mode: ${this.mode}`);
  }

  // ==================== Common Methods ====================

  /**
   * Get current status
   * Returns mode-specific status information
   */
  getStatus(): any {
    if (this.finder instanceof RealtimeFinder) {
      return this.finder.getStatus();
    }
    // Historic finder doesn't have status
    return { mode: this.mode };
  }

  /**
   * Stop all operations
   * Applicable to Realtime mode only
   */
  stop(): void {
    if (this.finder instanceof RealtimeFinder) {
      this.finder.stop();
    }
    // Historic finder is stateless, no cleanup needed
  }
}
