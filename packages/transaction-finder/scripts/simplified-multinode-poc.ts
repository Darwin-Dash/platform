#!/usr/bin/env npx ts-node
/**
 * Simplified Multi-Node Transaction Detection POC
 *
 * Tests the simplified architecture where:
 * 1. N parallel streams process ALL message types (tx, IS, MerkleBlock) equally
 * 2. A simple tracker deduplicates - callbacks fire only once
 * 3. Any stream that delivers IS hex wins
 * 4. CL fallback uses multi-node getTransaction() - ANY "true" wins
 *
 * This approach removes:
 * - TransactionStatusPoller (redundant with multi-node streams)
 * - ChainLockHeightMonitor (redundant with multi-node getTransaction)
 * - MultiNodeIsHunter (parallel streams replace it)
 *
 * The key insight: with N parallel streams all processing the same data,
 * deduplication is trivial and we get multi-node resilience "for free".
 *
 * Usage:
 *   # Single run (send DASH during test)
 *   npx ts-node scripts/simplified-multinode-poc.ts --address yXxx...
 *
 *   # Automated runs (requires RPC)
 *   npx ts-node scripts/simplified-multinode-poc.ts \
 *     --runs 5 \
 *     --address yXxx... \
 *     --auto-send
 *
 *   # Custom node count
 *   npx ts-node scripts/simplified-multinode-poc.ts \
 *     --runs 3 \
 *     --nodes 4 \
 *     --address yXxx...
 */

import DAPIClient from '@dashevo/dapi-client';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { config } from 'dotenv';
import { BloomFilterBuilder } from '../src/core/BloomFilterBuilder.js';
import { StreamWrapper } from '../src/core/StreamWrapper.js';
import dashcore from '@dashevo/dashcore-lib';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Transaction, MerkleBlock, InstantLock } = dashcore;

// Load environment
config({ path: path.join(__dirname, '../../js-evo-sdk/.env') });

// ============================================================================
// Types
// ============================================================================

interface TrackedTx {
  txid: string;
  detectedAt: number;
  detectedBy: string | null;
  instantLockHex: string | null;
  instantLockAt: number | null;
  instantLockBy: string | null;
  isChainLocked: boolean;
  chainLockAt: number | null;
  chainLockBy: string | null;
  blockHeight: number | null;
}

interface RunResult {
  runNumber: number;
  txid: string | null;
  txDetected: boolean;
  txDetectedBy: string | null;
  txDetectionLatencyMs: number;
  isHexCaptured: boolean;
  isHexCapturedBy: string | null;
  isHexLatencyMs: number;
  clConfirmed: boolean;
  clConfirmedBy: string | null;
  clLatencyMs: number;
  totalLatencyMs: number;
  method: 'instantlock' | 'chainlock' | 'timeout';
  error: string | null;
}

interface ReliabilityStats {
  totalRuns: number;
  successes: number;
  failures: number;
  txDetectionRate: number;
  isHexSuccessRate: number;
  clFallbackRate: number;
  avgTxDetectionMs: number;
  avgIsHexLatencyMs: number;
  avgClLatencyMs: number;
  nodeStats: Map<string, { txDetections: number; isHexDeliveries: number; clConfirmations: number }>;
}

interface StreamHandle {
  nodeAddress: string;
  stream: any;
  client: DAPIClient;
  asyncIterable: AsyncIterable<any>;
}

