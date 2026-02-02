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
        /only available in REALTIME mode/
      );

      expect(() => finder.clearTransaction('txid')).toThrow(
        /only available in REALTIME mode/
      );

      expect(() => finder.clearAllConfirmed()).toThrow(
        /only available in REALTIME mode/
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
        /only available in HISTORIC mode/
      );

      await expect(async () => await finder.findLatestSpendableUTXO()).rejects.toThrow(
        /only available in HISTORIC mode/
      );
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
