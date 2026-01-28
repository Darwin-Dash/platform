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

/**
 * Check if we should skip token tests (they only work reliably on local network)
 *
 * WASM SDK's own token tests only run against LOCAL network because:
 * - Token operations are complex WASM operations
 * - Testnet latency causes timeouts (even with 60s timeout)
 * - Token contracts may not be deployed on testnet
 *
 * @returns true if token tests should be skipped
 */
export function shouldSkipTokenTests(): boolean {
  return TEST_CONFIG.network !== 'local';
}

/**
 * Helper to conditionally skip token tests on non-local networks
 * Usage: it('token test', () => skipTokenTestsOnTestnet(async () => { ... }))
 */
export async function skipTokenTestsOnTestnet(testFn: () => void | Promise<void>): Promise<void> {
  if (shouldSkipTokenTests()) {
    console.log(`  [SKIP] Token test skipped on ${TEST_CONFIG.network} network (only works on local)`);
    return;
  }
  await testFn();
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
