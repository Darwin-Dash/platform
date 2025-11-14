/**
 * Mock transactions for testing
 * These simulate various transaction types and scenarios
 */

import { TESTNET_ADDRESSES } from './addresses';

export const MOCK_TRANSACTIONS = {
  // Standard transaction with single output
  simple: {
    tx: {
      hash: 'abc123def456',
      inputs: [],
      outputs: [
        {
          satoshis: 100000,
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address1,
            }),
          },
        },
      ],
    },
    metadata: {
      height: 500,
      time: new Date('2024-01-01T10:00:00Z'),
      blockHash: 'blockhash500',
      isChainLocked: true,
      isInstantLocked: false,
    },
  },

  // Multi-output transaction
  multiOutput: {
    tx: {
      hash: 'multi789ghi012',
      inputs: [],
      outputs: [
        {
          satoshis: 50000,
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address1,
            }),
          },
        },
        {
          satoshis: 30000,
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address2,
            }),
          },
        },
        {
          satoshis: 20000,
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address3,
            }),
          },
        },
      ],
    },
    metadata: {
      height: 501,
      time: new Date('2024-01-01T11:00:00Z'),
      blockHash: 'blockhash501',
      isChainLocked: true,
      isInstantLocked: true,
    },
  },

  // Spending transaction (has inputs)
  spending: {
    tx: {
      hash: 'spend345jkl678',
      inputs: [
        {
          prevTxId: 'abc123def456',
          outputIndex: 0,
        },
      ],
      outputs: [
        {
          satoshis: 95000, // 100000 - 5000 fee
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address4,
            }),
          },
        },
      ],
    },
    metadata: {
      height: 502,
      time: new Date('2024-01-01T12:00:00Z'),
      blockHash: 'blockhash502',
      isChainLocked: true,
      isInstantLocked: false,
    },
  },

  // Unconfirmed transaction (height 0)
  unconfirmed: {
    tx: {
      hash: 'unconf901mno234',
      inputs: [],
      outputs: [
        {
          satoshis: 75000,
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address5,
            }),
          },
        },
      ],
    },
    metadata: {
      height: 0,
      time: new Date('2024-01-01T13:00:00Z'),
      blockHash: null,
      isChainLocked: false,
      isInstantLocked: false,
    },
  },

  // Coinbase transaction (block reward)
  coinbase: {
    tx: {
      hash: 'coin567pqr890',
      inputs: [
        {
          prevTxId: '0000000000000000000000000000000000000000000000000000000000000000',
          outputIndex: 0xffffffff,
        },
      ],
      outputs: [
        {
          satoshis: 500000000,
          script: {
            toAddress: () => ({
              toString: () => TESTNET_ADDRESSES.address1,
            }),
          },
        },
      ],
    },
    metadata: {
      height: 100,
      time: new Date('2024-01-01T01:00:00Z'),
      blockHash: 'blockhash100',
      isChainLocked: true,
      isInstantLocked: true,
    },
  },

  // Transaction spending unknown address (should be ignored)
  unknownAddress: {
    tx: {
      hash: 'unkwn234stu567',
      inputs: [],
      outputs: [
        {
          satoshis: 25000,
          script: {
            toAddress: () => ({
              toString: () => 'yUnknownAddress1yUnknownAddress1',
            }),
          },
        },
      ],
    },
    metadata: {
      height: 503,
      time: new Date('2024-01-01T14:00:00Z'),
      blockHash: 'blockhash503',
      isChainLocked: true,
      isInstantLocked: false,
    },
  },
};

// Transaction sequences for testing workflows
export const TRANSACTION_SEQUENCES = {
  // Simple flow: receive, then spend
  receiveAndSpend: [
    MOCK_TRANSACTIONS.simple,
    MOCK_TRANSACTIONS.spending,
  ],

  // Multiple receives
  multipleReceives: [
    MOCK_TRANSACTIONS.simple,
    MOCK_TRANSACTIONS.multiOutput,
  ],

  // With unconfirmed
  withUnconfirmed: [
    MOCK_TRANSACTIONS.simple,
    MOCK_TRANSACTIONS.multiOutput,
    MOCK_TRANSACTIONS.unconfirmed,
  ],

  // Realistic wallet history
  walletHistory: [
    MOCK_TRANSACTIONS.coinbase,
    MOCK_TRANSACTIONS.simple,
    MOCK_TRANSACTIONS.multiOutput,
    MOCK_TRANSACTIONS.spending,
    MOCK_TRANSACTIONS.unconfirmed,
  ],
};
