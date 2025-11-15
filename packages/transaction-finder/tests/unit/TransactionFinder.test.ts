/**
 * Unit tests for TransactionFinder (main facade)
 * Tests factory pattern and mode-based delegation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionFinder } from '../../src/TransactionFinder.js';
import { FinderMode } from '../../src/types/index.js';
import { TESTNET_ADDRESSES } from '../fixtures/addresses.js';

// Mock DAPI client
const createMockDapiClient = () => ({
  core: {
    getBestBlockHeight: vi.fn().mockResolvedValue(1000),
    getBlockchainStatus: vi.fn().mockResolvedValue({
      chain: { blocksCount: 1000 },
    }),
    subscribeToTransactionsWithProofs: vi.fn().mockReturnValue({
      on: vi.fn(),
      cancel: vi.fn(),
    }),
    subscribeToBlockHeadersWithChainLocks: vi.fn().mockReturnValue({
      on: vi.fn(),
    }),
  },
  platform: {
    getEpochsInfo: vi.fn().mockResolvedValue({
      getMetadata: () => ({
        getCoreChainLockedHeight: () => 100,
      }),
    }),
  },
});

describe('TransactionFinder', () => {
  describe('Factory Pattern', () => {
    it('should create HistoricFinder when mode is HISTORIC', () => {
      const finder = new TransactionFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
        fromHeight: 1,
      });

      expect(finder.getMode()).toBe(FinderMode.HISTORIC);
      expect(finder.getNetwork()).toBe('testnet');
    });

    it('should create RealtimeFinder when mode is REALTIME', () => {
      const finder = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
      });

      expect(finder.getMode()).toBe(FinderMode.REALTIME);
      expect(finder.getNetwork()).toBe('testnet');
    });

    it('should create HybridFinder when mode is HYBRID', () => {
      const finder = new TransactionFinder({
        mode: FinderMode.HYBRID,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
        historic: { fromHeight: 1 },
        realtime: {},
      });

      expect(finder.getMode()).toBe(FinderMode.HYBRID);
      expect(finder.getNetwork()).toBe('testnet');
    });

    it('should throw error for invalid mode', () => {
      expect(() => {
        new TransactionFinder({
          mode: 'invalid' as any,
          network: 'testnet',
          addresses: [TESTNET_ADDRESSES.address1],
          dapiClient: createMockDapiClient(),
        } as any);
      }).toThrow('Invalid finder mode');
    });
  });

  describe('Method Routing - Historic Mode', () => {
    let finder: TransactionFinder;

    beforeEach(() => {
      finder = new TransactionFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
        fromHeight: 1,
      });
    });

    it('should throw error when calling realtime-only methods', () => {
      expect(() => finder.getTransaction('txid')).toThrow(
        /only available in REALTIME or HYBRID mode/
      );

      expect(() => finder.clearTransaction('txid')).toThrow(
        /only available in REALTIME or HYBRID mode/
      );

      expect(() => finder.clearAllConfirmed()).toThrow(
        /only available in REALTIME or HYBRID mode/
      );
    });

    it('should throw error when calling hybrid-only methods', async () => {
      await expect(async () => await finder.syncAndMonitor()).rejects.toThrow(
        /only available in HYBRID mode/
      );
    });
  });

  describe('Method Routing - Realtime Mode', () => {
    let finder: TransactionFinder;

    beforeEach(() => {
      finder = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
      });
    });

    it('should throw error when calling historic-only methods', async () => {
      await expect(async () => await finder.findUTXOs()).rejects.toThrow(
        /only available in HISTORIC or HYBRID mode/
      );

      await expect(async () => await finder.findLatestSpendableUTXO()).rejects.toThrow(
        /only available in HISTORIC or HYBRID mode/
      );
    });

    it('should throw error when calling hybrid-only methods', async () => {
      await expect(async () => await finder.syncAndMonitor()).rejects.toThrow(
        /only available in HYBRID mode/
      );
    });
  });

  describe('Method Routing - Hybrid Mode', () => {
    let finder: TransactionFinder;

    beforeEach(() => {
      finder = new TransactionFinder({
        mode: FinderMode.HYBRID,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
        historic: { fromHeight: 1 },
        realtime: {},
      });
    });

    it('should have access to all methods in hybrid mode', () => {
      // Should not throw for any mode-specific method
      expect(() => finder.getMode()).not.toThrow();
      expect(() => finder.getNetwork()).not.toThrow();

      // These will be tested with proper integration tests
      // Just verifying methods exist
      expect(typeof finder.findUTXOs).toBe('function');
      expect(typeof finder.findLatestSpendableUTXO).toBe('function');
      expect(typeof finder.monitorAddresses).toBe('function');
      expect(typeof finder.waitForConfirmation).toBe('function');
      expect(typeof finder.syncAndMonitor).toBe('function');
    });
  });

  describe('Common Methods', () => {
    it('should return mode via getMode()', () => {
      const historicFinder = new TransactionFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
        fromHeight: 1,
      });

      expect(historicFinder.getMode()).toBe(FinderMode.HISTORIC);
    });

    it('should return network via getNetwork()', () => {
      const finder = new TransactionFinder({
        mode: FinderMode.HISTORIC,
        network: 'mainnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
        fromHeight: 1,
      });

      expect(finder.getNetwork()).toBe('mainnet');
    });

    it('should support stop() method for realtime/hybrid modes', () => {
      const realtimeFinder = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [TESTNET_ADDRESSES.address1],
        dapiClient: createMockDapiClient(),
      });

      // Should not throw
      expect(() => realtimeFinder.stop()).not.toThrow();
    });
  });
});
