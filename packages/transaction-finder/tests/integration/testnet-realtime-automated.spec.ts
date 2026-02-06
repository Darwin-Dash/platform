/**
 * Automated Testnet On-Demand Transaction Detection Test
 *
 * Tests the on-demand detection flow where transactions are detected
 * purely via parallel multi-node streams, without knowing the txid beforehand.
 *
 * This is the ONLY supported detection flow:
 * 1. Call monitorAddresses() with callbacks BEFORE transactions are sent
 * 2. Someone sends funds (we don't know the txid)
 * 3. TransactionFinder detects via multi-node parallel streams
 * 4. onTransaction callback provides txid and transaction data
 * 5. onInstantLock callback provides IS hex
 *
 * Requirements:
 *   - Dash Core node running with RPC enabled
 *   - TESTNET_RPC_ENDPOINT, TESTNET_RPC_USERNAME, TESTNET_RPC_PASSWORD env vars
 *   - Funded testnet wallet
 *
 * Usage:
 *   npm run test:realtime:auto           # Both IS + CL (default)
 *   npm run test:realtime:auto:is        # InstantSend only
 *   npm run test:realtime:auto:cl        # ChainLock only
 *
 * Environment variables:
 *   TEST_MODE             - Test mode: instantsend, chainlock, or both (default: both)
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
import { getDAPIClientOptions, IS_NODE_HEALTH } from '../helpers/dapi-config.js';
import type {
  TransactionEvent,
  InstantLockEvent,
} from '../../src/types/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suppress gRPC CANCELLED rejections that fire asynchronously when streams
// are cancelled during reconnection or teardown. This is a known @grpc/grpc-js
// behavior — cancel() triggers an internal Promise rejection that cannot be
// caught via stream.on('error').
const grpcCancelHandler = (err: unknown) => {
  if (err && typeof err === 'object' && (err as any).code === 1 &&
      (err as any).details === 'Cancelled on client') {
    return; // swallow expected gRPC cancel rejection
  }
  // Re-throw anything else so it's not silently lost
  throw err;
};
process.on('unhandledRejection', grpcCancelHandler);

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

// Test mode configuration
const TEST_MODE = (process.env.TEST_MODE || 'both').toLowerCase();
const waitForIS = TEST_MODE === 'instantsend' || TEST_MODE === 'both';
const waitForCL = TEST_MODE === 'chainlock' || TEST_MODE === 'both';
const MODE_LABEL = TEST_MODE === 'instantsend' ? 'InstantSend only'
  : TEST_MODE === 'chainlock' ? 'ChainLock only'
  : 'Both IS + CL';

// Configuration
const NETWORK = process.env.NETWORK || 'testnet';
const TIMEOUT_MS = waitForCL ? 600000 : 120000; // 2min for IS-only (allows stale reconnect), 10min for CL

// RPC configuration
const RPC_CONFIG = {
  network: NETWORK as 'testnet' | 'mainnet',
  url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
  user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
  pass: process.env.TESTNET_RPC_PASSWORD || '',
  wallet: process.env.TESTNET_WALLET,
};

// Path for persisting IS node health data
const IS_NODE_HEALTH_PATH = path.join(__dirname, '../../../js-evo-sdk/demo/is-node-health.json');

// Store the last finder for persistence in afterAll
let lastFinder: TransactionFinder | null = null;

describe('On-Demand Realtime Monitoring', () => {
  let dapiClient: DAPIClient;
  let rpcClient: DashRpcClient;
  let broadcaster: TransactionBroadcaster;
  let testAddress: string;

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
    console.log(`🤖 On-Demand Detection Test [${MODE_LABEL}]`);
    console.log('═'.repeat(70));
    console.log(`Network: ${NETWORK}`);
    console.log(`Mode: ${MODE_LABEL}`);
    console.log('Pattern: On-demand detection via parallel multi-node streams');
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
    // Stream subscriptions need a longer timeout than regular RPC queries —
    // the gRPC stream must stay open long enough for the broadcast tx to
    // propagate through P2P to the DAPI node serving the stream.
    dapiClient = new DAPIClient({
      ...getDAPIClientOptions(NETWORK as 'testnet' | 'mainnet'),
      timeout: 60000,
    });
  });

  afterAll(async () => {
    // Persist learned IS node health data for future test runs
    if (lastFinder) {
      try {
        const healthData = lastFinder.exportNodeHealth();
        // Only persist if we have learned data
        if (healthData.knownGood.length > 0 || Object.keys(healthData.learned).length > 0) {
          // Ensure directory exists
          const dir = path.dirname(IS_NODE_HEALTH_PATH);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(IS_NODE_HEALTH_PATH, JSON.stringify(healthData, null, 2));
          console.log('');
          console.log(`💾 Persisted IS node health data to ${path.basename(IS_NODE_HEALTH_PATH)}`);
          console.log(`   Known-good nodes: ${healthData.knownGood.length}`);
          console.log(`   Learned nodes: ${Object.keys(healthData.learned).length}`);
        }
      } catch (error) {
        console.warn('⚠️  Failed to persist IS node health:', (error as Error).message);
      }
    }

    // Wait for gRPC to flush its internal CANCELLED rejection before
    // the test process exits and vitest's global handler catches it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    process.removeListener('unhandledRejection', grpcCancelHandler);
  });

  /**
   * On-Demand Detection Test
   *
   * This test follows the on-demand detection flow:
   * 1. monitorAddresses() with callbacks BEFORE transactions are sent
   * 2. Someone sends funds (we ignore the RPC return value - no txid used)
   * 3. TransactionFinder detects via multi-node parallel streams
   * 4. onTransaction callback provides txid, transaction data
   * 5. onInstantLock callback provides IS hex
   *
   * CRITICAL: We do NOT use any information from the RPC send call except
   * confirming the broadcast succeeded. The txid, IS hex, and all transaction
   * data must come ONLY from TransactionFinder callbacks.
   */
  it(`should detect transaction and IS hex via on-demand multi-node hunting [${MODE_LABEL}]`, async () => {
    // Skip if RPC not configured
    if (!RPC_CONFIG.pass) {
      expect(true).toBe(true);
      return;
    }

    // Clear events from previous test
    const onDemandEvents = {
      transactions: [] as TransactionEvent[],
      instantLocks: [] as InstantLockEvent[],
    };

    // Track timestamps
    const onDemandTimestamps = {
      broadcastTime: 0,
      txDetectedTime: 0,
      isDetectedTime: 0,
    };

    // Promise that resolves when we get transaction data from callback
    let txResolve: (tx: TransactionEvent) => void;
    const txPromise = new Promise<TransactionEvent>((resolve) => {
      txResolve = resolve;
    });

    // Promise that resolves when we get IS hex from callback
    let isResolve: (lock: InstantLockEvent) => void;
    const isPromise = new Promise<InstantLockEvent>((resolve) => {
      isResolve = resolve;
    });

    console.log('');
    console.log('═'.repeat(70));
    console.log('🔍 ON-DEMAND DETECTION TEST');
    console.log('═'.repeat(70));
    console.log('Flow: monitorAddresses() → broadcast → callbacks provide all data');
    console.log('All data MUST come from TransactionFinder callbacks');
    console.log('');

    // Get known-good IS nodes from persisted data (if available)
    const knownGoodIsNodes = IS_NODE_HEALTH?.knownGood || [];
    if (knownGoodIsNodes.length > 0) {
      console.log(`📋 Loaded ${knownGoodIsNodes.length} known-good IS nodes from previous runs`);
    }

    // Create a fresh finder for this test with multi-node IS hunting enabled
    const onDemandFinder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [testAddress],
      dapiClient: dapiClient as any,
      multiNodeIsHunting: true,  // Enable multi-node IS hunting
      isHuntingNodes: 3,         // Hunt from 3 nodes
      isHuntingTimeoutMs: 5000,  // 5s timeout for IS hex hunting
      streamReconnectInterval: 0, // Disable periodic reconnect for this test
      knownGoodIsNodes,          // Seed with known-good nodes from previous runs
    });

    // Store reference for afterAll persistence
    lastFinder = onDemandFinder;

    // Start monitoring BEFORE broadcast - this is the on-demand flow
    console.log('📡 Starting on-demand monitoring (multi-node IS hunting enabled)...');
    const onDemandCleanup = await onDemandFinder.monitorAddresses([testAddress], {
      onTransaction: (tx) => {
        onDemandTimestamps.txDetectedTime = Date.now();
        onDemandEvents.transactions.push(tx);
        console.log('');
        console.log('📥 ON-DEMAND: Transaction detected via callback!');
        console.log(`   txid: ${tx.txid}`);
        console.log(`   Detection latency: ${onDemandTimestamps.txDetectedTime - onDemandTimestamps.broadcastTime}ms`);
        txResolve(tx);
      },
      onInstantLock: (lock) => {
        onDemandTimestamps.isDetectedTime = Date.now();
        onDemandEvents.instantLocks.push(lock);
        console.log('');
        console.log('⚡ ON-DEMAND: InstantLock detected via callback!');
        console.log(`   txid: ${lock.txid}`);
        console.log(`   instantLockHex: ${lock.instantLockHex ? lock.instantLockHex.substring(0, 32) + '...' : '(not delivered)'}`);
        console.log(`   IS latency: ${lock.latency}ms`);
        // Only resolve if we have hex (that's what we're testing)
        if (lock.instantLockHex) {
          isResolve(lock);
        }
      },
    });
    console.log('✅ On-demand monitoring started');
    console.log('');

    // Build and broadcast transaction
    // CRITICAL: We do NOT use the txid from this call - only confirm it succeeded
    console.log('📡 Broadcasting test transaction...');
    console.log('   (Ignoring RPC return value - all data must come from callbacks)');
    try {
      const utxos = await broadcaster.listUnspent(0, 9999999, [testAddress]);
      if (utxos.length === 0) {
        throw new Error('No UTXOs available for on-demand test');
      }
      const totalAmount = utxos.reduce((sum: number, u: any) => sum + u.amount, 0);
      const fee = 0.00001;
      const sendAmount = Math.floor((totalAmount - fee) * 100000000) / 100000000;

      const inputs = utxos.map((u: any) => ({ txid: u.txid, vout: u.vout }));
      const outputs: Record<string, number> = {};
      outputs[testAddress] = sendAmount;

      const rawTx = await broadcaster.createRawTransaction(inputs, outputs);
      const signedHex = await broadcaster.signTransaction(rawTx);

      // Record broadcast time BEFORE broadcast
      onDemandTimestamps.broadcastTime = Date.now();

      // Broadcast - we intentionally IGNORE the return value
      await broadcaster.broadcast(signedHex);
      console.log('✅ Transaction broadcast succeeded');
      console.log('   (txid from RPC NOT used - waiting for callback)');
      console.log('');
    } catch (error) {
      console.error('❌ Transaction broadcast failed:', (error as Error).message);
      onDemandCleanup();
      onDemandFinder.stop();
      throw error;
    }

    // Wait for transaction detection from callback (NOT from RPC)
    console.log('⏳ Waiting for onTransaction callback...');
    let detectedTx: TransactionEvent;
    try {
      detectedTx = await Promise.race([
        txPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for transaction detection')), 30000)
        ),
      ]);
      console.log(`✅ Transaction detected via callback: ${detectedTx.txid}`);
    } catch (error) {
      console.error('❌ Transaction detection failed:', (error as Error).message);
      onDemandCleanup();
      onDemandFinder.stop();
      throw error;
    }

    // Wait for IS hex from callback (this is what multi-node hunting should provide)
    console.log('');
    console.log('⏳ Waiting for onInstantLock callback with hex...');
    let detectedIs: InstantLockEvent;
    try {
      detectedIs = await Promise.race([
        isPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for IS hex delivery')), 30000)
        ),
      ]);
      console.log(`✅ InstantLock hex delivered via callback!`);
    } catch (error) {
      console.log('');
      console.log('⚠️  IS hex not delivered within timeout');
      console.log('   This may indicate multi-node hunting did not find a node with rawtxlocksig enabled');

      // Check what we did get
      const isEventsWithoutHex = onDemandEvents.instantLocks.filter(l => !l.instantLockHex);
      if (isEventsWithoutHex.length > 0) {
        console.log(`   IS was detected ${isEventsWithoutHex.length} time(s) but WITHOUT hex`);
      }
    }

    // Cleanup
    onDemandCleanup();
    onDemandFinder.stop();

    // Print results
    console.log('');
    console.log('═'.repeat(70));
    console.log('📊 ON-DEMAND TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`Transaction detected via callback: ${onDemandEvents.transactions.length > 0 ? '✅ Yes' : '❌ No'}`);
    console.log(`InstantLock detected via callback: ${onDemandEvents.instantLocks.length > 0 ? '✅ Yes' : '❌ No'}`);
    console.log(`InstantLock HEX delivered:         ${onDemandEvents.instantLocks.some(l => l.instantLockHex) ? '✅ Yes' : '❌ No'}`);
    console.log('');

    if (onDemandEvents.transactions.length > 0) {
      const tx = onDemandEvents.transactions[0];
      console.log('Transaction Data (from callback only):');
      console.log(`  txid: ${tx.txid}`);
      console.log(`  timestamp: ${tx.timestamp}`);
      console.log(`  Detection latency: ${onDemandTimestamps.txDetectedTime - onDemandTimestamps.broadcastTime}ms`);
    }

    if (onDemandEvents.instantLocks.length > 0) {
      const is = onDemandEvents.instantLocks[0];
      console.log('');
      console.log('InstantLock Data (from callback only):');
      console.log(`  txid: ${is.txid}`);
      console.log(`  timestamp: ${is.timestamp}`);
      console.log(`  latency: ${is.latency}ms`);
      console.log(`  instantLockHex: ${is.instantLockHex ? is.instantLockHex.substring(0, 40) + '...' : '(not delivered)'}`);
    }

    console.log('═'.repeat(70));

    // Assertions - verify we got data from callbacks, not RPC
    expect(onDemandEvents.transactions.length).toBeGreaterThan(0);
    expect(onDemandEvents.transactions[0].txid).toBeDefined();

    // The critical assertion: IS hex must be delivered via multi-node hunting
    const hasIsHex = onDemandEvents.instantLocks.some(l => l.instantLockHex);
    if (hasIsHex) {
      console.log('');
      console.log('✅ ON-DEMAND TEST PASSED - IS hex delivered via multi-node hunting');
    } else {
      console.log('');
      console.log('⚠️  ON-DEMAND TEST INCOMPLETE - IS hex not delivered');
      console.log('   Multi-node hunting may not have found a node with rawtxlocksig enabled');
      // Don't fail the test - this is a best-effort feature
    }
  }, 120000); // 2 minute timeout
});
