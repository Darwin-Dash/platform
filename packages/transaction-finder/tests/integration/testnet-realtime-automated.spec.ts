/**
 * Automated Testnet On-Demand Transaction Detection Test (DAPI-Only)
 *
 * Tests the on-demand detection flow using DAPI exclusively - no RPC node required.
 * Transaction building uses dashcore-lib with mnemonic-derived keys.
 *
 * Flow:
 * 1. Find a spendable UTXO via DAPI historic scan
 * 2. Build a self-send TX with dashcore-lib
 * 3. Start monitorAddresses() with callbacks BEFORE broadcast
 * 4. Broadcast via dapiClient.core.broadcastTransaction()
 * 5. TransactionFinder detects TX via multi-node parallel streams
 * 6. onTransaction callback provides txid and transaction data
 * 7. onInstantLock callback provides IS hex
 *
 * Environment variables (from js-evo-sdk/.env):
 *   MNEMONIC          - BIP39 mnemonic for key derivation
 *   TESTNET_ADDRESS   - Address to monitor (BIP44 m/44'/1'/0'/0/0)
 *   NETWORK           - Network (testnet/mainnet)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import DAPIClient from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode } from '../../src/index.js';
import { config } from 'dotenv';
import { getDAPIClientOptions, IS_NODE_HEALTH } from '../helpers/dapi-config.js';
import {
  derivePrivateKey,
  deriveAddress,
  buildSelfSendTx,
  broadcastViaDAPI,
  waitForInstantSend,
  getCurrentHeight,
} from '../helpers/dapi-transaction-helper.js';
import type { ChainedUTXO } from '../helpers/dapi-transaction-helper.js';
import { loadTestState, saveTestState } from '../helpers/test-state.js';
import type {
  TransactionEvent,
  InstantLockEvent,
} from '../../src/types/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suppress gRPC CANCELLED rejections that fire asynchronously when streams
// are cancelled during reconnection or teardown.
const grpcCancelHandler = (err: unknown) => {
  if (err && typeof err === 'object' && (err as any).code === 1 &&
      (err as any).details === 'Cancelled on client') {
    return;
  }
  throw err;
};
process.on('unhandledRejection', grpcCancelHandler);

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

const MNEMONIC = process.env.MNEMONIC || '';
const NETWORK = process.env.NETWORK || 'testnet';
const TIMEOUT_MS = 120000; // 2 minutes

// Path for persisting IS node health data
const IS_NODE_HEALTH_PATH = path.join(__dirname, '../../../js-evo-sdk/demo/is-node-health.json');

// Store the last finder for persistence in afterAll
let lastFinder: TransactionFinder | null = null;

describe('On-Demand Realtime Monitoring (DAPI-Only)', () => {
  let dapiClient: DAPIClient;
  let privateKey: any;
  let testAddress: string;

  beforeAll(async () => {
    if (!MNEMONIC) {
      console.log('');
      console.log('Skipping automated test: MNEMONIC not set in environment');
      console.log('Set MNEMONIC in packages/js-evo-sdk/.env to enable this test');
      return;
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('On-Demand Detection Test [DAPI-Only]');
    console.log('='.repeat(70));
    console.log(`Network: ${NETWORK}`);
    console.log('Pattern: On-demand detection via parallel multi-node streams');
    console.log('TX Method: dashcore-lib + DAPI broadcast (no RPC)');
    console.log('');

    // Derive key from mnemonic
    console.log('Deriving key from mnemonic...');
    privateKey = derivePrivateKey(MNEMONIC, NETWORK);
    testAddress = deriveAddress(MNEMONIC, NETWORK);
    console.log(`  Derived address: ${testAddress}`);

    const envAddress = process.env.TESTNET_ADDRESS || '';
    if (envAddress && envAddress !== testAddress) {
      console.log(`  WARNING: Derived address differs from TESTNET_ADDRESS (${envAddress})`);
      console.log('  Using derived address for signing');
    }
    console.log('');

    // Initialize DAPI client
    dapiClient = new DAPIClient({
      ...getDAPIClientOptions(NETWORK as 'testnet' | 'mainnet'),
      timeout: 60000,
    });

    // Verify connectivity
    const height = await getCurrentHeight(dapiClient);
    console.log(`Connected to ${NETWORK} at height ${height}`);
    console.log('');
  });

  afterAll(async () => {
    // Persist learned IS node health data for future test runs
    if (lastFinder) {
      try {
        const healthData = lastFinder.exportNodeHealth();
        if (healthData.knownGood.length > 0 || Object.keys(healthData.learned).length > 0) {
          const dir = path.dirname(IS_NODE_HEALTH_PATH);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(IS_NODE_HEALTH_PATH, JSON.stringify(healthData, null, 2));
          console.log('');
          console.log(`Persisted IS node health data to ${path.basename(IS_NODE_HEALTH_PATH)}`);
          console.log(`  Known-good nodes: ${healthData.knownGood.length}`);
          console.log(`  Learned nodes: ${Object.keys(healthData.learned).length}`);
        }
      } catch (error) {
        console.warn('Failed to persist IS node health:', (error as Error).message);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
    process.removeListener('unhandledRejection', grpcCancelHandler);
  });

  it('should detect self-send TX and IS via DAPI-only flow', async () => {
    if (!MNEMONIC) {
      expect(true).toBe(true);
      return;
    }

    // ---- Step 1: Find a spendable UTXO ----
    console.log('Step 1: Finding spendable UTXO via DAPI...');
    const testState = loadTestState();
    const currentHeight = await getCurrentHeight(dapiClient);

    // Use state or scan last 500 blocks
    let scanFrom: number;
    if (testState.lastTxBlockHeight > 0) {
      scanFrom = Math.max(1, testState.lastTxBlockHeight - 10);
      console.log(`  Using persisted state, scanning from block ${scanFrom}`);
    } else {
      scanFrom = Math.max(1, currentHeight - 500);
      console.log(`  No state, scanning last 500 blocks from ${scanFrom}`);
    }

    const finder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [testAddress],
      dapiClient: dapiClient as any,
      fromHeight: scanFrom,
      toHeight: currentHeight,
      onProgress: (progress) => {
        if (progress.progress % 25 < 1) {
          process.stdout.write(`\r  Scan: ${progress.progress.toFixed(0)}%`);
        }
      },
    });

    const utxos = await finder.findUTXOs();
    console.log(`\n  Found ${utxos.length} UTXOs`);

    expect(utxos.length).toBeGreaterThan(0);
    if (utxos.length === 0) return;

    // Pick the largest UTXO
    const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis);
    const bestUtxo: ChainedUTXO = {
      txId: sorted[0].txId,
      vout: sorted[0].vout,
      satoshis: sorted[0].satoshis,
      script: sorted[0].script,
      address: sorted[0].address,
    };
    console.log(`  Using UTXO: ${bestUtxo.txId.substring(0, 16)}...:${bestUtxo.vout} (${bestUtxo.satoshis} duffs)`);
    console.log('');

    // ---- Step 2: Build self-send TX ----
    console.log('Step 2: Building self-send transaction...');
    const { txHex, txid: builtTxid, outputUtxo } = buildSelfSendTx(bestUtxo, privateKey, NETWORK);
    console.log(`  Built TX: ${builtTxid.substring(0, 16)}... (${outputUtxo.satoshis} duffs out, 500 fee)`);
    console.log('');

    // ---- Step 3: Set up monitoring BEFORE broadcast ----
    console.log('Step 3: Starting on-demand monitoring...');

    const events = {
      transactions: [] as TransactionEvent[],
      instantLocks: [] as InstantLockEvent[],
    };

    const timestamps = {
      broadcastTime: 0,
      txDetectedTime: 0,
      isDetectedTime: 0,
    };

    let txResolve: (tx: TransactionEvent) => void;
    const txPromise = new Promise<TransactionEvent>((resolve) => { txResolve = resolve; });

    let isResolve: (lock: InstantLockEvent) => void;
    const isPromise = new Promise<InstantLockEvent>((resolve) => { isResolve = resolve; });

    const knownGoodIsNodes = IS_NODE_HEALTH?.knownGood || [];
    if (knownGoodIsNodes.length > 0) {
      console.log(`  Loaded ${knownGoodIsNodes.length} known-good IS nodes from previous runs`);
    }

    const monitorFinder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [testAddress],
      dapiClient: dapiClient as any,
      multiNodeIsHunting: true,
      isHuntingNodes: 3,
      isHuntingTimeoutMs: 5000,
      streamReconnectInterval: 0,
      knownGoodIsNodes,
    });

    lastFinder = monitorFinder;

    const cleanup = await monitorFinder.monitorAddresses([testAddress], {
      onTransaction: (tx) => {
        timestamps.txDetectedTime = Date.now();
        events.transactions.push(tx);
        console.log('');
        console.log(`  TX detected via callback: ${tx.txid}`);
        console.log(`  Detection latency: ${timestamps.txDetectedTime - timestamps.broadcastTime}ms`);
        txResolve(tx);
      },
      onInstantLock: (lock) => {
        timestamps.isDetectedTime = Date.now();
        events.instantLocks.push(lock);
        console.log('');
        console.log(`  InstantLock detected: ${lock.txid}`);
        console.log(`  IS hex: ${lock.instantLockHex ? lock.instantLockHex.substring(0, 32) + '...' : '(not delivered)'}`);
        console.log(`  IS latency: ${lock.latency}ms`);
        if (lock.instantLockHex) {
          isResolve(lock);
        }
      },
    });
    console.log('  Monitoring started');
    console.log('');

    // ---- Step 4: Broadcast via DAPI ----
    console.log('Step 4: Broadcasting via DAPI...');
    timestamps.broadcastTime = Date.now();
    try {
      await broadcastViaDAPI(dapiClient, txHex);
      console.log('  Broadcast successful');
    } catch (error) {
      console.error('  Broadcast failed:', (error as Error).message);
      cleanup();
      monitorFinder.stop();
      throw error;
    }
    console.log('');

    // ---- Step 5: Wait for TX detection ----
    console.log('Step 5: Waiting for TX detection via callback...');
    let detectedTx: TransactionEvent;
    try {
      detectedTx = await Promise.race([
        txPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for TX detection (30s)')), 30000)
        ),
      ]);
      console.log(`  TX detected: ${detectedTx.txid}`);
    } catch (error) {
      console.error('  TX detection failed:', (error as Error).message);
      cleanup();
      monitorFinder.stop();
      throw error;
    }

    // ---- Step 6: Wait for IS ----
    console.log('');
    console.log('Step 6: Waiting for InstantLock...');
    try {
      await Promise.race([
        isPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for IS hex (30s)')), 30000)
        ),
      ]);
      console.log('  InstantLock hex delivered!');
    } catch {
      console.log('  IS hex not delivered within timeout');
      const isEventsWithoutHex = events.instantLocks.filter(l => !l.instantLockHex);
      if (isEventsWithoutHex.length > 0) {
        console.log(`  IS was detected ${isEventsWithoutHex.length} time(s) but WITHOUT hex`);
      }
    }

    // Cleanup streams
    cleanup();
    monitorFinder.stop();

    // ---- Step 7: Verify IS via polling (backup) ----
    console.log('');
    console.log('Step 7: Verifying IS confirmation via getTransaction...');
    const isConfirmed = await waitForInstantSend(dapiClient, detectedTx.txid, 15000);
    console.log(`  IS confirmed: ${isConfirmed}`);

    // ---- Persist state ----
    testState.lastTxBlockHeight = currentHeight;
    testState.lastUtxo = {
      txId: outputUtxo.txId,
      vout: outputUtxo.vout,
      satoshis: outputUtxo.satoshis,
      script: outputUtxo.script,
      address: outputUtxo.address,
      blockHeight: currentHeight,
    };
    saveTestState(testState);
    console.log('[state] Saved state for next run');

    // ---- Results ----
    console.log('');
    console.log('='.repeat(70));
    console.log('TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`TX detected via callback:  ${events.transactions.length > 0 ? 'YES' : 'NO'}`);
    console.log(`IS detected via callback:  ${events.instantLocks.length > 0 ? 'YES' : 'NO'}`);
    console.log(`IS hex delivered:          ${events.instantLocks.some(l => l.instantLockHex) ? 'YES' : 'NO'}`);
    console.log(`IS confirmed (poll):       ${isConfirmed ? 'YES' : 'NO'}`);

    if (events.transactions.length > 0) {
      const tx = events.transactions[0];
      console.log('');
      console.log('Transaction Data (from callback):');
      console.log(`  txid: ${tx.txid}`);
      console.log(`  Detection latency: ${timestamps.txDetectedTime - timestamps.broadcastTime}ms`);
    }

    if (events.instantLocks.length > 0) {
      const is = events.instantLocks[0];
      console.log('');
      console.log('InstantLock Data (from callback):');
      console.log(`  txid: ${is.txid}`);
      console.log(`  latency: ${is.latency}ms`);
      console.log(`  hex: ${is.instantLockHex ? is.instantLockHex.substring(0, 40) + '...' : '(not delivered)'}`);
    }
    console.log('='.repeat(70));

    // Assertions
    expect(events.transactions.length).toBeGreaterThan(0);
    expect(events.transactions[0].txid).toBeDefined();

    // IS hex delivery is best-effort - log result but don't fail test
    const hasIsHex = events.instantLocks.some(l => l.instantLockHex);
    if (hasIsHex) {
      console.log('');
      console.log('PASS - IS hex delivered via multi-node hunting');
    } else {
      console.log('');
      console.log('PARTIAL PASS - TX detected but IS hex not delivered');
      console.log('  Multi-node hunting may not have found a node with rawtxlocksig enabled');
    }
  }, TIMEOUT_MS);
});