interface POCConfig {
  runs: number;
  address: string;
  nodes: number;
  delay: number;
  autoSend: boolean;
  network: 'testnet' | 'mainnet';
  isHexTimeoutMs: number;
  clTimeoutMs: number;
  clPollIntervalMs: number;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): POCConfig {
  const args = process.argv.slice(2);
  const config: POCConfig = {
    runs: 1,
    address: '',
    nodes: 3,
    delay: 15000,
    autoSend: false,
    network: 'testnet',
    isHexTimeoutMs: 10000,
    clTimeoutMs: 180000,    // 3 minutes for CL
    clPollIntervalMs: 2000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--runs':
        config.runs = parseInt(args[++i], 10);
        break;
      case '--address':
        config.address = args[++i];
        break;
      case '--nodes':
        config.nodes = parseInt(args[++i], 10);
        break;
      case '--delay':
        config.delay = parseInt(args[++i], 10);
        break;
      case '--auto-send':
        config.autoSend = true;
        break;
      case '--network':
        config.network = args[++i] as 'testnet' | 'mainnet';
        break;
      case '--is-timeout':
        config.isHexTimeoutMs = parseInt(args[++i], 10);
        break;
      case '--cl-timeout':
        config.clTimeoutMs = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
Simplified Multi-Node Transaction Detection POC

Usage:
  npx ts-node scripts/simplified-multinode-poc.ts [options]

Options:
  --runs N          Number of test runs (default: 1)
  --address ADDR    Testnet address to monitor (required)
  --nodes N         Number of parallel streams (default: 3)
  --delay MS        Delay between runs in ms (default: 15000)
  --auto-send       Automatically send tDASH via RPC
  --network NET     Network: testnet or mainnet (default: testnet)
  --is-timeout MS   IS hex timeout in ms (default: 10000)
  --cl-timeout MS   ChainLock timeout in ms (default: 180000)
  --help            Show this help message

Environment variables (from ../js-evo-sdk/.env):
  TESTNET_RPC_ENDPOINT   RPC endpoint (default: http://localhost:19998)
  TESTNET_RPC_USERNAME   RPC username (default: dashrpc)
  TESTNET_RPC_PASSWORD   RPC password (required for --auto-send)
  TESTNET_WALLET         Wallet name (optional)

Examples:
  # Single manual run
  npx ts-node scripts/simplified-multinode-poc.ts --address yXxx...

  # 5 automated runs with 4 nodes
  npx ts-node scripts/simplified-multinode-poc.ts \\
    --runs 5 --nodes 4 --address yXxx... --auto-send
`);
        process.exit(0);
    }
  }

  if (!config.address) {
    config.address = process.env.TESTNET_ADDRESS || '';
  }

  if (!config.address) {
    console.error('Error: --address is required (or set TESTNET_ADDRESS env var)');
    process.exit(1);
  }

  return config;
}

// ============================================================================
// Node Discovery
// ============================================================================

async function getNodeAddresses(dapiClient: DAPIClient, count: number): Promise<string[]> {
  const addresses: string[] = [];

  // Try to get addresses from the DAPI client's address provider
  const addressProvider = (dapiClient as any).dapiAddressProvider;
  if (!addressProvider) {
    console.warn('No address provider available, using DNS seeds');
    return addresses;
  }

  // Try to get all addresses from list provider
  let allAddresses: any[] = [];

  if (addressProvider.listDAPIAddressProvider) {
    allAddresses = addressProvider.listDAPIAddressProvider.getAllAddresses() || [];
  } else if (typeof addressProvider.getAllAddresses === 'function') {
    allAddresses = addressProvider.getAllAddresses() || [];
  } else if (typeof addressProvider.getLiveAddress === 'function') {
    // Fallback: get addresses one at a time
    for (let i = 0; i < count * 3; i++) {
      try {
        const addr = await addressProvider.getLiveAddress();
        if (addr) {
          const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
          if (!addresses.includes(addrStr)) {
            addresses.push(addrStr);
          }
          if (addresses.length >= count) break;
        }
      } catch (e) {
        break;
      }
    }
    return addresses.slice(0, count);
  }

  // Convert DAPIAddress objects to strings
  for (const addr of allAddresses) {
    const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
    if (!addresses.includes(addrStr)) {
      addresses.push(addrStr);
    }
    if (addresses.length >= count * 2) break; // Get more than we need for shuffling
  }

  // Shuffle and return requested count
  for (let i = addresses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [addresses[i], addresses[j]] = [addresses[j], addresses[i]];
  }

  return addresses.slice(0, count);
}

// ============================================================================
// Stream Management
// ============================================================================

async function openParallelStreams(
  nodeAddresses: string[],
  bloomFilter: any,
  fromHeight: number,
  network: string,
  sharedClient?: DAPIClient
): Promise<StreamHandle[]> {
  const handles: StreamHandle[] = [];

  for (const nodeAddress of nodeAddresses) {
    try {
      // Use shared client if provided, otherwise create per-node client
      // Per-node clients allow true parallel connections, but shared client
      // is more reliable for stream subscription
      let client: DAPIClient;
      if (sharedClient) {
        client = sharedClient;
      } else {
        client = new DAPIClient({
          dapiAddresses: [nodeAddress],
          network,
          timeout: 60000,
        });
      }

      const core = (client as any).core;
      let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
        fromBlockHeight: fromHeight,
        count: 0,
      });

      if (rawStream && typeof rawStream.then === 'function') {
        rawStream = await rawStream;
      }

      const asyncIterable = StreamWrapper.makeAsyncIterable(rawStream);
      handles.push({
        nodeAddress,
        stream: rawStream,
        client,
        asyncIterable,
      });

      console.log(`  ✓ Stream ${handles.length}/${nodeAddresses.length}: ${nodeAddress}`);
    } catch (error) {
      console.log(`  ✗ Stream failed: ${nodeAddress} - ${(error as Error).message}`);
    }
  }

  return handles;
}

function closeStreams(handles: StreamHandle[]): void {
  for (const handle of handles) {
    try {
      if (typeof handle.stream.on === 'function') {
        handle.stream.on('error', () => {});
      }
      if (typeof handle.stream.cancel === 'function') {
        handle.stream.cancel();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Multi-Node getTransaction() for CL Detection
// ============================================================================

async function checkChainLockMultiNode(
  nodeAddresses: string[],
  txid: string,
  network: string,
  verbose: boolean = false
): Promise<{ isChainLocked: boolean; confirmedBy: string | null; blockHeight: number | null }> {
  const results = await Promise.allSettled(
    nodeAddresses.map(async (nodeAddress) => {
      const client = new DAPIClient({
        dapiAddresses: [nodeAddress],
        network,
        timeout: 10000,
      });

      const core = (client as any).core;
      const txResponse = await core.getTransaction(txid);

      // Debug: log what we got from each node
      if (verbose) {
        const nodeShort = nodeAddress.substring(8, 28);
        console.log(`    [CL] ${nodeShort}: height=${txResponse?.height ?? 'null'}, isChainLocked=${txResponse?.isChainLocked ?? 'null'}, isInstantLocked=${txResponse?.isInstantLocked ?? 'null'}`);
      }

      return {
        nodeAddress,
        isChainLocked: txResponse?.isChainLocked || false,
        isInstantLocked: txResponse?.isInstantLocked || false,
        blockHeight: txResponse?.height || null,
      };
    })
  );

  // ANY node says chainlocked → confirmed!
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.isChainLocked) {
      return {
        isChainLocked: true,
        confirmedBy: result.value.nodeAddress,
        blockHeight: result.value.blockHeight,
      };
    }
  }

  // Log summary if verbose
  if (verbose) {
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const anyInstantLocked = fulfilled.some(r => r.value.isInstantLocked);
    const anyInBlock = fulfilled.some(r => r.value.blockHeight !== null);
    if (!anyInBlock) {
      process.stdout.write('M'); // M = in Mempool (not mined yet)
    } else if (!anyInstantLocked) {
      process.stdout.write('B'); // B = in Block but no IS
    } else {
      process.stdout.write('.'); // . = IS confirmed, waiting for CL
    }
  }

  return { isChainLocked: false, confirmedBy: null, blockHeight: null };
}

// ============================================================================
// Stream Processing with Deduplication
// ============================================================================

async function processStream(
  handle: StreamHandle,
  tracker: Map<string, TrackedTx>,
  addresses: Set<string>,
  network: string,
  callbacks: {
    onNewTx: (txid: string, nodeAddress: string) => void;
    onNewIsHex: (txid: string, hex: string, nodeAddress: string) => void;
    onBlockInclusion: (txid: string, height: number, nodeAddress: string) => void;
  }
): Promise<void> {
  let messageCount = 0;
  let txCount = 0;
  let matchingTxCount = 0;
  const nodeShort = handle.nodeAddress.substring(8, 28);

  try {
    for await (const message of handle.asyncIterable) {
      messageCount++;
      recordStreamActivity(handle.nodeAddress);
      const msg = message as any;

      // Debug: log message types received
      const hasRawTx = typeof msg.getRawTransactions === 'function' && msg.getRawTransactions();
      const hasRawMerkle = typeof msg.getRawMerkleBlock === 'function' && msg.getRawMerkleBlock();
      const hasISLock = typeof msg.getInstantSendLockMessages === 'function' && msg.getInstantSendLockMessages();

      if (messageCount <= 3 || messageCount % 50 === 0) {
        console.log(`    [${nodeShort}] msg#${messageCount}: tx=${!!hasRawTx} merkle=${!!hasRawMerkle} is=${!!hasISLock}`);
      }

      // =========================================
      // Process Transactions
      // =========================================
      const rawTxs = typeof msg.getRawTransactions === 'function'
        ? msg.getRawTransactions()
        : msg.rawTransactions;

      if (rawTxs) {
        const txList = typeof (rawTxs as any).getTransactionsList === 'function'
          ? (rawTxs as any).getTransactionsList()
          : (Array.isArray(rawTxs) ? rawTxs : null);

        if (txList && txList.length > 0) {
          for (const txBuf of txList) {
            try {
              const tx = new Transaction(Buffer.from(txBuf));
              const txid = tx.hash;

              // Check if transaction involves monitored addresses
              let involvesAddress = false;
              if (tx.outputs && Array.isArray(tx.outputs)) {
                for (const output of tx.outputs) {
                  try {
                    if (output.script && output.script.toAddress) {
                      const addr = output.script.toAddress(network);
                      if (addr && addresses.has(addr.toString())) {
                        involvesAddress = true;
                        break;
                      }
                    }
                  } catch (e) {
                    // Non-standard output
                  }
                }
              }

              txCount++;
              if (involvesAddress) {
                matchingTxCount++;
                // DEDUPLICATION: Only fire callback for NEW transactions
                if (!tracker.has(txid)) {
                  const now = Date.now();
                  tracker.set(txid, {
                    txid,
                    detectedAt: now,
                    detectedBy: handle.nodeAddress,
                    instantLockHex: null,
                    instantLockAt: null,
                    instantLockBy: null,
                    isChainLocked: false,
                    chainLockAt: null,
                    chainLockBy: null,
                    blockHeight: null,
                  });
                  callbacks.onNewTx(txid, handle.nodeAddress);
                }
              }
            } catch (error) {
              // Ignore parse errors
            }
          }
        }
      }

      // =========================================
      // Process InstantLocks
      // =========================================
      const instantLockMessages = typeof msg.getInstantSendLockMessages === 'function'
        ? msg.getInstantSendLockMessages()
        : msg.instantSendLockMessages;

      const instantLockList = instantLockMessages?.getMessagesList
        ? instantLockMessages.getMessagesList()
        : (Array.isArray(instantLockMessages) ? instantLockMessages : null);

      if (instantLockList && instantLockList.length > 0) {
        for (const lockBuf of instantLockList) {
          try {
            const lock: any = (InstantLock as any).fromBuffer(Buffer.from(lockBuf));
            const txid = lock.txid.toString('hex');
            const hex = Buffer.from(lockBuf).toString('hex');

            // Check if we're tracking this tx
            const tracked = tracker.get(txid);
            if (tracked) {
              // DEDUPLICATION: Only fire callback if we don't have hex yet
              if (!tracked.instantLockHex) {
                tracked.instantLockHex = hex;
                tracked.instantLockAt = Date.now();
                tracked.instantLockBy = handle.nodeAddress;
                callbacks.onNewIsHex(txid, hex, handle.nodeAddress);
              }
            }
          } catch (error) {
            // Ignore parse errors
          }
        }
      }

      // =========================================
      // Process MerkleBlocks
      // =========================================
      const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
        ? msg.getRawMerkleBlock()
        : msg.rawMerkleBlock;

      if (rawMerkle) {
        try {
          const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
          // NOTE: We can't accurately determine block height from MerkleBlock alone
          // For this POC, we just note that the tx was included in a block
          const txids = merkleBlock.hashes.map((h: any) => {
            const buf = Buffer.from(String(h), 'hex');
            return buf.reverse().toString('hex');
          });

          for (const txid of txids) {
            const tracked = tracker.get(txid);
            if (tracked && !tracked.blockHeight) {
              // We don't know exact height from MerkleBlock, mark as "included"
              tracked.blockHeight = -1; // Placeholder
              callbacks.onBlockInclusion(txid, -1, handle.nodeAddress);
            }
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    }
  } catch (error) {
    // Stream ended or errored - this is normal during cleanup
    console.log(`    [${nodeShort}] Stream ended: ${messageCount} msgs, ${txCount} txs, ${matchingTxCount} matching`);
  }
}

// ============================================================================
// Stream Activity Tracking
// ============================================================================

interface StreamActivityTracker {
  lastActivityTime: number;
  messageCount: number;
}

const streamActivity = new Map<string, StreamActivityTracker>();

function recordStreamActivity(nodeAddress: string): void {
  const tracker = streamActivity.get(nodeAddress) || { lastActivityTime: 0, messageCount: 0 };
  tracker.lastActivityTime = Date.now();
  tracker.messageCount++;
  streamActivity.set(nodeAddress, tracker);
}

function getLastActivityTime(): number {
  let latest = 0;
  for (const tracker of streamActivity.values()) {
    if (tracker.lastActivityTime > latest) {
      latest = tracker.lastActivityTime;
    }
  }
  return latest;
}

// ============================================================================
// Transaction Detection Poller (Backup)
// ============================================================================

/**
 * Extract txid from a signed transaction hex.
 * Uses dashcore-lib to parse the transaction and get its hash.
 */
function getTxidFromHex(signedHex: string): string {
  const tx = new Transaction(Buffer.from(signedHex, 'hex'));
  return tx.hash;
}

/**
 * Poll for transaction detection via getTransaction().
 * This is a backup mechanism that races with stream detection.
 * Returns the txid when found, or throws on timeout.
 */
async function pollForTransactionDetection(
  txid: string,
  nodeAddresses: string[],
  network: string,
  timeoutMs: number,
  pollIntervalMs: number = 1000
): Promise<string> {
  const startTime = Date.now();
  let pollCount = 0;

  // Use a single shared client for polling (more reliable than per-node clients)
  const client = new DAPIClient({
    network,
    timeout: 5000,
  });
  const core = (client as any).core;

  while (Date.now() - startTime < timeoutMs) {
    pollCount++;
    try {
      const txResponse = await core.getTransaction(txid);
      // Check if we got valid transaction data
      const hasData = txResponse && (txResponse.transaction || txResponse.height !== undefined);
      if (hasData) {
        console.log(`    [POLLER] TX found!`);
        return txid;
      }
    } catch (error) {
      // Log error on first poll only
      if (pollCount === 1) {
        console.log(`    [POLLER] poll#1 error: ${(error as Error).message.substring(0, 50)}...`);
      }
    }

    // Log poll status every 10 polls
    if (pollCount % 10 === 0) {
      console.log(`    [POLLER] poll#${pollCount}: still searching...`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('TX detection timeout (poller)');
}

// ============================================================================
// Single Test Run
// ============================================================================

async function runSingleTest(
  config: POCConfig,
  runNumber: number,
  broadcaster: TransactionBroadcaster | null
): Promise<RunResult> {
  const result: RunResult = {
    runNumber,
    txid: null,
    txDetected: false,
    txDetectedBy: null,
    txDetectionLatencyMs: 0,
    isHexCaptured: false,
    isHexCapturedBy: null,
    isHexLatencyMs: 0,
    clConfirmed: false,
    clConfirmedBy: null,
    clLatencyMs: 0,
    totalLatencyMs: 0,
    method: 'timeout',
    error: null,
  };

  const startTime = Date.now();
  let broadcastTime = 0;

  // Simple tracker for deduplication
  const tracker = new Map<string, TrackedTx>();
  const addressSet = new Set([config.address]);

  // Promise resolvers for async coordination
  let txResolve: (txid: string) => void;
  const txPromise = new Promise<string>((resolve) => { txResolve = resolve; });

  let isHexResolve: (hex: string) => void;
  const isHexPromise = new Promise<string>((resolve) => { isHexResolve = resolve; });

  try {
    // 1. Create main DAPI client for node discovery
    const mainClient = new DAPIClient({
      network: config.network,
      timeout: 30000,
    });

    // 2. Get current blockchain height
    const core = (mainClient as any).core;
    const currentHeight = await core.getBestBlockHeight();
    console.log(`  Current height: ${currentHeight}`);

    // 3. Discover node addresses
    console.log(`  Discovering ${config.nodes} nodes...`);
    const nodeAddresses = await getNodeAddresses(mainClient, config.nodes);

    if (nodeAddresses.length === 0) {
      throw new Error('No DAPI nodes discovered');
    }

    console.log(`  Found ${nodeAddresses.length} nodes`);

    // 4. Build bloom filter for the address
    const bloomFilter = BloomFilterBuilder.build([config.address], config.network);

    // 5. Open parallel streams to ALL nodes (same processing for all)
    // Start from 10 blocks back to extend the scan phase.
    // Streams are most active during their scan phase - they deliver IS bytes
    // for transactions that arrive while scanning. Starting slightly back
    // ensures streams are still in scan phase when we broadcast.
    // Too far back (200 blocks) = scan takes too long, streams stall before broadcast
    // Too close (0 blocks) = scan finishes instantly, streams stall immediately
    const fromHeight = Math.max(1, currentHeight - 10);
    console.log(`  Opening ${nodeAddresses.length} parallel streams from height ${fromHeight}...`);
    // Use shared client for more reliable stream subscription
    // Per-node clients seem to have issues with immediate stream closure
    const streamHandles = await openParallelStreams(
      nodeAddresses,
      bloomFilter,
      fromHeight,
      config.network,
      mainClient  // Pass shared client
    );

    if (streamHandles.length === 0) {
      throw new Error('Failed to open any streams');
    }

    console.log(`  ✓ ${streamHandles.length} streams active`);

    // 6. Start processing ALL streams with the SAME logic
    console.log('  Starting stream processors...');
    const streamProcessors: Promise<void>[] = [];
    let acceptCallbacks = false; // Only accept callbacks after broadcast
    let historicalTxCount = 0;   // Counter for ignored historical transactions

    for (const handle of streamHandles) {
      const processor = processStream(handle, tracker, addressSet, config.network, {
        onNewTx: (txid, nodeAddress) => {
          // Only process transactions detected AFTER broadcast
          if (!acceptCallbacks) {
            // Historical transaction from scan phase - count but don't process
            historicalTxCount++;
            return;
          }
          console.log(`  📥 TX detected by ${nodeAddress.substring(0, 20)}...: ${txid.substring(0, 16)}...`);
          result.txDetected = true;
          result.txid = txid;
          result.txDetectedBy = nodeAddress;
          result.txDetectionLatencyMs = Date.now() - broadcastTime;
          txResolve(txid);
        },
        onNewIsHex: (txid, hex, nodeAddress) => {
          // Only process IS hex for transactions detected AFTER broadcast
          if (!acceptCallbacks) {
            return;
          }
          console.log(`  ⚡ IS hex captured by ${nodeAddress.substring(0, 20)}...: ${hex.substring(0, 32)}...`);
          result.isHexCaptured = true;
          result.isHexCapturedBy = nodeAddress;
          result.isHexLatencyMs = Date.now() - broadcastTime;
          isHexResolve(hex);
        },
        onBlockInclusion: (txid, height, nodeAddress) => {
          if (!acceptCallbacks) return;
          console.log(`  📦 Block inclusion by ${nodeAddress.substring(0, 20)}...`);
        },
      });
      streamProcessors.push(processor);
    }

    // 7. Send transaction (auto or manual)
    if (config.autoSend && broadcaster) {
      // Wait for stream connections to establish.
      // Since we start from currentHeight (no historical scan), streams connect quickly.
      // A brief wait ensures gRPC connections are fully established before broadcast.
      console.log('  ⏳ Waiting 2s for stream connections...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log('  📡 Auto-sending transaction...');
      try {
        const utxos = await broadcaster.listUnspent(0, 9999999, [config.address]);
        if (utxos.length === 0) {
          throw new Error('No UTXOs available');
        }

        const totalAmount = utxos.reduce((sum: number, u: any) => sum + u.amount, 0);
        const fee = 0.00001;
        const sendAmount = Math.floor((totalAmount - fee) * 100000000) / 100000000;

        const inputs = utxos.map((u: any) => ({ txid: u.txid, vout: u.vout }));
        const outputs: Record<string, number> = {};
        outputs[config.address] = sendAmount;

        const rawTx = await broadcaster.createRawTransaction(inputs, outputs);
        const signedHex = await broadcaster.signTransaction(rawTx);

        // Get the txid from the signed transaction BEFORE broadcast
        // This allows us to start the poller backup immediately
        const knownTxid = getTxidFromHex(signedHex);
        console.log(`  📋 Transaction txid: ${knownTxid.substring(0, 16)}...`);

        // Clear tracker and enable callbacks RIGHT BEFORE broadcast
        console.log(`  ℹ️  Ignored ${historicalTxCount} historical transactions during scan`);
        tracker.clear();
        broadcastTime = Date.now();
        acceptCallbacks = true;
        await broadcaster.broadcast(signedHex);
        console.log('  ✓ Transaction broadcast');

        // Start the poller backup for TX detection
        // This races with stream detection - first to find the TX wins
        const pollerPromise = pollForTransactionDetection(
          knownTxid,
          nodeAddresses,
          config.network,
          60000,  // 60s timeout
          1000    // 1s poll interval
        ).then((txid) => {
          // If poller finds it first and stream hasn't yet
          if (!result.txDetected) {
            console.log(`  📥 TX detected by POLLER: ${txid.substring(0, 16)}...`);
            result.txDetected = true;
            result.txid = txid;
            result.txDetectedBy = 'poller';
            result.txDetectionLatencyMs = Date.now() - broadcastTime;
            txResolve(txid);
          }
          return txid;
        }).catch(() => {
          // Poller timeout - stream may still succeed
        });

        // Store poller promise for potential cleanup (not awaited here)
        (result as any)._pollerPromise = pollerPromise;
      } catch (error) {
        throw new Error(`Broadcast failed: ${(error as Error).message}`);
      }
    } else {
      console.log('');
      console.log('  ⏳ Waiting for manual transaction...');
      console.log(`     Send tDASH to: ${config.address}`);
      console.log('');
      // Clear tracker and enable callbacks for manual send
      tracker.clear();
      broadcastTime = Date.now();
      acceptCallbacks = true;
      // NOTE: No poller backup for manual sends since we don't know the txid
    }

    // 8. Wait for transaction detection (stream OR poller - first wins)
    console.log('  Waiting for TX detection...');
    try {
      await Promise.race([
        txPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TX detection timeout')), 60000)
        ),
      ]);
    } catch (error) {
      result.error = 'TX detection timeout';
      closeStreams(streamHandles);
      result.totalLatencyMs = Date.now() - startTime;
      return result;
    }

    // 9. Wait for IS hex (with reconnection if streams stall)
    console.log('  Waiting for IS hex...');
    const isHexStartTime = Date.now();
    const STALE_STREAM_THRESHOLD_MS = 5000;
    let reconnectAttempted = false;

    while (Date.now() - isHexStartTime < config.isHexTimeoutMs) {
      // Check if IS hex arrived
      if (result.isHexCaptured) {
        result.method = 'instantlock';
        closeStreams(streamHandles);
        result.totalLatencyMs = Date.now() - startTime;
        return result;
      }

      // Check for stale streams (no activity for 5s) - reconnect once
      const lastActivity = getLastActivityTime();
      const timeSinceActivity = Date.now() - lastActivity;

      if (!reconnectAttempted && timeSinceActivity > STALE_STREAM_THRESHOLD_MS && lastActivity > 0) {
        console.log(`  ⚠️ Streams stale (${Math.round(timeSinceActivity / 1000)}s), reconnecting...`);
        reconnectAttempted = true;

        // Close old streams
        closeStreams(streamHandles);
        streamActivity.clear();

        // Open fresh streams
        const freshHeight = await (mainClient as any).core.getBestBlockHeight();
        const newFromHeight = Math.max(1, freshHeight - 5);
        const newHandles = await openParallelStreams(
          nodeAddresses,
          bloomFilter,
          newFromHeight,
          config.network,
          mainClient
        );

        if (newHandles.length > 0) {
          console.log(`  ✓ Reconnected ${newHandles.length} streams from height ${newFromHeight}`);
          // Start new processors (reuse same callbacks)
          for (const handle of newHandles) {
            const processor = processStream(handle, tracker, addressSet, config.network, {
              onNewTx: (txid, nodeAddress) => {
                if (!acceptCallbacks) return;
                if (!result.txDetected) {
                  console.log(`  📥 TX detected by ${nodeAddress.substring(0, 20)}...: ${txid.substring(0, 16)}...`);
                  result.txDetected = true;
                  result.txid = txid;
                  result.txDetectedBy = nodeAddress;
                  result.txDetectionLatencyMs = Date.now() - broadcastTime;
                  txResolve(txid);
                }
              },
              onNewIsHex: (txid, hex, nodeAddress) => {
                if (!acceptCallbacks) return;
                console.log(`  ⚡ IS hex captured by ${nodeAddress.substring(0, 20)}...: ${hex.substring(0, 32)}...`);
                result.isHexCaptured = true;
                result.isHexCapturedBy = nodeAddress;
                result.isHexLatencyMs = Date.now() - broadcastTime;
                isHexResolve(hex);
              },
              onBlockInclusion: (txid, height, nodeAddress) => {
                if (!acceptCallbacks) return;
                console.log(`  📦 Block inclusion by ${nodeAddress.substring(0, 20)}...`);
              },
            });
            streamProcessors.push(processor);
          }
          // Update handles reference for cleanup
          streamHandles.length = 0;
          streamHandles.push(...newHandles);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`  ⏳ No IS hex after ${config.isHexTimeoutMs}ms, falling back to CL...`);

    // 10. ChainLock fallback via multi-node getTransaction()
    console.log('  Polling for ChainLock confirmation...');
    console.log('  Legend: M=mempool, B=in block, .=IS locked (waiting CL)');
    const clStartTime = Date.now();
    const txid = result.txid!;
    let pollCount = 0;

    while (Date.now() - clStartTime < config.clTimeoutMs) {
      pollCount++;
      // Verbose logging for first poll and every 30th poll to see tx status
      const verbose = pollCount === 1 || pollCount % 30 === 0;
      if (verbose && pollCount > 1) {
        console.log(''); // newline before verbose output
      }

      const clResult = await checkChainLockMultiNode(nodeAddresses, txid, config.network, verbose);

      if (clResult.isChainLocked) {
        result.clConfirmed = true;
        result.clConfirmedBy = clResult.confirmedBy;
        result.clLatencyMs = Date.now() - broadcastTime;
        result.method = 'chainlock';
        console.log('');
        console.log(`  🔗 ChainLock confirmed by ${clResult.confirmedBy?.substring(0, 20)}... (poll #${pollCount})`);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, config.clPollIntervalMs));
    }
    console.log('');

    closeStreams(streamHandles);
    result.totalLatencyMs = Date.now() - startTime;
    return result;
  } catch (error) {
    result.error = (error as Error).message;
    result.totalLatencyMs = Date.now() - startTime;
    return result;
  }
}

// ============================================================================
// Statistics Calculation
// ============================================================================

function calculateStats(results: RunResult[]): ReliabilityStats {
  const nodeStats = new Map<string, { txDetections: number; isHexDeliveries: number; clConfirmations: number }>();

  let successes = 0;
  let failures = 0;
  let txDetections = 0;
  let isHexCaptures = 0;
  let clFallbacks = 0;
  let totalTxDetectionMs = 0;
  let totalIsHexMs = 0;
  let totalClMs = 0;
  let txDetectionCount = 0;
  let isHexCount = 0;
  let clCount = 0;

  for (const result of results) {
    if (result.error) {
      failures++;
      continue;
    }

    if (result.method === 'instantlock' || result.method === 'chainlock') {
      successes++;
    } else {
      failures++;
    }

    if (result.txDetected) {
      txDetections++;
      if (result.txDetectionLatencyMs > 0) {
        totalTxDetectionMs += result.txDetectionLatencyMs;
        txDetectionCount++;
      }

      // Track node stats for TX detection
      if (result.txDetectedBy) {
        const stats = nodeStats.get(result.txDetectedBy) || { txDetections: 0, isHexDeliveries: 0, clConfirmations: 0 };
        stats.txDetections++;
        nodeStats.set(result.txDetectedBy, stats);
      }
    }

    if (result.isHexCaptured) {
      isHexCaptures++;
      if (result.isHexLatencyMs > 0) {
        totalIsHexMs += result.isHexLatencyMs;
        isHexCount++;
      }

      // Track node stats for IS hex
      if (result.isHexCapturedBy) {
        const stats = nodeStats.get(result.isHexCapturedBy) || { txDetections: 0, isHexDeliveries: 0, clConfirmations: 0 };
        stats.isHexDeliveries++;
        nodeStats.set(result.isHexCapturedBy, stats);
      }
    }

    if (result.method === 'chainlock') {
      clFallbacks++;
      if (result.clLatencyMs > 0) {
        totalClMs += result.clLatencyMs;
        clCount++;
      }

      // Track node stats for CL
      if (result.clConfirmedBy) {
        const stats = nodeStats.get(result.clConfirmedBy) || { txDetections: 0, isHexDeliveries: 0, clConfirmations: 0 };
        stats.clConfirmations++;
        nodeStats.set(result.clConfirmedBy, stats);
      }
    }
  }

  const total = results.length;
  return {
    totalRuns: total,
    successes,
    failures,
    txDetectionRate: (txDetections / total) * 100,
    isHexSuccessRate: (isHexCaptures / total) * 100,
    clFallbackRate: (clFallbacks / total) * 100,
    avgTxDetectionMs: txDetectionCount > 0 ? totalTxDetectionMs / txDetectionCount : 0,
    avgIsHexLatencyMs: isHexCount > 0 ? totalIsHexMs / isHexCount : 0,
    avgClLatencyMs: clCount > 0 ? totalClMs / clCount : 0,
    nodeStats,
  };
}

// ============================================================================
// Reporting
// ============================================================================

function printRunResult(result: RunResult): void {
  console.log('');
  console.log('─'.repeat(60));
  console.log(`Run ${result.runNumber} Results:`);
  console.log('─'.repeat(60));

  if (result.error) {
    console.log(`  ❌ Error: ${result.error}`);
    return;
  }

  console.log(`  TXID:            ${result.txid?.substring(0, 32)}...`);
  console.log(`  TX Detected:     ${result.txDetected ? '✓' : '✗'} (${result.txDetectionLatencyMs}ms)`);
  console.log(`  IS Hex Captured: ${result.isHexCaptured ? '✓' : '✗'} (${result.isHexLatencyMs}ms)`);
  console.log(`  CL Confirmed:    ${result.clConfirmed ? '✓' : '✗'} (${result.clLatencyMs}ms)`);
  console.log(`  Method:          ${result.method}`);
  console.log(`  Total Latency:   ${result.totalLatencyMs}ms`);

  if (result.txDetectedBy) {
    console.log(`  TX Detected By:  ${result.txDetectedBy.substring(0, 30)}...`);
  }
  if (result.isHexCapturedBy) {
    console.log(`  IS Hex By:       ${result.isHexCapturedBy.substring(0, 30)}...`);
  }
  if (result.clConfirmedBy) {
    console.log(`  CL Confirmed By: ${result.clConfirmedBy.substring(0, 30)}...`);
  }
}

function printReliabilityReport(stats: ReliabilityStats): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('           SIMPLIFIED MULTI-NODE POC RESULTS');
  console.log('═'.repeat(60));
  console.log('');
  console.log('SUMMARY');
  console.log('─'.repeat(60));
  console.log(`  Total runs:         ${stats.totalRuns}`);
  console.log(`  Successes:          ${stats.successes}`);
  console.log(`  Failures:           ${stats.failures}`);
  console.log(`  Success rate:       ${((stats.successes / stats.totalRuns) * 100).toFixed(1)}%`);
  console.log('');
  console.log('DETECTION RATES');
  console.log('─'.repeat(60));
  console.log(`  TX detection:       ${stats.txDetectionRate.toFixed(1)}%`);
  console.log(`  IS hex capture:     ${stats.isHexSuccessRate.toFixed(1)}%`);
  console.log(`  CL fallback used:   ${stats.clFallbackRate.toFixed(1)}%`);
  console.log('');
  console.log('LATENCIES');
  console.log('─'.repeat(60));
  console.log(`  Avg TX detection:   ${stats.avgTxDetectionMs.toFixed(0)}ms`);
  console.log(`  Avg IS hex:         ${stats.avgIsHexLatencyMs.toFixed(0)}ms`);
  console.log(`  Avg CL:             ${stats.avgClLatencyMs.toFixed(0)}ms`);
  console.log('');
  console.log('PER-NODE STATS');
  console.log('─'.repeat(60));

  const sortedNodes = Array.from(stats.nodeStats.entries())
    .sort((a, b) => (b[1].txDetections + b[1].isHexDeliveries) - (a[1].txDetections + a[1].isHexDeliveries));

  for (const [node, nodeData] of sortedNodes) {
    console.log(`  ${node.substring(0, 35)}...`);
    console.log(`    TX detections: ${nodeData.txDetections}, IS hex: ${nodeData.isHexDeliveries}, CL: ${nodeData.clConfirmations}`);
  }

  console.log('');
  console.log('═'.repeat(60));

  // Verdict
  const successRate = (stats.successes / stats.totalRuns) * 100;
  if (successRate >= 90 && stats.isHexSuccessRate >= 70) {
    console.log('✅ VERDICT: EXCELLENT - High success and IS hex rates');
  } else if (successRate >= 80) {
    console.log('✓ VERDICT: GOOD - Acceptable success rate');
  } else if (successRate >= 50) {
    console.log('⚠️ VERDICT: MARGINAL - Consider investigating failures');
  } else {
    console.log('❌ VERDICT: POOR - Architecture needs review');
  }
  console.log('═'.repeat(60));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('═'.repeat(60));
  console.log('    SIMPLIFIED MULTI-NODE TRANSACTION DETECTION POC');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Architecture:');
  console.log('  • N parallel streams, all processing ALL message types');
  console.log('  • Simple tracker deduplicates → callbacks fire once');
  console.log('  • Any stream that delivers IS hex wins');
  console.log('  • CL fallback: multi-node getTransaction(), ANY "true" wins');
  console.log('');

  const pocConfig = parseArgs();

  console.log('Configuration:');
  console.log(`  Runs:           ${pocConfig.runs}`);
  console.log(`  Address:        ${pocConfig.address}`);
  console.log(`  Nodes:          ${pocConfig.nodes}`);
  console.log(`  Delay:          ${pocConfig.delay}ms`);
  console.log(`  Auto-send:      ${pocConfig.autoSend}`);
  console.log(`  Network:        ${pocConfig.network}`);
  console.log(`  IS timeout:     ${pocConfig.isHexTimeoutMs}ms`);
  console.log(`  CL timeout:     ${pocConfig.clTimeoutMs}ms`);
  console.log('');

  // Initialize RPC client if auto-send enabled
  let broadcaster: TransactionBroadcaster | null = null;
  if (pocConfig.autoSend) {
    const rpcConfig = {
      network: pocConfig.network as 'testnet' | 'mainnet',
      url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
      user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
      pass: process.env.TESTNET_RPC_PASSWORD || '',
      wallet: process.env.TESTNET_WALLET,
    };

    if (!rpcConfig.pass) {
      console.error('Error: --auto-send requires TESTNET_RPC_PASSWORD');
      process.exit(1);
    }

    console.log('Connecting to Dash Core RPC...');
    const rpcClient = new DashRpcClient(rpcConfig);
    broadcaster = new TransactionBroadcaster(rpcClient);

    try {
      const height = await rpcClient.getBlockCount();
      const balance = await rpcClient.getBalance();
      console.log(`  ✓ Connected at height ${height}, balance: ${balance.toFixed(8)} DASH`);
    } catch (error) {
      console.error(`  ✗ RPC connection failed: ${(error as Error).message}`);
      process.exit(1);
    }
    console.log('');
  }

  // Run tests
  const results: RunResult[] = [];

  for (let i = 1; i <= pocConfig.runs; i++) {
    console.log('═'.repeat(60));
    console.log(`RUN ${i}/${pocConfig.runs}`);
    console.log('═'.repeat(60));

    const result = await runSingleTest(pocConfig, i, broadcaster);
    results.push(result);
    printRunResult(result);

    if (i < pocConfig.runs) {
      console.log(`\nWaiting ${pocConfig.delay}ms before next run...`);
      await new Promise((resolve) => setTimeout(resolve, pocConfig.delay));
    }
  }

  // Print final statistics
  const stats = calculateStats(results);
  printReliabilityReport(stats);

  // Exit with appropriate code
  const successRate = (stats.successes / stats.totalRuns) * 100;
  process.exit(successRate >= 70 ? 0 : 1);
}

// Suppress gRPC CANCELLED rejections
process.on('unhandledRejection', (err: unknown) => {
  if (err && typeof err === 'object' && (err as any).code === 1 &&
      (err as any).details === 'Cancelled on client') {
    return;
  }
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
