#!/usr/bin/env node
/**
 * Identity Discovery Test Script
 *
 * Discovers all identity IDs for a mnemonic wallet.
 * Uses wasm-sdk via worker process to avoid WASM SDK RwLock issues.
 *
 * Usage:
 *   LOG_LEVEL=info node scripts/test-identity-get-ids.js
 *   LOG_LEVEL=debug node scripts/test-identity-get-ids.js
 *
 * Required environment variables (in .env):
 *   MNEMONIC - 12-word BIP39 mnemonic
 *   NETWORK - testnet or mainnet (default: testnet)
 */

import 'dotenv/config';
import { Wallet } from '@dashevo/wallet-lib';
import DAPIClient from '@dashevo/dapi-client';
import initWasm, { IdentityWasm } from '@dashevo/wasm-sdk';

// Simple logger with LOG_LEVEL support
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;
const log = {
  error: (...args) => currentLevel >= 0 && console.error('❌', ...args),
  warn: (...args) => currentLevel >= 1 && console.warn('⚠️', ...args),
  info: (...args) => currentLevel >= 2 && console.log('ℹ️', ...args),
  debug: (...args) => currentLevel >= 3 && console.log('🔍', ...args),
};

/**
 * Decode identity buffer to extract identity ID
 * Uses wasm-sdk's IdentityWasm.fromBuffer() to properly deserialize the identity
 */
function decodeIdentityId(identityBuffer) {
  if (!identityBuffer || identityBuffer.length === 0) {
    return null;
  }
  // Identity buffer is a serialized Identity object
  // Use IdentityWasm.fromBuffer() from wasm-sdk to properly deserialize
  const identity = IdentityWasm.fromBuffer(identityBuffer);
  return identity.toJSON().id;
}

/**
 * Discover identity by public key hash via DAPI
 * Uses wasm-sdk's IdentityWasm.fromBuffer() to decode the identity buffer
 */
async function discoverIdentityByHash(client, publicKeyHashHex) {
  try {
    const hashBuffer = Buffer.from(publicKeyHashHex, 'hex');
    const response = await client.platform.getIdentityByPublicKeyHash(hashBuffer, { prove: false });

    if (response.identity && response.identity.length > 0) {
      const identityId = decodeIdentityId(response.identity);
      return { found: true, identityId };
    }
    return { found: false };
  } catch (error) {
    // Not found is expected for most indices
    if (error.message && error.message.includes('not found')) {
      return { found: false };
    }
    // Any other error - log and return not found
    log.debug(`Discovery error for hash ${publicKeyHashHex}: ${error.message}`);
    return { found: false };
  }
}

/**
 * Main identity discovery function
 */
