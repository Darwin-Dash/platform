#!/usr/bin/env node

/**
 * Compare seed-based vs whitelist-direct approaches
 *
 * This measures the actual performance difference between:
 * 1. Current behavior: Using seeds (triggers subscription wait + fallback)
 * 2. Proposed behavior: Using whitelist directly (no subscription wait)
 */

const DAPIClient = require('@dashevo/dapi-client');
const networkConfigs = require('@dashevo/dapi-client/lib/networkConfigs');

console.log('=== Comparing Seeds vs Whitelist Direct ===\n');

async function testSeeds() {
  console.log('Test 1: Using seeds (current behavior)');
  console.log('Seeds: seed-1.testnet.networks.dash.org:1443\n');

  const startTime = Date.now();

  const client = new DAPIClient({
    seeds: ['seed-1.testnet.networks.dash.org:1443'],
    network: 'testnet',
  });

  try {
    const status = await client.core.getBlockchainStatus();
    const elapsed = Date.now() - startTime;

    console.log(`✅ Seeds approach SUCCESS in ${elapsed}ms`);
    console.log(`   Height: ${status.chain.headersCount}\n`);
    return elapsed;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Seeds approach FAILED after ${elapsed}ms`);
    console.error(`   Error: ${error.message}\n`);
    return elapsed;
  }
}

async function testWhitelist() {
  console.log('Test 2: Using whitelist directly (proposed behavior)');
  console.log(`Whitelist: ${networkConfigs.testnet.dapiAddressesWhiteList.length} IPs\n`);

  const startTime = Date.now();

  const client = new DAPIClient({
    dapiAddresses: networkConfigs.testnet.dapiAddressesWhiteList,
    network: 'testnet',
  });

  try {
    const status = await client.core.getBlockchainStatus();
    const elapsed = Date.now() - startTime;

    console.log(`✅ Whitelist approach SUCCESS in ${elapsed}ms`);
    console.log(`   Height: ${status.chain.headersCount}\n`);
    return elapsed;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Whitelist approach FAILED after ${elapsed}ms`);
    console.error(`   Error: ${error.message}\n`);
    return elapsed;
  }
}

async function main() {
  // Test seeds first
  const seedsTime = await testSeeds();

  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test whitelist
  const whitelistTime = await testWhitelist();

  // Compare results
  console.log('=== Results ===\n');
  console.log(`Seeds approach:     ${seedsTime}ms`);
  console.log(`Whitelist approach: ${whitelistTime}ms`);

  if (whitelistTime < seedsTime) {
    const improvement = seedsTime - whitelistTime;
    const percent = ((improvement / seedsTime) * 100).toFixed(1);
    console.log(`\n🎉 Whitelist is FASTER by ${improvement}ms (${percent}% improvement)`);
  } else if (whitelistTime > seedsTime) {
    const regression = whitelistTime - seedsTime;
    const percent = ((regression / seedsTime) * 100).toFixed(1);
    console.log(`\n⚠️  Whitelist is SLOWER by ${regression}ms (${percent}% slower)`);
    console.log('This suggests network conditions may be affecting the whitelist IPs.');
  } else {
    console.log('\n🤷 Both approaches took the same time.');
  }

  console.log('\nNote: The key benefit of whitelist-direct is avoiding subscription');
  console.log('errors and retries, which can add significant overhead.\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
