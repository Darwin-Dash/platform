#!/usr/bin/env npx ts-node
/**
 * Discover DAPI nodes with rawtxlocksig ZMQ enabled
 *
 * Opens parallel streams using a shared DAPI client and observes
 * whether InstantLock hex is delivered for network transactions.
 *
 * NOTE: With the DAPI client's load balancing, we can't test specific nodes.
 * Instead, we observe overall IS hex delivery and track nodes that appear
 * to be serving the connections.
 *
 * Usage:
 *   npx tsx scripts/discover-healthy-nodes.ts --streams 5 --probe-time 30000
 */

import DAPIClient from '@dashevo/dapi-client';
import { BloomFilterBuilder } from '../src/core/BloomFilterBuilder.js';
import { StreamWrapper } from '../src/core/StreamWrapper.js';
import dashcore from '@dashevo/dashcore-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { InstantLock } = dashcore;

// ============================================================================
// Types
// ============================================================================

interface StreamStats {
  streamId: number;
  messagesReceived: number;
  isMessagesReceived: number;
  txidsWithIs: Set<string>;
}

interface IsNodeHealth {
  version: number;
  generated: string;
  knownGood: string[];
  learned: Record<string, { successes: number; failures: number }>;
}

interface DiscoveryConfig {
  streams: number;
  probeTimeMs: number;
  output: string;
  network: 'testnet' | 'mainnet';
  verbose: boolean;
  mergeExisting: boolean;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): DiscoveryConfig {
  const args = process.argv.slice(2);
  const config: DiscoveryConfig = {
    streams: 5,
    probeTimeMs: 30000,
    output: path.join(__dirname, '../../js-evo-sdk/demo/is-node-health.json'),
    network: 'testnet',
    verbose: false,
    mergeExisting: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--streams':
        config.streams = parseInt(args[++i], 10);
        break;
      case '--nodes': // Alias for backwards compatibility
        config.streams = parseInt(args[++i], 10);
        break;
      case '--probe-time':
        config.probeTimeMs = parseInt(args[++i], 10);
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--network':
        config.network = args[++i] as 'testnet' | 'mainnet';
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--no-merge':
        config.mergeExisting = false;
        break;
      case '--help':
        console.log(`
Discover DAPI Nodes with rawtxlocksig ZMQ Enabled

Opens parallel streams and observes whether InstantLock hex messages
are delivered for network transactions.

Usage:
  npx tsx scripts/discover-healthy-nodes.ts [options]

Options:
  --streams N       Number of parallel streams (default: 5)
  --probe-time MS   Total observation time in ms (default: 30000)
  --output PATH     Output file path (default: is-node-health.json)
  --network NET     Network: testnet or mainnet (default: testnet)
  --verbose         Show detailed message output
  --no-merge        Don't merge with existing health data (replace)
  --help            Show this help message

Examples:
  # Quick discovery (5 streams, 30s)
  npx tsx scripts/discover-healthy-nodes.ts --streams 5 --probe-time 30000

  # Extended discovery (10 streams, 60s)
  npx tsx scripts/discover-healthy-nodes.ts --streams 10 --probe-time 60000

  # Verbose output
  npx tsx scripts/discover-healthy-nodes.ts --streams 3 --verbose
`);
        process.exit(0);
    }
  }

  return config;
}

// ============================================================================
// Node Discovery
// ============================================================================

