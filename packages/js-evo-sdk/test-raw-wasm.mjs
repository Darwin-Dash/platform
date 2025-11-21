#!/usr/bin/env node

/**
 * Test script for raw WASM SDK (without wrapper)
 *
 * This script tests if the WASM SDK works directly without our wrapper code.
 * It helps identify if the "already locked to a reader" error is in:
 * - Our wrapper code (if this passes but our wrapper fails)
 * - The WASM SDK itself (if this fails with the same error)
 * - The environment/Node.js setup (if this fails but WASM SDK tests pass)
 */

import init, * as sdk from '@dashevo/wasm-sdk/compressed';

async function testRawWasmSdk() {
  console.log('='.repeat(60));
  console.log('Testing Raw WASM SDK (no wrapper)');
  console.log('='.repeat(60));
  console.log('');

  try {
    console.log('[1/5] Initializing WASM module...');
    await init();
    console.log('✓ WASM initialized');
    console.log('');

    console.log('[2/5] Prefetching trusted quorums for testnet...');
    await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
    console.log('✓ Prefetch completed');
    console.log('');

    console.log('[3/5] Building WASM SDK client (trusted mode)...');
    const builder = sdk.WasmSdkBuilder.testnetTrusted();
    const client = await builder.build();
    console.log('✓ Client built successfully');
    console.log('');

    console.log('[4/5] Fetching identity from testnet...');
    console.log('   Identity ID: 5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');
    const identity = await client.getIdentity('5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');
    console.log('✓ Identity fetched successfully');
    console.log('');

    if (identity) {
      console.log('[5/5] Identity details:');
      console.log(`  - Type: ${typeof identity}`);
      console.log(`  - Constructor: ${identity.constructor.name}`);
      console.log('');
    }

    console.log('Cleaning up...');
    client.free();
    console.log('✓ Client freed');
    console.log('');

    console.log('='.repeat(60));
    console.log('✓ TEST PASSED - Raw WASM SDK works!');
    console.log('='.repeat(60));
    process.exit(0);

  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('✗ TEST FAILED - Raw WASM SDK error');
    console.log('='.repeat(60));
    console.log('');
    console.log('Error message:', error.message);
    console.log('');

    if (error.stack) {
      console.log('Stack trace:');
      console.log(error.stack);
    }
    console.log('');

    process.exit(1);
  }
}

testRawWasmSdk();
