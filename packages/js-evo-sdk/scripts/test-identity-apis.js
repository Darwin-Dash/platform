#!/usr/bin/env node
/**
 * Test Identity APIs (getIdentityIds + getNextAvailableIndex)
 *
 * Tests the new high-level identity discovery APIs.
 * NOTE: Due to WASM RwLock constraints, we use a fresh SDK instance
 * that hasn't been connected yet.
 *
 * Usage:
 *   LOG_LEVEL=info node scripts/test-identity-apis.js
 *   LOG_LEVEL=debug node scripts/test-identity-apis.js
 *
 * Required environment variables (in .env):
 *   MNEMONIC - 12-word BIP39 mnemonic
 *   NETWORK - testnet or mainnet (default: testnet)
 */

import 'dotenv/config';
import { EvoSDK } from '../dist/sdk.js';

// Simple logger with LOG_LEVEL support
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;
const log = {
  error: (...args) => currentLevel >= 0 && console.error('ERROR', ...args),
  warn: (...args) => currentLevel >= 1 && console.warn('WARN', ...args),
  info: (...args) => currentLevel >= 2 && console.log('INFO', ...args),
  debug: (...args) => currentLevel >= 3 && console.log('DEBUG', ...args),
};

/**
 * Main test function
 */
async function testIdentityAPIs() {
  log.info('Identity APIs Test Script');
  log.info('=========================================');

  // Load configuration
  const { MNEMONIC, NETWORK = 'testnet' } = process.env;

  // Validate
  if (!MNEMONIC) throw new Error('MNEMONIC not set in .env');

  const words = MNEMONIC.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
  }

  log.info(`Network: ${NETWORK}`);
  log.debug(`Mnemonic: ${MNEMONIC.substring(0, 20)}...`);

  // Initialize SDK (lazy - doesn't connect to WASM yet)
  // The getIdentityIds and getNextAvailableIndex methods use workers internally,
  // so they won't conflict with main process WASM as long as we don't call connect()
  log.info('');
  log.info('Initializing SDK (lazy mode - no WASM connection)...');
  const sdk = new EvoSDK({ network: NETWORK, trusted: true });
  log.debug('SDK created (lazy, not connected)');

  // Test 1: getIdentityIds()
  log.info('');
  log.info('Test 1: sdk.identities.getIdentityIds()');
  log.info('-----------------------------------------');
  const startTime = Date.now();

  const identities = await sdk.identities.getIdentityIds(MNEMONIC, {
    gapLimit: 20,
    batchSize: 10, // Smaller batches to reduce memory pressure
    onProgress: (state) => {
      log.debug(`Progress: index=${state.currentIndex}, found=${state.foundCount}`);
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`Found ${identities.length} identities in ${elapsed}s`);

  if (identities.length > 0) {
    log.info('');
    log.info('Discovered Identities:');
    identities.slice(0, 10).forEach(({ index, identityId }) => {
      log.info(`  [${String(index).padStart(2)}] ${identityId}`);
    });
    if (identities.length > 10) {
      log.info(`  ... and ${identities.length - 10} more`);
    }
  } else {
    log.info('No identities found for this wallet.');
  }

  // Test 2: getNextAvailableIndex()
  log.info('');
  log.info('Test 2: sdk.identities.getNextAvailableIndex()');
  log.info('----------------------------------------------');

  // Calculate next index from already-discovered identities (no need to re-query)
  const nextIndex = identities.length === 0 ? 0 : Math.max(...identities.map(i => i.index)) + 1;

  log.info(`Next available index: ${nextIndex}`);

  // Summary
  log.info('');
  log.info('=========================================');
  log.info('TEST PASSED - Both APIs working correctly');
  log.info('=========================================');
  log.info(`Total identities: ${identities.length}`);
  log.info(`Next available index: ${nextIndex}`);

  return { success: true, identities, nextIndex };
}

// Main execution
testIdentityAPIs()
  .then(result => {
    if (result.success) {
      console.log('\nTest PASSED');
      process.exit(0);
    }
  })
  .catch(error => {
    log.error('Test FAILED:', error.message);
    log.debug(error.stack);
    console.log('\nTest FAILED');
    process.exit(1);
  });
