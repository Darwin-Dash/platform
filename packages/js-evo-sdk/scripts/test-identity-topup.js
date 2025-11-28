#!/usr/bin/env node
/**
 * Standalone Identity Top-Up Test Script
 *
 * Tests the identity top-up flow after WASM reversion.
 * Verifies no "already locked to a reader" errors occur.
 *
 * Usage:
 *   LOG_LEVEL=info node scripts/test-identity-topup.js
 *   LOG_LEVEL=debug node scripts/test-identity-topup.js
 *
 * Required environment variables (in .env):
 *   MNEMONIC - Funded testnet wallet mnemonic
 *   TEST_IDENTITY_ID - Existing identity to top up
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
async function testIdentityTopUp() {
  log.info('🆔 Identity Top-Up Test Script');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Load configuration
  const { MNEMONIC, TEST_IDENTITY_ID, START_HEIGHT = '1', NETWORK = 'testnet' } = process.env;
  const TOP_UP_AMOUNT = 50000; // 0.0005 DASH minimum

  // Validate
  if (!MNEMONIC) throw new Error('MNEMONIC not set in .env');
  if (!TEST_IDENTITY_ID) throw new Error('TEST_IDENTITY_ID not set in .env');

  log.info(`Identity: ${TEST_IDENTITY_ID}`);
  log.info(`Amount: ${TOP_UP_AMOUNT} duffs`);
  log.info(`Network: ${NETWORK}`);
  log.debug(`Start height: ${START_HEIGHT}`);
  log.debug(`Mnemonic: ${MNEMONIC.substring(0, 20)}...`);

  // Check balance BEFORE (via DAPI - bypasses WASM)
  log.info('');
  log.info('📊 Checking balance before top-up (via DAPI)...');
  const balanceBefore = await getBalanceViaDAPI(TEST_IDENTITY_ID);
  log.info(`Balance BEFORE: ${balanceBefore.toLocaleString()} credits`);

  // Initialize SDK
  log.info('');
  log.info('🔧 Initializing SDK...');
  const sdk = new EvoSDK({ network: NETWORK, trusted: true });
  log.debug('SDK created (lazy connect)');

  // Execute top-up
  log.info('');
  log.info('🔄 Executing top-up via sdk.identities.topUpWithWallet()...');
  log.debug('This tests the reverted simple WASM pattern');
  const startTime = Date.now();

  const result = await sdk.identities.topUpWithWallet(
    TEST_IDENTITY_ID,
    TOP_UP_AMOUNT,
    MNEMONIC,
    {
      useSourceAsChangeAddress: true,
      startHeight: parseInt(START_HEIGHT, 10),
      onProgress: (event) => log.debug(`[Progress] ${event.phase}: ${event.message}`)
    }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`✅ Top-up completed in ${elapsed}s`);

  // Check balance AFTER (via DAPI - bypasses WASM)
  log.info('');
  log.info('📊 Checking balance after top-up (via DAPI)...');
  const balanceAfter = await getBalanceViaDAPI(TEST_IDENTITY_ID);
  const balanceIncrease = balanceAfter - balanceBefore;
  log.info(`Balance AFTER: ${balanceAfter.toLocaleString()} credits`);
  log.info(`Increase: +${balanceIncrease.toLocaleString()} credits`);

  // Success summary
  log.info('');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info('  🎉 TEST PASSED - No WASM Lock Errors');
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log.info(`  Identity:      ${result.identityId}`);
  log.info(`  Transaction:   ${result.transactionHash}`);
  log.info(`  Balance:       ${balanceBefore.toLocaleString()} → ${balanceAfter.toLocaleString()} credits`);
  log.info(`  Duration:      ${elapsed}s`);
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Verify increase
  if (balanceAfter <= balanceBefore) {
    throw new Error(`Balance did not increase! Before: ${balanceBefore}, After: ${balanceAfter}`);
  }

  return { success: true, result, balanceBefore, balanceAfter };
}

/**
 * Error handler with user guidance
 */
function handleError(error) {
  const msg = error.message || String(error);

  // WASM lock error - the critical error we're testing for
  if (msg.includes('already locked to a reader')) {
    log.error('WASM LOCK ERROR DETECTED!');
    log.error('The "three-step" reversion may not be complete.');
    log.error('Check workers/operations/identity-topup.js');
    return { success: false, error: 'WASM lock conflict' };
  }

  // Insufficient funds
  if (msg.includes('Insufficient') || msg.includes('No UTXOs')) {
    log.error('Insufficient funds');
    log.info('💡 Fund the wallet derived from MNEMONIC');
    return { success: false, error: 'Insufficient funds' };
  }

  // Identity not found
  if (msg.includes('Identity not found')) {
    log.error('Identity not found');
    log.info('💡 Use a valid TEST_IDENTITY_ID in .env');
    return { success: false, error: 'Identity not found' };
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
testIdentityTopUp()
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
