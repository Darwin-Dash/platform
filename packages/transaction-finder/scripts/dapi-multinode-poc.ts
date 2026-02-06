#!/usr/bin/env npx ts-node
/**
 * DAPI-Only Multi-Node Transaction Detection POC
 *
 * Like simplified-multinode-poc.ts but requires NO local RPC node.
 * Everything runs through DAPI:
 * 1. Historic scan via DAPI to find UTXOs
 * 2. Self-send TX built with dashcore-lib, signed with mnemonic-derived key
 * 3. Broadcast via dapiClient.core.broadcastTransaction()
 * 4. IS hex monitoring via parallel streams
 *
 * UTXO Chaining:
 * - Run 1 uses a confirmed UTXO from historic scan
 * - Runs 2+ use the previous run's self-send output (IS-locked)
 * - Each run's output becomes the next run's input (Dash allows spending IS-locked UTXOs)
 *
 * Usage:
 *   # Single run
 *   yarn poc:dapi
 *
 *   # 10 IS-only runs with healthy node tracking
 *   yarn poc:dapi -- --runs 10 --is-only --use-healthy-nodes
 *
 *   # Custom settings
 *   yarn poc:dapi -- --runs 5 --nodes 4 --strategy staggered-multi
 */

import DAPIClient from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode } from '../src/index.js';
import { config } from 'dotenv';
import { BloomFilterBuilder } from '../src/core/BloomFilterBuilder.js';
import { StreamWrapper } from '../src/core/StreamWrapper.js';
import dashcore from '@dashevo/dashcore-lib';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Transaction, MerkleBlock, InstantLock, Script, Mnemonic, PrivateKey } = dashcore;

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

type ReconnectionStrategy = 'stale-detection' | 'aggressive-single' | 'staggered-multi';

interface POCConfig {
  runs: number;
  nodes: number;
  delay: number;
  network: 'testnet' | 'mainnet';
  isHexTimeoutMs: number;
  clTimeoutMs: number;
  clPollIntervalMs: number;
  reconnectionStrategy: ReconnectionStrategy;
  aggressiveReconnectMs: number;
  staggeredReconnectMs: number;
  staggeredSlots: number;
  isOnly: boolean;
  useHealthyNodes: boolean;
  // DAPI-only fields (derived from .env)
  mnemonic: string;
  address: string;
  startHeight: number;
}

interface ChainedUTXO {
  txId: string;
  vout: number;
  satoshis: number;
  script: string;
  address: string;
}

// ============================================================================
// Healthy Node List (reused from simplified POC)
// ============================================================================

interface IsNodeHealth {
  version: number;
  generated: string;
  knownGood: string[];
  learned: Record<string, { successes: number; failures: number }>;
}

const HEALTH_FILE_PATH = path.join(__dirname, '../../js-evo-sdk/demo/is-node-health.json');

let currentHealthData: IsNodeHealth | null = null;
let currentNodeAddresses: string[] = [];

