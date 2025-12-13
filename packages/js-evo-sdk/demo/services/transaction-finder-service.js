/**
 * TransactionFinderService - Unified interface for UTXO discovery and monitoring
 * Supports MOCK mode (development) and REAL mode (testnet DAPI)
 */
import { EventEmitter } from 'events';

// These will be dynamically imported only in REAL mode
let TransactionFinder;
let FinderMode;
let DAPIClient;

// Block counts for each timeframe (based on ~2.5 min block time)
const BLOCKS_PER_TIMEFRAME = {
  hour: 60,    // ~1 hour with safety margin
  day: 576,    // ~24 hours
  week: 4032   // ~7 days
};

// Balance thresholds in duffs
const MIN_BALANCE = 100000;         // 0.001 DASH
const RECOMMENDED_BALANCE = 1000000; // 0.01 DASH

export class TransactionFinderService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.useMockMode = options.useMockMode ?? false;
    this.network = options.network || 'testnet';
    this.dapiClient = null;
    this.historicFinder = null;
    this.realtimeFinder = null;
    this.isInitialized = false;
    this._monitoringCleanup = null;
  }

  /**
   * Initialize DAPI client and load transaction-finder module (REAL mode only)
   */
  async initialize() {
    if (this.useMockMode || this.isInitialized) return;

    try {
      // Dynamic import to avoid bundling issues in mock mode
      const txFinderModule = await import('@dashevo/transaction-finder');
      TransactionFinder = txFinderModule.TransactionFinder;
      FinderMode = txFinderModule.FinderMode;

      const dapiModule = await import('@dashevo/dapi-client');
      DAPIClient = dapiModule.default || dapiModule.DAPIClient;

      this.dapiClient = new DAPIClient({
        network: this.network,
        timeout: 30000,
        retries: 3,
        baseBanTime: 60000
      });

      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('initialization-error', error);
      throw error;
    }
  }

  /**
   * Get current blockchain height
   */
  async getCurrentBlockHeight() {
    if (this.useMockMode) {
      return 920000; // Mock height for testnet
    }

    await this.initialize();
    const status = await this.dapiClient.core.getBlockchainStatus();
    return status.blocks || status.chain?.blocksCount || status.chain?.headersCount;
  }

  /**
   * Calculate fromHeight based on timeframe selection
   * @param {'hour' | 'day' | 'week'} timeframe
   */
  async calculateFromHeight(timeframe) {
    const currentHeight = await this.getCurrentBlockHeight();
    const blocksBack = BLOCKS_PER_TIMEFRAME[timeframe] || 60;
    return Math.max(0, currentHeight - blocksBack);
  }

  /**
   * Get estimated sync time for a timeframe
   * @param {'hour' | 'day' | 'week'} timeframe
   */
  getEstimatedSyncTime(timeframe) {
    switch (timeframe) {
      case 'hour':
        return '10-30 seconds';
      case 'day':
        return '1-2 minutes';
      case 'week':
        return '3-5 minutes';
      default:
        return '10-30 seconds';
    }
  }

  /**
   * Historic Mode: Find UTXOs for addresses within timeframe
   * Used for "Already funded" flow
   * @param {string[]} addresses - Addresses to scan
   * @param {Object} options - Options
   * @param {'hour' | 'day' | 'week'} options.timeframe - Timeframe to scan
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<UTXO[]>} Found UTXOs
   */
  async findUTXOs(addresses, options = {}) {
    const { timeframe = 'hour', onProgress } = options;

    if (this.useMockMode) {
      return this._mockFindUTXOs(addresses, onProgress);
    }

    await this.initialize();

    const fromHeight = await this.calculateFromHeight(timeframe);
    const currentHeight = await this.getCurrentBlockHeight();

    this.historicFinder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: this.network,
      addresses: Array.isArray(addresses) ? addresses : [addresses],
      dapiClient: this.dapiClient,
      fromHeight,
      toHeight: currentHeight,
    });

    // Forward progress events
    this.historicFinder.on('progress', (progress) => {
      this.emit('scan-progress', progress);
      if (onProgress) onProgress(progress);
    });

    this.historicFinder.on('step', (step) => {
      this.emit('scan-step', step);
    });

    try {
      const utxos = await this.historicFinder.findUTXOs();
      this.emit('scan-complete', { utxos, count: utxos.length });
      return utxos;
    } catch (error) {
      this.emit('scan-error', error);
      throw error;
    }
  }

  /**
   * Find the latest spendable UTXO
   * @param {string[]} addresses
   * @param {Object} options
   * @returns {Promise<UTXO | null>}
   */
  async findLatestSpendableUTXO(addresses, options = {}) {
    const utxos = await this.findUTXOs(addresses, options);
    if (utxos.length === 0) return null;

    // Sort by block height descending and return the most recent
    return utxos.sort((a, b) => b.blockHeight - a.blockHeight)[0];
  }

  /**
   * Realtime Mode: Monitor address for incoming transactions
   * Used for "Sending now" flow
   * @param {string} address - Address to monitor
   * @param {Object} callbacks - Event callbacks
   * @returns {Promise<Function>} Cleanup function
   */
  async monitorAddress(address, callbacks = {}) {
    const { onTransaction, onInstantLock, onChainLock, onError } = callbacks;

    if (this.useMockMode) {
      return this._mockMonitorAddress(address, callbacks);
    }

    await this.initialize();

    this.realtimeFinder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: this.network,
      addresses: [address],
      dapiClient: this.dapiClient,
      autoPruneOnConfirmation: true,
    });

    const cleanup = await this.realtimeFinder.monitorAddresses([address], {
      onTransaction: (tx) => {
        console.log('funding-status: transaction detected', tx.txid);
        this.emit('transaction-detected', tx);
        if (onTransaction) onTransaction(tx);
      },
      onInstantLock: (lock) => {
        console.log('funding-status: instantlock received', lock.txid);
        this.emit('instantlock-received', lock);
        if (onInstantLock) onInstantLock(lock);
      },
      onChainLock: (cl) => {
        console.log('funding-status: chainlock received', cl.txid);
        this.emit('chainlock-received', cl);
        if (onChainLock) onChainLock(cl);
      },
    });

    this._monitoringCleanup = cleanup;
    return cleanup;
  }

  /**
   * Wait for transaction confirmation (InstantLock + optional ChainLock)
   * @param {string} txid - Transaction ID to wait for
   * @param {Object} options
   * @returns {Promise<ConfirmationResult>}
   */
  async waitForConfirmation(txid, options = {}) {
    const {
      requireInstantLock = true,
      requireChainLock = true, // Default to ChainLock per user preference
      timeout = 180000, // 3 minutes default
      onProgress
    } = options;

    if (this.useMockMode) {
      return this._mockWaitForConfirmation(txid, options);
    }

    if (!this.realtimeFinder) {
      throw new Error('Realtime monitoring must be started first');
    }

    return this.realtimeFinder.waitForConfirmation(txid, {
      requireInstantLock,
      requireChainLock,
      timeout,
      onProgress: (status) => {
        this.emit('confirmation-progress', status);
        if (onProgress) onProgress(status);
      }
    });
  }

  /**
   * Calculate total balance from UTXOs
   * @param {UTXO[]} utxos
   * @returns {number} Total in duffs
   */
  calculateBalance(utxos) {
    return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
  }

  /**
   * Format balance for display
   * @param {number} duffs
   * @returns {string}
   */
  formatBalance(duffs) {
    const dash = duffs / 100000000;
    return `${dash.toFixed(4)} DASH`;
  }

  /**
   * Validate funding balance meets requirements
   * @param {number} balance - Balance in duffs
   * @returns {{ valid: boolean, message: string }}
   */
  validateBalance(balance) {
    if (balance < MIN_BALANCE) {
      return {
        valid: false,
        message: `Minimum balance of ${this.formatBalance(MIN_BALANCE)} required`
      };
    }
    if (balance < RECOMMENDED_BALANCE) {
      return {
        valid: true,
        message: `Balance below recommended ${this.formatBalance(RECOMMENDED_BALANCE)}, but sufficient`
      };
    }
    return { valid: true, message: 'Balance sufficient' };
  }

  /**
   * Stop all monitoring
   */
  stop() {
    if (this._monitoringCleanup) {
      this._monitoringCleanup();
      this._monitoringCleanup = null;
    }
    if (this.realtimeFinder) {
      this.realtimeFinder.stop();
      this.realtimeFinder = null;
    }
    this.historicFinder = null;
    this.emit('stopped');
  }

  /**
   * Check if currently monitoring
   */
  isMonitoring() {
    return this._monitoringCleanup !== null;
  }

  // ========== Mock Implementations ==========

  async _mockFindUTXOs(addresses, onProgress) {
    // Check for test flag to return empty
    if (typeof window !== 'undefined' && window.__MOCK_EMPTY_UTXOS__) {
      await this._delay(1000);
      this.emit('scan-complete', { utxos: [], count: 0 });
      return [];
    }

    // Simulate scanning progress
    const totalBlocks = 60;
    for (let i = 0; i <= totalBlocks; i += 10) {
      await this._delay(200);
      const progress = {
        progress: (i / totalBlocks) * 100,
        syncedBlocks: i,
        totalBlocks,
        currentHeight: 920000 - totalBlocks + i
      };
      this.emit('scan-progress', progress);
      if (onProgress) onProgress(progress);
    }

    // Return mock UTXO
    const mockUTXO = {
      txId: 'mock_' + Date.now().toString(16),
      vout: 0,
      satoshis: 5000000, // 0.05 DASH
      address: addresses[0],
      blockHeight: 920000,
      blockTime: Date.now(),
      blockHash: 'mock_block_hash_' + Date.now().toString(16),
      isChainLocked: true,
      isInstantLocked: true,
      script: '76a914' + 'a'.repeat(40) + '88ac' // P2PKH placeholder
    };

    this.emit('scan-complete', { utxos: [mockUTXO], count: 1 });
    return [mockUTXO];
  }

  async _mockMonitorAddress(address, callbacks) {
    const { onTransaction, onInstantLock, onChainLock } = callbacks;

    // Simulate receiving transaction after 5-10 seconds
    const txDelay = 5000 + Math.random() * 5000;
    const txid = 'mock_tx_' + Date.now().toString(16);

    const timeoutIds = [];

    // Transaction detected
    timeoutIds.push(setTimeout(async () => {
      const mockTx = {
        txid,
        timestamp: Date.now(),
        address,
        outputs: [{ satoshis: 5000000, address }]
      };

      console.log('funding-status: transaction detected', txid);
      this.emit('transaction-detected', mockTx);
      if (onTransaction) onTransaction(mockTx);

      // InstantLock after 1-2 seconds
      await this._delay(1000 + Math.random() * 1000);
      const mockLock = {
        txid,
        timestamp: Date.now(),
        latency: 1500,
        instantLockHex: '00' + txid
      };
      console.log('funding-status: instantlock received', txid);
      this.emit('instantlock-received', mockLock);
      if (onInstantLock) onInstantLock(mockLock);

      // ChainLock after 2 more seconds (mock - real would be ~2 minutes)
      await this._delay(2000);
      const mockChainLock = {
        txid,
        timestamp: Date.now(),
        blockHeight: 920001,
        chainLockedHeight: 920001,
        latency: 5000
      };
      console.log('funding-status: chainlock received', txid);
      this.emit('chainlock-received', mockChainLock);
      if (onChainLock) onChainLock(mockChainLock);
    }, txDelay));

    // Return cleanup function
    this._monitoringCleanup = () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
    return this._monitoringCleanup;
  }

  async _mockWaitForConfirmation(txid, options) {
    const { requireChainLock = true, timeout = 180000, onProgress } = options;
    const startTime = Date.now();

    // Simulate progress updates
    const steps = requireChainLock
      ? ['waiting', 'instantlocked', 'chainlocked']
      : ['waiting', 'instantlocked'];

    for (let i = 0; i < steps.length; i++) {
      await this._delay(1000 + Math.random() * 1000);
      const status = {
        txid,
        status: steps[i],
        elapsedMs: Date.now() - startTime,
        message: this._getStatusMessage(steps[i])
      };
      this.emit('confirmation-progress', status);
      if (onProgress) onProgress(status);
    }

    return {
      txid,
      method: requireChainLock ? 'chainlock' : 'instantlock',
      instantLockTime: Date.now() - 2000,
      chainLockTime: requireChainLock ? Date.now() : null,
      blockHeight: 920001,
      totalLatencyMs: Date.now() - startTime,
      instantLockHex: '00' + txid
    };
  }

  _getStatusMessage(status) {
    switch (status) {
      case 'waiting':
        return 'Waiting for transaction...';
      case 'instantlocked':
        return 'InstantLock confirmed!';
      case 'chainlocked':
        return 'ChainLock confirmed!';
      default:
        return 'Processing...';
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton factory
let serviceInstance = null;

/**
 * Get or create the TransactionFinderService singleton
 * @param {Object} options
 * @returns {TransactionFinderService}
 */
export function getTransactionFinderService(options = {}) {
  if (!serviceInstance) {
    serviceInstance = new TransactionFinderService(options);
  }
  return serviceInstance;
}

/**
 * Reset the service singleton (useful for testing or mode switching)
 */
export function resetTransactionFinderService() {
  if (serviceInstance) {
    serviceInstance.stop();
    serviceInstance = null;
  }
}

export default TransactionFinderService;
