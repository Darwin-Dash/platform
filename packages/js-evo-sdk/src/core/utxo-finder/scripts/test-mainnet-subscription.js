#!/usr/bin/env node

/**
 * Test if subscribeToMasternodeList works on mainnet/evonet
 * Compares against testnet to see if it's network-specific
 */

const DAPIClient = require('@dashevo/dapi-client');

console.log('━'.repeat(70));
console.log('Testing subscribeToMasternodeList on MAINNET/evonet');
console.log('━'.repeat(70));
console.log('grpc-js version:', require('@grpc/grpc-js/package.json').version);
console.log('');

const client = new DAPIClient({
  seeds: ['seed-1.mainnet.networks.dash.org:443'], // Mainnet uses port 443
  network: 'mainnet',
  timeout: 15000,
  retries: 1,
});

let subscriptionAttempted = false;
let subscriptionSucceeded = false;
let errorCount = 0;

// Monitor console.log for subscription events
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.join(' ');

  if (msg.includes('subscribeToMasternodeList')) {
    subscriptionAttempted = true;
  }
  if (msg.includes('Masternode list diff') || (msg.includes('diffCount') && !msg.includes('Error'))) {
    subscriptionSucceeded = true;
  }
  if (msg.includes('14 UNAVAILABLE')) {
    errorCount++;
  }

  // Still output original logs
  originalLog(...args);
};

console.error('Waiting 8 seconds for subscription attempts...');

setTimeout(() => {
  console.error(`Status after 8s: attempted=${subscriptionAttempted}, succeeded=${subscriptionSucceeded}, errors=${errorCount}`);
  console.error('');

  client.core.getBlockchainStatus()
    .then((status) => {
      console.log = originalLog;
      console.log('');
      console.log('━'.repeat(70));
      console.log('RESULT');
      console.log('━'.repeat(70));
      console.log('Blockchain height:', status.chain.headersCount);
      console.log('Subscription attempted:', subscriptionAttempted);
      console.log('Subscription succeeded:', subscriptionSucceeded);
      console.log('Subscription errors:', errorCount);
      console.log('');

      if (subscriptionSucceeded) {
        console.log('✅ MAINNET SUBSCRIPTION WORKS!');
        console.log('   (This means the issue is testnet-specific)');
        process.exit(0);
      } else {
        console.log('❌ MAINNET SUBSCRIPTION ALSO FAILS');
        console.log('   (This is a grpc-js/infrastructure issue across all networks)');
        process.exit(1);
      }
    })
    .catch((e) => {
      console.log = originalLog;
      console.error('ERROR:', e.message);
      process.exit(2);
    });

  setTimeout(() => {
    console.log = originalLog;
    console.error('TIMEOUT - getBlockchainStatus hung');
    process.exit(3);
  }, 20000);
}, 8000);
