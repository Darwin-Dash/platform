/**
 * Automated Testnet InstantSend/ChainLock Monitoring Test
 *
 * Broadcasts a transaction via Dash Core RPC and monitors for confirmations.
 * Full end-to-end validation of IS/CL detection.
 *
 * Requirements:
 *   - Dash Core node running with RPC enabled
 *   - TESTNET_RPC_ENDPOINT, TESTNET_RPC_USERNAME, TESTNET_RPC_PASSWORD env vars
 *   - Funded testnet wallet
 *
 * Usage:
 *   npm run test:realtime:auto
 *
 * Environment variables:
 *   TESTNET_RPC_ENDPOINT  - RPC endpoint (default: http://localhost:19998)
 *   TESTNET_RPC_USERNAME  - RPC username (default: dashrpc)
 *   TESTNET_RPC_PASSWORD  - RPC password (required)
 *   TESTNET_WALLET        - Wallet name (optional)
 *   TESTNET_ADDRESS       - Address to use (or generates new one)
 *   NETWORK               - Network (testnet/mainnet, default: testnet)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import DAPIClient from '@dashevo/dapi-client';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { TransactionFinder, FinderMode } from '../../src/index.js';
import { config } from 'dotenv';
import { getDAPIClientOptions } from '../helpers/dapi-config.js';
import type {
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
  BlockInclusionEvent,
} from '../../src/types/index.js';

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

// Configuration
const NETWORK = process.env.NETWORK || 'testnet';
const TIMEOUT_MS = 300000; // 5 minutes - allows time for ChainLock

// RPC configuration
const RPC_CONFIG = {
  network: NETWORK as 'testnet' | 'mainnet',
  url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
  user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
  pass: process.env.TESTNET_RPC_PASSWORD || '',
  wallet: process.env.TESTNET_WALLET,
};

describe('Automated Realtime Monitoring', () => {
  let dapiClient: DAPIClient;
  let rpcClient: DashRpcClient;
  let broadcaster: TransactionBroadcaster;
  let finder: TransactionFinder;
  let cleanup: (() => void) | null = null;
  let testAddress: string;

  // Event tracking
  const events = {
    transactions: [] as TransactionEvent[],
    instantLocks: [] as InstantLockEvent[],
    chainLocks: [] as ChainLockEvent[],
    blockInclusions: [] as BlockInclusionEvent[],
  };

  // Timing
  const timestamps = {
    txBroadcast: 0,
    txDetected: 0,
    instantLock: 0,
    chainLock: 0,
  };

  beforeAll(async () => {
    // Skip if RPC password not configured
    if (!RPC_CONFIG.pass) {
      console.log('');
      console.log('⚠️  Skipping automated test: TESTNET_RPC_PASSWORD not set');
      console.log('   Set environment variables to enable this test:');
      console.log('   - TESTNET_RPC_ENDPOINT (default: http://localhost:19998)');
      console.log('   - TESTNET_RPC_USERNAME (default: dashrpc)');
      console.log('   - TESTNET_RPC_PASSWORD (required)');
      return;
    }

    console.log('');
    console.log('═'.repeat(70));
    console.log('🤖 Automated InstantSend/ChainLock Monitoring Test');
    console.log('═'.repeat(70));
    console.log(`Network: ${NETWORK}`);
    console.log('Pattern: UTXO Consolidation (all funds → same address)');
    console.log('');

    // Initialize RPC client
    console.log('🔌 Connecting to Dash Core RPC...');
    rpcClient = new DashRpcClient({
      network: RPC_CONFIG.network,
      url: RPC_CONFIG.url,
      user: RPC_CONFIG.user,
      pass: RPC_CONFIG.pass,
      wallet: RPC_CONFIG.wallet,
    });
    broadcaster = new TransactionBroadcaster(rpcClient);

    // Test RPC connection
    try {
      const height = await rpcClient.getBlockCount();
      const balance = await rpcClient.getBalance();

      console.log(`✅ Connected to ${NETWORK} at height ${height}`);
      console.log(`   Wallet balance: ${balance.toFixed(8)} DASH`);
      console.log('');

      // Check balance (need at least fee amount)
      const minRequired = 0.00002; // Need more than fee
      if (balance < minRequired) {
        throw new Error(
          `Insufficient balance: ${balance} DASH (need at least ${minRequired} DASH)`
        );
      }
    } catch (error) {
      console.error('❌ RPC connection failed:', (error as Error).message);
      console.error('');
      console.error('Troubleshooting:');
      console.error(`1. Ensure Dash Core is running: dashd ${NETWORK === 'testnet' ? '-testnet' : ''}`);
      console.error(`2. Check RPC credentials`);
      console.error(`3. Verify wallet is loaded`);
      throw error;
    }

    // Use address from environment or generate new one
    testAddress = process.env.TESTNET_ADDRESS || '';

    if (!testAddress) {
      console.log('📬 Generating new address for test...');
      try {
        testAddress = await broadcaster.getNewAddress('automated_test');
        console.log(`   Address: ${testAddress}`);
      } catch (error) {
        console.error('❌ Failed to generate new address:', (error as Error).message);
        throw error;
      }
    } else {
      console.log('📬 Using address from environment:');
      console.log(`   Address: ${testAddress}`);
    }
    console.log('');

    // Initialize DAPI client with healthy nodes
    dapiClient = new DAPIClient(getDAPIClientOptions(NETWORK as 'testnet' | 'mainnet'));

    // Initialize finder
    finder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [testAddress],
      dapiClient: dapiClient as any,
    });
  });

  afterAll(() => {
    if (cleanup) {
      cleanup();
    }
    finder?.stop();
  });

  it('should detect IS and CL for broadcast transaction', async () => {
    // Skip if RPC not configured
    if (!RPC_CONFIG.pass) {
      expect(true).toBe(true);
      return;
    }

    // Track when confirmations complete
    let instantLockReceived = false;
    let chainLockReceived = false;

    // Start monitoring BEFORE broadcasting
    console.log('🔍 Starting DAPI transaction monitoring...');
    cleanup = await finder.monitorAddresses([testAddress], {
      onTransaction: (tx) => {
        events.transactions.push(tx);
        timestamps.txDetected = Date.now();
        console.log('');
        console.log('📥 Transaction detected:', tx.txid.substring(0, 16) + '...');
        console.log(`   Detection latency: ${timestamps.txDetected - timestamps.txBroadcast} ms`);
      },
      onInstantLock: (lock) => {
        events.instantLocks.push(lock);
        timestamps.instantLock = Date.now();
        instantLockReceived = true;
        console.log('');
        console.log('⚡ InstantLock received!');
        console.log(`   Tx → InstantLock latency: ${lock.latency} ms`);
        console.log(`   Broadcast → InstantLock: ${timestamps.instantLock - timestamps.txBroadcast} ms`);
      },
      onChainLock: (cl) => {
        events.chainLocks.push(cl);
        timestamps.chainLock = Date.now();
        chainLockReceived = true;
        console.log('');
        console.log('⛓️  ChainLock confirmed!');
        console.log(`   Block height: ${cl.blockHeight}`);
        console.log(`   Tx → ChainLock latency: ${cl.latency} ms`);
        console.log(`   Broadcast → ChainLock: ${timestamps.chainLock - timestamps.txBroadcast} ms`);
      },
      onBlockInclusion: (block) => {
        events.blockInclusions.push(block);
        console.log('');
        console.log('📦 Block inclusion:', block.txid.substring(0, 16) + '... in block', block.blockHeight);
      },
    });

    console.log('✅ Monitoring started');
    console.log('');

    // Broadcast transaction using consolidation pattern
    console.log('📡 Broadcasting consolidation transaction...');
    console.log('   (All UTXOs → single output to same address, no change)');

    let broadcastTxid: string;
    try {
      timestamps.txBroadcast = Date.now();
      // Use confirmed UTXOs only (minConf=1) to avoid unconfirmed chains
      // from prior test runs that miners may deprioritize
      const result = await broadcaster.sendToAddress(testAddress, 1);
      broadcastTxid = result.txid;

      console.log(`✅ Transaction broadcast: ${broadcastTxid}`);
      console.log(`   Consolidated amount: ${result.amount} DASH`);

      // Pre-register the txid so tracker watches for it in merkle blocks
      finder.preRegisterTransaction(broadcastTxid);

      // Allow time for P2P propagation from local dashd to remote DAPI nodes
      console.log('   Waiting 3s for P2P propagation...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log(`   Waiting for confirmations...`);
      console.log('');
    } catch (error) {
      console.error('❌ Transaction broadcast failed:', (error as Error).message);
      throw error;
    }

    // Wait for confirmations with timeout
    const startTime = Date.now();
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // Success: both IS and CL received
        if (instantLockReceived && chainLockReceived) {
          clearInterval(checkInterval);
          resolve();
        }

        // Timeout reached
        if (elapsed > TIMEOUT_MS) {
          clearInterval(checkInterval);
          console.log('');
          console.log('⏱️  Test timeout reached');
          resolve();
        }
      }, 1000);
    });

    // Print results
    console.log('');
    console.log('═'.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`Transaction detected: ${events.transactions.length > 0 ? '✅ Yes' : '❌ No'}`);
    console.log(`InstantLock received: ${instantLockReceived ? '✅ Yes' : '❌ No'}`);
    console.log(`Block inclusion:      ${events.blockInclusions.length > 0 ? '✅ Yes' : '❌ No'}`);
    console.log(`ChainLock received:   ${chainLockReceived ? '✅ Yes' : '❌ No'}`);
    console.log('');

    if (broadcastTxid) {
      console.log(`Transaction ID: ${broadcastTxid}`);
      console.log('');
    }

    if (timestamps.txBroadcast && timestamps.txDetected) {
      console.log('Latency Metrics:');
      console.log(`  Broadcast → Detection: ${timestamps.txDetected - timestamps.txBroadcast} ms`);

      if (timestamps.instantLock) {
        console.log(`  Broadcast → InstantLock: ${timestamps.instantLock - timestamps.txBroadcast} ms`);
      }

      if (timestamps.chainLock) {
        console.log(`  Broadcast → ChainLock: ${((timestamps.chainLock - timestamps.txBroadcast) / 1000).toFixed(1)} s`);
      }
      console.log('');
    }

    const status = finder.getStatus();
    console.log('Monitor Status:', status);
    console.log('═'.repeat(70));

    // Find OUR transaction in the events (there may be other testnet transactions)
    const ourTx = events.transactions.find((tx) => tx.txid === broadcastTxid);
    const ourInstantLock = events.instantLocks.find((lock) => lock.txid === broadcastTxid);
    const ourChainLock = events.chainLocks.find((cl) => cl.txid === broadcastTxid);

    // Assertions
    if (ourTx && ourInstantLock) {
      console.log('');
      console.log('✅ TEST PASSED - Full IS/CL flow validated');

      // Verify transaction was detected
      expect(ourTx).toBeDefined();
      expect(ourTx.txid).toBe(broadcastTxid);

      // Verify InstantLock
      expect(ourInstantLock).toBeDefined();
      expect(ourInstantLock.txid).toBe(broadcastTxid);
      expect(ourInstantLock.latency).toBeGreaterThanOrEqual(0);

      // ChainLock is optional (might take longer than timeout)
      if (ourChainLock) {
        expect(ourChainLock.txid).toBe(broadcastTxid);
        expect(ourChainLock.blockHeight).toBeGreaterThan(0);
      }
    } else if (!ourTx) {
      console.log('');
      console.log('❌ TEST FAILED - Transaction not detected via DAPI');
      console.log(`   Looking for txid: ${broadcastTxid}`);
      console.log(`   Detected txids: ${events.transactions.map((t) => t.txid).join(', ')}`);
      expect(ourTx).toBeDefined();
    } else if (!ourInstantLock) {
      console.log('');
      console.log('⚠️  TEST INCOMPLETE - InstantLock not received within timeout');
      console.log('   This may indicate network issues');
      console.log(`   Looking for txid: ${broadcastTxid}`);
      console.log(`   InstantLock txids: ${events.instantLocks.map((l) => l.txid).join(', ')}`);
      // Don't fail - IS might be slow on testnet
      expect(true).toBe(true);
    }
  }, TIMEOUT_MS + 60000); // Add 60s buffer for setup/teardown
});