async function loadHealthyNodes(): Promise<IsNodeHealth> {
  try {
    const data = await fs.promises.readFile(HEALTH_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn(`  Warning: Could not load healthy nodes: ${(error as Error).message}`);
    return { version: 1, generated: new Date().toISOString(), knownGood: [], learned: {} };
  }
}

async function saveHealthyNodes(healthData: IsNodeHealth): Promise<void> {
  healthData.generated = new Date().toISOString();
  await fs.promises.writeFile(HEALTH_FILE_PATH, JSON.stringify(healthData, null, 2));
  console.log(`  Saved updated health data to ${HEALTH_FILE_PATH}`);
}

function updateNodeHealth(healthData: IsNodeHealth, nodeAddress: string, success: boolean): void {
  const addr = nodeAddress.replace('https://', '');
  if (!healthData.learned[addr]) {
    healthData.learned[addr] = { successes: 0, failures: 0 };
  }
  if (success) {
    healthData.learned[addr].successes++;
  } else {
    healthData.learned[addr].failures++;
  }
}

function promoteOrDemoteNodes(healthData: IsNodeHealth): void {
  const MIN_ATTEMPTS = 3;
  const SUCCESS_THRESHOLD = 0.5;
  const stillGood: string[] = [];

  for (const addr of healthData.knownGood) {
    const stats = healthData.learned[addr];
    if (!stats) { stillGood.push(addr); continue; }
    const total = stats.successes + stats.failures;
    if (total < MIN_ATTEMPTS) { stillGood.push(addr); continue; }
    const rate = stats.successes / total;
    if (rate >= SUCCESS_THRESHOLD) {
      stillGood.push(addr);
    } else {
      console.log(`  Demoting ${addr} (success rate: ${(rate * 100).toFixed(0)}%)`);
    }
  }

  for (const [addr, stats] of Object.entries(healthData.learned)) {
    if (healthData.knownGood.includes(addr)) continue;
    const total = stats.successes + stats.failures;
    if (total < MIN_ATTEMPTS) continue;
    const rate = stats.successes / total;
    if (rate >= SUCCESS_THRESHOLD && !stillGood.includes(addr)) {
      console.log(`  Promoting ${addr} (success rate: ${(rate * 100).toFixed(0)}%)`);
      stillGood.push(addr);
    }
  }

  healthData.knownGood = stillGood;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): POCConfig {
  const args = process.argv.slice(2);
  const config: POCConfig = {
    runs: 1,
    nodes: 3,
    delay: 15000,
    network: (process.env.NETWORK as 'testnet' | 'mainnet') || 'testnet',
    isHexTimeoutMs: 10000,
    clTimeoutMs: 180000,
    clPollIntervalMs: 2000,
    reconnectionStrategy: 'stale-detection',
    aggressiveReconnectMs: 5000,
    staggeredReconnectMs: 15000,
    staggeredSlots: 3,
    isOnly: false,
    useHealthyNodes: false,
    mnemonic: process.env.MNEMONIC || '',
    address: process.env.TESTNET_ADDRESS || '',
    startHeight: parseInt(process.env.START_HEIGHT || '0', 10),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--runs': config.runs = parseInt(args[++i], 10); break;
      case '--nodes': config.nodes = parseInt(args[++i], 10); break;
      case '--delay': config.delay = parseInt(args[++i], 10); break;
      case '--network': config.network = args[++i] as 'testnet' | 'mainnet'; break;
      case '--is-timeout': config.isHexTimeoutMs = parseInt(args[++i], 10); break;
      case '--cl-timeout': config.clTimeoutMs = parseInt(args[++i], 10); break;
      case '--strategy': config.reconnectionStrategy = args[++i] as ReconnectionStrategy; break;
      case '--aggressive-interval': config.aggressiveReconnectMs = parseInt(args[++i], 10); break;
      case '--staggered-interval': config.staggeredReconnectMs = parseInt(args[++i], 10); break;
      case '--staggered-slots': config.staggeredSlots = parseInt(args[++i], 10); break;
      case '--is-only': config.isOnly = true; break;
      case '--use-healthy-nodes': config.useHealthyNodes = true; break;
      case '--address': config.address = args[++i]; break;
      case '--mnemonic': config.mnemonic = args[++i]; break;
      case '--start-height': config.startHeight = parseInt(args[++i], 10); break;
      case '--help':
        console.log(`
DAPI-Only Multi-Node Transaction Detection POC

No RPC node required! Uses DAPI for everything:
  - Historic scan for UTXOs
  - Transaction broadcast via dapiClient.core.broadcastTransaction()
  - IS hex monitoring via parallel streams
  - UTXO chaining across runs (IS-locked outputs feed next run)

Usage:
  yarn poc:dapi [options]

Options:
  --runs N              Number of test runs (default: 1)
  --nodes N             Number of parallel streams (default: 3)
  --delay MS            Delay between runs in ms (default: 15000)
  --network NET         Network: testnet or mainnet (default: from .env)
  --is-timeout MS       IS hex timeout in ms (default: 10000)
  --cl-timeout MS       ChainLock timeout in ms (default: 180000)
  --strategy STRAT      Reconnection strategy (default: stale-detection)
  --is-only             Skip ChainLock fallback, IS hex only (faster)
  --use-healthy-nodes   Use known healthy nodes from is-node-health.json
  --address ADDR        Override testnet address (default: from .env)
  --mnemonic PHRASE     Override mnemonic (default: from .env)
  --start-height N      Override start height for historic scan (default: from .env)
  --help                Show this help message

Environment variables (from ../js-evo-sdk/.env):
  MNEMONIC              BIP39 mnemonic for key derivation
  TESTNET_ADDRESS       Address to monitor (BIP44 m/44'/1'/0'/0/0)
  START_HEIGHT          Block height to start historic scan from
  NETWORK               Network (testnet/mainnet)
`);
        process.exit(0);
    }
  }

  if (!config.mnemonic) {
    console.error('Error: MNEMONIC is required (set in .env or --mnemonic)');
    process.exit(1);
  }
  if (!config.address) {
    console.error('Error: TESTNET_ADDRESS is required (set in .env or --address)');
    process.exit(1);
  }
  if (!config.startHeight) {
    console.error('Error: START_HEIGHT is required (set in .env or --start-height)');
    process.exit(1);
  }

  return config;
}

// ============================================================================
// Key Derivation (pure dashcore-lib, no WASM)
// ============================================================================

function derivePrivateKey(mnemonic: string, network: string): any {
  const mn = new Mnemonic(mnemonic);
  const hdKey = mn.toHDPrivateKey('', network);
  // BIP44: m/44'/1'/0'/0/0 (testnet) or m/44'/5'/0'/0/0 (mainnet)
  const coinType = network === 'mainnet' ? 5 : 1;
  const derived = hdKey.deriveChild(`m/44'/${coinType}'/0'/0/0`);
  return derived.privateKey;
}

// ============================================================================
// UTXO Discovery via DAPI (Historic Scan)
// ============================================================================

async function findUTXOsViaDAPI(
  dapiClient: DAPIClient,
  address: string,
  startHeight: number,
  network: string
): Promise<ChainedUTXO[]> {
  console.log(`  Scanning blockchain from height ${startHeight} for UTXOs...`);

  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: network as 'testnet' | 'mainnet' | 'regtest',
    addresses: [address],
    dapiClient: dapiClient as any,
    fromHeight: startHeight,
    onProgress: (progress) => {
      if (progress.progress % 25 < 1) {
        process.stdout.write(`\r  Sync: ${progress.progress.toFixed(0)}% (${progress.syncedBlocks}/${progress.totalBlocks} blocks)   `);
      }
    },
  });

  const utxos = await finder.findUTXOs();
  console.log(`\r  Sync complete. Found ${utxos.length} UTXOs.                    `);

  return utxos.map(u => ({
    txId: u.txId,
    vout: u.vout,
    satoshis: u.satoshis,
    script: u.script,
    address: u.address,
  }));
}

// ============================================================================
// Self-Send Transaction Builder
// ============================================================================

const SELF_SEND_FEE = 500; // 500 duffs fee (~0.000005 DASH)

function buildSelfSendTx(
  utxo: ChainedUTXO,
  privateKey: any,
  network: string
): { txHex: string; txid: string; outputUtxo: ChainedUTXO } {
  const sendAmount = utxo.satoshis - SELF_SEND_FEE;
  if (sendAmount <= 0) {
    throw new Error(`UTXO too small: ${utxo.satoshis} duffs (need > ${SELF_SEND_FEE} for fee)`);
  }

  const address = privateKey.toAddress(network);
  const unspentOutput = new Transaction.UnspentOutput({
    txId: utxo.txId,
    outputIndex: utxo.vout,
    address: utxo.address,
    script: utxo.script || Script.buildPublicKeyHashOut(address).toString(),
    satoshis: utxo.satoshis,
  });

  const tx = new Transaction()
    .from(unspentOutput)
    .to(address.toString(), sendAmount)
    .sign(privateKey);

  const txHex = tx.toString();
  const txid = tx.hash;

  // Build the output UTXO for chaining
  const outputUtxo: ChainedUTXO = {
    txId: txid,
    vout: 0,
    satoshis: sendAmount,
    script: Script.buildPublicKeyHashOut(address).toString(),
    address: address.toString(),
  };

  return { txHex, txid, outputUtxo };
}

