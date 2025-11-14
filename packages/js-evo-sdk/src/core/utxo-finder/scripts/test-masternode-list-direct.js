#!/usr/bin/env node

/**
 * Direct Masternode List Subscription Test
 *
 * Tests if a whitelisted masternode can serve the masternode list
 * (bypassing seeds to isolate the problem)
 */

import DAPIClient from '@dashevo/dapi-client';

const MASTERNODE_IP = '44.239.39.153:1443'; // From whitelist

console.log('━'.repeat(70));
console.log('Testing subscribeToMasternodeList on Whitelisted Masternode');
console.log('━'.repeat(70));
console.log(`Target: ${MASTERNODE_IP}`);
console.log();

async function testDirectMasternodeConnection() {
  console.log('Creating DAPIClient with direct masternode address...');

  const client = new DAPIClient({
    dapiAddresses: [MASTERNODE_IP],
    network: 'testnet',
    timeout: 10000,
    retries: 2,
  });

  console.log('✅ DAPIClient created');
  console.log();

  // Test 1: Unary RPC
  console.log('Test 1: Unary RPC (getBlockchainStatus)');
  try {
    const start = Date.now();
    const status = await client.core.getBlockchainStatus();
    const duration = Date.now() - start;
    console.log(`✅ SUCCESS in ${duration}ms`);
    console.log(`   Block height: ${status.chain?.blocksCount || status.blocks}`);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    return;
  }

  console.log();

  // Test 2: Try to trigger masternode list subscription
  console.log('Test 2: Masternode List Subscription');
  console.log('Attempting to subscribe to masternode list stream...');
  console.log('(This happens internally when DAPIClient needs MN addresses)');
  console.log();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('⏱️  Timed out after 45 seconds');
      console.log();
      console.log('CONCLUSION:');
      console.log('  If you see subscription retry errors above, the masternode');
      console.log('  is NOT providing the list (same issue as seeds).');
      console.log();
      console.log('  If NO errors, the subscription succeeded quietly in background.');
      resolve();
    }, 45000);

    // Make a request that would benefit from masternode discovery
    // This should trigger the subscription internally
    setTimeout(async () => {
      try {
        await client.core.getBlockchainStatus();
        console.log('Query completed - check for subscription errors above');
      } catch (e) {
        console.log(`Query error: ${e.message}`);
      }

      // Give some time for subscription to complete
      setTimeout(() => {
        clearTimeout(timeout);
        console.log();
        console.log('RESULT:');
        console.log('  Check the debug logs above for:');
        console.log('  - "subscribeToMasternodeList" attempts');
        console.log('  - "14 UNAVAILABLE" errors');
        console.log('  - "Masternode list diff received" success messages');
        resolve();
      }, 10000);
    }, 5000);
  });
}

// Enable gRPC debug logging
process.env.GRPC_VERBOSITY = 'DEBUG';
process.env.GRPC_TRACE = 'call_stream';

testDirectMasternodeConnection()
  .then(() => {
    console.log();
    console.log('Test complete');
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