async function discoverAllNodes(dapiClient: DAPIClient): Promise<string[]> {
  const addresses: string[] = [];

  // First, make calls to force the DAPI client to resolve actual node addresses
  console.log('  Warming up DAPI client (resolving DNS seeds)...');
  const core = (dapiClient as any).core;
  for (let i = 0; i < 10; i++) {
    try {
      await core.getBestBlockHeight();
    } catch {
      // Ignore errors, we're just warming up the address list
    }
  }

  // Try to get addresses from the DAPI client's address provider
  const addressProvider = (dapiClient as any).dapiAddressProvider;
  if (!addressProvider) {
    console.warn('No address provider available');
    return addresses;
  }

  // Try to get all addresses from list provider
  let allAddresses: any[] = [];

  if (addressProvider.listDAPIAddressProvider) {
    allAddresses = addressProvider.listDAPIAddressProvider.getAllAddresses() || [];
  } else if (typeof addressProvider.getAllAddresses === 'function') {
    allAddresses = addressProvider.getAllAddresses() || [];
  }

  // Convert DAPIAddress objects to strings, filtering out DNS seeds
  for (const addr of allAddresses) {
    const addrStr = typeof addr.toString === 'function' ? addr.toString() : String(addr);
    // Skip DNS seed hostnames (contain "seed" or don't start with IP)
    if (/^https:\/\/\d/.test(addrStr) && !addresses.includes(addrStr)) {
      addresses.push(addrStr);
    }
  }

  return addresses;
}

// ============================================================================
// Bloom Filter Building
// ============================================================================

function buildBroadBloomFilter(network: string): any {
  // Known active testnet addresses for broader transaction matching
  // Using addresses that have recent transaction activity
  // Address from POC script + testnet faucet addresses
  const activeAddresses = [
    'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',  // Known active from POC
    'yWdXnYxGbouNoo8yMvcbZmZ3Gdp6BpySxL',  // Testnet faucet
  ];

  // Use a higher false positive rate (10%) to catch more transactions
  return BloomFilterBuilder.build(activeAddresses, network, 0.1);
}

// ============================================================================
// Stream Processing
// ============================================================================

async function processStream(
  streamId: number,
  asyncIterable: AsyncIterable<any>,
  stats: StreamStats,
  verbose: boolean,
  stopSignal: { stopped: boolean }
): Promise<void> {
  try {
    for await (const message of asyncIterable) {
      if (stopSignal.stopped) break;

      stats.messagesReceived++;
      const msg = message as any;

      // Check for InstantLock messages
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

            stats.isMessagesReceived++;
            stats.txidsWithIs.add(txid);

            if (verbose) {
              const hex = Buffer.from(lockBuf).toString('hex');
              console.log(`  [Stream ${streamId}] IS hex for ${txid.substring(0, 16)}...: ${hex.substring(0, 32)}...`);
            }
          } catch {
            // Invalid IS lock format
          }
        }
      }
    }
  } catch (error) {
    // Stream ended or errored
    if (verbose) {
      console.log(`  [Stream ${streamId}] Ended: ${(error as Error).message?.substring(0, 50) || 'unknown'}`);
    }
  }
}

// ============================================================================
// Health Data Management
// ============================================================================

