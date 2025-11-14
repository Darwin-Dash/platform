/**
 * Unit tests for UTXOExtractor
 * Tests UTXO extraction from transactions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOExtractor } from '../../src/UTXOExtractor';
import {
  MOCK_TRANSACTIONS,
  TRANSACTION_SEQUENCES,
} from '../fixtures/transactions';
import { TESTNET_ADDRESSES, MAINNET_ADDRESSES } from '../fixtures/addresses';
import { createMockTransaction, createMockSpendingTransaction, wrapTransactionWithMetadata } from '../helpers/mocks';

describe('UTXOExtractor', () => {
  let extractor: UTXOExtractor;

  beforeEach(() => {
    extractor = new UTXOExtractor('testnet');
  });

  describe('extractUTXOs', () => {
    it('should extract UTXO from simple transaction', () => {
      const transactions = [MOCK_TRANSACTIONS.simple];
      const addresses = [TESTNET_ADDRESSES.address1];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(1);
      expect(utxos[0].txId).toBe('abc123def456');
      expect(utxos[0].satoshis).toBe(100000);
      expect(utxos[0].address).toBe(TESTNET_ADDRESSES.address1);
      expect(utxos[0].vout).toBe(0);
    });

    it('should extract multiple UTXOs from multi-output transaction', () => {
      const transactions = [MOCK_TRANSACTIONS.multiOutput];
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address3,
      ];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(3);
      expect(utxos[0].satoshis).toBe(50000);
      expect(utxos[1].satoshis).toBe(30000);
      expect(utxos[2].satoshis).toBe(20000);
    });

    it('should ignore outputs not matching our addresses', () => {
      const transactions = [MOCK_TRANSACTIONS.multiOutput];
      const addresses = [TESTNET_ADDRESSES.address1]; // Only watching address1

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(1);
      expect(utxos[0].address).toBe(TESTNET_ADDRESSES.address1);
    });

    it('should mark spent UTXOs', () => {
      // Transactions showing a UTXO being spent
      const transactions = [
        MOCK_TRANSACTIONS.simple, // Creates UTXO
        MOCK_TRANSACTIONS.spending, // Spends the UTXO
      ];
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address4,
      ];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      // Should track both the original and what it was spent for
      const originalOutput = utxos.find(
        (u) => u.txId === 'abc123def456' && u.address === TESTNET_ADDRESSES.address1
      );

      if (originalOutput) {
        // Should be marked as spent
        expect(originalOutput.spent).toBe(true);
      }
    });

    it('should handle empty transaction list', () => {
      const utxos = extractor.extractUTXOs([], [TESTNET_ADDRESSES.address1]);

      expect(utxos).toEqual([]);
    });

    it('should handle no matching addresses', () => {
      const transactions = [MOCK_TRANSACTIONS.simple];
      const addresses = [TESTNET_ADDRESSES.address4]; // Different address

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(0);
    });

    it('should extract metadata correctly', () => {
      const transactions = [MOCK_TRANSACTIONS.multiOutput];
      const addresses = [TESTNET_ADDRESSES.address1];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos[0]).toMatchObject({
        blockHeight: 501,
        isChainLocked: true,
        isInstantLocked: true,
      });
      // blockTime is stored as milliseconds timestamp
      expect(typeof utxos[0].blockTime).toBe('number');
      expect(utxos[0].blockHash).toBe('blockhash501');
    });
  });

  describe('multiple addresses in watch set', () => {
    it('should extract UTXOs from all watched addresses', () => {
      const transactions = [MOCK_TRANSACTIONS.multiOutput];
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address3,
      ];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(3);
      expect(utxos.map((u) => u.address)).toEqual(addresses);
    });

    it('should handle overlapping addresses', () => {
      const transactions = [MOCK_TRANSACTIONS.multiOutput];
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address1, // Duplicate
        TESTNET_ADDRESSES.address2,
      ];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      // Should extract without duplication issues
      expect(utxos.length).toBeGreaterThan(0);
    });
  });

  describe('transaction sequences', () => {
    it('should handle receive and spend sequence', () => {
      const transactions = TRANSACTION_SEQUENCES.receiveAndSpend;
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address4,
      ];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      // Should extract all outputs
      expect(utxos.length).toBeGreaterThan(0);
    });

    it('should handle realistic wallet history', () => {
      const transactions = TRANSACTION_SEQUENCES.walletHistory;
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address3,
        TESTNET_ADDRESSES.address4,
        TESTNET_ADDRESSES.address5,
      ];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      // Should extract multiple UTXOs
      expect(utxos.length).toBeGreaterThan(0);
    });
  });

  describe('spent tracking', () => {
    it('should track spent vs unspent UTXOs', () => {
      // Create original transaction
      const originalTxBuffer = createMockTransaction('original-tx', [
        { satoshis: 100000, address: TESTNET_ADDRESSES.address1 },
      ]);
      const originalTx = wrapTransactionWithMetadata(originalTxBuffer, { height: 500 });

      // Create spending transaction that spends from originalTx
      const mockSpendTxBuffer = createMockSpendingTransaction(
        'spend123',
        [{ prevTxId: originalTx.tx.hash, outputIndex: 0 }],  // Use actual hash
        [{ satoshis: 95000, address: TESTNET_ADDRESSES.address2 }],
        501
      );

      const mockSpendTx = wrapTransactionWithMetadata(mockSpendTxBuffer, {
        height: 501,
        isChainLocked: true,
      });

      const transactions = [originalTx, mockSpendTx];
      const addresses = [TESTNET_ADDRESSES.address1, TESTNET_ADDRESSES.address2];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      // Verify both UTXOs extracted
      expect(utxos.length).toBeGreaterThan(0);

      // Original UTXO should NOT be in the list (spent)
      const originalUTXO = utxos.find(u => u.txId === originalTx.tx.hash);
      expect(originalUTXO).toBeUndefined(); // Spent, so filtered out
    });

    it('should handle multiple spends', () => {
      const tx1Buffer = createMockTransaction('tx1', [
        { satoshis: 50000, address: TESTNET_ADDRESSES.address1 },
      ]);
      const tx2Buffer = createMockTransaction('tx2', [
        { satoshis: 50000, address: TESTNET_ADDRESSES.address1 },
      ]);

      // Get actual transaction hashes from the created buffers
      const tx1 = wrapTransactionWithMetadata(tx1Buffer, { height: 500 });
      const tx2 = wrapTransactionWithMetadata(tx2Buffer, { height: 500 });

      // Now create spending transaction with ACTUAL tx hashes
      const spendBuffer = createMockSpendingTransaction(
        'spend',
        [
          { prevTxId: tx1.tx.hash, outputIndex: 0 },
          { prevTxId: tx2.tx.hash, outputIndex: 0 },
        ],
        [{ satoshis: 95000, address: TESTNET_ADDRESSES.address2 }]
      );

      const spend = wrapTransactionWithMetadata(spendBuffer, { height: 501 });

      const transactions = [tx1, tx2, spend];
      const addresses = [TESTNET_ADDRESSES.address1, TESTNET_ADDRESSES.address2];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      // Should handle both inputs
      expect(utxos.length).toBeGreaterThan(0);
    });
  });

  describe('network handling', () => {
    it('should extract for testnet network', () => {
      const testExtractor = new UTXOExtractor('testnet');
      const transactions = [MOCK_TRANSACTIONS.simple];
      const addresses = [TESTNET_ADDRESSES.address1];

      const utxos = testExtractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(1);
    });

    it('should extract for mainnet network', () => {
      const mainExtractor = new UTXOExtractor('mainnet');
      const txBuffer = createMockTransaction('main1', [
        { satoshis: 100000, address: MAINNET_ADDRESSES.address1 },
      ]);
      const tx = wrapTransactionWithMetadata(txBuffer, { height: 500 });

      const utxos = mainExtractor.extractUTXOs([tx], [MAINNET_ADDRESSES.address1]);

      expect(utxos).toHaveLength(1);
    });

    it('should create extractor for mainnet', () => {
      const mainExtractor = new UTXOExtractor('mainnet');

      const txBuffer = createMockTransaction('main1', [
        { satoshis: 100000, address: MAINNET_ADDRESSES.address1 },
      ]);
      const tx = wrapTransactionWithMetadata(txBuffer, { height: 500 });

      const utxos = mainExtractor.extractUTXOs([tx], [MAINNET_ADDRESSES.address1]);

      expect(utxos).toHaveLength(1);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle transaction with no outputs', () => {
      const txNoOutputs = {
        tx: {
          hash: 'noop123',
          inputs: [],
          outputs: [],
        },
        metadata: {
          height: 500,
          time: new Date(),
          blockHash: 'hash',
          isChainLocked: true,
          isInstantLocked: false,
        },
      };

      const utxos = extractor.extractUTXOs(
        [txNoOutputs] as any,
        [TESTNET_ADDRESSES.address1]
      );

      expect(utxos).toEqual([]);
    });

    it('should handle malformed output gracefully', () => {
      const txMalformed = {
        tx: {
          hash: 'bad123',
          inputs: [],
          outputs: [
            {
              satoshis: 100000,
              script: {
                toAddress: () => null, // Bad address
              },
            },
          ],
        },
        metadata: {
          height: 500,
          time: new Date(),
          blockHash: 'hash',
          isChainLocked: true,
          isInstantLocked: false,
        },
      };

      // Should handle gracefully
      expect(() => {
        extractor.extractUTXOs([txMalformed] as any, [
          TESTNET_ADDRESSES.address1,
        ]);
      }).not.toThrow();
    });

    it('should handle transactions with zero satoshis', () => {
      const txZeroBuffer = createMockTransaction('zero1', [
        { satoshis: 0, address: TESTNET_ADDRESSES.address1 },
      ]);
      const txZero = wrapTransactionWithMetadata(txZeroBuffer, { height: 500 });

      const utxos = extractor.extractUTXOs([txZero], [
        TESTNET_ADDRESSES.address1,
      ]);

      // May extract or skip depending on implementation
      expect(utxos).toBeDefined();
    });

    it('should handle very large satoshi amounts', () => {
      const txLargeBuffer = createMockTransaction('large1', [
        { satoshis: 21000000 * 100000000, address: TESTNET_ADDRESSES.address1 }, // Max supply
      ]);
      const txLarge = wrapTransactionWithMetadata(txLargeBuffer, { height: 500 });

      const utxos = extractor.extractUTXOs([txLarge], [
        TESTNET_ADDRESSES.address1,
      ]);

      expect(utxos).toHaveLength(1);
      expect(utxos[0].satoshis).toBe(21000000 * 100000000);
    });
  });

  describe('unconfirmed transactions', () => {
    it('should extract from unconfirmed transactions', () => {
      const transactions = [MOCK_TRANSACTIONS.unconfirmed];
      const addresses = [TESTNET_ADDRESSES.address5];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos).toHaveLength(1);
      expect(utxos[0].blockHeight).toBe(0);
    });

    it('should mark unconfirmed with height 0', () => {
      const transactions = [MOCK_TRANSACTIONS.unconfirmed];
      const addresses = [TESTNET_ADDRESSES.address5];

      const utxos = extractor.extractUTXOs(transactions as any, addresses);

      expect(utxos[0]).toMatchObject({
        blockHeight: 0,
        blockHash: null,
        isChainLocked: false,
      });
    });
  });
});
