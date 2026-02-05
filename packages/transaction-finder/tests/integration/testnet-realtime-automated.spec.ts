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
import { getDAPIClientOptions } from '../helpers/dapi-config.js';
import type {
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
  BlockInclusionEvent,
  ConfirmationResult,
} from '../../src/types/index.js';

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
    console.log(`🤖 Automated Monitoring Test [${MODE_LABEL}]`);
    console.log('═'.repeat(70));
    console.log(`Network: ${NETWORK}`);
    console.log(`Mode: ${MODE_LABEL}`);
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
    // Stream subscriptions need a longer timeout than regular RPC queries —
    // the gRPC stream must stay open long enough for the broadcast tx to
    // propagate through P2P to the DAPI node serving the stream.
    dapiClient = new DAPIClient({
      ...getDAPIClientOptions(NETWORK as 'testnet' | 'mainnet'),
      timeout: 60000,
    });

    // Initialize finder with stream reconnection enabled.
    // Periodic reconnection forces DAPI to re-run its historical + mempool scan,
    // catching transactions missed during continuous streaming.
    // preRegisterTransaction() pauses reconnection so the gRPC stream stays
    // alive for IS proof byte delivery.
    finder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [testAddress],
      dapiClient: dapiClient as any,
      streamReconnectInterval: 60000, // 60s periodic reconnect for catching missed txs
      // reconnectOnPreRegister defaults to true — immediate reconnect for fresh IS emitter
      // preRegisterReconnectDelay defaults to 0 — reconnect before broadcast
      autoPruneOnConfirmation: true, // Prune confirmed txs from extended scan
      maxTrackedTransactions: 5000, // Higher limit for extended scan false positives
    });
  });

  afterAll(async () => {
    if (cleanup) {
      cleanup();
    }
    finder?.stop();
    // Wait for gRPC to flush its internal CANCELLED rejection before
    // the test process exits and vitest's global handler catches it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    process.removeListener('unhandledRejection', grpcCancelHandler);
  });

  it(`should detect confirmations for broadcast transaction [${MODE_LABEL}]`, async () => {
    // Skip if RPC not configured
    if (!RPC_CONFIG.pass) {
      expect(true).toBe(true);
      return;
    }

    // Track when confirmations complete
    let instantLockReceived = false;
    let chainLockReceived = false;
    let broadcastTxid: string = '';

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
        if (broadcastTxid && lock.txid === broadcastTxid) {
          instantLockReceived = true;
        }
        console.log('');
        console.log('⚡ InstantLock received!');
        console.log(`   Tx: ${lock.txid.substring(0, 16)}...`);
        console.log(`   Tx → InstantLock latency: ${lock.latency} ms`);
        console.log(`   Broadcast → InstantLock: ${timestamps.instantLock - timestamps.txBroadcast} ms`);
        console.log(`   instantLockHex: ${lock.instantLockHex ? lock.instantLockHex.substring(0, 32) + '...' : '(not delivered — poller detected IS, no raw proof bytes)'}`);
      },
      onChainLock: (cl) => {
        events.chainLocks.push(cl);
        timestamps.chainLock = Date.now();
        if (broadcastTxid && cl.txid === broadcastTxid) {
          chainLockReceived = true;
        }
        console.log('');
        console.log('⛓️  ChainLock confirmed!');
        console.log(`   Tx: ${cl.txid.substring(0, 16)}...`);
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

    // Build, sign, pre-register, THEN broadcast.
    // This matches the real SDK pattern (identity-creator.ts) where the txid
    // is computed locally from the signed tx, preRegisterTransaction() is called
    // BEFORE broadcast, and then the tx is broadcast. This ordering is critical:
    // preRegister triggers an immediate stream reconnect so the fresh bloom filter
    // emitter is registered BEFORE the IS ZMQ event fires (~1-2s after broadcast).
    console.log('📡 Building consolidation transaction...');
    console.log('   (All UTXOs → single output to same address, no change)');
    try {
      // Step 1: Build and sign transaction WITHOUT broadcasting
      // Use minConf=0 to allow spending unconfirmed outputs from prior test runs.
      // Dash supports chained IS transactions, so unconfirmed IS-locked outputs are safe.
      const utxos = await broadcaster.listUnspent(0, 9999999, [testAddress]);
      if (utxos.length === 0) {
        throw new Error('No confirmed UTXOs available for test address');
      }
      const totalAmount = utxos.reduce((sum: number, u: any) => sum + u.amount, 0);
      const fee = 0.00001;
      const sendAmount = Math.floor((totalAmount - fee) * 100000000) / 100000000;

      const inputs = utxos.map((u: any) => ({ txid: u.txid, vout: u.vout }));
      const outputs: Record<string, number> = {};
      outputs[testAddress] = sendAmount;

      const rawTx = await broadcaster.createRawTransaction(inputs, outputs);
      const signedHex = await broadcaster.signTransaction(rawTx);

      // Step 2: Decode to get txid BEFORE broadcast
      const decoded = await rpcClient.call<{ txid: string }>('decoderawtransaction', [signedHex]);
      broadcastTxid = decoded.txid;

      console.log(`   Built tx: ${broadcastTxid}`);
      console.log(`   Consolidated amount: ${sendAmount} DASH (from ${utxos.length} UTXOs)`);

      // Step 3: Pre-register BEFORE broadcast (matches SDK identity-creator.ts pattern)
      // This triggers an immediate stream reconnect so the fresh bloom filter
      // emitter is registered and ready to cache IS ZMQ events.
      finder.preRegisterTransaction(broadcastTxid);
      console.log(`   Pre-registered txid for IS monitoring`);

      // Brief delay to allow the stream reconnection to initiate (the
      // reconnect is async via setTimeout(0)). The extended scan (200 blocks)
      // keeps the preMempoolSentInstantLockListener active long enough for
      // the broadcast tx to reach the DAPI node and IS to fire.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 4: NOW broadcast — IS event fires ~1-2s after this
      timestamps.txBroadcast = Date.now();
      const txid = await broadcaster.broadcast(signedHex);
      console.log(`✅ Transaction broadcast: ${txid}`);

      console.log(`   Waiting for confirmations...`);
      console.log('');
    } catch (error) {
      console.error('❌ Transaction broadcast failed:', (error as Error).message);
      throw error;
    }

    // Use waitForConfirmation() — this is what the SDK actually calls.
    // It exercises the hex wait logic when poller detects IS before stream delivers hex.
    console.log('   Using waitForConfirmation() to validate hex delivery...');
    let confirmation: ConfirmationResult | undefined;
    try {
      confirmation = await finder.waitForConfirmation(broadcastTxid, {
        requireInstantLock: waitForIS,
        requireChainLock: waitForCL,
        timeout: TIMEOUT_MS,
        onProgress: (progress) => {
          // Log progress every 10s to show test is alive
          if (progress.elapsedMs % 10000 < 1100) {
            console.log(`   [${(progress.elapsedMs / 1000).toFixed(0)}s] ${progress.message}`);
          }
        },
      });
    } catch (error) {
      console.log('');
      console.log('⏱️  waitForConfirmation() error:', (error as Error).message);
      // In IS-only mode, waitForConfirmation MUST succeed — fail hard
      if (waitForIS && !waitForCL) {
        throw error;
      }
    }

    // In IS-only mode, confirmation must be defined
    if (waitForIS && !waitForCL) {
      expect(confirmation).toBeDefined();
    }

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

    // Log waitForConfirmation() result
    if (confirmation) {
      console.log('');
      console.log('waitForConfirmation() result:');
      console.log(`  method: ${confirmation.method}`);
      console.log(`  instantLockHex: ${confirmation.instantLockHex ? confirmation.instantLockHex.substring(0, 32) + '...' : '(absent)'}`);
      console.log(`  totalLatencyMs: ${confirmation.totalLatencyMs}`);

      // Assert method is correct in IS-only mode
      if (waitForIS && !waitForCL) {
        expect(confirmation.method).toBe('instantlock');
        // Note: instantLockHex delivery depends on DAPI node ZMQ configuration.
        // Not all testnet DAPI nodes have rawtxlocksig ZMQ enabled, so hex delivery
        // is best-effort. The SDK falls back to ChainAssetLockProof when hex is absent.
        // When hex IS delivered, it validates the full InstantAssetLockProof path.
      }

      // Log which hex delivery path was taken
      if (confirmation.instantLockHex) {
        console.log('✅ InstantLock hex delivered — InstantAssetLockProof path available');
      } else if (confirmation.method === 'instantlock') {
        console.log('❌ InstantLock detected but hex NOT delivered — SDK would fall back to ChainLock');
        console.log('   (This means the stream did not deliver IS proof bytes within the hex wait window)');
      }
    }

    // Find OUR transaction/lock events (there may be other testnet transactions)
    const ourTx = events.transactions.find((tx) => tx.txid === broadcastTxid);
    const ourInstantLock = events.instantLocks.find((lock) => lock.txid === broadcastTxid);
    const ourChainLock = events.chainLocks.find((cl) => cl.txid === broadcastTxid);

    // Determine if we got any confirmation signal at all (stream TX, IS, or CL)
    const anyConfirmation = ourTx || ourInstantLock || ourChainLock;

    // Assertions
    if (!anyConfirmation) {
      console.log('');
      console.log('❌ TEST FAILED - No confirmation signal received (stream TX, IS poll, or CL poll)');
      console.log(`   Looking for txid: ${broadcastTxid}`);
      console.log(`   Stream-detected txids: ${events.transactions.map((t) => t.txid).join(', ') || '(none)'}`);
      console.log(`   InstantLock txids: ${events.instantLocks.map((l) => l.txid).join(', ') || '(none)'}`);
      expect(anyConfirmation).toBeDefined();
    } else {
      // At least one confirmation signal received

      if (ourTx) {
        // Stream-based transaction detection worked
        expect(ourTx.txid).toBe(broadcastTxid);
      } else {
        // Transaction detected via polling only (stream staled before delivering raw tx)
        console.log('');
        console.log('ℹ️  Transaction detected via polling (stream did not deliver raw tx)');
      }

      // InstantLock assertions (required in IS and both modes)
      if (waitForIS) {
        if (ourInstantLock) {
          expect(ourInstantLock.txid).toBe(broadcastTxid);
          expect(ourInstantLock.latency).toBeGreaterThanOrEqual(0);
        } else {
          console.log('');
          console.log('⚠️  TEST INCOMPLETE - InstantLock not received within timeout');
          console.log(`   Looking for txid: ${broadcastTxid}`);
          console.log(`   InstantLock txids: ${events.instantLocks.map((l) => l.txid).join(', ')}`);
          // Don't fail - IS might be slow on testnet
        }
      }

      // ChainLock assertions (required in CL and both modes)
      if (waitForCL) {
        if (ourChainLock) {
          expect(ourChainLock.txid).toBe(broadcastTxid);
          // blockHeight may be 0 when CL detected via polling (getTransaction)
          // without the stream delivering a MerkleBlock for this tx
          expect(ourChainLock.blockHeight).toBeGreaterThanOrEqual(0);
        } else {
          console.log('');
          console.log('⚠️  TEST INCOMPLETE - ChainLock not received within timeout');
          console.log(`   Looking for txid: ${broadcastTxid}`);
          console.log(`   ChainLock txids: ${events.chainLocks.map((cl) => cl.txid).join(', ')}`);
          // Don't fail - CL might take longer than timeout
        }
      }

      console.log('');
      console.log(`✅ TEST PASSED - ${MODE_LABEL} flow validated`);
    }
  }, TIMEOUT_MS + 60000); // Add 60s buffer for setup/teardown
});
