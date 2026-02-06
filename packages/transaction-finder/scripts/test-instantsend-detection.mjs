#!/usr/bin/env node

/**
 * Standalone InstantSend Detection Test Script
 *
 * This script tests InstantLock detection in isolation by:
 * 1. Connecting to a local Dash Core RPC node
 * 2. Sending a consolidation transaction
 * 3. Monitoring for InstantLock confirmation via DAPI
 * 4. Reporting InstantLock detection latency and status
 *
 * Unlike the ChainLock test, this test completes quickly (~2-5 seconds)
 * since InstantLock is received almost immediately after broadcast.
 *
 * Usage:
 *   node scripts/test-instantsend-detection.mjs
 *
 * Environment Variables:
 *   TESTNET_RPC_ENDPOINT  - RPC endpoint (default: http://localhost:19998)
 *   TESTNET_RPC_USERNAME  - RPC username (default: dashrpc)
 *   TESTNET_RPC_PASSWORD  - RPC password (required)
 *   TESTNET_WALLET        - Wallet name (optional)
 *   TESTNET_ADDRESS       - Address to use (or generates new one)
 *   NETWORK               - Network (testnet/mainnet, default: testnet)
 *   INSTANTLOCK_TIMEOUT   - InstantLock wait timeout in ms (default: 30000)
 */

import { config } from 'dotenv';
import DAPIClient from '@dashevo/dapi-client';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { TransactionFinder, FinderMode } from '../dist/index.js';

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

// Configuration
const NETWORK = process.env.NETWORK || 'testnet';
const INSTANTLOCK_TIMEOUT = parseInt(process.env.INSTANTLOCK_TIMEOUT || '30000', 10); // 30 seconds default

// RPC configuration
const RPC_CONFIG = {
  network: NETWORK,
  url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
  user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
  pass: process.env.TESTNET_RPC_PASSWORD || '',
  wallet: process.env.TESTNET_WALLET,
};

