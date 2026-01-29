/**
 * Transaction Finder Service
 *
 * Provides address monitoring and UTXO discovery for wallet funding flows.
 * Uses event-based pattern for real-time transaction detection.
 *
 * Two discovery paths supported:
 * - Path A (Historic): findUTXOs() scans blockchain for existing UTXOs
 * - Path B (On-demand): monitorAddress() watches for incoming transactions in real-time
 *
 * Events emitted:
 * - scan-progress: Progress during historic UTXO scanning
 * - transaction-detected: New transaction found (on-demand mode)
 * - instantlock-received: InstantSend lock confirmed
 * - chainlock-received: ChainLock confirmed
 */

import { EventEmitter } from 'events';

class TransactionFinderService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.network = options.network || 'testnet';
    this.useMockMode = options.useMockMode ?? true; // Default to mock mode for demo
    this.monitoring = false;
    this.monitoredAddress = null;
    this._monitoringTimers = [];
  }

  /**
   * Monitor an address for incoming transactions (Path B: On-demand)
   *
   * Emits events in sequence:
   * 1. transaction-detected - When TX arrives at address
   * 2. instantlock-received - When InstantSend lock is confirmed (~1-2s)
   * 3. chainlock-received - When ChainLock is confirmed (~2-5s)
   *
   * @param {string} address - Address to monitor
   * @param {object} options - Monitoring options
   * @returns {Promise<Function>} Cleanup function
   */
  async monitorAddress(address, options = {}) {
    this.monitoring = true;
    this.monitoredAddress = address;
    this._monitoringTimers = [];

    console.log('funding-status: monitoring started for', address);

    if (this.useMockMode) {
      // Mock mode: Simulate transaction detection and confirmation flow
      await this._simulateMockOnDemandFlow(address, options);
    } else {
      // Real mode: Would connect to DAPI for transaction monitoring
      // This would use bloom filters and transaction streaming
      console.log('Real network monitoring not yet implemented');
    }

    // Return cleanup function
    return () => {
      this.stop();
    };
  }

  /**
   * Simulate the on-demand transaction monitoring flow (mock mode)
   * @private
   */
  async _simulateMockOnDemandFlow(address, options) {
    const mockTxId = this._generateMockTxId();
    const mockBalance = 5000000; // 0.05 DASH in duffs
    const txDetectedAt = Date.now();

    // Step 1: Transaction detected (3-6 seconds after monitoring starts)
    const txDelay = 3000 + Math.random() * 3000;
    const txTimer = setTimeout(() => {
      if (!this.monitoring) return;

      const txData = {
        txid: mockTxId,
        address: address,
        outputs: [{ satoshis: mockBalance, address: address }],
        timestamp: Date.now(),
      };

      console.log('funding-status: transaction detected', mockTxId.substring(0, 16));
      this.emit('transaction-detected', txData);
    }, txDelay);
    this._monitoringTimers.push(txTimer);

    // Step 2: InstantLock received (1-2 seconds after TX detection)
    const isDelay = txDelay + 1000 + Math.random() * 1000;
    const isTimer = setTimeout(() => {
      if (!this.monitoring) return;

      const instantLockData = {
        txid: mockTxId,
        timestamp: Date.now(),
        latency: Date.now() - txDetectedAt - txDelay, // Time since TX was detected
        signature: this._generateMockSignature(),
      };

      console.log('funding-status: instantlock received', `${(instantLockData.latency / 1000).toFixed(1)}s`);
      this.emit('instantlock-received', instantLockData);
    }, isDelay);
    this._monitoringTimers.push(isTimer);

    // Step 3: ChainLock received (2-5 seconds after TX detection)
    // In real network, ChainLock takes ~2.5 minutes, but we simulate faster for UX
    const clDelay = txDelay + 2000 + Math.random() * 3000;
    const clTimer = setTimeout(() => {
      if (!this.monitoring) return;

      const chainLockData = {
        txid: mockTxId,
        timestamp: Date.now(),
        blockHeight: 920000 + Math.floor(Math.random() * 100),
        blockHash: this._generateMockBlockHash(),
        signature: this._generateMockSignature(),
      };

      console.log('funding-status: chainlock received at block', chainLockData.blockHeight);
      this.emit('chainlock-received', chainLockData);
    }, clDelay);
    this._monitoringTimers.push(clTimer);
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.monitoring = false;
    this.monitoredAddress = null;

    // Clear all pending timers
    for (const timer of this._monitoringTimers) {
      clearTimeout(timer);
    }
    this._monitoringTimers = [];

    console.log('funding-status: monitoring stopped');
  }

  /**
   * Find UTXOs for addresses (Path A: Historic discovery)
   *
   * Scans the blockchain for existing UTXOs at given addresses.
   * Emits scan-progress events during the scan.
   *
   * @param {string|string[]} addresses - Address(es) to query
   * @param {object} options - Scan options
   * @param {string} options.timeframe - 'hour' | 'day' | 'week'
   * @param {Function} options.onProgress - Progress callback (deprecated, use events)
   * @returns {Promise<Array>} Array of UTXOs
   */
  async findUTXOs(addresses, options = {}) {
    const addressList = Array.isArray(addresses) ? addresses : [addresses];
    const timeframe = options.timeframe || 'hour';

    console.log('funding-status: starting UTXO scan for', addressList.length, 'addresses', `(${timeframe})`);

    if (this.useMockMode) {
      return await this._simulateMockHistoricScan(addressList, timeframe);
    } else {
      // Real mode: Would query DAPI for UTXOs
      console.log('Real network UTXO discovery not yet implemented');
      return [];
    }
  }

  /**
   * Simulate historic UTXO scanning (mock mode)
   * @private
   */
  async _simulateMockHistoricScan(addresses, timeframe) {
    const blocksToScan = {
      hour: 60,
      day: 576,
      week: 4032,
    };
    const totalBlocks = blocksToScan[timeframe] || 60;

    // Simulate scanning progress
    const progressSteps = 10;
    const stepDelay = (timeframe === 'hour' ? 200 : timeframe === 'day' ? 300 : 400);

    for (let i = 0; i <= progressSteps; i++) {
      if (!this.monitoring && i > 0) break; // Allow initial emit even if not "monitoring"

      const progress = Math.round((i / progressSteps) * 100);
      const syncedBlocks = Math.round((i / progressSteps) * totalBlocks);

      this.emit('scan-progress', {
        progress,
        syncedBlocks,
        totalBlocks,
      });

      if (i < progressSteps) {
        await this._delay(stepDelay);
      }
    }

    // Generate mock UTXOs (always return funds in mock mode for testing)
    const mockUTXOs = this._generateMockUTXOs(addresses[0]);

    console.log('funding-status: scan complete, found', mockUTXOs.length, 'UTXOs');
    return mockUTXOs;
  }

  /**
   * Generate mock UTXOs for testing
   * @private
   */
  _generateMockUTXOs(address) {
    return [
      {
        txid: this._generateMockTxId(),
        vout: 0,
        address: address,
        satoshis: 5000000, // 0.05 DASH
        script: '76a914' + '00'.repeat(20) + '88ac', // P2PKH placeholder
        confirmations: 6,
        height: 920000,
        isChainLocked: true,
      },
    ];
  }

  /**
   * Calculate total balance from UTXOs
   * @param {Array} utxos - Array of UTXOs
   * @returns {number} Total balance in satoshis/duffs
   */
  calculateBalance(utxos) {
    return utxos.reduce((sum, utxo) => sum + (utxo.satoshis || 0), 0);
  }

  /**
   * Generate a mock transaction ID
   * @private
   */
  _generateMockTxId() {
    const chars = '0123456789abcdef';
    let txid = '';
    for (let i = 0; i < 64; i++) {
      txid += chars[Math.floor(Math.random() * chars.length)];
    }
    return txid;
  }

  /**
   * Generate a mock block hash
   * @private
   */
  _generateMockBlockHash() {
    return '00000000' + this._generateMockTxId().substring(8);
  }

  /**
   * Generate a mock signature (BLS signature placeholder)
   * @private
   */
  _generateMockSignature() {
    const chars = '0123456789abcdef';
    let sig = '';
    for (let i = 0; i < 96; i++) {
      sig += chars[Math.floor(Math.random() * chars.length)];
    }
    return sig;
  }

  /**
   * Helper to delay execution
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let serviceInstance = null;

/**
 * Get or create the transaction finder service
 * @param {object} options - Service options
 * @param {boolean} options.useMockMode - Use mock mode (default: true for demo)
 * @param {string} options.network - Network to use (default: 'testnet')
 * @param {boolean} options.forceNew - Force create a new instance
 * @returns {TransactionFinderService}
 */
export function getTransactionFinderService(options = {}) {
  if (!serviceInstance || options.forceNew) {
    serviceInstance = new TransactionFinderService(options);
  } else {
    // Update options on existing instance
    if (options.useMockMode !== undefined) {
      serviceInstance.useMockMode = options.useMockMode;
    }
    if (options.network) {
      serviceInstance.network = options.network;
    }
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetTransactionFinderService() {
  if (serviceInstance) {
    serviceInstance.stop();
    serviceInstance.removeAllListeners();
  }
  serviceInstance = null;
}

export { TransactionFinderService };
