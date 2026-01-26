/**
 * Vitest integration test setup
 *
 * This file runs before all integration tests to configure the test environment.
 * It re-exports helpers from tests/lib/helpers.ts for convenience.
 */

import { beforeAll, afterAll } from 'vitest';

// Import and re-export all helpers
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  createTestSDK as createTestSDKHelper,
  waitForSTPropagated,
  waitForTransaction,
  waitForIdentity,
  waitForBalance,
  waitForDocument,
  wait,
  skipIfNoMnemonic as skipIfNoMnemonicHelper,
  retry,
  createCleanup,
  assertValidIdentifier,
  assertValidMnemonic,
  EvoSDK,
  wallet,
  type CreateEvoSDKWithWalletOptions,
  type EvoSDKWithWalletResult,
  type WaitForTransactionOptions,
  type WaitForSTPropagatedOptions,
} from '../lib/helpers.js';

// Re-export all helpers
export {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  waitForSTPropagated,
  waitForTransaction,
  waitForIdentity,
  waitForBalance,
  waitForDocument,
  wait,
  retry,
  createCleanup,
  assertValidIdentifier,
  assertValidMnemonic,
  EvoSDK,
  wallet,
  type CreateEvoSDKWithWalletOptions,
  type EvoSDKWithWalletResult,
  type WaitForTransactionOptions,
  type WaitForSTPropagatedOptions,
};

// Legacy exports for backward compatibility
export const TEST_MNEMONIC = TEST_CONFIG.mnemonic;
export const testConfig = {
  network: TEST_CONFIG.network,
  timeout: TEST_CONFIG.timeout,
  hasMnemonic: TEST_CONFIG.hasMnemonic,
};

/**
 * Create a test SDK instance with the configured network
 * @deprecated Use createEvoSDKWithWallet or createTestSDKHelper instead
 */
export async function createTestSDK() {
  const result = await createTestSDKHelper(false);
  return result.sdk;
}

/**
 * Helper to skip tests that require a funded wallet
 * Wrapper around skipIfNoMnemonicHelper for backward compatibility
 */
export function skipIfNoMnemonic(testFn: () => void | Promise<void>) {
  return skipIfNoMnemonicHelper(testFn);
}

// ============================================================================
// Vitest Setup Hooks
// ============================================================================

beforeAll(async () => {
  console.log(`\n js-evo-sdk Integration Tests`);
  console.log(`   Network: ${TEST_CONFIG.network}`);
  console.log(`   Timeout: ${TEST_CONFIG.timeout}ms`);
  console.log(`   Mnemonic: ${TEST_CONFIG.hasMnemonic ? 'Provided' : 'Not provided (some tests will skip)'}`);
  console.log('');
});

afterAll(async () => {
  console.log('\n Integration test cleanup complete');
});
