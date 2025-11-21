import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Querying identity WITHOUT trusted mode (no quorum verification)...\n');

await init();
console.log('✓ WASM initialized\n');

// Try the testnet() builder (non-trusted)
const builder = sdk.WasmSdkBuilder.testnet();
const client = await builder.build();
console.log('✓ Client built (non-trusted mode - should work)\n');

try {
  const identityId = 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';
  console.log(`Fetching identity: ${identityId}`);
  const identity = await client.getIdentity(identityId);

  if (identity) {
    console.log('✓ Identity fetched successfully!');
    console.log('  Type:', identity.constructor.name);
  } else {
    console.log('✗ Identity returned null');
  }
} catch (error) {
  console.log('✗ Failed:', error.message);
}

client.free();
