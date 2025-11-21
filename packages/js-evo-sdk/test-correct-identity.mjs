#!/usr/bin/env node
import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Testing with CORRECT identity from .env: DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq\n');

await init();
console.log('✓ WASM initialized');

await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
console.log('✓ Prefetch completed');

const builder = sdk.WasmSdkBuilder.testnetTrusted();
const client = await builder.build();
console.log('✓ Client built');

try {
  const identity = await client.getIdentity('DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq');
  console.log('✓ Identity fetched successfully!');
  console.log('Identity:', identity);
} catch (error) {
  console.log('✗ Failed:', error.message);
}

client.free();
