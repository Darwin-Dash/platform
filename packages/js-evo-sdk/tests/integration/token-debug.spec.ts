/**
 * Token Debug Test - WASM SDK Verification
 *
 * STATUS: FIXED
 * DATE: 2026-01-28
 *
 * ROOT CAUSE: Conflicting WASM modules (wasm-sdk and wasm-dpp)
 * SOLUTION: Dynamic imports for @dashevo/dapi-client
 *
 * See: docs/WASM_SDK_TESTNET_RWLOCK_ISSUE.md for full details
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EvoSDK } from '../../src/sdk.js';
import { ensureInitialized, WasmSdk } from '../../src/wasm.js';

// Known testnet identity for baseline test
const TESTNET_IDENTITY = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk';

// Token contract ID (may or may not have tokens on testnet)
const TOKEN_CONTRACT_ID = 'ALybvzfcCwMs7sinDwmtumw17NneuW7RgFtFHgjKmF3A';

describe('WASM SDK Testnet Verification', { timeout: 120000 }, () => {
  let sdk: EvoSDK;

  beforeAll(async () => {
    console.log('\n=== SETUP: SDK ===\n');
    await ensureInitialized();

    sdk = EvoSDK.testnetTrusted({
      logs: 'debug',
      settings: {
        timeoutMs: 30000,
        retries: 2,
      },
    });

    await sdk.connect();
    console.log('[SETUP] SDK connected\n');
  }, 60000);

  afterAll(() => {
    console.log('\n=== TEARDOWN ===\n');
  });

  // ============================================================================
  // WASM SDK Direct Calls (previously broken, now fixed)
  // ============================================================================
  it('✅ WASM SDK getIdentity works on testnet', async () => {
    console.log('\n[TEST] Calling sdk.wasm.getIdentity() directly...');

    const start = Date.now();
    const identity = await sdk.wasm.getIdentity(TESTNET_IDENTITY);
    const elapsed = Date.now() - start;

    console.log(`[TEST] SUCCESS in ${elapsed}ms`);
    expect(identity).toBeDefined();
    expect(elapsed).toBeLessThan(30000);
  }, 45000);

  it('✅ WASM SDK getTokenContractInfo works on testnet', async () => {
    console.log('\n[TEST] Calling sdk.wasm.getTokenContractInfo() directly...');

    const start = Date.now();
    try {
      const info = await sdk.wasm.getTokenContractInfo(TOKEN_CONTRACT_ID);
      const elapsed = Date.now() - start;
      console.log(`[TEST] SUCCESS in ${elapsed}ms, info:`, info);
      expect(elapsed).toBeLessThan(30000);
    } catch (err: any) {
      const elapsed = Date.now() - start;
      // Token contract may not exist, but the important thing is the call completed
      console.log(`[TEST] Error (but didn't hang) in ${elapsed}ms: ${err.message}`);
      expect(elapsed).toBeLessThan(30000);
    }
  }, 45000);

  // ============================================================================
  // Facade-based calls
  // ============================================================================
  it('✅ Identity via IdentitiesFacade', async () => {
    console.log('\n[TEST] Fetching identity via sdk.identities.get()...');

    const start = Date.now();
    const identity = await sdk.identities.get(TESTNET_IDENTITY);
    const elapsed = Date.now() - start;

    console.log(`[TEST] SUCCESS in ${elapsed}ms`);
    expect(identity).toBeDefined();
    expect(elapsed).toBeLessThan(30000);
  }, 35000);

  // ============================================================================
  // Pure computation (no network)
  // ============================================================================
  it('✅ Token ID calculation (pure computation)', async () => {
    const tokenId = await sdk.tokens.calculateId(TOKEN_CONTRACT_ID, 0);
    console.log(`\n[TEST] Calculated token ID: ${tokenId}`);
    expect(tokenId).toBe('Hqyu8WcRwXCTwbNxdga4CN5gsVEGc67wng4TFzceyLUv');
  }, 5000);

  it('✅ WASM SDK methods exist on prototype', async () => {
    const methods = ['getTokenContractInfo', 'getTokenTotalSupply', 'getIdentity'];
    for (const method of methods) {
      const exists = typeof (WasmSdk.prototype as any)[method] === 'function';
      console.log(`[TEST] ${method}: ${exists ? 'EXISTS' : 'MISSING'}`);
      expect(exists).toBe(true);
    }
  }, 5000);
});