async function loadExistingHealth(filePath: string): Promise<IsNodeHealth | null> {
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function normalizeNodeAddress(address: string): string {
  return address.replace('https://', '');
}

// ============================================================================
// Main Discovery Flow
// ============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('═'.repeat(60));
  console.log('      DAPI NODE IS HEALTH DISCOVERY');
  console.log('═'.repeat(60));
  console.log('');
  console.log('This script opens parallel streams and observes InstantLock');
  console.log('hex delivery to verify nodes have rawtxlocksig ZMQ enabled.');
  console.log('');

  const config = parseArgs();

  console.log('Configuration:');
  console.log(`  Parallel streams: ${config.streams}`);
  console.log(`  Probe time:       ${config.probeTimeMs}ms`);
  console.log(`  Network:          ${config.network}`);
  console.log(`  Output:           ${config.output}`);
  console.log(`  Merge existing:   ${config.mergeExisting}`);
  console.log(`  Verbose:          ${config.verbose}`);
  console.log('');

  // Load existing health data if merging
  let existingHealth: IsNodeHealth | null = null;
  if (config.mergeExisting) {
    existingHealth = await loadExistingHealth(config.output);
    if (existingHealth) {
      console.log(`Loaded existing health data:`);
      console.log(`  Known good nodes: ${existingHealth.knownGood.length}`);
      console.log(`  Learned nodes:    ${Object.keys(existingHealth.learned).length}`);
      console.log('');
    }
  }

  // Create DAPI client
  console.log('Connecting to DAPI...');
  const mainClient = new DAPIClient({
    network: config.network,
    timeout: 60000,
  });

  // Discover nodes
  const allNodes = await discoverAllNodes(mainClient);
  console.log(`Found ${allNodes.length} nodes in network`);

  // Get current blockchain height
  const core = (mainClient as any).core;
  const currentHeight = await core.getBestBlockHeight();
  console.log(`Current blockchain height: ${currentHeight}`);
  console.log('');

  // Build bloom filter
  const bloomFilter = buildBroadBloomFilter(config.network);
  const fromHeight = Math.max(1, currentHeight - 10);

  // Open parallel streams
  console.log(`Opening ${config.streams} parallel streams from height ${fromHeight}...`);
  const streams: any[] = [];
  const streamStats: StreamStats[] = [];
  const stopSignal = { stopped: false };

  for (let i = 0; i < config.streams; i++) {
    try {
      let rawStream = core.subscribeToTransactionsWithProofs(bloomFilter, {
        fromBlockHeight: fromHeight,
        count: 0,
      });

      if (rawStream && typeof rawStream.then === 'function') {
        rawStream = await rawStream;
      }

      streams.push(rawStream);
      const stats: StreamStats = {
        streamId: i,
        messagesReceived: 0,
        isMessagesReceived: 0,
        txidsWithIs: new Set(),
      };
      streamStats.push(stats);

      const asyncIterable = StreamWrapper.makeAsyncIterable(rawStream);

      // Start processing in background (don't await)
      processStream(i, asyncIterable, stats, config.verbose, stopSignal);

      console.log(`  ✓ Stream ${i + 1}/${config.streams} opened`);
    } catch (error) {
      console.log(`  ✗ Stream ${i + 1}/${config.streams} failed: ${(error as Error).message?.substring(0, 40)}`);
    }
  }

  if (streams.length === 0) {
    console.error('Error: Failed to open any streams');
    process.exit(1);
  }

  console.log('');
  console.log(`Observing network traffic for ${config.probeTimeMs / 1000}s...`);

  // Progress reporting
  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const totalMsgs = streamStats.reduce((sum, s) => sum + s.messagesReceived, 0);
    const totalIs = streamStats.reduce((sum, s) => sum + s.isMessagesReceived, 0);
    const uniqueTxids = new Set(streamStats.flatMap((s) => Array.from(s.txidsWithIs))).size;
    process.stdout.write(
      `\r  Elapsed: ${(elapsed / 1000).toFixed(0)}s | Messages: ${totalMsgs} | IS: ${totalIs} | Unique TXs: ${uniqueTxids}   `
    );
  }, 1000);

  // Wait for probe time
  await new Promise((resolve) => setTimeout(resolve, config.probeTimeMs));

  // Stop streams
  stopSignal.stopped = true;
  clearInterval(progressInterval);
  console.log('');
  console.log('');

  // Close streams
  for (const stream of streams) {
    try {
      if (typeof stream.on === 'function') {
        stream.on('error', () => {});
      }
      if (typeof stream.cancel === 'function') {
        stream.cancel();
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // Aggregate results
  const totalMessages = streamStats.reduce((sum, s) => sum + s.messagesReceived, 0);
  const totalIsMessages = streamStats.reduce((sum, s) => sum + s.isMessagesReceived, 0);
  const uniqueTxidsWithIs = new Set(streamStats.flatMap((s) => Array.from(s.txidsWithIs)));
  const isDelivered = totalIsMessages > 0;

  // Print per-stream stats
  console.log('Per-stream statistics:');
  for (const stats of streamStats) {
    const status = stats.isMessagesReceived > 0 ? '✓' : '✗';
    console.log(
      `  Stream ${stats.streamId}: ${stats.messagesReceived} msgs, ${stats.isMessagesReceived} IS, ${stats.txidsWithIs.size} unique TXs ${status}`
    );
  }
  console.log('');

  // Build health data
  // Since we can't know which specific nodes delivered IS, we:
  // - If IS was delivered, mark all discovered nodes as "working" (the network supports IS)
  // - Track success/failure based on whether IS was observed
  const healthData: IsNodeHealth = existingHealth || {
    version: 1,
    generated: new Date().toISOString(),
    knownGood: [],
    learned: {},
  };

  healthData.generated = new Date().toISOString();

  // Update learned stats based on observation
  if (isDelivered) {
    // IS was delivered - the network is healthy
    // Boost confidence in known good nodes
    for (const node of healthData.knownGood) {
      if (!healthData.learned[node]) {
        healthData.learned[node] = { successes: 0, failures: 0 };
      }
      healthData.learned[node].successes++;
    }
    console.log('✓ InstantLock hex IS being delivered on the network');
  } else {
    // No IS delivered - could be network issue or no transactions
    console.log('⚠️ No InstantLock hex observed (could be low network activity)');
  }

  // If we don't have any known good nodes yet, use discovered nodes
  if (healthData.knownGood.length === 0 && isDelivered && allNodes.length > 0) {
    // Add first 10 discovered nodes as known good
    healthData.knownGood = allNodes.slice(0, 10).map(normalizeNodeAddress);
    for (const node of healthData.knownGood) {
      healthData.learned[node] = { successes: 1, failures: 0 };
    }
    console.log(`Added ${healthData.knownGood.length} discovered nodes to knownGood list`);
  }

  // Save results
  await fs.promises.writeFile(config.output, JSON.stringify(healthData, null, 2));

  // Print summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('DISCOVERY RESULTS');
  console.log('═'.repeat(60));
  console.log(`Streams opened:     ${streams.length}`);
  console.log(`Total messages:     ${totalMessages}`);
  console.log(`IS messages:        ${totalIsMessages}`);
  console.log(`Unique TXs with IS: ${uniqueTxidsWithIs.size}`);
  console.log(`IS delivery:        ${isDelivered ? 'YES ✓' : 'NO ✗'}`);
  console.log('');
  console.log(`Known good nodes:   ${healthData.knownGood.length}`);
  console.log(`Total learned:      ${Object.keys(healthData.learned).length}`);
  console.log('');
  console.log(`Saved to: ${config.output}`);
  console.log('═'.repeat(60));

  // Print healthy nodes list
  if (healthData.knownGood.length > 0) {
    console.log('');
    console.log('Known good nodes:');
    for (const node of healthData.knownGood.slice(0, 10)) {
      const stats = healthData.learned[node];
      const successRate = stats
        ? ((stats.successes / (stats.successes + stats.failures)) * 100).toFixed(0)
        : '?';
      console.log(`  - ${node} (${successRate}%)`);
    }
    if (healthData.knownGood.length > 10) {
      console.log(`  ... and ${healthData.knownGood.length - 10} more`);
    }
  }

  console.log('');
  if (isDelivered) {
    console.log('✓ Discovery successful - IS hex delivery confirmed');
  } else if (totalMessages > 0) {
    console.log('⚠️ Network active but no IS messages - may need more observation time');
  } else {
    console.log('✗ No network activity observed - check connectivity');
  }
  console.log('');

  process.exit(isDelivered || healthData.knownGood.length > 0 ? 0 : 1);
}

// Suppress gRPC CANCELLED rejections
process.on('unhandledRejection', (err: unknown) => {
  if (
    err &&
    typeof err === 'object' &&
    (err as any).code === 1 &&
    (err as any).details === 'Cancelled on client'
  ) {
    return;
  }
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