// ============================================================================
// DAPI Broadcast
// ============================================================================

async function broadcastViaDAPI(
  dapiClient: DAPIClient,
  txHex: string,
): Promise<string> {
  const txid = await (dapiClient as any).core.broadcastTransaction(
    Buffer.from(txHex, 'hex')
  );
  return txid;
}

// ============================================================================
// IS Confirmation Check (for UTXO chaining)
// ============================================================================

async function waitForInstantSend(
  dapiClient: DAPIClient,
  txid: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 2000
): Promise<boolean> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    pollCount++;
    try {
      const txResponse = await (dapiClient as any).core.getTransaction(txid);
      if (txResponse?.isInstantLocked) {
        console.log(`  IS confirmed for ${txid.substring(0, 16)}... (poll #${pollCount})`);
        return true;
      }
    } catch (error) {
      if (pollCount === 1) {
        console.log(`  IS poll error: ${(error as Error).message.substring(0, 50)}...`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.log(`  IS confirmation timeout for ${txid.substring(0, 16)}...`);
  return false;
}

// ============================================================================
// Node Discovery (reused from simplified POC)
// ============================================================================

async function getNodeAddresses(dapiClient: DAPIClient, count: number): Promise<string[]> {
  const addresses: string[] = [];
  const addressProvider = (dapiClient as any).dapiAddressProvider;
  if (!addressProvider) return addresses;

  let allAddresses: any[] = [];
  if (addressProvider.listDAPIAddressProvider) {
    allAddresses = addressProvider.listDAPIAddressProvider.getAllAddresses() || [];
  } else if (typeof addressProvider.getAllAddresses === 'function') {
    allAddresses = addressProvider.getAllAddresses() || [];
  } else if (typeof addressProvider.getLiveAddress === 'function') {
    for (let i = 0; i < count * 3; i++) {
      try {
        const addr = await addressProvider.getLiveAddress();
        if (addr) {
          const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
          if (!addresses.includes(addrStr)) addresses.push(addrStr);
          if (addresses.length >= count) break;
        }
      } catch { break; }
    }
    return addresses.slice(0, count);
  }

  for (const addr of allAddresses) {
    const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
    if (!addresses.includes(addrStr)) addresses.push(addrStr);
    if (addresses.length >= count * 2) break;
  }

  // Shuffle
  for (let i = addresses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [addresses[i], addresses[j]] = [addresses[j], addresses[i]];
  }

  return addresses.slice(0, count);
}

// ============================================================================
// Stream Management (reused from simplified POC)
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
      const client = sharedClient || new DAPIClient({
        dapiAddresses: [nodeAddress],
        network,
        timeout: 60000,
      });

      const core = (client as any).core;
      let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
        fromBlockHeight: fromHeight,
        count: 0,
      });
      if (rawStream && typeof rawStream.then === 'function') rawStream = await rawStream;

      const asyncIterable = StreamWrapper.makeAsyncIterable(rawStream);
      handles.push({ nodeAddress, stream: rawStream, client, asyncIterable });
      console.log(`  Stream ${handles.length}/${nodeAddresses.length}: ${nodeAddress}`);
    } catch (error) {
      console.log(`  Stream failed: ${nodeAddress} - ${(error as Error).message}`);
    }
  }
  return handles;
}

function closeStreams(handles: StreamHandle[]): void {
  for (const handle of handles) {
    try {
      if (typeof handle.stream.on === 'function') handle.stream.on('error', () => {});
      if (typeof handle.stream.cancel === 'function') handle.stream.cancel();
    } catch { /* ignore */ }
  }
}

// ============================================================================
// Stream Activity Tracking
// ============================================================================

const streamActivity = new Map<string, { lastActivityTime: number; messageCount: number }>();

function recordStreamActivity(nodeAddress: string): void {
  const tracker = streamActivity.get(nodeAddress) || { lastActivityTime: 0, messageCount: 0 };
  tracker.lastActivityTime = Date.now();
  tracker.messageCount++;
  streamActivity.set(nodeAddress, tracker);
}

function getLastActivityTime(): number {
  let latest = 0;
  for (const tracker of streamActivity.values()) {
    if (tracker.lastActivityTime > latest) latest = tracker.lastActivityTime;
  }
  return latest;
}

