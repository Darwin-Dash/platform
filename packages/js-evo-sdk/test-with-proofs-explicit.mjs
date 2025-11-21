#!/usr/bin/env node

/**
 * Test fetching identity WITH proofs explicitly enabled
 */

import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Testing identity fetch WITH proofs explicitly enabled\n');

await init();
console.log('✓ WASM initialized');

// Create trusted builder
const builder = sdk.WasmSdkBuilder.testnetTrusted();
console.log('✓ Builder created (testnetTrusted)');

// Explicitly ENABLE proofs
const builderWithProofs = builder.withProofs(true);
console.log('✓ Proofs ENABLED with withProofs(true)');

// Also call prefetch to populate quorum cache
console.log('\nPrefetching quorums...');
await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
console.log('✓ Quorum prefetch completed');

const client = await builderWithProofs.build();
console.log('✓ Client built');

try {
  const identityId = 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';
  console.log(`\nFetching identity: ${identityId}`);
  console.log('With proofs: TRUE (requires quorum verification)');

  const identity = await client.getIdentity(identityId);

  if (identity) {
    console.log('\n✓ SUCCESS! Identity fetched WITH proof verification!');
    console.log('  Type:', identity.constructor.name);
  } else {
    console.log('✗ Identity returned null');
  }
} catch (error) {
  console.log('✗ Failed:', error.message);
  console.log('\nIf error is "quorum not found", that means:');
  console.log('  - Proofs ARE being requested');
  console.log('  - Quorum verification IS happening');
  console.log('  - But the identity\'s quorum isn\'t in cache');
}

client.free();
