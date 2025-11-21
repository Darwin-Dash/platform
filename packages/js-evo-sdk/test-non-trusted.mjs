#!/usr/bin/env node
import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Testing NON-TRUSTED mode (no quorum verification)\n');

await init();
console.log('✓ WASM initialized');

// NO prefetch - not needed for non-trusted
const builder = sdk.WasmSdkBuilder.testnet();  // NOT testnetTrusted()
const client = await builder.build();
console.log('✓ Client built (non-trusted mode)');

try {
  const identity = await client.getIdentity('DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq');
  console.log('✓ Identity fetched successfully!');
  console.log('Type:', typeof identity);
} catch (error) {
  console.log('✗ Failed:', error.message);
}

client.free();