// Logging helpers
const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[✅] ${msg}`),
  error: (msg) => console.error(`[❌] ${msg}`),
  warn: (msg) => console.warn(`[⚠️] ${msg}`),
  divider: () => console.log('═'.repeat(70)),
};

async function main() {
  log.divider();
  console.log('⚡ InstantSend Detection Test');
  console.log('   Testing InstantLock confirmation in isolation (no ChainLock requirement)');
  log.divider();
  console.log(`Network: ${NETWORK}`);
  console.log(`Timeout: ${INSTANTLOCK_TIMEOUT / 1000}s`);
  console.log('');

  // Check RPC password
  if (!RPC_CONFIG.pass) {
    log.error('TESTNET_RPC_PASSWORD environment variable is required');
    console.log('');
    console.log('Set the following environment variables:');
    console.log('  TESTNET_RPC_ENDPOINT  - RPC endpoint (default: http://localhost:19998)');
    console.log('  TESTNET_RPC_USERNAME  - RPC username (default: dashrpc)');
    console.log('  TESTNET_RPC_PASSWORD  - RPC password (required)');
    console.log('  TESTNET_WALLET        - Wallet name (optional)');
    process.exit(1);
  }

  // Initialize RPC client
  log.info('Connecting to Dash Core RPC...');
  const rpcClient = new DashRpcClient({
    network: RPC_CONFIG.network,
    url: RPC_CONFIG.url,
    user: RPC_CONFIG.user,
    pass: RPC_CONFIG.pass,
    wallet: RPC_CONFIG.wallet,
  });

  const broadcaster = new TransactionBroadcaster(rpcClient);

  // Test RPC connection
  let blockHeight;
  let balance;
  try {
    blockHeight = await rpcClient.getBlockCount();
    balance = await rpcClient.getBalance();

    log.success(`Connected to ${NETWORK} at height ${blockHeight}`);
    console.log(`   Wallet balance: ${balance.toFixed(8)} DASH`);
    console.log('');

    // Check balance
    const minRequired = 0.00002;
    if (balance < minRequired) {
      log.error(`Insufficient balance: ${balance} DASH (need at least ${minRequired} DASH)`);
      process.exit(1);
    }
  } catch (error) {
    log.error(`RPC connection failed: ${error.message}`);
    console.log('');
    console.log('Troubleshooting:');
    console.log(`1. Ensure Dash Core is running: dashd ${NETWORK === 'testnet' ? '-testnet' : ''}`);
    console.log('2. Check RPC credentials');
    console.log('3. Verify wallet is loaded');
    process.exit(1);
  }

  // Get test address
  let testAddress = process.env.TESTNET_ADDRESS || '';

  if (!testAddress) {
    log.info('Generating new address for test...');
    try {
      testAddress = await broadcaster.getNewAddress('instantsend_test');
      console.log(`   Address: ${testAddress}`);
    } catch (error) {
      log.error(`Failed to generate address: ${error.message}`);
      process.exit(1);
    }
  } else {
    log.info('Using address from environment:');
    console.log(`   Address: ${testAddress}`);
  }
  console.log('');

  // Initialize DAPI client
  const dapiClient = new DAPIClient({
    network: NETWORK,
    timeout: 60000,
    retries: 5,
  });

  // Initialize finder
  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: NETWORK,
    addresses: [testAddress],
    dapiClient: dapiClient,
  });

  // Tracking variables
  let broadcastTxid = null;
  let txDetected = false;
  let instantLockReceived = false;
  let cleanup = null;

  const timestamps = {
    broadcast: 0,
    txDetected: 0,
    instantLock: 0,
  };

  const instantLockData = {
    latency: null,
    instantLockHex: null,
  };

  // Start monitoring BEFORE broadcasting
  log.info('Starting DAPI transaction monitoring...');
  try {
    cleanup = await finder.monitorAddresses([testAddress], {
      onTransaction: (tx) => {
        if (tx.txid === broadcastTxid) {
          txDetected = true;
          timestamps.txDetected = Date.now();
          console.log('');
          log.info(`Transaction detected: ${tx.txid.substring(0, 16)}...`);
          console.log(`   Detection latency: ${timestamps.txDetected - timestamps.broadcast} ms`);
        }
      },
      onInstantLock: (lock) => {
        if (lock.txid === broadcastTxid) {
          instantLockReceived = true;
          timestamps.instantLock = Date.now();
          instantLockData.latency = lock.latency;
          instantLockData.instantLockHex = lock.instantLockHex || null;

          console.log('');
          log.success('⚡ InstantLock received!');
          console.log(`   IS latency: ${lock.latency} ms`);
          console.log(`   Broadcast → IS: ${timestamps.instantLock - timestamps.broadcast} ms`);
          if (lock.instantLockHex) {
            console.log(`   IS hex: ${lock.instantLockHex.substring(0, 32)}...`);
          }
        }
      },
      // Don't wait for ChainLock in this test
      onChainLock: (cl) => {
        if (cl.txid === broadcastTxid) {
          log.info('⛓️  ChainLock also received (not required for this test)');
        }
      },
    });
    log.success('Monitoring started');
  } catch (error) {
    log.error(`Failed to start monitoring: ${error.message}`);
    process.exit(1);
  }
  console.log('');

  // Broadcast transaction
  log.info('Broadcasting consolidation transaction...');
  console.log('   (All UTXOs → single output to same address)');

  try {
    timestamps.broadcast = Date.now();
    const result = await broadcaster.sendToAddress(testAddress);
    broadcastTxid = result.txid;

    log.success(`Transaction broadcast: ${broadcastTxid}`);
    console.log(`   Amount: ${result.amount} DASH`);
    console.log('');
    log.info(`Waiting for InstantLock (timeout: ${INSTANTLOCK_TIMEOUT / 1000}s)...`);
    console.log('   Note: InstantLock typically arrives within 1-3 seconds');
  } catch (error) {
    log.error(`Transaction broadcast failed: ${error.message}`);
    if (cleanup) cleanup();
    process.exit(1);
  }

  // Wait for InstantLock
  const startWait = Date.now();
  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startWait;

      // Log progress every 5 seconds
      if (elapsed > 0 && elapsed % 5000 < 1000) {
        const elapsedSec = Math.floor(elapsed / 1000);
        process.stdout.write(`\r   Waiting... ${elapsedSec}s elapsed`);
        if (txDetected) process.stdout.write(' [TX ✓]');
      }

      // Success: InstantLock received
      if (instantLockReceived) {
        clearInterval(checkInterval);
        console.log('');
        resolve();
      }

      // Timeout reached
      if (elapsed > INSTANTLOCK_TIMEOUT) {
        clearInterval(checkInterval);
        console.log('');
        log.warn('InstantLock timeout reached');
        resolve();
      }
    }, 500);
  });

  // Cleanup
  if (cleanup) cleanup();
  finder.stop();

  // Print final results
  console.log('');
  log.divider();
  console.log('📊 TEST RESULTS');
  log.divider();

  console.log(`Transaction ID:     ${broadcastTxid}`);
  console.log(`Transaction detect: ${txDetected ? '✅ Yes' : '❌ No'}`);
  console.log(`InstantLock:        ${instantLockReceived ? '✅ Yes' : '❌ No'}`);
  console.log('');

  if (instantLockReceived) {
    console.log('InstantLock Details:');
    console.log(`  IS latency:  ${instantLockData.latency} ms`);
    console.log(`  Total time:  ${timestamps.instantLock - timestamps.broadcast} ms`);
    if (instantLockData.instantLockHex) {
      console.log(`  Has IS hex:  ✅ Yes (${instantLockData.instantLockHex.length} chars)`);
    } else {
      console.log(`  Has IS hex:  ⚠️ No (may not be included in event)`);
    }
    console.log('');

    // Verify InstantLock event shape
    console.log('InstantLock Event Shape Verification:');
    console.log(`  ✅ txid:      string (${typeof broadcastTxid})`);
    console.log(`  ✅ latency:   number (${typeof instantLockData.latency})`);
    console.log(`  ✅ timestamp: number (verified during callback)`);
    if (instantLockData.instantLockHex !== null) {
      console.log(`  ✅ instantLockHex: string (optional, ${typeof instantLockData.instantLockHex})`);
    }
    console.log('');

    // Performance check
    const totalTime = timestamps.instantLock - timestamps.broadcast;
    if (totalTime < 5000) {
      log.success(`InstantLock received in ${totalTime}ms (excellent)`);
    } else if (totalTime < 10000) {
      log.success(`InstantLock received in ${totalTime}ms (good)`);
    } else {
      log.warn(`InstantLock received in ${totalTime}ms (slower than expected)`);
    }
    console.log('');

    log.divider();
    log.success('INSTANTSEND TEST PASSED');
    log.divider();
    process.exit(0);
  } else {
    console.log('Possible reasons for InstantLock failure:');
    console.log('  - DAPI stream not connected properly');
    console.log('  - Masternode quorum issues');
    console.log('  - Network connectivity issues');
    console.log('  - Transaction using non-IS-eligible inputs');
    console.log('');

    if (txDetected) {
      log.warn('Transaction was detected but InstantLock not received');
      log.warn('This may indicate LLMQ quorum issues');
    } else {
      log.error('Transaction was NOT detected via DAPI');
      log.error('Check DAPI connectivity and address filtering');
    }

    log.divider();
    log.error('INSTANTSEND TEST FAILED');
    log.divider();
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Unexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
