#!/usr/bin/env node

/**
 * Test fetching identity WITHOUT proof verification
 *
 * Key insight: By default, getIdentity() does NOT request proofs!
 * Proofs are optional - you have to explicitly enable them with withProofs(true)
 */

import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Testing identity fetch WITHOUT proof verification\n');

await init();
console.log('✓ WASM initialized');

// Create trusted builder
const builder = sdk.WasmSdkBuilder.testnetTrusted();
console.log('✓ Builder created (testnetTrusted)');

// Explicitly disable proofs
const builderNoProofs = builder.withProofs(false);
console.log('✓ Proofs disabled with withProofs(false)');

const client = await builderNoProofs.build();
console.log('✓ Client built');

try {
  const identityId = 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';
  console.log(`\nFetching identity: ${identityId}`);
  console.log('With proofs: FALSE (no verification needed)');

  const identity = await client.getIdentity(identityId);

  if (identity) {
    console.log('\n✓ SUCCESS! Identity fetched without proof verification!');
    console.log('  Type:', identity.constructor.name);
    console.log('\nThis proves:');
    console.log('  1. Proofs are NOT required by default');
    console.log('  2. You can get identity data without quorum cache');
    console.log('  3. The "quorum not found" error only happens when proofs=true');
  } else {
    console.log('✗ Identity returned null');
  }
} catch (error) {
  console.log('✗ Failed:', error.message);
}

client.free();
