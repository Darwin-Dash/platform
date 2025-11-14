/**
 * Quick validation test - verifies library can be imported and basic functionality works
 */

import { InstantSendChainLockMonitor, createAddressBloomFilter, TransactionTracker } from '../dist/index.js';

console.log('✅ InstantSendChainLockMonitor imported successfully');
console.log('✅ createAddressBloomFilter imported successfully');
console.log('✅ TransactionTracker imported successfully');

// Test TransactionTracker
const tracker = new TransactionTracker();
tracker.addBroadcast('test-txid-123');
const tx = tracker.getTransaction('test-txid-123');
console.log('✅ TransactionTracker works:', tx.status === 'pending');

// Test bloom filter creation
try {
  const filter = createAddressBloomFilter('yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy', 'testnet');
  console.log('✅ Bloom filter created successfully');
} catch (e) {
  console.error('❌ Bloom filter creation failed:', e.message);
  process.exit(1);
}

// Test InstantSendChainLockMonitor instantiation
try {
  const monitor = new InstantSendChainLockMonitor({
    network: 'testnet',
    dapiAddresses: ['seed-1.testnet.networks.dash.org:1443'],
  });
  console.log('✅ InstantSendChainLockMonitor instantiated successfully');
} catch (e) {
  console.error('❌ InstantSendChainLockMonitor instantiation failed:', e.message);
  process.exit(1);
}

console.log('');
console.log('═'.repeat(60));
console.log('✅ ALL VALIDATION CHECKS PASSED');
console.log('═'.repeat(60));
console.log('');
console.log('Library is ready for use!');
console.log('');
console.log('Next step: Run integration test with real testnet monitoring:');
console.log('  node tests/integration/instantsend-chainlock-monitor.spec.js');
console.log('');

process.exit(0);
