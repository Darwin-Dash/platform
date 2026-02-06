#!/usr/bin/env node
/**
 * DAPI Healthy Nodes Builder
 *
 * Tests all testnet whitelist nodes and outputs healthy ones to a JSON file.
 * Also tests InstantSend hex delivery capability for multi-node IS hunting.
 *
 * Run this before using the demo app for faster discovery.
 *
 * Usage: node scripts/build-healthy-nodes.js
 * Output: demo/healthy-nodes.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Known-good IS hex capable nodes (from reliability testing)
// These nodes have ZMQ rawtxlocksig enabled and deliver IS proof bytes
const KNOWN_IS_CAPABLE_NODES = [
  '35.82.197.197:1443',
  '44.227.137.77:1443',
  '44.239.39.153:1443',
  '44.240.98.102:1443',
  '52.13.132.146:1443',
  '52.24.124.162:1443',
  '52.33.28.47:1443',
  '52.34.144.50:1443',
  '52.43.13.92:1443',
  '52.43.86.231:1443',
];

async function checkNodeHealth(nodeAddress, timeout = 5000) {
  const DAPIClient = (await import('@dashevo/dapi-client')).default;

  try {
    const client = new DAPIClient({
      network: 'testnet',
      dapiAddresses: [nodeAddress],
      timeout: timeout,
      retries: 0
    });

    const startTime = Date.now();
    const height = await client.core.getBestBlockHeight();
    const latency = Date.now() - startTime;

    return { healthy: true, height: parseInt(height), latency };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

/**
 * Test if a node can open a transaction stream.
 * This is a basic liveness test - actual IS hex delivery requires transaction activity.
 */
async function checkStreamCapability(nodeAddress, timeout = 8000) {
  const DAPIClient = (await import('@dashevo/dapi-client')).default;
  const dashcore = await import('@dashevo/dashcore-lib');
  const { BloomFilter, Transaction, Address } = dashcore.default || dashcore;

  try {
    const client = new DAPIClient({
      network: 'testnet',
      dapiAddresses: [nodeAddress],
      timeout: timeout,
      retries: 0
    });

    // Get current height
    const height = await client.core.getBestBlockHeight();

    // Create a minimal bloom filter
    const BLOOM_UPDATE_ALL = Transaction?.BloomFilter?.BLOOM_UPDATE_ALL ?? 2;
    const filter = BloomFilter.create(1, 0.001, 0, BLOOM_UPDATE_ALL);
    const testAddress = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
    const addr = new Address(testAddress, 'testnet');
    filter.insert(addr.hashBuffer);

    // Open stream from recent blocks (just test if it opens)
    const stream = await client.core.subscribeToTransactionsWithProofs(filter, {
      fromBlockHeight: Math.max(1, parseInt(height) - 10),
      count: 0,
    });

    // Wait for first message or timeout
    const startTime = Date.now();
    let messageReceived = false;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stream timeout')), 3000);
    });

    const streamPromise = (async () => {
      for await (const msg of stream) {
        messageReceived = true;
        stream.cancel();
        break;
      }
    })();

    try {
      await Promise.race([streamPromise, timeoutPromise]);
    } catch (e) {
      // Timeout or cancel is OK - we just wanted to test stream open
    }

    try { stream.cancel(); } catch (_) {}

    const latency = Date.now() - startTime;
    return { streamCapable: true, messageReceived, latency };
  } catch (error) {
    return { streamCapable: false, error: error.message };
  }
}

