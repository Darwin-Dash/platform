#!/usr/bin/env node

/**
 * Test what methods are available on DAPI core client
 */

const DAPIClient = require('@dashevo/dapi-client');

async function main() {
  console.log('=== DAPI Core Methods Test ===\n');

  const dapiClient = new DAPIClient({
    network: 'testnet',
    timeout: 30000,
  });

  console.log('Available methods on dapiClient.core:\n');
  const coreMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(dapiClient.core))
    .filter(name => typeof dapiClient.core[name] === 'function' && name !== 'constructor');

  coreMethods.forEach(method => {
    console.log(`  - ${method}`);
  });

  console.log('\n=== Testing Specific Methods ===\n');

  // Test getBlockByHeight
  console.log('Testing getBlockByHeight...');
  try {
    const result = await dapiClient.core.getBlockByHeight(1353469);
    console.log('✅ getBlockByHeight works!');
    console.log('  Result:', JSON.stringify(result, null, 2).substring(0, 200));
  } catch (error) {
    console.log(`❌ getBlockByHeight failed: ${error.message}`);
  }

  // Test getBlockByHash
  console.log('\nTesting getBlockByHash...');
  try {
    const result = await dapiClient.core.getBlockByHash('0000018f8581f81fe922b16c5597d7ac0ffeb424531353b4d74e5da4bac9196a');
    console.log('✅ getBlockByHash works!');
    console.log('  Result keys:', Object.keys(result));
    console.log('  Height:', result.height);
    console.log('  Header:', result.header ? 'present' : 'missing');
  } catch (error) {
    console.log(`❌ getBlockByHash failed: ${error.message}`);
  }

  // Test getBlockHash
  console.log('\nTesting getBlockHash...');
  try {
    const result = await dapiClient.core.getBlockHash(1353469);
    console.log('✅ getBlockHash works!');
    console.log('  Result:', result);
  } catch (error) {
    console.log(`❌ getBlockHash failed: ${error.message}`);
  }

  console.log('\nDone!');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
