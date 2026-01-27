/**
 * WASM Operations Registry
 *
 * Maps operation names to their handler functions.
 * Add new operations here to extend worker capabilities.
 *
 * All operations run in isolated worker processes to avoid
 * the WASM SDK reader lock issue that causes "already locked to a reader" errors.
 */

// Identity operations
import { identityCreateOperation } from './identity-create.js';
import { identityTopUpOperation } from './identity-topup.js';
import { identityDiscoverOperation } from './identity-discover.js';
import { identityDiscoverMnemonicOperation } from './identity-discover-mnemonic.js';
import { identityFetchOperation } from './identity-fetch.js';
import { identityFetchWithProofOperation } from './identity-fetch-with-proof.js';
import { identityFetchUnprovedOperation } from './identity-fetch-unproved.js';
import { identityGetKeysOperation } from './identity-get-keys.js';

// DPNS operations
import {
  dpnsResolveOperation,
  dpnsIsAvailableOperation,
  dpnsUsernameOperation,
  dpnsGetUsernameByNameOperation,
} from './dpns.js';

// Document operations
import {
  documentGetOperation,
  documentQueryOperation,
} from './documents.js';

// Token operations
import {
  tokenBalancesOperation,
  tokenIdentityBalancesOperation,
  tokenTotalSupplyOperation,
  tokenStatusesOperation,
} from './tokens.js';

// Contract operations
import { contractGetOperation } from './contracts.js';

// DashPay operations
import {
  dashpayProfileOperation,
  dashpayContactsSentOperation,
  dashpayContactsReceivedOperation,
} from './dashpay.js';

// System operations
import {
  systemStatusOperation,
  systemEpochOperation,
} from './system.js';

/**
 * Registry of available WASM operations
 *
 * Each operation receives:
 * - params: Operation-specific parameters
 * - sdk: EvoSDK instance (connected)
 * - wasmModule: WASM module with WasmSdk class
 * - network: Network name ('testnet', 'mainnet', 'local')
 *
 * Each operation must return a result object or throw an error.
 */
export const operations = {
  // Identity operations
  'identity-create': identityCreateOperation,
  'identity-topup': identityTopUpOperation,
  'identity-discover': identityDiscoverOperation,
  'identity-discover-mnemonic': identityDiscoverMnemonicOperation,
  'identity-fetch': identityFetchOperation,
  'identity-fetch-with-proof': identityFetchWithProofOperation,
  'identity-fetch-unproved': identityFetchUnprovedOperation,
  'identity-get-keys': identityGetKeysOperation,

  // DPNS operations
  'dpns-resolve': dpnsResolveOperation,
  'dpns-is-available': dpnsIsAvailableOperation,
  'dpns-username': dpnsUsernameOperation,
  'dpns-get-username-by-name': dpnsGetUsernameByNameOperation,

  // Document operations
  'document-get': documentGetOperation,
  'document-query': documentQueryOperation,

  // Token operations
  'token-balances': tokenBalancesOperation,
  'token-identity-balances': tokenIdentityBalancesOperation,
  'token-total-supply': tokenTotalSupplyOperation,
  'token-statuses': tokenStatusesOperation,

  // Contract operations
  'contract-get': contractGetOperation,

  // DashPay operations
  'dashpay-profile': dashpayProfileOperation,
  'dashpay-contacts-sent': dashpayContactsSentOperation,
  'dashpay-contacts-received': dashpayContactsReceivedOperation,

  // System operations
  'system-status': systemStatusOperation,
  'system-epoch': systemEpochOperation,
};

/**
 * Get list of supported operation names
 * @returns {string[]} Array of supported operation names
 */
export function getSupportedOperations() {
  return Object.keys(operations);
}
