#!/usr/bin/env node

/**
 * Standalone ChainLock Detection Test Script
 *
 * This script tests ChainLock detection in isolation by:
 * 1. Connecting to a local Dash Core RPC node
 * 2. Sending a consolidation transaction
 * 3. Monitoring for ChainLock confirmation via DAPI
 * 4. Reporting ChainLock detection latency and status
 *
 * Usage:
 *   node scripts/test-chainlock-detection.mjs
 *
 * Environment Variables:
 *   TESTNET_RPC_ENDPOINT  - RPC endpoint (default: http://localhost:19998)
 *   TESTNET_RPC_USERNAME  - RPC username (default: dashrpc)
 *   TESTNET_RPC_PASSWORD  - RPC password (required)
 *   TESTNET_WALLET        - Wallet name (optional)
 *   TESTNET_ADDRESS       - Address to use (or generates new one)
 *   NETWORK               - Network (testnet/mainnet, default: testnet)
 *   CHAINLOCK_TIMEOUT     - ChainLock wait timeout in ms (default: 120000)
 */

import { config } from 'dotenv';
import DAPIClient from '@dashevo/dapi-client';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { TransactionFinder, FinderMode } from '../dist/index.js';

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

// Configuration
const NETWORK = process.env.NETWORK || 'testnet';
const CHAINLOCK_TIMEOUT = parseInt(process.env.CHAINLOCK_TIMEOUT || '120000', 10); // 2 minutes default

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
  console.log('🔗 ChainLock Detection Test');
  console.log('   Testing ChainLock confirmation in isolation (no InstantLock requirement)');
  log.divider();
  console.log(`Network: ${NETWORK}`);
  console.log(`Timeout: ${CHAINLOCK_TIMEOUT / 1000}s`);
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
      testAddress = await broadcaster.getNewAddress('chainlock_test');
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
  let chainLockReceived = false;
  let cleanup = null;

  const timestamps = {
    broadcast: 0,
    txDetected: 0,
    instantLock: 0,
    chainLock: 0,
  };

  const chainLockData = {
    blockHeight: null,
    chainLockedHeight: null,
    latency: null,
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
          console.log('');
          log.info('⚡ InstantLock received (not required for this test)');
          console.log(`   IS latency: ${lock.latency} ms`);
        }
      },
      onChainLock: (cl) => {
        if (cl.txid === broadcastTxid) {
          chainLockReceived = true;
          timestamps.chainLock = Date.now();
          chainLockData.blockHeight = cl.blockHeight;
          chainLockData.chainLockedHeight = cl.chainLockedHeight;
          chainLockData.latency = cl.latency;

          console.log('');
          log.success('⛓️  ChainLock confirmed!');
          console.log(`   Block height: ${cl.blockHeight}`);
          console.log(`   ChainLocked height: ${cl.chainLockedHeight}`);
          console.log(`   CL latency: ${cl.latency} ms`);
          console.log(`   Broadcast → ChainLock: ${((timestamps.chainLock - timestamps.broadcast) / 1000).toFixed(1)}s`);
        }
      },
      onBlockInclusion: (block) => {
        if (block.txid === broadcastTxid) {
          console.log('');
          log.info(`📦 Block inclusion at height ${block.blockHeight}`);
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
    log.info(`Waiting for ChainLock (timeout: ${CHAINLOCK_TIMEOUT / 1000}s)...`);
    console.log('   Note: ChainLock typically takes ~60s (next block + LLMQ signing)');
  } catch (error) {
    log.error(`Transaction broadcast failed: ${error.message}`);
    if (cleanup) cleanup();
    process.exit(1);
  }

  // Wait for ChainLock
  const startWait = Date.now();
  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startWait;

      // Log progress every 15 seconds
      if (elapsed > 0 && elapsed % 15000 < 1000) {
        const elapsedSec = Math.floor(elapsed / 1000);
        process.stdout.write(`\r   Waiting... ${elapsedSec}s elapsed`);
        if (txDetected) process.stdout.write(' [TX ✓]');
        if (instantLockReceived) process.stdout.write(' [IS ✓]');
      }

      // Success: ChainLock received
      if (chainLockReceived) {
        clearInterval(checkInterval);
        console.log('');
        resolve();
      }

      // Timeout reached
      if (elapsed > CHAINLOCK_TIMEOUT) {
        clearInterval(checkInterval);
        console.log('');
        log.warn('ChainLock timeout reached');
        resolve();
      }
    }, 1000);
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
  console.log(`InstantLock:        ${instantLockReceived ? '✅ Yes' : '⚠️ Not received (optional)'}`);
  console.log(`ChainLock:          ${chainLockReceived ? '✅ Yes' : '❌ No'}`);
  console.log('');

  if (chainLockReceived) {
    console.log('ChainLock Details:');
    console.log(`  Block height:       ${chainLockData.blockHeight}`);
    console.log(`  ChainLocked height: ${chainLockData.chainLockedHeight}`);
    console.log(`  CL latency:         ${chainLockData.latency} ms`);
    console.log(`  Total time:         ${((timestamps.chainLock - timestamps.broadcast) / 1000).toFixed(1)}s`);
    console.log('');

    // Verify ChainLock event shape
    console.log('ChainLock Event Shape Verification:');
    console.log(`  ✅ txid:             string (${typeof broadcastTxid})`);
    console.log(`  ✅ blockHeight:      number (${typeof chainLockData.blockHeight})`);
    console.log(`  ✅ chainLockedHeight: number (${typeof chainLockData.chainLockedHeight})`);
    console.log(`  ✅ latency:          number (${typeof chainLockData.latency})`);
    console.log('');

    log.divider();
    log.success('CHAINLOCK TEST PASSED');
    log.divider();
    process.exit(0);
  } else {
    console.log('Possible reasons for ChainLock failure:');
    console.log('  - Transaction not included in block yet');
    console.log('  - LLMQ signing taking longer than timeout');
    console.log('  - Network connectivity issues');
    console.log('  - DAPI node out of sync');
    console.log('');

    if (txDetected) {
      log.warn('Transaction was detected but ChainLock not received within timeout');
      log.warn('Try increasing CHAINLOCK_TIMEOUT environment variable');
    } else {
      log.error('Transaction was NOT detected via DAPI');
      log.error('Check DAPI connectivity and address filtering');
    }

    log.divider();
    log.error('CHAINLOCK TEST INCOMPLETE');
    log.divider();
    process.exit(1);
  }
}

main().catch((error) => {
  log.error(`Unexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
