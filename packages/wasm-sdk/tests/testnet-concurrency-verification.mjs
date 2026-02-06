/**
 * Testnet verification script for RwLock fix.
 * Run with: node tests/testnet-concurrency-verification.mjs
 */
import init, * as sdk from '../dist/sdk.js';

async function main() {
  console.log('Initializing WASM SDK...');
  await init();

  console.log('Prefetching testnet quorums (this may take 10-30s)...');
  await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();

  console.log('Building testnet trusted SDK...');
  const client = sdk.WasmSdkBuilder.testnetTrusted().build();

  // DPNS contract exists on all networks
  const DPNS_CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

  console.log('\n=== Test 1: Concurrent contract fetches ===');
  const contractFetches = [];
  for (let i = 0; i < 5; i++) {
    contractFetches.push(client.getDataContract(DPNS_CONTRACT));
  }
  const contracts = await Promise.all(contractFetches);
  console.log(`✓ ${contracts.length} concurrent contract fetches completed`);

  console.log('\n=== Test 2: Concurrent DPNS lookups ===');
  // Look up 'dash' TLD which exists on all networks
  const dpnsLookups = [];
  for (let i = 0; i < 3; i++) {
    dpnsLookups.push(client.dpnsResolveName('dash'));
  }
  const dpnsResults = await Promise.all(dpnsLookups);
  console.log(`✓ ${dpnsResults.length} concurrent DPNS lookups completed`);

  console.log('\n=== Test 3: Mixed concurrent operations ===');
  const mixedOps = [
    client.getDataContract(DPNS_CONTRACT),
    client.dpnsResolveName('dash'),
    client.getDataContract(DPNS_CONTRACT),
    client.getStatus(),
  ];
  const mixedResults = await Promise.all(mixedOps);
  console.log(`✓ ${mixedResults.length} mixed concurrent operations completed`);

  console.log('\n=== Test 4: Rapid sequential then parallel ===');
  for (let i = 0; i < 3; i++) {
    await client.getStatus();
  }
  const parallelStatus = await Promise.all([
    client.getStatus(),
    client.getStatus(),
    client.getStatus(),
  ]);
  console.log(`✓ Sequential and parallel status checks completed`);

  console.log('\n✅ All testnet concurrency tests passed!');
  console.log('The RwLock fix is working correctly.\n');

  client.free();
}

main().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
