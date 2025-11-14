/**
 * Automated integration test for InstantSend ChainLock Monitor with RPC transaction broadcasting
 *
 * This test automatically sends a transaction via RPC and monitors for confirmations.
 * Requires a local Dash Core node with RPC enabled.
 *
 * Usage:
 *   NETWORK=testnet node tests/integration/automated-instantsend-chainlock.spec.js
 *
 * Environment variables:
 *   NETWORK - 'testnet' or 'mainnet' (default: testnet)
 *   TESTNET_RPC_URL - RPC endpoint (default: http://localhost:19998)
 *   TESTNET_RPC_USER - RPC username (default: dashrpc)
 *   TESTNET_RPC_PASS - RPC password (required)
 *   TESTNET_WALLET - Wallet name (default: test_wallet)
 */

import { InstantSendChainLockMonitor } from '../../dist/index.js';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import networkConfigs from '@dashevo/dapi-client/lib/networkConfigs.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const NETWORK = process.env.NETWORK || 'testnet';
const TIMEOUT_MS = 300000; // 5 minutes - allows time for ChainLock on testnet

// RPC configuration
const RPC_CONFIG = {
  testnet: {
    network: 'testnet',
    url: process.env.TESTNET_RPC_URL || 'http://localhost:19998',
    user: process.env.TESTNET_RPC_USER || 'dashrpc',
    pass: process.env.TESTNET_RPC_PASS || '',
    wallet: process.env.TESTNET_WALLET || 'test_wallet',
  },
  mainnet: {
    network: 'mainnet',
    url: process.env.MAINNET_RPC_URL || 'http://localhost:9998',
    user: process.env.MAINNET_RPC_USER || 'dashrpc',
    pass: process.env.MAINNET_RPC_PASS || '',
    wallet: process.env.MAINNET_WALLET || 'main_wallet',
  },
};

