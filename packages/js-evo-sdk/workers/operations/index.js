/**
 * WASM Operations Registry
 *
 * Maps operation names to their handler functions.
 * Add new operations here to extend worker capabilities.
 */

import { identityCreateOperation } from './identity-create.js';
import { identityTopUpOperation } from './identity-topup.js';
import { identityDiscoverOperation } from './identity-discover.js';
import { identityFetchOperation } from './identity-fetch.js';
import { identityFetchWithProofOperation } from './identity-fetch-with-proof.js';
import { identityFetchUnprovedOperation } from './identity-fetch-unproved.js';
import { identityGetKeysOperation } from './identity-get-keys.js';

/**
 * Registry of available WASM operations
 *
 * Each operation receives:
 * - params: Operation-specific parameters
 * - sdk: EvoSDK instance (fresh, not connected)
 * - wasmModule: WASM module with WasmSdk class
 *
 * Each operation must return a result object or throw an error.
 */
export const operations = {
  'identity-create': identityCreateOperation,
  'identity-topup': identityTopUpOperation,
  'identity-discover': identityDiscoverOperation,
  'identity-fetch': identityFetchOperation,
  'identity-fetch-with-proof': identityFetchWithProofOperation,
  'identity-fetch-unproved': identityFetchUnprovedOperation,
  'identity-get-keys': identityGetKeysOperation,
  // Future operations can be added here:
  // 'credit-transfer': creditTransferOperation,
  // 'credit-withdrawal': creditWithdrawalOperation,
};

/**
 * Get list of supported operation names
 * @returns {string[]} Array of supported operation names
 */
export function getSupportedOperations() {
  return Object.keys(operations);
}
