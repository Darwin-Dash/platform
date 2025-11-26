/**
 * Unit tests for UTXOExtractor
 * Tests UTXO extraction from transaction sets with spent output tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOExtractor } from '../../../src/utils/utxo-extractor.js';
import { TransactionWithMetadata } from '../../../src/types/index.js';

describe('UTXOExtractor', () => {
  let extractor: UTXOExtractor;

  beforeEach(() => {
    extractor = new UTXOExtractor('testnet');
  });

  // Helper to create mock transactions
  const createMockTransaction = (
    hash: string,
    outputs: Array<{ address: string | null; satoshis: number }>,
    inputs: Array<{ prevTxId: string; outputIndex: number }> = []
  ): TransactionWithMetadata => ({
    tx: {
      hash,
      outputs: outputs.map((out) => ({
        satoshis: out.satoshis,
        script: out.address
          ? {
              toAddress: () => ({ toString: () => out.address }),
              toHex: () => 'mockscript',
            }
          : null,
        address: out.address,
      })),
      inputs: inputs.map((inp) => ({
        prevTxId: Buffer.from(inp.prevTxId, 'hex'),
        outputIndex: inp.outputIndex,
      })),
    } as any,
    metadata: {
      height: 1000,
      time: new Date(1609459200000),
      blockHash: 'blockhash123',
      isChainLocked: false,
      isInstantLocked: false,
    },
  });

  describe('extractUTXOs', () => {
    describe('basic extraction', () => {
      it('should extract UTXO from transaction with matching address', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [{ address, satoshis: 100000 }]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        expect(utxos).toHaveLength(1);
        expect(utxos[0].txId).toBe(
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        );
        expect(utxos[0].vout).toBe(0);
        expect(utxos[0].satoshis).toBe(100000);
        expect(utxos[0].address).toBe(address);
      });

      it('should extract multiple UTXOs from transaction with multiple outputs', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [
              { address, satoshis: 100000 },
              { address, satoshis: 200000 },
              { address, satoshis: 300000 },
            ]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        expect(utxos).toHaveLength(3);
        expect(utxos[0].vout).toBe(0);
        expect(utxos[0].satoshis).toBe(100000);
        expect(utxos[1].vout).toBe(1);
        expect(utxos[1].satoshis).toBe(200000);
        expect(utxos[2].vout).toBe(2);
        expect(utxos[2].satoshis).toBe(300000);
      });

      it('should extract UTXOs from multiple transactions', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [{ address, satoshis: 100000 }]
          ),
          createMockTransaction(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            [{ address, satoshis: 200000 }]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        expect(utxos).toHaveLength(2);
        expect(utxos[0].txId).toBe(
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        );
        expect(utxos[1].txId).toBe(
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        );
      });
    });

    describe('address filtering', () => {
      it('should only extract UTXOs for watched addresses', () => {
        const watchedAddress = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const otherAddress = 'yY2sN5HvJMq5a3sFMWV9dVc2e8FZDg3cLL';

        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [
              { address: watchedAddress, satoshis: 100000 },
              { address: otherAddress, satoshis: 200000 },
            ]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [watchedAddress]);

        expect(utxos).toHaveLength(1);
        expect(utxos[0].address).toBe(watchedAddress);
        expect(utxos[0].satoshis).toBe(100000);
      });

      it('should extract UTXOs for multiple watched addresses', () => {
        const address1 = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const address2 = 'yY2sN5HvJMq5a3sFMWV9dVc2e8FZDg3cLL';

        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [
              { address: address1, satoshis: 100000 },
              { address: address2, satoshis: 200000 },
            ]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address1, address2]);

        expect(utxos).toHaveLength(2);
      });

      it('should return empty array when no addresses match', () => {
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [{ address: 'yUnwatchedAddress', satoshis: 100000 }]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [
          'yWatchedAddress1',
          'yWatchedAddress2',
        ]);

        expect(utxos).toHaveLength(0);
      });

      it('should return empty array for empty address list', () => {
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [{ address: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy', satoshis: 100000 }]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, []);

        expect(utxos).toHaveLength(0);
      });
    });

    describe('spent output tracking', () => {
      it('should exclude spent UTXOs', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const tx1Hash =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

        const transactions = [
          // First transaction creates UTXO
          createMockTransaction(tx1Hash, [{ address, satoshis: 100000 }]),
          // Second transaction spends that UTXO
          createMockTransaction(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            [{ address, satoshis: 50000 }], // Change output
            [{ prevTxId: tx1Hash, outputIndex: 0 }] // Spends tx1:0
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        // Only the change output should remain (tx1:0 is spent)
        expect(utxos).toHaveLength(1);
        expect(utxos[0].txId).toBe(
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        );
        expect(utxos[0].satoshis).toBe(50000);
      });

      it('should track multiple spent outputs', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const tx1Hash =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const tx2Hash =
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

        const transactions = [
          // Two transactions creating UTXOs
          createMockTransaction(tx1Hash, [{ address, satoshis: 100000 }]),
          createMockTransaction(tx2Hash, [{ address, satoshis: 200000 }]),
          // Third transaction spends both
          createMockTransaction(
            'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            [{ address, satoshis: 250000 }],
            [
              { prevTxId: tx1Hash, outputIndex: 0 },
              { prevTxId: tx2Hash, outputIndex: 0 },
            ]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        expect(utxos).toHaveLength(1);
        expect(utxos[0].satoshis).toBe(250000);
      });

      it('should not mark unrelated outputs as spent', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const tx1Hash =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

        const transactions = [
          createMockTransaction(tx1Hash, [
            { address, satoshis: 100000 }, // vout 0
            { address, satoshis: 200000 }, // vout 1
          ]),
          // Spend only vout 0
          createMockTransaction(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            [{ address, satoshis: 50000 }],
            [{ prevTxId: tx1Hash, outputIndex: 0 }]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        // vout 1 should still be unspent (200000), plus the change (50000)
        expect(utxos).toHaveLength(2);
        const amounts = utxos.map((u) => u.satoshis).sort((a, b) => a - b);
        expect(amounts).toEqual([50000, 200000]);
      });
    });

    describe('metadata extraction', () => {
      it('should include block height in extracted UTXOs', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const tx: TransactionWithMetadata = {
          tx: {
            hash: 'aaaa',
            outputs: [
              {
                satoshis: 100000,
                address,
                script: { toAddress: () => ({ toString: () => address }) },
              },
            ],
            inputs: [],
          } as any,
          metadata: {
            height: 12345,
            time: new Date(),
            blockHash: 'hash',
            isChainLocked: false,
            isInstantLocked: false,
          },
        };

        const utxos = extractor.extractUTXOs([tx], [address]);

        expect(utxos[0].blockHeight).toBe(12345);
      });

      it('should include lock states in extracted UTXOs', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const tx: TransactionWithMetadata = {
          tx: {
            hash: 'aaaa',
            outputs: [
              {
                satoshis: 100000,
                address,
                script: { toAddress: () => ({ toString: () => address }) },
              },
            ],
            inputs: [],
          } as any,
          metadata: {
            height: 12345,
            time: new Date(),
            blockHash: 'hash',
            isChainLocked: true,
            isInstantLocked: true,
          },
        };

        const utxos = extractor.extractUTXOs([tx], [address]);

        expect(utxos[0].isChainLocked).toBe(true);
        expect(utxos[0].isInstantLocked).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty transaction list', () => {
        const utxos = extractor.extractUTXOs([], ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy']);

        expect(utxos).toHaveLength(0);
      });

      it('should handle transactions with no outputs', () => {
        const tx: TransactionWithMetadata = {
          tx: {
            hash: 'aaaa',
            outputs: [],
            inputs: [],
          } as any,
          metadata: {
            height: 1000,
            time: new Date(),
            blockHash: 'hash',
            isChainLocked: false,
            isInstantLocked: false,
          },
        };

        const utxos = extractor.extractUTXOs([tx], ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy']);

        expect(utxos).toHaveLength(0);
      });

      it('should skip outputs with null address', () => {
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [
              { address: null, satoshis: 100000 }, // OP_RETURN or similar
              { address: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy', satoshis: 200000 },
            ]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [
          'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
        ]);

        expect(utxos).toHaveLength(1);
        expect(utxos[0].satoshis).toBe(200000);
      });

      it('should handle outputs with zero satoshis', () => {
        const address = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
        const transactions = [
          createMockTransaction(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            [{ address, satoshis: 0 }]
          ),
        ];

        const utxos = extractor.extractUTXOs(transactions, [address]);

        expect(utxos).toHaveLength(1);
        expect(utxos[0].satoshis).toBe(0);
      });
    });
  });

  describe('getSpendableUTXOs', () => {
    const createUTXO = (overrides: any = {}) => ({
      txId: 'aaaa',
      vout: 0,
      satoshis: 100000,
      script: '',
      address: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
      blockHeight: 0,
      blockTime: 0,
      blockHash: null,
      isChainLocked: false,
      isInstantLocked: false,
      ...overrides,
    });

    it('should return confirmed UTXOs', () => {
      const utxos = [createUTXO({ blockHeight: 1000 })];

      const spendable = extractor.getSpendableUTXOs(utxos);

      expect(spendable).toHaveLength(1);
    });

    it('should return ChainLocked UTXOs', () => {
      const utxos = [createUTXO({ isChainLocked: true })];

      const spendable = extractor.getSpendableUTXOs(utxos);

      expect(spendable).toHaveLength(1);
    });

    it('should return InstantLocked UTXOs', () => {
      const utxos = [createUTXO({ isInstantLocked: true })];

      const spendable = extractor.getSpendableUTXOs(utxos);

      expect(spendable).toHaveLength(1);
    });

    it('should filter out unconfirmed and unlocked UTXOs', () => {
      const utxos = [
        createUTXO({
          blockHeight: 0,
          isChainLocked: false,
          isInstantLocked: false,
        }),
      ];

      const spendable = extractor.getSpendableUTXOs(utxos);

      expect(spendable).toHaveLength(0);
    });

    it('should return mix of confirmed and locked UTXOs', () => {
      const utxos = [
        createUTXO({ txId: 'confirmed', blockHeight: 1000 }),
        createUTXO({ txId: 'chainlocked', isChainLocked: true }),
        createUTXO({ txId: 'instantlocked', isInstantLocked: true }),
        createUTXO({ txId: 'unspendable' }), // None of the above
      ];

      const spendable = extractor.getSpendableUTXOs(utxos);

      expect(spendable).toHaveLength(3);
      const txIds = spendable.map((u) => u.txId);
      expect(txIds).toContain('confirmed');
      expect(txIds).toContain('chainlocked');
      expect(txIds).toContain('instantlocked');
      expect(txIds).not.toContain('unspendable');
    });
  });

  describe('network configuration', () => {
    it('should use provided network for address extraction', () => {
      const mainnetExtractor = new UTXOExtractor('mainnet');
      const testnetExtractor = new UTXOExtractor('testnet');

      // Both should be created without error
      expect(mainnetExtractor).toBeDefined();
      expect(testnetExtractor).toBeDefined();
    });

    it('should default to testnet', () => {
      const defaultExtractor = new UTXOExtractor();
      expect(defaultExtractor).toBeDefined();
    });
  });
});
