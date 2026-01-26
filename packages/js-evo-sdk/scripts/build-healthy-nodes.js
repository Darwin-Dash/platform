#!/usr/bin/env node
/**
 * DAPI Healthy Nodes Builder
 *
 * Tests all testnet whitelist nodes and outputs healthy ones to a JSON file.
 * Run this before using the demo app for faster discovery.
 *
 * Usage: node scripts/build-healthy-nodes.js
 * Output: demo/healthy-nodes.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // Test in parallel batches
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

  // Filter and sort healthy nodes
  const healthyNodes = results
    .filter(r => r.healthy)
    .sort((a, b) => a.latency - b.latency)
    .map(r => r.address);

  console.log(`\n✓ Found ${healthyNodes.length}/${whitelist.length} healthy nodes`);

  if (healthyNodes.length === 0) {
    console.error('\n❌ No healthy nodes found! Check network connectivity.');
    process.exit(1);
  }

  // Write output file
  const outputPath = path.join(__dirname, '../demo/healthy-nodes.json');
  const output = {
    generated: new Date().toISOString(),
    network: 'testnet',
    count: healthyNodes.length,
    nodes: healthyNodes
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
