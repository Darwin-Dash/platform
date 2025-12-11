#!/usr/bin/env node
/**
 * Standalone Identity Creation Test Script
 *
 * Tests the identity creation flow with automatic discovery.
 * Uses getIdentityIds() API to discover existing identities and
 * automatically creates a new identity at the next available index.
 *
 * Usage:
 *   LOG_LEVEL=info node scripts/test-identity-create.js
 *   LOG_LEVEL=debug node scripts/test-identity-create.js
 *
 * Required environment variables (in .env):
 *   MNEMONIC - Funded testnet wallet mnemonic
 *   START_HEIGHT - Blockchain height to start sync (default: 1)
 *   NETWORK - testnet or mainnet (default: testnet)
 */

import 'dotenv/config';
import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';
import { EvoSDK } from '../dist/sdk.js';

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
 * Get identity balance via DAPI (bypasses WASM SDK)
 * This allows checking balance without interfering with WASM operations
 */
async function getBalanceViaDAPI(identityId) {
  const client = new DAPIClient({ network: process.env.NETWORK || 'testnet' });
  const idBuffer = Buffer.from(bs58.decode(identityId));
  const response = await client.platform.getIdentityBalance(idBuffer, { prove: false });
  return Number(response.balance);
}

/**
 * Main test function
 */
async function testIdentityCreate() {
  log.info('🆔 Identity Creation Test Script');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Load configuration
  const { MNEMONIC, START_HEIGHT = '1', NETWORK = 'testnet' } = process.env;
  const INITIAL_BALANCE = 200000; // 0.002 DASH (minimum for identity creation)

  // Validate
  if (!MNEMONIC) throw new Error('MNEMONIC not set in .env');

  log.info(`Initial balance: ${INITIAL_BALANCE} duffs`);
  log.info(`Network: ${NETWORK}`);
  log.debug(`Start height: ${START_HEIGHT}`);
  log.debug(`Mnemonic: ${MNEMONIC.substring(0, 20)}...`);

  // Initialize SDK
  log.info('');
  log.info('🔧 Initializing SDK...');
  const sdk = new EvoSDK({ network: NETWORK, trusted: true });
  log.debug('SDK created (lazy connect)');

  // Discover existing identities BEFORE creation
  log.info('');
  log.info('📊 Discovering existing identities (via getIdentityIds)...');
  const identitiesBefore = await sdk.identities.getIdentityIds(MNEMONIC, { gapLimit: 20 });
  const nextIndex = identitiesBefore.length > 0
    ? Math.max(...identitiesBefore.map(i => i.index)) + 1
    : 0;
  log.info(`Found ${identitiesBefore.length} existing identities`);
  log.info(`Next available index: ${nextIndex}`);

  // Execute identity creation (auto-discovery happens internally too)
  log.info('');
  log.info('🔄 Creating identity via sdk.identities.createWithWallet()...');
  log.debug('createWithWallet() will use getIdentityIds() internally for auto-discovery');
  const startTime = Date.now();

  const result = await sdk.identities.createWithWallet(
    MNEMONIC,
    INITIAL_BALANCE,
    {
      useSourceAsChangeAddress: true,
      startHeight: parseInt(START_HEIGHT, 10),
      onProgress: (event) => log.debug(`[Progress] ${event.phase}: ${event.message}`)
    }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`✅ Identity creation completed in ${elapsed}s`);

  // Verify identity on Platform
  log.info('');
  log.info('📊 Verifying identity on Platform (via DAPI)...');
  const balance = await getBalanceViaDAPI(result.identityId);
  log.info(`Identity balance: ${balance.toLocaleString()} credits`);

  // Verify identity count increased
  log.info('');
  log.info('📊 Verifying identity count increased...');
  const identitiesAfter = await sdk.identities.getIdentityIds(MNEMONIC, { gapLimit: 20 });
  log.info(`Now have ${identitiesAfter.length} identities (was ${identitiesBefore.length})`);

  // Success summary
  log.info('');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info('  🎉 TEST PASSED - Identity Created Successfully');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info(`  Identity:      ${result.identityId}`);
  log.info(`  Index:         ${nextIndex}`);
  log.info(`  Transaction:   ${result.transactionHash}`);
  log.info(`  Balance:       ${balance.toLocaleString()} credits`);
  log.info(`  Count:         ${identitiesBefore.length} → ${identitiesAfter.length} identities`);
  log.info(`  Duration:      ${elapsed}s`);
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Verify balance exists
  if (balance <= 0) {
    throw new Error(`Identity has no balance! Expected > 0, got: ${balance}`);
  }

  // Verify identity count increased
  if (identitiesAfter.length <= identitiesBefore.length) {
    throw new Error(`Identity count did not increase! Before: ${identitiesBefore.length}, After: ${identitiesAfter.length}`);
  }

  return { success: true, result, balance, identitiesBefore: identitiesBefore.length, identitiesAfter: identitiesAfter.length };
}

/**
 * Error handler with user guidance
 */
function handleError(error) {
  const msg = error.message || String(error);

  // WASM lock error - the critical error we're testing for
  if (msg.includes('already locked to a reader')) {
    log.error('WASM LOCK ERROR DETECTED!');
    log.error('The worker isolation may not be complete.');
    log.error('Check workers/operations/identity-create.js');
    return { success: false, error: 'WASM lock conflict' };
  }

  // Insufficient funds
  if (msg.includes('Insufficient') || msg.includes('No UTXOs')) {
    log.error('Insufficient funds');
    log.info('💡 Fund the wallet derived from MNEMONIC');
    return { success: false, error: 'Insufficient funds' };
  }

  // Per-key signing failure
  if (msg.includes('Could not find private key')) {
    log.error('Per-key signing failed');
    log.info('💡 Check identityCreatePrepare implementation in wasm-sdk');
    return { success: false, error: 'Per-key signing failed' };
  }

  // Identity not appearing on Platform
  if (msg.includes('Identity has no balance')) {
    log.error('Identity created but has no balance');
    log.info('💡 State transition may have been rejected by Platform');
    log.info('💡 Check per-key signatures in identityCreatePrepare');
    return { success: false, error: 'Identity not on Platform' };
  }

  // Transaction already in blockchain (replay)
  if (msg.includes('Transaction already in chain') ||
      msg.includes('already in block chain')) {
    log.warn('🔄 Transaction already broadcast and confirmed');
    log.info('💡 This transaction was successful in a previous run');
    return { success: false, error: 'Transaction replay' };
  }

  // UTXO conflict errors
  if (msg.includes('tx-txlock-conflict') ||
      msg.includes('txlock-conflict') ||
      msg.includes('bad-txns-inputs-missingorspent')) {
    log.error('❌ UTXO conflict error');
    log.error('🔒 UTXOs are already locked/spent in pending transactions');
    log.info('');
    log.info('💡 Solutions to resolve UTXO conflicts:');
    log.info('   1. Wait 10-15 minutes for InstantLock timeouts to expire');
    log.info('   2. Generate a fresh wallet with new UTXOs');
    log.info('   3. Send new funds to the current wallet');
    return { success: false, error: 'UTXO conflict' };
  }

  // Generic error
  log.error('Unexpected error:', msg);
  log.debug(error.stack);
  return { success: false, error: msg };
}

// Main execution
testIdentityCreate()
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