// ============================================================================
// Stream Processing with Deduplication (reused from simplified POC)
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
  const nodeShort = handle.nodeAddress.substring(8, 28);

  try {
    for await (const message of handle.asyncIterable) {
      messageCount++;
      recordStreamActivity(handle.nodeAddress);
      const msg = message as any;

      // Process Transactions
      const rawTxs = typeof msg.getRawTransactions === 'function' ? msg.getRawTransactions() : msg.rawTransactions;
      if (rawTxs) {
        const txList = typeof (rawTxs as any).getTransactionsList === 'function'
          ? (rawTxs as any).getTransactionsList()
          : (Array.isArray(rawTxs) ? rawTxs : null);
        if (txList && txList.length > 0) {
          for (const txBuf of txList) {
            try {
              const tx = new Transaction(Buffer.from(txBuf));
              const txid = tx.hash;
              let involvesAddress = false;
              if (tx.outputs && Array.isArray(tx.outputs)) {
                for (const output of tx.outputs) {
                  try {
                    if (output.script && output.script.toAddress) {
                      const addr = output.script.toAddress(network);
                      if (addr && addresses.has(addr.toString())) { involvesAddress = true; break; }
                    }
                  } catch { /* non-standard */ }
                }
              }
              if (involvesAddress && !tracker.has(txid)) {
                tracker.set(txid, {
                  txid, detectedAt: Date.now(), detectedBy: handle.nodeAddress,
                  instantLockHex: null, instantLockAt: null, instantLockBy: null,
                  isChainLocked: false, chainLockAt: null, chainLockBy: null, blockHeight: null,
                });
                callbacks.onNewTx(txid, handle.nodeAddress);
              }
            } catch { /* parse error */ }
          }
        }
      }

      // Process InstantLocks
      const instantLockMessages = typeof msg.getInstantSendLockMessages === 'function'
        ? msg.getInstantSendLockMessages() : msg.instantSendLockMessages;
      const instantLockList = instantLockMessages?.getMessagesList
        ? instantLockMessages.getMessagesList()
        : (Array.isArray(instantLockMessages) ? instantLockMessages : null);
      if (instantLockList && instantLockList.length > 0) {
        for (const lockBuf of instantLockList) {
          try {
            const lock: any = (InstantLock as any).fromBuffer(Buffer.from(lockBuf));
            const txid = lock.txid.toString('hex');
            const hex = Buffer.from(lockBuf).toString('hex');
            const tracked = tracker.get(txid);
            if (tracked && !tracked.instantLockHex) {
              tracked.instantLockHex = hex;
              tracked.instantLockAt = Date.now();
              tracked.instantLockBy = handle.nodeAddress;
              callbacks.onNewIsHex(txid, hex, handle.nodeAddress);
            }
          } catch { /* parse error */ }
        }
      }

      // Process MerkleBlocks
      const rawMerkle = typeof msg.getRawMerkleBlock === 'function' ? msg.getRawMerkleBlock() : msg.rawMerkleBlock;
      if (rawMerkle) {
        try {
          const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
          const txids = merkleBlock.hashes.map((h: any) => {
            const buf = Buffer.from(String(h), 'hex');
            return buf.reverse().toString('hex');
          });
          for (const txid of txids) {
            const tracked = tracker.get(txid);
            if (tracked && !tracked.blockHeight) {
              tracked.blockHeight = -1;
              callbacks.onBlockInclusion(txid, -1, handle.nodeAddress);
            }
          }
        } catch { /* parse error */ }
      }
    }
  } catch {
    // Stream ended - normal during cleanup
  }
}

// ============================================================================
// Multi-Node ChainLock Check
// ============================================================================

