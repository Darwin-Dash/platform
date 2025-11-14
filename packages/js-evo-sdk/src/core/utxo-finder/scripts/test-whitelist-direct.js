#!/usr/bin/env node

/**
 * Test using testnet whitelist IPs directly as dapiAddresses
 *
 * This validates that bypassing the subscription wait and using whitelist
 * addresses immediately will work reliably.
 *
 * Expected results:
 * - Query completes in <500ms (vs ~2.7s with seed subscription wait)
 * - No "14 UNAVAILABLE" subscription errors
 * - Valid blockchain data returned
 */

const DAPIClient = require('@dashevo/dapi-client');
const networkConfigs = require('@dashevo/dapi-client/lib/networkConfigs');

console.log('=== Testing Whitelist Direct Approach ===\n');

// Test 1: Using whitelist directly (bypassing seeds)
console.log('Test 1: Using whitelist IPs directly as dapiAddresses');
console.log(`Whitelist has ${networkConfigs.testnet.dapiAddressesWhiteList.length} addresses\n`);

const startTime = Date.now();

const client = new DAPIClient({
  dapiAddresses: networkConfigs.testnet.dapiAddressesWhiteList,
  network: 'testnet',
});

console.log('DAPIClient created, making first query...');

client.core.getBlockchainStatus()
  .then((status) => {
    const elapsed = Date.now() - startTime;

    console.log('\n✅ SUCCESS!');
    console.log(`\nTime to first query: ${elapsed}ms`);
    console.log(`Expected: <500ms (without subscription wait)`);
    console.log(`Current behavior with seeds: ~2700ms (with subscription timeout)\n`);

    console.log('Blockchain data:');
    console.log(`  - Height: ${status.chain.headersCount}`);
    console.log(`  - Best block hash: ${status.chain.bestBlockHash}`);
    console.log(`  - Chain: ${status.chain.name}`);
    console.log(`  - Network: ${status.network}\n`);

    if (elapsed < 1000) {
      console.log('🎉 Excellent! Query completed in less than 1 second.');
      console.log('This proves the whitelist-first approach will eliminate the 2.7s delay.\n');
    } else if (elapsed < 2000) {
      console.log('⚠️  Query took over 1 second but less than 2 seconds.');
      console.log('This is still faster than the current 2.7s subscription wait.\n');
    } else {
      console.log('⚠️  Query took over 2 seconds.');
      console.log('This is unexpected - may indicate network issues.\n');
    }

    process.exit(0);
  })
  .catch((error) => {
    const elapsed = Date.now() - startTime;

    console.error('\n❌ FAILED!');
    console.error(`\nTime before error: ${elapsed}ms`);
    console.error(`Error: ${error.message}`);
    console.error(`Code: ${error.code}`);

    if (error.code === 14) {
      console.error('\nThis is a "14 UNAVAILABLE" error.');
      console.error('This suggests the whitelist IPs may also be unreachable.');
      console.error('Network may be experiencing issues.\n');
    }

    process.exit(1);
  });

// Set a timeout in case the query hangs
setTimeout(() => {
  console.error('\n❌ TIMEOUT after 30 seconds');
  console.error('Query did not complete in reasonable time.');
  console.error('This suggests connectivity issues with the whitelist IPs.\n');
  process.exit(1);
}, 30000);
