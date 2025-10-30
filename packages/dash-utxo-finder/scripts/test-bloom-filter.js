#!/usr/bin/env node

/**
 * Test bloom filter construction to verify it correctly matches addresses
 */

const { BloomFilter, Address } = require('@dashevo/dashcore-lib');

const TEST_ADDRESS = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const NETWORK = 'testnet';

console.log('=== Bloom Filter Construction Test ===\n');
console.log(`Test Address: ${TEST_ADDRESS}`);
console.log(`Network: ${NETWORK}\n`);

try {
  // Create address object
  console.log('Creating Address object...');
  const address = Address.fromString(TEST_ADDRESS, NETWORK);

  console.log('Address details:');
  console.log(`  toString: ${address.toString()}`);
  console.log(`  hashBuffer: ${address.hashBuffer.toString('hex')}`);
  console.log(`  hashBuffer length: ${address.hashBuffer.length} bytes`);
  console.log(`  type: ${address.type}`);
  console.log(`  network: ${address.network}\n`);

  // Create bloom filter with same parameters as our code
  console.log('Creating bloom filter...');
  const BLOOM_FALSE_POSITIVE_RATE = 0.0001;

  const filter = BloomFilter.create(
    1 * 10, // addresses.length * 10 (1 address)
    BLOOM_FALSE_POSITIVE_RATE,
    0, // nTweak
    BloomFilter.BLOOM_UPDATE_ALL
  );

  console.log('Bloom filter created:');
  console.log(`  vData length: ${filter.vData.length} bytes`);
  console.log(`  nHashFuncs: ${filter.nHashFuncs}`);
  console.log(`  nTweak: ${filter.nTweak}`);
  console.log(`  nFlags: ${filter.nFlags}\n`);

  // Insert address into filter
  console.log(`Inserting address hashBuffer into bloom filter...`);
  filter.insert(address.hashBuffer);

  console.log(`✅ Address inserted successfully\n`);

  // Test if filter matches the address
  console.log('Testing bloom filter match...');
  const matches = filter.contains(address.hashBuffer);
  console.log(`  Filter contains address: ${matches ? '✅ YES' : '❌ NO'}\n`);

  if (!matches) {
    console.log('⚠️  WARNING: Bloom filter does not match the address it should contain!');
    console.log('This indicates a bloom filter construction bug.\n');
  } else {
    console.log('✅ Bloom filter correctly matches the address');
    console.log('The bloom filter construction is correct.\n');
  }

  // Show final filter parameters for DAPI
  console.log('Final bloom filter for DAPI:');
  console.log(`  vData: ${Buffer.from(filter.vData).toString('hex')}`);
  console.log(`  vData (base64): ${Buffer.from(filter.vData).toString('base64')}`);
  console.log(`  nHashFuncs: ${filter.nHashFuncs}`);
  console.log(`  nTweak: ${filter.nTweak}`);
  console.log(`  nFlags: ${filter.nFlags}\n`);

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