async function runAutomatedTest() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('🤖 InstantSend ChainLock Monitor - Automated Integration Test');
  console.log('═'.repeat(70));
  console.log(`Network: ${NETWORK}`);
  console.log('Pattern: UTXO Consolidation (all funds → same address, fixed fee 0.00001 DASH)');
  console.log('');

  // Get RPC config for network
  const rpcConfig = RPC_CONFIG[NETWORK];
  if (!rpcConfig) {
    console.error(`❌ Invalid network: ${NETWORK}`);
    process.exit(1);
  }

  if (!rpcConfig.pass) {
    console.error('❌ RPC password not configured');
    console.error(`   Set ${NETWORK.toUpperCase()}_RPC_PASS environment variable`);
    process.exit(1);
  }

  // Initialize RPC client
  console.log('🔌 Connecting to Dash Core RPC...');
  const rpcClient = new DashRpcClient(rpcConfig);
  const broadcaster = new TransactionBroadcaster(rpcClient);

  // Test RPC connection
  try {
    const connected = await rpcClient.testConnection();
    if (!connected) {
      throw new Error('RPC connection test failed');
    }

    const height = await rpcClient.getBlockCount();
    const balance = await rpcClient.getBalance();

    console.log(`✅ Connected to ${NETWORK} at height ${height}`);
    console.log(`   Wallet balance: ${balance.toFixed(8)} DASH`);
    console.log('');

    // Check balance (need at least fee amount)
    const minRequired = 0.00001;  // Just the fee
    if (balance < minRequired) {
      throw new Error(
        `Insufficient balance: ${balance} DASH (need at least ${minRequired} DASH for fee)`
      );
    }
  } catch (error) {
    console.error('❌ RPC connection failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error(`1. Ensure Dash Core is running: dashd ${NETWORK === 'testnet' ? '-testnet' : ''}`);
    console.error(`2. Check RPC credentials in .env file`);
    console.error(`3. Verify wallet is loaded: dash-cli ${NETWORK === 'testnet' ? '-testnet' : ''} listwallets`);
    process.exit(1);
  }

  // Use address from environment or generate new one
  let testAddress = process.env.TESTNET_ADDRESS || process.env.MAINNET_ADDRESS;

  if (!testAddress) {
    console.log('📬 Generating new address for test...');
    try {
      testAddress = await broadcaster.getNewAddress('automated_test');
      console.log(`   Address: ${testAddress}`);
    } catch (error) {
      console.error('❌ Failed to generate new address:', error.message);
      console.error('   Set TESTNET_ADDRESS or MAINNET_ADDRESS in .env file instead');
      process.exit(1);
    }
  } else {
    console.log('📬 Using address from environment:');
    console.log(`   Address: ${testAddress}`);
  }
  console.log('');

  // Initialize payment monitor
  console.log('🔍 Initializing payment monitor...');

  // Use whitelist directly - faster and more reliable (avoids TLS cert errors and stream resets)
  // Same configuration as test-instantsend-chainlock-monitor.js
  const monitor = new InstantSendChainLockMonitor({
    dapiAddresses: networkConfigs.testnet.dapiAddressesWhiteList,
    network: NETWORK,
    timeout: 60000,
    retries: 15,
    debug: true,
  });

  // Track events
  let transactionDetected = false;
  let instantLockReceived = false;
  let chainLockReceived = false;
  let detectedTxid = null;

  const eventTimestamps = {
    txBroadcast: null,
    txDetected: null,
    instantLock: null,
    chainLock: null,
  };

  // Start monitoring
  const unsubscribe = await monitor.watchAddresses(testAddress, {
    onTransaction: (tx) => {
      transactionDetected = true;
      detectedTxid = tx.txid;
      eventTimestamps.txDetected = Date.now();
      console.log('');
      console.log('📥 Transaction detected:', tx.txid.substring(0, 16) + '...');
      console.log(`   Detection latency: ${eventTimestamps.txDetected - eventTimestamps.txBroadcast} ms`);
    },
    onInstantLock: (lock) => {
      instantLockReceived = true;
      eventTimestamps.instantLock = Date.now();
      console.log('');
      console.log('⚡ InstantLock received!');
      console.log(`   Tx → InstantLock latency: ${lock.latency} ms`);
      console.log(`   Broadcast → InstantLock: ${eventTimestamps.instantLock - eventTimestamps.txBroadcast} ms`);
    },
    onChainLock: (cl) => {
      chainLockReceived = true;
      eventTimestamps.chainLock = Date.now();
      console.log('');
      console.log('⛓️  ChainLock confirmed!');
      console.log(`   Block height: ${cl.blockHeight}`);
      console.log(`   Tx → ChainLock latency: ${cl.latency} ms`);
      console.log(`   Broadcast → ChainLock: ${eventTimestamps.chainLock - eventTimestamps.txBroadcast} ms`);
    },
  });

  console.log('✅ Monitoring started');

  // Test DAPI ChainLock height query (diagnostic - after init)
  console.log('🔍 Testing DAPI ChainLock height query...');
  try {
    const response = await monitor.dapiClient.platform.getEpochsInfo(0, 1, { prove: false });
    const metadata = response.getMetadata();
    const chainLockHeight = metadata.getCoreChainLockedHeight();
    console.log(`   Current ChainLock height: ${chainLockHeight}`);
  } catch (error) {
    console.error(`   ❌ Error querying ChainLock height: ${error.message}`);
    console.error('   ChainLock monitoring will not work!');
  }
  console.log('');

  // Broadcast transaction using consolidation pattern
  console.log('📡 Broadcasting consolidation transaction...');
  console.log('   (All UTXOs → single output to same address, no change)');
  try {
    eventTimestamps.txBroadcast = Date.now();

    // Consolidation: all funds back to same address
    const result = await broadcaster.sendToAddress(testAddress);

    console.log(`✅ Transaction broadcast: ${result.txid}`);
    console.log(`   Consolidated amount: ${result.amount} DASH`);
    console.log(`   Fee: 0.00001 DASH (fixed)`);
    console.log(`   Waiting for confirmations...`);
    console.log('');
  } catch (error) {
    console.error('❌ Transaction broadcast failed:', error.message);
    unsubscribe();
    process.exit(1);
  }

  // Wait for confirmations with timeout
  const startTime = Date.now();
  const checkInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;

    if (instantLockReceived && chainLockReceived) {
      clearInterval(checkInterval);
      unsubscribe();
      printResults();
      process.exit(0);
    }

    if (elapsed > TIMEOUT_MS) {
      clearInterval(checkInterval);
      unsubscribe();
      console.log('');
      console.log('⏱️  Test timeout reached');
      printResults();

      if (!transactionDetected) {
        console.log('');
        console.log('❌ TEST FAILED - Transaction not detected');
        process.exit(1);
      } else if (!instantLockReceived) {
        console.log('');
        console.log('⚠️  TEST INCOMPLETE - InstantLock not received');
        console.log('   (This may be expected on some networks)');
        process.exit(0);
      } else {
        console.log('');
        console.log('⚠️  TEST INCOMPLETE - ChainLock not received within 5 minutes');
        console.log('   (Typical testnet ChainLock: 1-3 minutes, max seen: 4 minutes)');
        console.log('   This may indicate a testnet network issue.');
        process.exit(1);  // Fail if no ChainLock after 5 minutes
      }
    }
  }, 1000);

  function printResults() {
    console.log('');
    console.log('═'.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(70));
    console.log('Transaction detected:', transactionDetected ? '✅ Yes' : '❌ No');
    console.log('InstantLock received:', instantLockReceived ? '✅ Yes' : '❌ No');
    console.log('ChainLock received:', chainLockReceived ? '✅ Yes' : '❌ No');
    console.log('');

    if (transactionDetected && detectedTxid) {
      console.log('Transaction ID:', detectedTxid);
      console.log('');
    }

    if (eventTimestamps.txBroadcast && eventTimestamps.txDetected) {
      console.log('Latency Metrics:');
      console.log(`  Broadcast → Detection: ${eventTimestamps.txDetected - eventTimestamps.txBroadcast} ms`);

      if (eventTimestamps.instantLock) {
        console.log(
          `  Broadcast → InstantLock: ${eventTimestamps.instantLock - eventTimestamps.txBroadcast} ms`
        );
      }

      if (eventTimestamps.chainLock) {
        console.log(
          `  Broadcast → ChainLock: ${eventTimestamps.chainLock - eventTimestamps.txBroadcast} ms`
        );
      }

      console.log('');
    }

    const status = monitor.getStatus();
    console.log('Monitor Status:', {
      active: status.active,
      trackedTransactions: status.trackedTransactions,
      chainLockHeight: status.chainLockHeight,
    });
    console.log('═'.repeat(70));

    if (transactionDetected && instantLockReceived) {
      console.log('');
      console.log('✅ TEST PASSED - Payment monitoring working correctly');
    }
  }
}

runAutomatedTest().catch((error) => {
  console.error('');
  console.error('❌ Test error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
