/**
 * Mock UTXOs for testing UTXO selection and filtering
 */

import { UTXO } from '../../src/types';
import { TESTNET_ADDRESSES } from './addresses';

export const MOCK_UTXOS: Record<string, UTXO> = {
  // Basic unspent output
  unspent1: {
    txId: 'abc123def456',
    vout: 0,
    satoshis: 100000,
    script: '76a914...',
    address: TESTNET_ADDRESSES.address1,
    blockHeight: 500,
    blockTime: new Date('2024-01-01T10:00:00Z'),
    blockHash: 'blockhash500',
    isChainLocked: true,
    isInstantLocked: false,
  },

  // Smaller UTXO
  unspent2: {
    txId: 'multi789ghi012',
    vout: 1,
    satoshis: 30000,
    script: '76a914...',
    address: TESTNET_ADDRESSES.address2,
    blockHeight: 501,
    blockTime: new Date('2024-01-01T11:00:00Z'),
    blockHash: 'blockhash501',
    isChainLocked: true,
    isInstantLocked: true,
  },

  // Newest unspent
  unspent3: {
    txId: 'new987uvw234',
    vout: 0,
    satoshis: 250000,
    script: '76a914...',
    address: TESTNET_ADDRESSES.address3,
    blockHeight: 510,
    blockTime: new Date('2024-01-01T20:00:00Z'),
    blockHash: 'blockhash510',
    isChainLocked: true,
    isInstantLocked: true,
  },

  // Unconfirmed (height 0)
  unconfirmed: {
    txId: 'unconf901mno234',
    vout: 0,
    satoshis: 75000,
    script: '76a914...',
    address: TESTNET_ADDRESSES.address5,
    blockHeight: 0,
    blockTime: new Date('2024-01-01T13:00:00Z'),
    blockHash: null,
    isChainLocked: false,
    isInstantLocked: false,
  },

  // Old UTXO
  oldUnspent: {
    txId: 'old111aaa222',
    vout: 0,
    satoshis: 1000000,
    script: '76a914...',
    address: TESTNET_ADDRESSES.address4,
    blockHeight: 100,
    blockTime: new Date('2023-12-01T00:00:00Z'),
    blockHash: 'blockhash100',
    isChainLocked: true,
    isInstantLocked: true,
  },
};

// Common UTXO sets for testing
export const UTXO_SETS = {
  // Single unspent - typical case
  single: [MOCK_UTXOS.unspent1],

  // Multiple unspent, different sizes
  multiple: [
    MOCK_UTXOS.unspent1,
    MOCK_UTXOS.unspent2,
    MOCK_UTXOS.unspent3,
  ],

  // With unconfirmed mixed in
  withUnconfirmed: [
    MOCK_UTXOS.unspent1,
    MOCK_UTXOS.unconfirmed,
    MOCK_UTXOS.unspent3,
  ],

  // Empty set
  empty: [],

  // Only unconfirmed (not spendable)
  onlyUnconfirmed: [MOCK_UTXOS.unconfirmed],

  // High value set
  highValue: [
    MOCK_UTXOS.oldUnspent,
    { ...MOCK_UTXOS.unspent3, satoshis: 500000 },
  ],

  // Small value set (for testing coin selection)
  smallValues: [
    { ...MOCK_UTXOS.unspent2, satoshis: 10000 },
    { ...MOCK_UTXOS.unspent1, satoshis: 15000, txId: 'small1' },
    { ...MOCK_UTXOS.unspent3, satoshis: 20000, txId: 'small2' },
    { ...MOCK_UTXOS.oldUnspent, satoshis: 25000, txId: 'small3' },
  ],
};

// Helper to create custom UTXO
export function createUTXO(overrides: Partial<UTXO>): UTXO {
  return {
    txId: 'custom123',
    vout: 0,
    satoshis: 100000,
    script: '76a914...',
    address: TESTNET_ADDRESSES.address1,
    blockHeight: 500,
    blockTime: new Date(),
    blockHash: 'blockhash',
    isChainLocked: true,
    isInstantLocked: false,
    ...overrides,
  };
}
