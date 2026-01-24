/**
 * HybridFinder Unit Tests
 *
 * Tests for the HybridFinder class which coordinates historic scanning
 * and realtime monitoring by delegating to HistoricFinder and RealtimeFinder.
 *
 * Test Coverage:
 * 1. Initialization and configuration
 * 2. syncAndMonitor() - Full hybrid operation
 * 3. findUTXOs() - Historic scan only
 * 4. findLatestSpendableUTXO() - Single UTXO selection
 * 5. monitorAddresses() - Realtime monitoring only
 * 6. Event forwarding from child finders
 * 7. Delegation methods (waitForConfirmation, getTransaction, etc.)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridFinder } from '../../../src/finders/HybridFinder.js';
import { HistoricFinder } from '../../../src/finders/HistoricFinder.js';
import { RealtimeFinder } from '../../../src/finders/RealtimeFinder.js';
import { FinderMode } from '../../../src/types/index.js';
import { ControllableMockDAPIClient } from '../../helpers/ControllableMockDAPIClient.js';
import { TEST_ADDRESSES } from '../../helpers/test-fixtures.js';

// Mock the child finders
vi.mock('../../../src/finders/HistoricFinder.js');
vi.mock('../../../src/finders/RealtimeFinder.js');

describe('HybridFinder', () => {
  let mockDAPIClient: ControllableMockDAPIClient;
  let mockHistoricFinder: any;
  let mockRealtimeFinder: any;

  const baseConfig = {
    mode: FinderMode.HYBRID,
    network: 'testnet',
    addresses: [TEST_ADDRESSES.address1],
    historic: {
      fromHeight: 1000,
      toHeight: 2000,
    },
    realtime: {
      autoPruneOnConfirmation: true,
      maxTrackedTransactions: 500,
    },
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock DAPI client
    mockDAPIClient = new ControllableMockDAPIClient();

    // Create mock historic finder
    mockHistoricFinder = {
      findUTXOs: vi.fn().mockResolvedValue([]),
      findLatestSpendableUTXO: vi.fn().mockResolvedValue(null),
      getNetwork: vi.fn().mockReturnValue('testnet'),
      on: vi.fn(),
      emit: vi.fn(),
    };

    // Create mock realtime finder
    mockRealtimeFinder = {
      monitorAddresses: vi.fn().mockResolvedValue(() => {}),
      waitForConfirmation: vi.fn().mockResolvedValue({}),
      getTransaction: vi.fn().mockReturnValue(null),
      clearTransaction: vi.fn(),
      clearAllConfirmed: vi.fn(),
      getStatus: vi.fn().mockReturnValue({
        active: false,
        trackedTransactions: 0,
        chainLockHeight: 0,
      }),
      stop: vi.fn(),
      getNetwork: vi.fn().mockReturnValue('testnet'),
      on: vi.fn(),
      emit: vi.fn(),
    };

    // Mock constructor returns
    (HistoricFinder as any).mockImplementation(() => mockHistoricFinder);
    (RealtimeFinder as any).mockImplementation(() => mockRealtimeFinder);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Initialization', () => {
    it('should create HistoricFinder with correct config', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      expect(HistoricFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: FinderMode.HISTORIC,
          network: 'testnet',
          addresses: [TEST_ADDRESSES.address1],
          dapiClient: mockDAPIClient,
          fromHeight: 1000,
          toHeight: 2000,
        })
      );
    });

    it('should create RealtimeFinder with correct config', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      expect(RealtimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [TEST_ADDRESSES.address1],
          dapiClient: mockDAPIClient,
          autoPruneOnConfirmation: true,
          maxTrackedTransactions: 500,
        })
      );
    });

    it('should merge shared config with finder-specific config', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
        timeout: 30000,
        retries: 5,
        bloomFalsePositiveRate: 0.001,
      });

      // Both finders should receive shared config
      expect(HistoricFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
          retries: 5,
          bloomFalsePositiveRate: 0.001,
        })
      );

      expect(RealtimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
          retries: 5,
          bloomFalsePositiveRate: 0.001,
        })
      );
    });

    it('should set up event forwarding from child finders', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      // Historic finder events should be forwarded
      expect(mockHistoricFinder.on).toHaveBeenCalledWith('start', expect.any(Function));
      expect(mockHistoricFinder.on).toHaveBeenCalledWith('step', expect.any(Function));
      expect(mockHistoricFinder.on).toHaveBeenCalledWith('progress', expect.any(Function));
      expect(mockHistoricFinder.on).toHaveBeenCalledWith('found', expect.any(Function));
      expect(mockHistoricFinder.on).toHaveBeenCalledWith('error', expect.any(Function));

      // Realtime finder events should be forwarded
      expect(mockRealtimeFinder.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should initialize with monitoring inactive', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const status = finder.getStatus();
      expect(status.monitoring).toBe(false);
    });
  });

  describe('2. syncAndMonitor() - Full Hybrid Operation', () => {
    it('should perform historic scan followed by realtime monitoring', async () => {
      const mockUTXOs = [
        {
          txid: 'tx1',
          outputIndex: 0,
          address: TEST_ADDRESSES.address1,
          satoshis: 100000,
          height: 1500,
        },
      ];

      mockHistoricFinder.findUTXOs.mockResolvedValue(mockUTXOs);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const callbacks = {
        onTransaction: vi.fn(),
        onInstantLock: vi.fn(),
      };

      const result = await finder.syncAndMonitor(callbacks);

      // Should run historic scan first
      expect(mockHistoricFinder.findUTXOs).toHaveBeenCalled();

      // Should start realtime monitoring after historic scan
      expect(mockRealtimeFinder.monitorAddresses).toHaveBeenCalledWith(
        [TEST_ADDRESSES.address1],
        callbacks
      );

      // Should return UTXOs and cleanup function
      expect(result.utxos).toEqual(mockUTXOs);
      expect(typeof result.stopMonitoring).toBe('function');
    });

    it('should emit phase events during hybrid operation', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const phaseEvents: any[] = [];
      finder.on('phase', (data) => phaseEvents.push(data));

      await finder.syncAndMonitor();

      // Should emit events for both phases
      expect(phaseEvents).toContainEqual({
        phase: 'historic',
        status: 'starting',
      });
      expect(phaseEvents).toContainEqual(
        expect.objectContaining({
          phase: 'historic',
          status: 'completed',
        })
      );
      expect(phaseEvents).toContainEqual({
        phase: 'realtime',
        status: 'starting',
      });
      expect(phaseEvents).toContainEqual({
        phase: 'realtime',
        status: 'active',
      });
    });

    it('should update monitoring state when monitoring starts', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      expect(finder.getStatus().monitoring).toBe(false);

      await finder.syncAndMonitor();

      expect(finder.getStatus().monitoring).toBe(true);
    });

    it('should allow monitoring to be stopped via cleanup function', async () => {
      const mockStopFn = vi.fn();
      mockRealtimeFinder.monitorAddresses.mockResolvedValue(mockStopFn);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const { stopMonitoring } = await finder.syncAndMonitor();

      expect(finder.getStatus().monitoring).toBe(true);

      stopMonitoring();

      expect(mockStopFn).toHaveBeenCalled();
      expect(finder.getStatus().monitoring).toBe(false);
    });

    it('should emit stopped event when monitoring stops', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const phaseEvents: any[] = [];
      finder.on('phase', (data) => phaseEvents.push(data));

      const { stopMonitoring } = await finder.syncAndMonitor();
      stopMonitoring();

      expect(phaseEvents).toContainEqual({
        phase: 'realtime',
        status: 'stopped',
      });
    });

    it('should work with empty callbacks', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const result = await finder.syncAndMonitor();

      // Should still call monitorAddresses with empty object
      expect(mockRealtimeFinder.monitorAddresses).toHaveBeenCalledWith(
        [TEST_ADDRESSES.address1],
        {}
      );
    });
  });

  describe('3. findUTXOs() - Historic Scan Only', () => {
    it('should delegate to HistoricFinder.findUTXOs()', async () => {
      const mockUTXOs = [
        {
          txid: 'tx1',
          outputIndex: 0,
          address: TEST_ADDRESSES.address1,
          satoshis: 100000,
          height: 1500,
        },
        {
          txid: 'tx2',
          outputIndex: 1,
          address: TEST_ADDRESSES.address1,
          satoshis: 200000,
          height: 1600,
        },
      ];

      mockHistoricFinder.findUTXOs.mockResolvedValue(mockUTXOs);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const result = await finder.findUTXOs();

      expect(mockHistoricFinder.findUTXOs).toHaveBeenCalled();
      expect(result).toEqual(mockUTXOs);
    });

    it('should not start realtime monitoring', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      await finder.findUTXOs();

      expect(mockRealtimeFinder.monitorAddresses).not.toHaveBeenCalled();
      expect(finder.getStatus().monitoring).toBe(false);
    });

    it('should return empty array when no UTXOs found', async () => {
      mockHistoricFinder.findUTXOs.mockResolvedValue([]);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const result = await finder.findUTXOs();

      expect(result).toEqual([]);
    });
  });

  describe('4. findLatestSpendableUTXO() - Single UTXO Selection', () => {
    it('should delegate to HistoricFinder.findLatestSpendableUTXO()', async () => {
      const mockUTXO = {
        txid: 'latest-tx',
        outputIndex: 0,
        address: TEST_ADDRESSES.address1,
        satoshis: 500000,
        height: 1900,
      };

      mockHistoricFinder.findLatestSpendableUTXO.mockResolvedValue(mockUTXO);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const result = await finder.findLatestSpendableUTXO();

      expect(mockHistoricFinder.findLatestSpendableUTXO).toHaveBeenCalled();
      expect(result).toEqual(mockUTXO);
    });

    it('should not start realtime monitoring', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      await finder.findLatestSpendableUTXO();

      expect(mockRealtimeFinder.monitorAddresses).not.toHaveBeenCalled();
      expect(finder.getStatus().monitoring).toBe(false);
    });
  });

  describe('5. monitorAddresses() - Realtime Monitoring Only', () => {
    it('should start realtime monitoring without historic scan', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const callbacks = {
        onTransaction: vi.fn(),
        onInstantLock: vi.fn(),
      };

      await finder.monitorAddresses(callbacks);

      // Should call realtime monitor
      expect(mockRealtimeFinder.monitorAddresses).toHaveBeenCalledWith(
        [TEST_ADDRESSES.address1],
        callbacks
      );

      // Should NOT call historic finder
      expect(mockHistoricFinder.findUTXOs).not.toHaveBeenCalled();
    });

    it('should update monitoring state', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      expect(finder.getStatus().monitoring).toBe(false);

      await finder.monitorAddresses({});

      expect(finder.getStatus().monitoring).toBe(true);
    });

    it('should return cleanup function', async () => {
      const mockStopFn = vi.fn();
      mockRealtimeFinder.monitorAddresses.mockResolvedValue(mockStopFn);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const stopMonitoring = await finder.monitorAddresses({});

      expect(typeof stopMonitoring).toBe('function');

      stopMonitoring();

      expect(mockStopFn).toHaveBeenCalled();
      expect(finder.getStatus().monitoring).toBe(false);
    });
  });

  describe('6. Event Forwarding', () => {
    it('should forward historic:start event', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const listener = vi.fn();
      finder.on('historic:start', listener);

      // Get the registered handler and call it
      const startHandler = mockHistoricFinder.on.mock.calls.find(
        (call: any) => call[0] === 'start'
      )?.[1];

      const testData = { addressCount: 5, fromHeight: 1000 };
      startHandler?.(testData);

      expect(listener).toHaveBeenCalledWith(testData);
    });

    it('should forward historic:step event', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const listener = vi.fn();
      finder.on('historic:step', listener);

      const stepHandler = mockHistoricFinder.on.mock.calls.find(
        (call: any) => call[0] === 'step'
      )?.[1];

      const testData = { step: 'building-bloom-filter' };
      stepHandler?.(testData);

      expect(listener).toHaveBeenCalledWith(testData);
    });

    it('should forward historic:progress event', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const listener = vi.fn();
      finder.on('historic:progress', listener);

      const progressHandler = mockHistoricFinder.on.mock.calls.find(
        (call: any) => call[0] === 'progress'
      )?.[1];

      const testData = {
        processedBlocks: 100,
        totalBlocks: 1000,
        currentHeight: 1100,
      };
      progressHandler?.(testData);

      expect(listener).toHaveBeenCalledWith(testData);
    });

    it('should forward historic:found event', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const listener = vi.fn();
      finder.on('historic:found', listener);

      const foundHandler = mockHistoricFinder.on.mock.calls.find(
        (call: any) => call[0] === 'found'
      )?.[1];

      const testData = { utxos: [], totalUTXOs: 5 };
      foundHandler?.(testData);

      expect(listener).toHaveBeenCalledWith(testData);
    });

    it('should forward historic:error event', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const listener = vi.fn();
      finder.on('historic:error', listener);

      const errorHandler = mockHistoricFinder.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];

      const testError = new Error('Historic sync failed');
      errorHandler?.(testError);

      expect(listener).toHaveBeenCalledWith(testError);
    });

    it('should forward realtime:error event', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const listener = vi.fn();
      finder.on('realtime:error', listener);

      const errorHandler = mockRealtimeFinder.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];

      const testError = new Error('Stream failed');
      errorHandler?.(testError);

      expect(listener).toHaveBeenCalledWith(testError);
    });
  });

  describe('7. Delegation Methods', () => {
    it('should delegate waitForConfirmation to RealtimeFinder', async () => {
      const mockResult = {
        txid: 'test-tx',
        method: 'instantlock',
        instantLockTime: 123456,
        chainLockTime: null,
        blockHeight: 1500,
        totalLatencyMs: 2000,
      };

      mockRealtimeFinder.waitForConfirmation.mockResolvedValue(mockResult);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const result = await finder.waitForConfirmation('test-tx', {
        requireInstantLock: true,
        timeout: 60000,
      });

      expect(mockRealtimeFinder.waitForConfirmation).toHaveBeenCalledWith('test-tx', {
        requireInstantLock: true,
        timeout: 60000,
      });
      expect(result).toEqual(mockResult);
    });

    it('should delegate getTransaction to RealtimeFinder', () => {
      const mockTransaction = {
        txid: 'test-tx',
        broadcastTime: 123456,
        instantLockTime: 123458,
        blockHeight: 1500,
        blockHash: 'block-hash',
        chainLockTime: null,
        chainLockBlockHeight: null,
        status: 'instantlocked',
      };

      mockRealtimeFinder.getTransaction.mockReturnValue(mockTransaction);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const result = finder.getTransaction('test-tx');

      expect(mockRealtimeFinder.getTransaction).toHaveBeenCalledWith('test-tx');
      expect(result).toEqual(mockTransaction);
    });

    it('should delegate clearTransaction to RealtimeFinder', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      finder.clearTransaction('test-tx');

      expect(mockRealtimeFinder.clearTransaction).toHaveBeenCalledWith('test-tx');
    });

    it('should delegate clearAllConfirmed to RealtimeFinder', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      finder.clearAllConfirmed();

      expect(mockRealtimeFinder.clearAllConfirmed).toHaveBeenCalled();
    });

    it('should combine status from monitoring state and realtime finder', () => {
      mockRealtimeFinder.getStatus.mockReturnValue({
        active: true,
        trackedTransactions: 5,
        chainLockHeight: 1500,
      });

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      // Start monitoring
      (finder as any).isMonitoring = true;

      const status = finder.getStatus();

      expect(status.monitoring).toBe(true);
      expect(status.realtimeStatus).toEqual({
        active: true,
        trackedTransactions: 5,
        chainLockHeight: 1500,
      });
    });

    it('should stop realtime monitoring via stop()', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      // Simulate active monitoring
      (finder as any).isMonitoring = true;

      finder.stop();

      expect(mockRealtimeFinder.stop).toHaveBeenCalled();
      expect(finder.getStatus().monitoring).toBe(false);
    });

    it('should not call realtime stop if not monitoring', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      expect(finder.getStatus().monitoring).toBe(false);

      finder.stop();

      // Stop should still be called, but monitoring was already false
      expect(mockRealtimeFinder.stop).not.toHaveBeenCalled();
    });

    it('should return network from config', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
        network: 'mainnet',
      });

      expect(finder.getNetwork()).toBe('mainnet');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle historic scan error during syncAndMonitor', async () => {
      const testError = new Error('Sync failed');
      mockHistoricFinder.findUTXOs.mockRejectedValue(testError);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      await expect(finder.syncAndMonitor()).rejects.toThrow('Sync failed');

      // Should not start realtime monitoring if historic scan fails
      expect(mockRealtimeFinder.monitorAddresses).not.toHaveBeenCalled();
    });

    it('should handle realtime monitoring startup error during syncAndMonitor', async () => {
      mockHistoricFinder.findUTXOs.mockResolvedValue([]);
      mockRealtimeFinder.monitorAddresses.mockRejectedValue(
        new Error('Stream failed')
      );

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      await expect(finder.syncAndMonitor()).rejects.toThrow('Stream failed');
    });

    it('should handle multiple addresses in config', async () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
        addresses: [TEST_ADDRESSES.address1, TEST_ADDRESSES.address2],
      });

      await finder.monitorAddresses({});

      expect(mockRealtimeFinder.monitorAddresses).toHaveBeenCalledWith(
        [TEST_ADDRESSES.address1, TEST_ADDRESSES.address2],
        {}
      );
    });

    it('should allow calling stop() multiple times', () => {
      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      (finder as any).isMonitoring = true;

      finder.stop();
      finder.stop();
      finder.stop();

      // Should only call realtime stop once (first time)
      expect(mockRealtimeFinder.stop).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup function being called multiple times', async () => {
      const mockStopFn = vi.fn();
      mockRealtimeFinder.monitorAddresses.mockResolvedValue(mockStopFn);

      const finder = new HybridFinder({
        ...baseConfig,
        dapiClient: mockDAPIClient,
      });

      const { stopMonitoring } = await finder.syncAndMonitor();

      stopMonitoring();
      stopMonitoring();
      stopMonitoring();

      // Mock stop function should be called each time
      expect(mockStopFn).toHaveBeenCalledTimes(3);
      // But monitoring state should remain false after first stop
      expect(finder.getStatus().monitoring).toBe(false);
    });
  });
});