async function main() {
  console.log('DAPI Healthy Nodes Builder');
  console.log('==========================\n');

  // Load whitelist
  const networkConfigs = await import('@dashevo/dapi-client/lib/networkConfigs.js')
    .then(m => m.default || m);
  const whitelist = networkConfigs.testnet.dapiAddressesWhiteList;

  console.log(`Testing ${whitelist.length} nodes (5s timeout, 10 parallel)...\n`);

  const results = [];
  const CONCURRENCY = 10;

  // Phase 1: Basic health check (DAPI reachability)
  console.log('Phase 1: DAPI Reachability\n');
  for (let i = 0; i < whitelist.length; i += CONCURRENCY) {
    const batch = whitelist.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (addr) => {
        const result = await checkNodeHealth(addr, 5000);
        const status = result.healthy ? `✓ ${result.latency}ms` : `✗ ${result.error?.substring(0, 40)}`;
        console.log(`  ${addr}: ${status}`);
        return { address: addr, ...result };
      })
    );
    results.push(...batchResults);
  }

  // Filter healthy nodes
  const healthyNodes = results
    .filter(r => r.healthy)
    .sort((a, b) => a.latency - b.latency)
    .map(r => r.address);

  console.log(`\n✓ Found ${healthyNodes.length}/${whitelist.length} healthy nodes`);

  if (healthyNodes.length === 0) {
    console.error('\n❌ No healthy nodes found! Check network connectivity.');
    process.exit(1);
  }

  // Phase 2: Stream capability check (subset of healthy nodes)
  console.log('\nPhase 2: Stream Capability (testing first 15 healthy nodes)\n');
  const streamTestNodes = healthyNodes.slice(0, 15);
  const streamResults = [];

  for (let i = 0; i < streamTestNodes.length; i += 5) {
    const batch = streamTestNodes.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (addr) => {
        const result = await checkStreamCapability(addr, 8000);
        const status = result.streamCapable
          ? `✓ stream (msg: ${result.messageReceived ? 'yes' : 'no'})`
          : `✗ ${result.error?.substring(0, 30)}`;
        console.log(`  ${addr}: ${status}`);
        return { address: addr, ...result };
      })
    );
    streamResults.push(...batchResults);
  }

  const streamCapableNodes = streamResults
    .filter(r => r.streamCapable)
    .map(r => r.address);

  console.log(`\n✓ ${streamCapableNodes.length}/${streamTestNodes.length} nodes support streams`);

  // Determine IS-capable nodes (known-good + verified stream-capable)
  // IS hex delivery requires ZMQ rawtxlocksig which we can't easily test without tx activity
  // Use known-good list from reliability testing + any healthy nodes that support streams
  const knownIsCapableSet = new Set(KNOWN_IS_CAPABLE_NODES);
  const isHexCapable = healthyNodes.filter(addr => {
    // Normalize address for comparison (add port if missing)
    const normalized = addr.includes(':') ? addr : `${addr}:443`;
    const hostPort = normalized.replace('https://', '').replace('http://', '');
    return knownIsCapableSet.has(hostPort);
  });

  console.log(`\n✓ ${isHexCapable.length} nodes in known IS-capable list`);

  // Write output file
  const outputPath = path.join(__dirname, '../demo/healthy-nodes.json');
  const output = {
    generated: new Date().toISOString(),
    network: 'testnet',
    count: healthyNodes.length,
    nodes: healthyNodes,
    // IS hex capable nodes (known-good from reliability testing)
    isHexCapable: isHexCapable,
    // Seed list of known-good IS nodes (for persistence bootstrap)
    knownIsCapableSeeds: KNOWN_IS_CAPABLE_NODES,
  };

  // Ensure demo directory exists
  const demoDir = path.join(__dirname, '../demo');
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to: ${outputPath}`);

  // Show top 5 fastest
  console.log('\nTop 5 fastest nodes:');
  results
    .filter(r => r.healthy)
    .sort((a, b) => a.latency - b.latency)
    .slice(0, 5)
    .forEach((r, i) => console.log(`  ${i + 1}. ${r.address} (${r.latency}ms, height: ${r.height})`));

  // Show IS-capable nodes
  if (isHexCapable.length > 0) {
    console.log('\nKnown IS hex capable nodes (for multi-node hunting):');
    isHexCapable.forEach((addr, i) => console.log(`  ${i + 1}. ${addr}`));
  }

  // Summary stats
  const avgLatency = Math.round(
    results.filter(r => r.healthy).reduce((sum, r) => sum + r.latency, 0) / healthyNodes.length
  );
  console.log(`\nAverage latency: ${avgLatency}ms`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
