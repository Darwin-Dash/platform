/**
 * Test Fixtures Index
 * Central export of all test fixtures for easy importing
 */

// Address fixtures
export {
  TESTNET_ADDRESSES,
  MAINNET_ADDRESSES,
  REGTEST_ADDRESSES,
  INVALID_ADDRESSES,
} from './addresses';

// Transaction fixtures
export {
  MOCK_TRANSACTIONS,
  TRANSACTION_SEQUENCES,
} from './transactions';

// UTXO fixtures
export {
  MOCK_UTXOS,
  UTXO_SETS,
  createUTXO,
} from './utxos';