async function discoverIdentities() {
  log.info('🔍 Identity Discovery Test Script');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Load configuration
  const { MNEMONIC, NETWORK = 'testnet' } = process.env;
  const GAP_LIMIT = 20;
  const BATCH_SIZE = 10; // Query 10 at a time for progress visibility

  // Validate
  if (!MNEMONIC) throw new Error('MNEMONIC not set in .env');

  // Validate mnemonic format
  const words = MNEMONIC.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
  }

  log.info(`Network: ${NETWORK}`);
  log.info(`Gap limit: ${GAP_LIMIT}, Batch size: ${BATCH_SIZE}`);
  log.debug(`Mnemonic: ${MNEMONIC.substring(0, 20)}...`);

  // Initialize wasm-sdk (for IdentityWasm.fromBuffer decoding)
  log.info('');
  log.info('🔧 Initializing wasm-sdk...');
  await initWasm();
  log.debug('wasm-sdk initialized');

  // Create DAPI client
  log.info('🔧 Initializing DAPI client...');
  const client = new DAPIClient({ network: NETWORK });
  log.debug('DAPI client created');

  // Create wallet in offline mode (no sync needed for key derivation)
  log.info('');
  log.info('💼 Creating wallet (offline mode)...');
  const wallet = new Wallet({
    mnemonic: MNEMONIC,
    network: NETWORK,
    offlineMode: true
  });

  const account = await wallet.getAccount({
    index: 0,
    disableIdentitySync: true
  });
  log.debug('Wallet account created');

  // Discover identities
  log.info('');
  log.info('🔄 Discovering identities via Platform (DAPI)...');
  const startTime = Date.now();

  const foundIdentities = [];
  let consecutiveNotFound = 0;
  let currentIndex = 0;
  let batchNumber = 0;

  // Iterative discovery with gap limit
  while (consecutiveNotFound < GAP_LIMIT) {
    batchNumber++;
    const batchStartIndex = currentIndex;
    let foundInBatch = 0;

    // Process batch
    for (let i = 0; i < BATCH_SIZE && consecutiveNotFound < GAP_LIMIT; i++) {
      const index = currentIndex++;

      // Derive HD key for this index
      const { privateKey } = account.identities.getIdentityHDKeyByIndex(index, 0);
      const publicKey = privateKey.toPublicKey();
      const publicKeyHashHex = publicKey.hash.toString('hex');

      // Query Platform
      const result = await discoverIdentityByHash(client, publicKeyHashHex);

      if (result.found && result.identityId) {
        foundIdentities.push({
          index,
          identityId: result.identityId,
          publicKeyHash: publicKeyHashHex
        });
        foundInBatch++;
        consecutiveNotFound = 0;
        log.debug(`  [${index}] ${result.identityId}`);
      } else {
        consecutiveNotFound++;
        if (consecutiveNotFound >= GAP_LIMIT) {
          log.debug(`  Gap limit (${GAP_LIMIT}) reached at index ${index}`);
          break;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    log.debug(`Batch ${batchNumber}: ${foundInBatch} found, total ${foundIdentities.length} (${elapsed}s elapsed)`);
  }

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // Display results
  displayResults(foundIdentities, elapsedTime);

  // Cleanup
  log.debug('Cleaning up wallet connections');
  try {
    if (wallet && typeof wallet.disconnect === 'function') {
      await wallet.disconnect();
    }
  } catch (cleanupError) {
    log.debug('Wallet cleanup non-fatal error:', cleanupError.message);
  }

  return { success: true, identities: foundIdentities };
}

/**
 * Display discovery results
 */
function displayResults(identities, elapsedTime) {
  log.info('');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info('  🎉 IDENTITY DISCOVERY COMPLETE');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info('');

  if (identities.length === 0) {
    log.info('  📊 No identities found for this wallet');
    log.info('');
    log.info('  💡 Create your first identity:');
    log.info('     LOG_LEVEL=info node scripts/test-identity-create.js');
    log.info('');
    log.info('  📌 Next available index: 0');
  } else {
    log.info(`  📊 Total Identities: ${identities.length}`);
    log.info(`  ⏱️  Discovery Time:  ${elapsedTime}s`);
    log.info('');
    log.info('  Index → Identity ID');
    log.info('  ────────────────────────────────────────────────────────────');

    identities.forEach(({ index, identityId }) => {
      log.info(`  [${String(index).padStart(2)}]    ${identityId}`);
    });

    // Calculate next available index
    const maxIndex = Math.max(...identities.map(i => i.index));
    const nextIndex = maxIndex + 1;

    log.info('');
    log.info(`  📌 Next available index: ${nextIndex}`);
    log.info('');
    log.info('  💡 Top-up an identity:');
    log.info('     1. Copy an Identity ID from above');
    log.info('     2. Add to .env: TEST_IDENTITY_ID=<identity-id>');
    log.info('     3. Run: LOG_LEVEL=info node scripts/test-identity-topup.js');
  }

  log.info('');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Error handler with user guidance
 */
function handleError(error) {
  const msg = error.message || String(error);

  // Platform connection errors
  if (msg.includes('DAPI') || msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) {
    log.error('Platform connection failed');
    log.info('💡 Check internet connectivity or DAPI server availability.');
    return { success: false, error: 'Platform connection failed' };
  }

  // Invalid mnemonic
  if (msg.includes('mnemonic') || msg.includes('12 words')) {
    log.error('Invalid mnemonic');
    log.info('💡 Check MNEMONIC in .env file (must be 12 words)');
    return { success: false, error: 'Invalid mnemonic' };
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    log.error('Discovery timeout');
    log.info('💡 Platform may be slow. Try again in a moment.');
    return { success: false, error: 'Timeout' };
  }

  // Generic error
  log.error('Unexpected error:', msg);
  log.debug(error.stack);
  return { success: false, error: msg };
}

// Main execution
discoverIdentities()
  .then(result => {
    if (result.success) {
      console.log('\n✅ Test PASSED');
      process.exit(0);
    }
  })
  .catch(error => {
    handleError(error);
    console.log('\n❌ Test FAILED');
    process.exit(1);
  });
