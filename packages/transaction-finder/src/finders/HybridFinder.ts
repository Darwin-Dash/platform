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
import { HistoricFinder } from './HistoricFinder.js';
import { RealtimeFinder, RealtimeFinderCallbacks } from './RealtimeFinder.js';
import {
  UTXO,
  HybridFinderConfig,
  FinderMode,
} from '../types/index.js';
import { createLogger, Logger } from '../utils/logger.js';

export class HybridFinder extends EventEmitter {
  private historicFinder: HistoricFinder;
  private realtimeFinder: RealtimeFinder;
  private config: HybridFinderConfig;
  private logger: Logger;
  private isMonitoring: boolean;

  constructor(config: HybridFinderConfig) {
    super();
    this.config = config;
    this.logger = createLogger('HybridFinder');
    this.isMonitoring = false;

    // Create historic finder with shared config + historic-specific config
    this.historicFinder = new HistoricFinder({
      mode: FinderMode.HISTORIC,
      network: config.network,
      addresses: config.addresses,
      dapiClient: config.dapiClient,
      dapiAddresses: config.dapiAddresses,
      seeds: config.seeds,
      timeout: config.timeout,
      retries: config.retries,
      bloomFalsePositiveRate: config.bloomFalsePositiveRate,
      logLevel: config.logLevel,
      ...config.historic,
    });

    // Create realtime finder with shared config + realtime-specific config
    this.realtimeFinder = new RealtimeFinder({
      mode: FinderMode.REALTIME,
      network: config.network,
      addresses: config.addresses,
      dapiClient: config.dapiClient,
      dapiAddresses: config.dapiAddresses,
      seeds: config.seeds,
      timeout: config.timeout,
      retries: config.retries,
      bloomFalsePositiveRate: config.bloomFalsePositiveRate,
      logLevel: config.logLevel,
      ...config.realtime,
    });

    // Forward events from both finders
    this.setupEventForwarding();
  }

  /**
   * Set up event forwarding from child finders to hybrid finder
   * @private
   */
  private setupEventForwarding(): void {
    // Forward historic finder events
    this.historicFinder.on('start', (data) => this.emit('historic:start', data));
    this.historicFinder.on('step', (data) => this.emit('historic:step', data));
    this.historicFinder.on('progress', (data) => this.emit('historic:progress', data));
    this.historicFinder.on('found', (data) => this.emit('historic:found', data));
    this.historicFinder.on('error', (error) => this.emit('historic:error', error));

    // Forward realtime finder events
    this.realtimeFinder.on('error', (error) => this.emit('realtime:error', error));
  }

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
  async syncAndMonitor(callbacks?: RealtimeFinderCallbacks): Promise<{
    utxos: UTXO[];
    stopMonitoring: () => void;
  }> {
    this.logger.info('🔄 Starting hybrid operation: historic sync + realtime monitoring');

    // PHASE 1: Historic Sync
    this.logger.info('📜 Phase 1: Historic blockchain scan');
    this.emit('phase', { phase: 'historic', status: 'starting' });

    const utxos = await this.historicFinder.findUTXOs();

    this.logger.info(`✅ Historic scan complete: found ${utxos.length} UTXOs`);
    this.emit('phase', { phase: 'historic', status: 'completed', utxos: utxos.length });

    // PHASE 2: Realtime Monitoring
    this.logger.info('⚡ Phase 2: Starting realtime monitoring');
    this.emit('phase', { phase: 'realtime', status: 'starting' });

    const stopMonitoring = await this.realtimeFinder.monitorAddresses(
      this.config.addresses,
      callbacks || {}
    );

    this.isMonitoring = true;
    this.logger.info('✅ Realtime monitoring active');
    this.emit('phase', { phase: 'realtime', status: 'active' });

    // Return results and cleanup function
    return {
      utxos,
      stopMonitoring: () => {
        this.logger.info('⏸️  Stopping realtime monitoring');
        this.isMonitoring = false;
        stopMonitoring();
        this.emit('phase', { phase: 'realtime', status: 'stopped' });
      },
    };
  }

  /**
   * Run historic scan only (without starting realtime monitoring)
   * Useful when you just need historical UTXOs without ongoing monitoring
   *
   * @returns Array of discovered UTXOs
   */
  async findUTXOs(): Promise<UTXO[]> {
    this.logger.info('📜 Running historic scan only (no monitoring)');
    return await this.historicFinder.findUTXOs();
  }

  /**
   * Find latest spendable UTXO from historic scan
   * Useful for payment operations that need just one UTXO
   *
   * @returns Latest spendable UTXO
   */
  async findLatestSpendableUTXO(): Promise<UTXO> {
    this.logger.info('📜 Finding latest spendable UTXO (historic scan only)');
    return await this.historicFinder.findLatestSpendableUTXO();
  }

  /**
   * Start realtime monitoring only (without historic scan)
   * Useful when you've already synced history and just want monitoring
   *
   * @param callbacks Event callbacks for monitoring
   * @returns Cleanup function to stop monitoring
   */
  async monitorAddresses(callbacks: RealtimeFinderCallbacks): Promise<() => void> {
    this.logger.info('⚡ Starting realtime monitoring only (no historic scan)');
    const stopMonitoring = await this.realtimeFinder.monitorAddresses(
      this.config.addresses,
      callbacks
    );

    this.isMonitoring = true;

    return () => {
      this.isMonitoring = false;
      stopMonitoring();
    };
  }

  /**
   * Wait for a specific transaction to be confirmed
   * Delegates to realtime finder
   */
  async waitForConfirmation(...args: Parameters<RealtimeFinder['waitForConfirmation']>) {
    return await this.realtimeFinder.waitForConfirmation(...args);
  }

  /**
   * Get tracked transaction state from realtime finder
   */
  getTransaction(txid: string) {
    return this.realtimeFinder.getTransaction(txid);
  }

  /**
   * Clear a specific transaction from realtime tracker
   */
  clearTransaction(txid: string): void {
    this.realtimeFinder.clearTransaction(txid);
  }

  /**
   * Clear all confirmed transactions from realtime tracker
   */
  clearAllConfirmed(): void {
    this.realtimeFinder.clearAllConfirmed();
  }

  /**
   * Get current status of hybrid finder
   */
  getStatus(): {
    monitoring: boolean;
    realtimeStatus: ReturnType<RealtimeFinder['getStatus']>;
  } {
    return {
      monitoring: this.isMonitoring,
      realtimeStatus: this.realtimeFinder.getStatus(),
    };
  }

  /**
   * Stop all operations
   */
  stop(): void {
    this.logger.info('⏹️  Stopping hybrid finder');
    if (this.isMonitoring) {
      this.realtimeFinder.stop();
      this.isMonitoring = false;
    }
  }

  /**
   * Get the configured network
   */
  getNetwork(): string {
    return this.config.network;
  }
}
