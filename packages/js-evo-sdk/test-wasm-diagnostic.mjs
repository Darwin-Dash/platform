#!/usr/bin/env node

/**
 * Comprehensive WASM SDK diagnostic script
 *
 * Tests all aspects of WASM SDK initialization to isolate the issue
 */

import init, * as sdk from '@dashevo/wasm-sdk/compressed';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDiagnostic() {
  console.log('='.repeat(70));
  console.log('WASM SDK DIAGNOSTIC TEST');
  console.log('='.repeat(70));
  console.log('');

  // Test 1: WASM Initialization
  try {
    console.log('[TEST 1] WASM Module Initialization');
    console.log('  Status: Starting...');
    await init();
    console.log('  ✓ WASM initialized successfully');
  } catch (error) {
    console.log('  ✗ WASM initialization failed:', error.message);
    process.exit(1);
  }
  console.log('');

  // Test 2: Prefetch Testnet
  try {
    console.log('[TEST 2] Prefetch Trusted Quorums for Testnet');
    console.log('  Status: Starting prefetch...');
    const startPrefetch = Date.now();
    await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
    const prefetchTime = Date.now() - startPrefetch;
    console.log(`  ✓ Prefetch completed in ${prefetchTime}ms`);
  } catch (error) {
    console.log('  ✗ Prefetch failed:', error.message);
    process.exit(1);
  }
  console.log('');

  // Test 3: Builder Creation
  let builder;
  try {
    console.log('[TEST 3] Create WasmSdkBuilder (Testnet - Trusted)');
    console.log('  Status: Creating builder...');
    builder = sdk.WasmSdkBuilder.testnetTrusted();
    console.log('  ✓ Builder created successfully');
    console.log('  Builder type:', typeof builder);
    console.log('  Builder constructor:', builder.constructor.name);
  } catch (error) {
    console.log('  ✗ Builder creation failed:', error.message);
    process.exit(1);
  }
  console.log('');

  // Test 4: Client Build
  let client;
  try {
    console.log('[TEST 4] Build WasmSdk Client');
    console.log('  Status: Building client...');
    const startBuild = Date.now();
    client = await builder.build();
    const buildTime = Date.now() - startBuild;
    console.log(`  ✓ Client built successfully in ${buildTime}ms`);
    console.log('  Client type:', typeof client);
    console.log('  Client constructor:', client.constructor.name);
  } catch (error) {
    console.log('  ✗ Client build failed:', error.message);
    if (error.stack) {
      console.log('  Stack:', error.stack);
    }
    process.exit(1);
  }
  console.log('');

  // Test 5: Simple Quorum Verify
  try {
    console.log('[TEST 5] Verify Quorum Setup');
    console.log('  Status: Checking quorum configuration...');
    // This is a placeholder - we'll try to call a method that uses quorum
    console.log('  Note: Quorum verification requires network call');
  } catch (error) {
    console.log('  Error:', error.message);
  }
  console.log('');

  // Test 6: Attempt Identity Fetch
  try {
    console.log('[TEST 6] Fetch Identity (with timeout)');
    console.log('  Status: Attempting to fetch identity...');
    console.log('  Identity ID: 5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');
    console.log('  This may timeout if quorum is not reachable');

    const fetchPromise = client.getIdentity('5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk');

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Fetch timeout after 10 seconds')), 10000)
    );

    const startFetch = Date.now();
    const identity = await Promise.race([fetchPromise, timeoutPromise]);
    const fetchTime = Date.now() - startFetch;

    console.log(`  ✓ Identity fetched in ${fetchTime}ms`);
    if (identity) {
      console.log('  Identity type:', typeof identity);
      console.log('  Identity constructor:', identity.constructor.name);
    }
  } catch (error) {
    console.log('  ✗ Identity fetch failed:', error.message);
    if (error.stack) {
      console.log('  Stack trace:');
      const lines = error.stack.split('\n').slice(0, 5);
      lines.forEach(line => console.log('    ' + line));
    }
    // Don't exit - continue to cleanup
  }
  console.log('');

  // Cleanup
  try {
    console.log('[CLEANUP] Freeing resources');
    if (client) {
      client.free();
      console.log('  ✓ Client freed');
    }
  } catch (error) {
    console.log('  Error during cleanup:', error.message);
  }
  console.log('');

  console.log('='.repeat(70));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(70));
}

runDiagnostic().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
