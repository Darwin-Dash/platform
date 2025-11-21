import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Test with DETAILED logging\n');

await init();
console.log('[1] WASM initialized');

console.log('[2] About to call prefetch...');
console.time('prefetch');
await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
console.timeEnd('prefetch');
console.log('[3] Prefetch completed');

console.log('[4] Creating builder...');
const builder = sdk.WasmSdkBuilder.testnetTrusted();
console.log('[5] Builder created');

console.log('[6] Building client...');
console.time('build');
const client = await builder.build();
console.timeEnd('build');
console.log('[7] Client built');

try {
  console.log('[8] About to fetch identity...');
  console.time('getIdentity');
  const identity = await client.getIdentity('DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq');
  console.timeEnd('getIdentity');
  console.log('[9] ✓ Identity fetched!');
} catch (error) {
  console.log('[9] ✗ Identity fetch failed');
  console.log('Error:', error.message);
}

client.free();