async function checkChainLockMultiNode(
  nodeAddresses: string[],
  txid: string,
  network: string,
  verbose: boolean = false
): Promise<{ isChainLocked: boolean; confirmedBy: string | null; blockHeight: number | null }> {
  const results = await Promise.allSettled(
    nodeAddresses.map(async (nodeAddress) => {
      const client = new DAPIClient({ dapiAddresses: [nodeAddress], network, timeout: 10000 });
      const txResponse = await (client as any).core.getTransaction(txid);
      if (verbose) {
        const nodeShort = nodeAddress.substring(8, 28);
        console.log(`    [CL] ${nodeShort}: height=${txResponse?.height ?? 'null'}, CL=${txResponse?.isChainLocked ?? 'null'}`);
      }
      return {
        nodeAddress,
        isChainLocked: txResponse?.isChainLocked || false,
        blockHeight: txResponse?.height || null,
      };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.isChainLocked) {
      return { isChainLocked: true, confirmedBy: result.value.nodeAddress, blockHeight: result.value.blockHeight };
    }
  }

  if (verbose) {
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const anyInBlock = fulfilled.some(r => r.value.blockHeight !== null);
    process.stdout.write(anyInBlock ? '.' : 'M');
  }

  return { isChainLocked: false, confirmedBy: null, blockHeight: null };
}

// ============================================================================
// TX Detection Poller (backup for stream detection)
// ============================================================================

async function pollForTransactionDetection(
  txid: string,
  network: string,
  timeoutMs: number,
  pollIntervalMs: number = 1000
): Promise<string> {
  const startTime = Date.now();
  let pollCount = 0;
  const client = new DAPIClient({ network, timeout: 5000 });
  const core = (client as any).core;

  while (Date.now() - startTime < timeoutMs) {
    pollCount++;
    try {
      const txResponse = await core.getTransaction(txid);
      if (txResponse && (txResponse.transaction || txResponse.height !== undefined)) {
        console.log(`    [POLLER] TX found!`);
        return txid;
      }
    } catch (error) {
      if (pollCount === 1) {
        console.log(`    [POLLER] poll#1 error: ${(error as Error).message.substring(0, 50)}...`);
      }
    }
    if (pollCount % 10 === 0) console.log(`    [POLLER] poll#${pollCount}: still searching...`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error('TX detection timeout (poller)');
}

// ============================================================================
// Single Test Run
// ============================================================================

async function runSingleTest(
  pocConfig: POCConfig,
  runNumber: number,
  mainClient: DAPIClient,
  privateKey: any,
  currentUTXO: ChainedUTXO,
): Promise<{ result: RunResult; nextUTXO: ChainedUTXO | null }> {
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
  let nextUTXO: ChainedUTXO | null = null;

  const tracker = new Map<string, TrackedTx>();
  const addressSet = new Set([pocConfig.address]);

  let txResolve: (txid: string) => void;
  const txPromise = new Promise<string>((resolve) => { txResolve = resolve; });
  let isHexResolve: (hex: string) => void;
  const isHexPromise = new Promise<string>((resolve) => { isHexResolve = resolve; });

  try {
    // 1. Get current height
    const core = (mainClient as any).core;
    const currentHeight = await core.getBestBlockHeight();
    console.log(`  Current height: ${currentHeight}`);
    console.log(`  Input UTXO: ${currentUTXO.txId.substring(0, 16)}...:${currentUTXO.vout} (${currentUTXO.satoshis} duffs)`);

    // 2. Build self-send transaction
    const { txHex, txid: knownTxid, outputUtxo } = buildSelfSendTx(
      currentUTXO, privateKey, pocConfig.network
    );
    nextUTXO = outputUtxo;
    console.log(`  Built self-send TX: ${knownTxid.substring(0, 16)}... (${outputUtxo.satoshis} duffs out, ${SELF_SEND_FEE} fee)`);

    // 3. Discover nodes
    let nodeAddresses: string[];
    if (pocConfig.useHealthyNodes) {
      if (!currentHealthData) currentHealthData = await loadHealthyNodes();
      if (currentHealthData.knownGood.length === 0) {
        console.log(`  No healthy nodes in list, using random discovery`);
        nodeAddresses = await getNodeAddresses(mainClient, pocConfig.nodes);
      } else {
        nodeAddresses = currentHealthData.knownGood.slice(0, pocConfig.nodes).map(a => `https://${a}`);
        console.log(`  Using ${nodeAddresses.length} healthy nodes`);
      }
    } else {
      nodeAddresses = await getNodeAddresses(mainClient, pocConfig.nodes);
    }
    if (nodeAddresses.length === 0) throw new Error('No DAPI nodes discovered');
    currentNodeAddresses = nodeAddresses;

    // 4. Open parallel streams
    const bloomFilter = BloomFilterBuilder.build([pocConfig.address], pocConfig.network);
    const scanBlocksBack = pocConfig.reconnectionStrategy === 'stale-detection' ? 10 : 50;
    const fromHeight = Math.max(1, currentHeight - scanBlocksBack);
    console.log(`  Opening ${nodeAddresses.length} streams from height ${fromHeight}...`);
    const streamHandles = await openParallelStreams(
      nodeAddresses, bloomFilter, fromHeight, pocConfig.network, mainClient
    );
    if (streamHandles.length === 0) throw new Error('Failed to open any streams');

    // 5. Start stream processors
    const streamProcessors: Promise<void>[] = [];
    let acceptCallbacks = false;
    let historicalTxCount = 0;

    for (const handle of streamHandles) {
      streamProcessors.push(processStream(handle, tracker, addressSet, pocConfig.network, {
        onNewTx: (txid, nodeAddress) => {
          if (!acceptCallbacks) { historicalTxCount++; return; }
          console.log(`  TX detected by ${nodeAddress.substring(0, 20)}...: ${txid.substring(0, 16)}...`);
          result.txDetected = true;
          result.txid = txid;
          result.txDetectedBy = nodeAddress;
          result.txDetectionLatencyMs = Date.now() - broadcastTime;
          txResolve(txid);
        },
        onNewIsHex: (txid, hex, nodeAddress) => {
          if (!acceptCallbacks) return;
          console.log(`  IS hex captured by ${nodeAddress.substring(0, 20)}...: ${hex.substring(0, 32)}...`);
          result.isHexCaptured = true;
          result.isHexCapturedBy = nodeAddress;
          result.isHexLatencyMs = Date.now() - broadcastTime;
          isHexResolve(hex);
        },
        onBlockInclusion: (txid, height, nodeAddress) => {
          if (!acceptCallbacks) return;
        },
      }));
    }

    // 6. Wait for streams to establish, then broadcast via DAPI
    console.log('  Waiting 2s for stream connections...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`  Ignored ${historicalTxCount} historical transactions during scan`);
    tracker.clear();
    broadcastTime = Date.now();
    acceptCallbacks = true;

    console.log('  Broadcasting via DAPI...');
    await broadcastViaDAPI(mainClient, txHex);
    console.log('  Transaction broadcast successful');

    // Start poller backup
    pollForTransactionDetection(knownTxid, pocConfig.network, 60000, 1000)
      .then((txid) => {
        if (!result.txDetected) {
          console.log(`  TX detected by POLLER: ${txid.substring(0, 16)}...`);
          result.txDetected = true;
          result.txid = txid;
          result.txDetectedBy = 'poller';
          result.txDetectionLatencyMs = Date.now() - broadcastTime;
          txResolve(txid);
        }
      })
      .catch(() => { /* poller timeout */ });

    // 7. Wait for TX detection
    console.log('  Waiting for TX detection...');
    try {
      await Promise.race([
        txPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TX detection timeout')), 60000)),
      ]);
    } catch {
      result.error = 'TX detection timeout';
      closeStreams(streamHandles);
      result.totalLatencyMs = Date.now() - startTime;
      return { result, nextUTXO: null };
    }

    // 8. Wait for IS hex (using configured strategy)
    console.log(`  Waiting for IS hex (strategy: ${pocConfig.reconnectionStrategy})...`);
    const isHexStartTime = Date.now();

    const createProcessorsForHandles = (handles: StreamHandle[]) => {
      for (const handle of handles) {
        streamProcessors.push(processStream(handle, tracker, addressSet, pocConfig.network, {
          onNewTx: (txid, nodeAddress) => {
            if (!acceptCallbacks || result.txDetected) return;
            result.txDetected = true; result.txid = txid;
            result.txDetectedBy = nodeAddress;
            result.txDetectionLatencyMs = Date.now() - broadcastTime;
            txResolve(txid);
          },
          onNewIsHex: (txid, hex, nodeAddress) => {
            if (!acceptCallbacks) return;
            console.log(`  IS hex captured by ${nodeAddress.substring(0, 20)}...: ${hex.substring(0, 32)}...`);
            result.isHexCaptured = true; result.isHexCapturedBy = nodeAddress;
            result.isHexLatencyMs = Date.now() - broadcastTime;
            isHexResolve(hex);
          },
          onBlockInclusion: () => {},
        }));
      }
    };

    // Strategy: stale-detection
    if (pocConfig.reconnectionStrategy === 'stale-detection') {
      let reconnectAttempted = false;
      while (Date.now() - isHexStartTime < pocConfig.isHexTimeoutMs) {
        if (result.isHexCaptured) {
          result.method = 'instantlock';
          closeStreams(streamHandles);
          result.totalLatencyMs = Date.now() - startTime;
          return { result, nextUTXO };
        }
        const lastActivity = getLastActivityTime();
        const timeSinceActivity = Date.now() - lastActivity;
        if (!reconnectAttempted && timeSinceActivity > 5000 && lastActivity > 0) {
          console.log(`  Streams stale (${Math.round(timeSinceActivity / 1000)}s), reconnecting...`);
          reconnectAttempted = true;
          closeStreams(streamHandles);
          streamActivity.clear();
          const freshHeight = await core.getBestBlockHeight();
          const newHandles = await openParallelStreams(
            nodeAddresses, bloomFilter, Math.max(1, freshHeight - 5), pocConfig.network, mainClient
          );
          if (newHandles.length > 0) {
            createProcessorsForHandles(newHandles);
            streamHandles.length = 0;
            streamHandles.push(...newHandles);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    // Strategy: aggressive-single
    else if (pocConfig.reconnectionStrategy === 'aggressive-single') {
      let lastReconnect = Date.now();
      let reconnectCount = 0;
      while (Date.now() - isHexStartTime < pocConfig.isHexTimeoutMs) {
        if (result.isHexCaptured) {
          result.method = 'instantlock'; closeStreams(streamHandles);
          result.totalLatencyMs = Date.now() - startTime;
          return { result, nextUTXO };
        }
        if (Date.now() - lastReconnect > pocConfig.aggressiveReconnectMs) {
          reconnectCount++;
          closeStreams(streamHandles); streamActivity.clear();
          const freshHeight = await core.getBestBlockHeight();
          const newHandles = await openParallelStreams(
            nodeAddresses.slice(0, 1), bloomFilter, Math.max(1, freshHeight - 50), pocConfig.network, mainClient
          );
          if (newHandles.length > 0) {
            createProcessorsForHandles(newHandles);
            streamHandles.length = 0; streamHandles.push(...newHandles);
          }
          lastReconnect = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    // Strategy: staggered-multi
    else if (pocConfig.reconnectionStrategy === 'staggered-multi') {
      const numSlots = pocConfig.staggeredSlots;
      const staggerOffset = Math.floor(pocConfig.staggeredReconnectMs / numSlots);
      const slots = Array.from({ length: numSlots }, (_, i) => ({
        slotId: i, lastReconnect: Date.now() - (i * staggerOffset),
        handle: streamHandles[i] || null, reconnectCount: 0,
      }));

      while (Date.now() - isHexStartTime < pocConfig.isHexTimeoutMs) {
        if (result.isHexCaptured) {
          result.method = 'instantlock';
          for (const slot of slots) { if (slot.handle) closeStreams([slot.handle]); }
          result.totalLatencyMs = Date.now() - startTime;
          return { result, nextUTXO };
        }
        for (const slot of slots) {
          if (Date.now() - slot.lastReconnect > pocConfig.staggeredReconnectMs) {
            slot.reconnectCount++;
            if (slot.handle) closeStreams([slot.handle]);
            const freshHeight = await core.getBestBlockHeight();
            const nodeAddr = nodeAddresses[slot.slotId % nodeAddresses.length];
            try {
              const newHandles = await openParallelStreams(
                [nodeAddr], bloomFilter, Math.max(1, freshHeight - 50), pocConfig.network, mainClient
              );
              if (newHandles.length > 0) { slot.handle = newHandles[0]; createProcessorsForHandles(newHandles); }
            } catch {}
            slot.lastReconnect = Date.now();
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      for (const slot of slots) { if (slot.handle) closeStreams([slot.handle]); }
    }

    // 9. ChainLock fallback
    if (pocConfig.isOnly) {
      console.log(`  No IS hex after ${pocConfig.isHexTimeoutMs}ms (IS-only mode, skipping CL)`);
      closeStreams(streamHandles);
      result.totalLatencyMs = Date.now() - startTime;
      return { result, nextUTXO };
    }

    console.log(`  No IS hex after ${pocConfig.isHexTimeoutMs}ms, falling back to CL...`);
    const clStartTime = Date.now();
    const txid = result.txid!;
    let pollCount = 0;

    while (Date.now() - clStartTime < pocConfig.clTimeoutMs) {
      pollCount++;
      const verbose = pollCount === 1 || pollCount % 30 === 0;
      if (verbose && pollCount > 1) console.log('');
      const clResult = await checkChainLockMultiNode(nodeAddresses, txid, pocConfig.network, verbose);
      if (clResult.isChainLocked) {
        result.clConfirmed = true; result.clConfirmedBy = clResult.confirmedBy;
        result.clLatencyMs = Date.now() - broadcastTime; result.method = 'chainlock';
        console.log(`\n  ChainLock confirmed by ${clResult.confirmedBy?.substring(0, 20)}... (poll #${pollCount})`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, pocConfig.clPollIntervalMs));
    }

    closeStreams(streamHandles);
    result.totalLatencyMs = Date.now() - startTime;
    return { result, nextUTXO };
  } catch (error) {
    result.error = (error as Error).message;
    result.totalLatencyMs = Date.now() - startTime;
    return { result, nextUTXO: null };
  }
}

// ============================================================================
// Statistics & Reporting (reused from simplified POC)
// ============================================================================

function calculateStats(results: RunResult[]): ReliabilityStats {
  const nodeStats = new Map<string, { txDetections: number; isHexDeliveries: number; clConfirmations: number }>();
  let successes = 0, failures = 0, txDetections = 0, isHexCaptures = 0, clFallbacks = 0;
  let totalTxDetectionMs = 0, totalIsHexMs = 0, totalClMs = 0;
  let txDetectionCount = 0, isHexCount = 0, clCount = 0;

  for (const r of results) {
    if (r.error) { failures++; continue; }
    if (r.method === 'instantlock' || r.method === 'chainlock') successes++; else failures++;

    if (r.txDetected) {
      txDetections++;
      if (r.txDetectionLatencyMs > 0) { totalTxDetectionMs += r.txDetectionLatencyMs; txDetectionCount++; }
      if (r.txDetectedBy) {
        const s = nodeStats.get(r.txDetectedBy) || { txDetections: 0, isHexDeliveries: 0, clConfirmations: 0 };
        s.txDetections++; nodeStats.set(r.txDetectedBy, s);
      }
    }
    if (r.isHexCaptured) {
      isHexCaptures++;
      if (r.isHexLatencyMs > 0) { totalIsHexMs += r.isHexLatencyMs; isHexCount++; }
      if (r.isHexCapturedBy) {
        const s = nodeStats.get(r.isHexCapturedBy) || { txDetections: 0, isHexDeliveries: 0, clConfirmations: 0 };
        s.isHexDeliveries++; nodeStats.set(r.isHexCapturedBy, s);
      }
    }
    if (r.method === 'chainlock') {
      clFallbacks++;
      if (r.clLatencyMs > 0) { totalClMs += r.clLatencyMs; clCount++; }
      if (r.clConfirmedBy) {
        const s = nodeStats.get(r.clConfirmedBy) || { txDetections: 0, isHexDeliveries: 0, clConfirmations: 0 };
        s.clConfirmations++; nodeStats.set(r.clConfirmedBy, s);
      }
    }
  }

  const total = results.length;
  return {
    totalRuns: total, successes, failures,
    txDetectionRate: (txDetections / total) * 100,
    isHexSuccessRate: (isHexCaptures / total) * 100,
    clFallbackRate: (clFallbacks / total) * 100,
    avgTxDetectionMs: txDetectionCount > 0 ? totalTxDetectionMs / txDetectionCount : 0,
    avgIsHexLatencyMs: isHexCount > 0 ? totalIsHexMs / isHexCount : 0,
    avgClLatencyMs: clCount > 0 ? totalClMs / clCount : 0,
    nodeStats,
  };
}

function printRunResult(r: RunResult): void {
  console.log('');
  console.log('-'.repeat(60));
  console.log(`Run ${r.runNumber} Results:`);
  console.log('-'.repeat(60));
  if (r.error) { console.log(`  ERROR: ${r.error}`); return; }
  console.log(`  TXID:            ${r.txid?.substring(0, 32)}...`);
  console.log(`  TX Detected:     ${r.txDetected ? 'YES' : 'NO'} (${r.txDetectionLatencyMs}ms)`);
  console.log(`  IS Hex Captured: ${r.isHexCaptured ? 'YES' : 'NO'} (${r.isHexLatencyMs}ms)`);
  console.log(`  CL Confirmed:    ${r.clConfirmed ? 'YES' : 'NO'} (${r.clLatencyMs}ms)`);
  console.log(`  Method:          ${r.method}`);
  console.log(`  Total Latency:   ${r.totalLatencyMs}ms`);
}

function printReliabilityReport(stats: ReliabilityStats, config: POCConfig): void {
  console.log('');
  console.log('='.repeat(60));
  console.log('       DAPI-ONLY MULTI-NODE POC RESULTS');
  console.log('='.repeat(60));
  console.log('');
  console.log('CONFIG');
  console.log('-'.repeat(60));
  console.log(`  Strategy:       ${config.reconnectionStrategy}`);
  console.log(`  IS timeout:     ${config.isHexTimeoutMs}ms`);
  console.log(`  Healthy nodes:  ${config.useHealthyNodes ? 'YES' : 'no (random)'}`);
  if (config.isOnly) console.log(`  Mode:           IS-only (no CL fallback)`);
  console.log('');
  console.log('SUMMARY');
  console.log('-'.repeat(60));
  console.log(`  Total runs:     ${stats.totalRuns}`);
  console.log(`  Successes:      ${stats.successes}`);
  console.log(`  Failures:       ${stats.failures}`);
  console.log(`  Success rate:   ${((stats.successes / stats.totalRuns) * 100).toFixed(1)}%`);
  console.log('');
  console.log('DETECTION RATES');
  console.log('-'.repeat(60));
  console.log(`  TX detection:   ${stats.txDetectionRate.toFixed(1)}%`);
  console.log(`  IS hex capture: ${stats.isHexSuccessRate.toFixed(1)}%`);
  console.log(`  CL fallback:    ${stats.clFallbackRate.toFixed(1)}%`);
  console.log('');
  console.log('LATENCIES');
  console.log('-'.repeat(60));
  console.log(`  Avg TX:         ${stats.avgTxDetectionMs.toFixed(0)}ms`);
  console.log(`  Avg IS hex:     ${stats.avgIsHexLatencyMs.toFixed(0)}ms`);
  console.log(`  Avg CL:         ${stats.avgClLatencyMs.toFixed(0)}ms`);
  console.log('');
  console.log('PER-NODE STATS');
  console.log('-'.repeat(60));
  for (const [node, d] of stats.nodeStats) {
    console.log(`  ${node.substring(0, 35)}...`);
    console.log(`    TX: ${d.txDetections}, IS: ${d.isHexDeliveries}, CL: ${d.clConfirmations}`);
  }
  console.log('');
  const successRate = (stats.successes / stats.totalRuns) * 100;
  if (successRate >= 90 && stats.isHexSuccessRate >= 70) console.log('VERDICT: EXCELLENT');
  else if (successRate >= 80) console.log('VERDICT: GOOD');
  else if (successRate >= 50) console.log('VERDICT: MARGINAL');
  else console.log('VERDICT: POOR');
  console.log('='.repeat(60));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('    DAPI-ONLY MULTI-NODE TRANSACTION DETECTION POC');
  console.log('='.repeat(60));
  console.log('');
  console.log('No RPC node required! Everything runs through DAPI:');
  console.log('  1. Historic scan to find UTXOs');
  console.log('  2. Self-send TX built & signed with mnemonic key');
  console.log('  3. Broadcast via dapiClient.core.broadcastTransaction()');
  console.log('  4. IS hex monitoring via parallel streams');
  console.log('  5. UTXO chaining: each output feeds the next run');
  console.log('');

  const pocConfig = parseArgs();

  console.log('Configuration:');
  console.log(`  Runs:           ${pocConfig.runs}`);
  console.log(`  Address:        ${pocConfig.address}`);
  console.log(`  Start height:   ${pocConfig.startHeight}`);
  console.log(`  Nodes:          ${pocConfig.nodes}`);
  console.log(`  Strategy:       ${pocConfig.reconnectionStrategy}`);
  console.log(`  IS timeout:     ${pocConfig.isHexTimeoutMs}ms`);
  console.log(`  IS-only mode:   ${pocConfig.isOnly ? 'YES' : 'no'}`);
  console.log(`  Healthy nodes:  ${pocConfig.useHealthyNodes ? 'YES' : 'no'}`);
  console.log('');

  // 1. Derive private key from mnemonic
  console.log('Deriving private key from mnemonic...');
  const privateKey = derivePrivateKey(pocConfig.mnemonic, pocConfig.network);
  const derivedAddress = privateKey.toAddress(pocConfig.network).toString();
  console.log(`  Derived address: ${derivedAddress}`);
  if (derivedAddress !== pocConfig.address) {
    console.warn(`  WARNING: Derived address doesn't match TESTNET_ADDRESS!`);
    console.warn(`  Expected: ${pocConfig.address}`);
    console.warn(`  Using derived address for signing.`);
  }
  console.log('');

  // 2. Create main DAPI client
  const mainClient = new DAPIClient({ network: pocConfig.network, timeout: 30000 });

  // 3. Historic scan to find initial UTXO
  console.log('Finding UTXOs via DAPI historic scan...');
  const utxos = await findUTXOsViaDAPI(
    mainClient, pocConfig.address, pocConfig.startHeight, pocConfig.network
  );

  if (utxos.length === 0) {
    console.error('ERROR: No UTXOs found. Fund the address first.');
    process.exit(1);
  }

  // Pick the largest UTXO
  const sortedUtxos = utxos.sort((a, b) => b.satoshis - a.satoshis);
  let currentUTXO = sortedUtxos[0];
  console.log(`  Using UTXO: ${currentUTXO.txId.substring(0, 16)}...:${currentUTXO.vout} (${currentUTXO.satoshis} duffs)`);
  console.log(`  Total fees for ${pocConfig.runs} runs: ${pocConfig.runs * SELF_SEND_FEE} duffs`);
  if (currentUTXO.satoshis < pocConfig.runs * SELF_SEND_FEE + 1000) {
    console.warn(`  WARNING: UTXO may be too small for ${pocConfig.runs} runs!`);
  }
  console.log('');

  // 4. Run tests with UTXO chaining
  const results: RunResult[] = [];

  for (let i = 1; i <= pocConfig.runs; i++) {
    console.log('='.repeat(60));
    console.log(`RUN ${i}/${pocConfig.runs} (UTXO: ${currentUTXO.satoshis} duffs)`);
    console.log('='.repeat(60));

    const { result, nextUTXO } = await runSingleTest(
      pocConfig, i, mainClient, privateKey, currentUTXO
    );
    results.push(result);
    printRunResult(result);

    // Update node health
    if (pocConfig.useHealthyNodes && currentHealthData) {
      if (result.isHexCaptured && result.isHexCapturedBy) {
        updateNodeHealth(currentHealthData, result.isHexCapturedBy, true);
      } else if (!result.isHexCaptured && currentNodeAddresses.length > 0) {
        for (const addr of currentNodeAddresses) updateNodeHealth(currentHealthData, addr, false);
      }
    }

    // Chain UTXO for next run
    if (nextUTXO && i < pocConfig.runs) {
      // Wait for IS confirmation before using the output as input
      console.log(`\n  Waiting for IS confirmation before next run...`);
      const isConfirmed = await waitForInstantSend(mainClient, result.txid!, 30000);
      if (isConfirmed) {
        currentUTXO = nextUTXO;
        console.log(`  Chained UTXO: ${currentUTXO.txId.substring(0, 16)}...:${currentUTXO.vout} (${currentUTXO.satoshis} duffs)`);
      } else {
        console.log(`  IS not confirmed, waiting 15s for mempool propagation...`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
        currentUTXO = nextUTXO; // Use it anyway - Dash allows spending unconfirmed
        console.log(`  Using unconfirmed UTXO: ${currentUTXO.txId.substring(0, 16)}...`);
      }

      if (i < pocConfig.runs) {
        console.log(`\n  Waiting ${pocConfig.delay}ms before next run...`);
        await new Promise((resolve) => setTimeout(resolve, pocConfig.delay));
      }
    } else if (!nextUTXO && i < pocConfig.runs) {
      console.error(`  ERROR: No output UTXO from run ${i}, cannot chain. Stopping.`);
      break;
    }
  }

  // Save health data
  if (pocConfig.useHealthyNodes && currentHealthData) {
    console.log('\nUpdating node health data...');
    promoteOrDemoteNodes(currentHealthData);
    await saveHealthyNodes(currentHealthData);
  }

  // Print report
  const stats = calculateStats(results);
  printReliabilityReport(stats, pocConfig);

  const successRate = (stats.successes / stats.totalRuns) * 100;
  process.exit(successRate >= 70 ? 0 : 1);
}

// Suppress gRPC CANCELLED rejections
process.on('unhandledRejection', (err: unknown) => {
  if (err && typeof err === 'object' && (err as any).code === 1 && (err as any).details === 'Cancelled on client') return;
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
