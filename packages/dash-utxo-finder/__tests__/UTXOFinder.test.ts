/**
 * Integration tests for UTXOFinder
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UTXOFinder,
  AddressDerivation,
  BloomFilterBuilder,
  UTXOExtractor,
  LatestUTXOSelector,
} from '../src/index';

// Mock DAPI client for testing
class MockDAPIClient {
  async core() {
    return {
      getStatus: async () => ({
        chain: { blocksCount: 1000 },
      }),
      getBlockByHash: async () => ({ height: 500 }),
      subscribeToTransactionsWithProofs: async function* () {
        // Mock empty stream
        yield { rawTransactions: [], rawMerkleBlock: null };
      },
    };
  }
}

describe('UTXOFinder', () => {
  let finder: UTXOFinder;
  let dapiClient: any;

  beforeEach(() => {
    dapiClient = new MockDAPIClient();
    finder = new UTXOFinder(dapiClient, 'testnet');
  });

  describe('initialization', () => {
    it('should initialize with correct network', () => {
      expect(finder.getNetwork()).toBe('testnet');
    });

    it('should emit start event when finding UTXOs', async () => {
      const startHandler = vi.fn();
      finder.on('start', startHandler);

      try {
        await finder.findLatestSpendableUTXO(['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj'], {
          fromHeight: 1000,
        });
      } catch (error) {
        // Expected to fail with mock client
      }

      expect(startHandler).toHaveBeenCalled();
    });
  });

  describe('AddressDerivation', () => {
    it('should derive addresses from mnemonic', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const result = AddressDerivation.fromMnemonic(mnemonic, 'testnet', {
        externalCount: 5,
        internalCount: 5,
      });

      expect(result.external).toHaveLength(5);
      expect(result.internal).toHaveLength(5);
      expect(result.hdPrivateKey).toBeDefined();
      expect(result.external[0].address).toMatch(/^y/); // testnet addresses start with 'y'
    });

    it('should derive single address', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const addr = AddressDerivation.deriveAddress(mnemonic, 'testnet', 0, 0, false);

      expect(addr.address).toBeDefined();
      expect(addr.privateKey).toBeDefined();
      expect(addr.path).toBe("m/44'/1'/0'/0/0");
    });

    it('should generate extended public key for watch-only mode', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const xpub = AddressDerivation.getHDPublicKeyFromMnemonic(mnemonic, 'testnet');

      expect(xpub).toBeDefined();
      expect(xpub).toMatch(/^(tpub|xpub)/);
    });
  });

  describe('BloomFilterBuilder', () => {
    it('should build bloom filter for addresses', () => {
      const addresses = [
        'yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj',
        'yRdS4bJ3Yk8RY1aMp9qYKTd7xJ8t9yQzT8',
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(bloomFilter).toHaveProperty('length');
      expect(typeof bloomFilter).toBe('object');
    });

    it('should handle invalid addresses gracefully', () => {
      const addresses = [
        'yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj',
        'invalid-address',
      ];

      // Should not throw, just skip invalid
      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');
      expect(bloomFilter).toBeDefined();
    });
  });

  describe('LatestUTXOSelector', () => {
    const mockUTXOs = [
      {
        txId: 'abc123',
        vout: 0,
        satoshis: 100000,
        script: '76a9...',
        address: 'yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj',
        blockHeight: 500,
        blockTime: Date.now(),
        blockHash: 'hash1',
        isChainLocked: false,
        isInstantLocked: false,
      },
      {
        txId: 'def456',
        vout: 0,
        satoshis: 50000,
        script: '76a9...',
        address: 'yRdS4bJ3Yk8RY1aMp9qYKTd7xJ8t9yQzT8',
        blockHeight: 501,
        blockTime: Date.now() + 1000,
        blockHash: 'hash2',
        isChainLocked: false,
        isInstantLocked: false,
      },
    ];

    it('should select latest UTXO by block height', () => {
      const latest = LatestUTXOSelector.select(mockUTXOs);
      expect(latest.txId).toBe('def456'); // Higher block height
    });

    it('should throw error for no spendable UTXOs', () => {
      const unspendable = [
        {
          ...mockUTXOs[0],
          blockHeight: 0, // Not confirmed
          isChainLocked: false,
          isInstantLocked: false,
        },
      ];

      expect(() => LatestUTXOSelector.select(unspendable)).toThrow(
        'No spendable UTXOs available'
      );
    });

    it('should check required amount', () => {
      expect(() => LatestUTXOSelector.select(mockUTXOs, 200000)).toThrow(
        'Insufficient funds'
      );
    });

    it('should return all spendable sorted by recency', () => {
      const all = LatestUTXOSelector.getAllSpendable(mockUTXOs);
      expect(all).toHaveLength(2);
      expect(all[0].txId).toBe('def456'); // Most recent first
    });

    it('should select UTXOs for specific amount', () => {
      const selected = LatestUTXOSelector.selectForAmount(mockUTXOs, 100000);
      expect(selected.length).toBeGreaterThanOrEqual(1);
      expect(selected.reduce((sum, u) => sum + u.satoshis, 0)).toBeGreaterThanOrEqual(100000);
    });
  });

  describe('UTXOExtractor', () => {
    it('should extract UTXOs from transactions', () => {
      const extractor = new UTXOExtractor('testnet');

      // Mock transactions (simplified for testing)
      const transactions = [
        {
          tx: {
            hash: 'txid123',
            inputs: [],
            outputs: [
              {
                satoshis: 100000,
                script: {
                  toAddress: () => ({ toString: () => 'yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj' }),
                },
              },
            ],
          },
          metadata: {
            height: 500,
            time: new Date(),
            blockHash: 'blockhash',
            isChainLocked: false,
            isInstantLocked: false,
          },
        },
      ];

      const addresses = ['yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj'];
      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(1);
      expect(utxos[0].satoshis).toBe(100000);
    });
  });

  describe('network switching', () => {
    it('should allow changing network', () => {
      finder.setNetwork('mainnet');
      expect(finder.getNetwork()).toBe('mainnet');
    });
  });
});
