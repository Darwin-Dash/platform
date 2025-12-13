/**
 * Unit tests for TransactionFinderService
 * Tests mock mode functionality and service API
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TransactionFinderService,
  getTransactionFinderService,
  resetTransactionFinderService
} from '../../services/transaction-finder-service.js';

describe('TransactionFinderService', () => {
  let service;

  beforeEach(() => {
    resetTransactionFinderService();
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    resetTransactionFinderService();
  });

  describe('Constructor', () => {
    it('creates service with default options', () => {
      service = new TransactionFinderService();
      expect(service.useMockMode).toBe(false);
      expect(service.network).toBe('testnet');
      expect(service.isInitialized).toBe(false);
    });

    it('creates service with mock mode enabled', () => {
      service = new TransactionFinderService({ useMockMode: true });
      expect(service.useMockMode).toBe(true);
    });

    it('creates service with custom network', () => {
      service = new TransactionFinderService({ network: 'mainnet' });
      expect(service.network).toBe('mainnet');
    });
  });

  describe('Singleton Factory', () => {
    it('returns same instance on multiple calls', () => {
      const instance1 = getTransactionFinderService({ useMockMode: true });
      const instance2 = getTransactionFinderService();
      expect(instance1).toBe(instance2);
    });

    it('resets instance properly', () => {
      const instance1 = getTransactionFinderService({ useMockMode: true });
      resetTransactionFinderService();
      const instance2 = getTransactionFinderService({ useMockMode: false });
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Mock Mode - Block Height', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('returns mock block height', async () => {
      const height = await service.getCurrentBlockHeight();
      expect(height).toBe(920000);
    });

    it('calculates correct fromHeight for hour timeframe', async () => {
      const fromHeight = await service.calculateFromHeight('hour');
      expect(920000 - fromHeight).toBe(60);
    });

    it('calculates correct fromHeight for day timeframe', async () => {
      const fromHeight = await service.calculateFromHeight('day');
      expect(920000 - fromHeight).toBe(576);
    });

    it('calculates correct fromHeight for week timeframe', async () => {
      const fromHeight = await service.calculateFromHeight('week');
      expect(920000 - fromHeight).toBe(4032);
    });

    it('defaults to hour for unknown timeframe', async () => {
      const fromHeight = await service.calculateFromHeight('unknown');
      expect(920000 - fromHeight).toBe(60);
    });
  });

  describe('Mock Mode - findUTXOs', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('returns mock UTXOs with progress events', async () => {
      const progressEvents = [];

      service.on('scan-progress', (p) => progressEvents.push(p));
      const utxos = await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });

      expect(utxos).toHaveLength(1);
      expect(utxos[0].satoshis).toBeGreaterThan(0);
      expect(utxos[0].address).toBe('yTestAddr123');
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].progress).toBe(100);
    });

    it('emits scan-complete event', async () => {
      const completeEvents = [];
      service.on('scan-complete', (e) => completeEvents.push(e));

      await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });

      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].count).toBe(1);
    });

    it('returns empty array when __MOCK_EMPTY_UTXOS__ is set', async () => {
      // Set the global flag
      globalThis.window = { __MOCK_EMPTY_UTXOS__: true };

      const utxos = await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });

      expect(utxos).toHaveLength(0);

      // Clean up
      delete globalThis.window;
    });

    it('calls onProgress callback', async () => {
      const progressCalls = [];

      await service.findUTXOs(['yTestAddr123'], {
        timeframe: 'hour',
        onProgress: (p) => progressCalls.push(p)
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Mock Mode - monitorAddress', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('emits transaction → instantlock → chainlock sequence', async () => {
      const events = [];

      const cleanup = await service.monitorAddress('yTestAddr123', {
        onTransaction: (tx) => events.push({ type: 'tx', ...tx }),
        onInstantLock: (lock) => events.push({ type: 'is', ...lock }),
        onChainLock: (cl) => events.push({ type: 'cl', ...cl }),
      });

      // Wait for mock events (5-10s tx + 1-2s IS + 2s CL = ~15s max)
      await new Promise(r => setTimeout(r, 16000));
      cleanup();

      const txEvent = events.find(e => e.type === 'tx');
      const isEvent = events.find(e => e.type === 'is');
      const clEvent = events.find(e => e.type === 'cl');

      expect(txEvent).toBeDefined();
      expect(isEvent).toBeDefined();
      expect(clEvent).toBeDefined();
      expect(txEvent.txid).toBeDefined();
      expect(isEvent.txid).toBe(txEvent.txid);
      expect(clEvent.txid).toBe(txEvent.txid);
    }, 20000);

    it('returns cleanup function', async () => {
      const cleanup = await service.monitorAddress('yTestAddr123', {});
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('sets isMonitoring to true', async () => {
      expect(service.isMonitoring()).toBe(false);
      await service.monitorAddress('yTestAddr123', {});
      expect(service.isMonitoring()).toBe(true);
      service.stop();
      expect(service.isMonitoring()).toBe(false);
    });
  });

  describe('Mock Mode - waitForConfirmation', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('returns confirmation result with InstantLock only', async () => {
      // Start monitoring first (required for waitForConfirmation)
      await service.monitorAddress('yTestAddr123', {});

      const result = await service._mockWaitForConfirmation('test_txid_123', {
        requireChainLock: false
      });

      expect(result.txid).toBe('test_txid_123');
      expect(result.method).toBe('instantlock');
      expect(result.instantLockTime).toBeDefined();
      expect(result.totalLatencyMs).toBeGreaterThan(0);
    });

    it('returns confirmation result with ChainLock', async () => {
      await service.monitorAddress('yTestAddr123', {});

      const result = await service._mockWaitForConfirmation('test_txid_123', {
        requireChainLock: true
      });

      expect(result.txid).toBe('test_txid_123');
      expect(result.method).toBe('chainlock');
      expect(result.chainLockTime).toBeDefined();
    });

    it('emits confirmation-progress events', async () => {
      await service.monitorAddress('yTestAddr123', {});
      const progressEvents = [];

      await service._mockWaitForConfirmation('test_txid_123', {
        requireChainLock: true,
        onProgress: (status) => progressEvents.push(status)
      });

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.status === 'instantlocked')).toBe(true);
      expect(progressEvents.some(e => e.status === 'chainlocked')).toBe(true);
    });
  });

  describe('Balance Utilities', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('calculates balance from UTXOs', () => {
      const utxos = [
        { satoshis: 1000000 },
        { satoshis: 2000000 },
        { satoshis: 500000 }
      ];
      expect(service.calculateBalance(utxos)).toBe(3500000);
    });

    it('handles empty UTXO array', () => {
      expect(service.calculateBalance([])).toBe(0);
    });

    it('formats balance correctly', () => {
      expect(service.formatBalance(100000000)).toBe('1.0000 DASH');
      expect(service.formatBalance(50000000)).toBe('0.5000 DASH');
      expect(service.formatBalance(1234567)).toBe('0.0123 DASH');
    });

    it('validates minimum balance', () => {
      const result = service.validateBalance(50000); // Below minimum
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Minimum');
    });

    it('validates recommended balance', () => {
      const result = service.validateBalance(500000); // Above min, below recommended
      expect(result.valid).toBe(true);
      expect(result.message).toContain('below recommended');
    });

    it('validates sufficient balance', () => {
      const result = service.validateBalance(2000000); // Above recommended
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Balance sufficient');
    });
  });

  describe('Estimated Sync Time', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('returns correct estimates', () => {
      expect(service.getEstimatedSyncTime('hour')).toBe('10-30 seconds');
      expect(service.getEstimatedSyncTime('day')).toBe('1-2 minutes');
      expect(service.getEstimatedSyncTime('week')).toBe('3-5 minutes');
      expect(service.getEstimatedSyncTime('unknown')).toBe('10-30 seconds');
    });
  });

  describe('Service Lifecycle', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('stops monitoring and emits stopped event', async () => {
      const stoppedEvents = [];
      service.on('stopped', () => stoppedEvents.push(true));

      await service.monitorAddress('yTestAddr123', {});
      expect(service.isMonitoring()).toBe(true);

      service.stop();

      expect(service.isMonitoring()).toBe(false);
      expect(stoppedEvents).toHaveLength(1);
    });

    it('can be restarted after stop', async () => {
      await service.monitorAddress('yTestAddr123', {});
      service.stop();
      expect(service.isMonitoring()).toBe(false);

      await service.monitorAddress('yTestAddr456', {});
      expect(service.isMonitoring()).toBe(true);
    });
  });
});
