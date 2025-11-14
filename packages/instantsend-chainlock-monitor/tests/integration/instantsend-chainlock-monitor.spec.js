/**
 * Integration test for InstantSend ChainLock Monitor
 *
 * Tests the library on testnet by monitoring an address for InstantSend and ChainLock confirmations.
 * This test validates that InstantSend and ChainLock detection work as expected.
 *
 * Usage:
 *   TESTNET_ADDRESS=yX3CJJ42... node tests/integration/instantsend-chainlock-monitor.spec.js
 *
 * While test is running, send a small amount of DASH to the address from Dash Core wallet.
 */

import { InstantSendChainLockMonitor } from '../../dist/index.js';
import dotenv from 'dotenv';

dotenv.config();

const TESTNET_ADDRESS = process.env.TESTNET_ADDRESS;
const TEST_DURATION_MS = 300000; // 5 minutes

if (!TESTNET_ADDRESS) {
  console.error('❌ Error: TESTNET_ADDRESS not set in .env file');
  process.exit(1);
}

async function runIntegrationTest() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('🧪 InstantSend ChainLock Monitor Integration Test');
  console.log('═'.repeat(60));
  console.log('Network: testnet');
  console.log('Address:', TESTNET_ADDRESS);
  console.log('Duration:', TEST_DURATION_MS / 1000, 'seconds');
  console.log('');
  console.log('Send DASH to the address above to test payment detection');
  console.log('═'.repeat(60));
  console.log('');

  const monitor = new InstantSendChainLockMonitor({
    network: 'testnet',
    debug: true,
  });

  let detectedTransactions = 0;
  let instantLockCount = 0;
  let chainLockCount = 0;

  const unsubscribe = await monitor.watchAddresses(TESTNET_ADDRESS, {
    onTransaction: (tx) => {
      detectedTransactions++;
      console.log('📥 Transaction detected:', tx.txid);
    },
    onInstantLock: (lock) => {
      instantLockCount++;
      console.log('⚡ InstantLock received:', lock.txid);
      console.log('   Latency:', lock.latency, 'ms');
    },
    onChainLock: (cl) => {
      chainLockCount++;
      console.log('⛓️  ChainLock confirmed:', cl.txid);
      console.log('   Block:', cl.blockHeight);
      console.log('   Latency:', cl.latency, 'ms');
    },
    onBlockInclusion: (block) => {
      console.log('📦 Block inclusion:', block.txid, 'in block', block.blockHeight);
    },
  });

  console.log('✅ Monitoring started');
  console.log('⏳ Waiting for payments...');
  console.log('');

  // Wait for test duration
  await new Promise((resolve) => {
    setTimeout(() => {
      console.log('');
      console.log('⏱️  Test duration complete');
      unsubscribe();
      resolve();
    }, TEST_DURATION_MS);
  });

  // Print results
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('═'.repeat(60));
  console.log('Transactions detected:', detectedTransactions);
  console.log('InstantLocks received:', instantLockCount);
  console.log('ChainLocks confirmed:', chainLockCount);
  console.log('');

  const status = monitor.getStatus();
  console.log('Final status:', status);
  console.log('═'.repeat(60));
  console.log('');

  if (detectedTransactions > 0) {
    console.log('✅ Test PASSED - Payment detection working');
  } else {
    console.log('⚠️  Test INCOMPLETE - No payments received during test period');
    console.log('   This is expected if no DASH was sent to the address');
  }

  console.log('');
  process.exit(0);
}

runIntegrationTest().catch((error) => {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
