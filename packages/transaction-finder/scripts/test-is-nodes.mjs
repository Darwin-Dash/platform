#!/usr/bin/env node
/**
 * Test which DAPI nodes deliver InstantLock messages on the stream.
 * Opens a stream to each healthy node and monitors for IS lock messages.
 */

import DAPIClient from '@dashevo/dapi-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load healthy nodes
const nodesFile = path.join(__dirname, '../../js-evo-sdk/demo/healthy-nodes.json');
const nodesData = JSON.parse(fs.readFileSync(nodesFile, 'utf-8'));
const nodes = nodesData.nodes;

console.log(`Testing ${nodes.length} DAPI nodes for IS lock support...`);
console.log('Monitoring for 30 seconds on each node...\n');

// Test address (our test address)
const testAddress = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';

// We'll test a subset of nodes
const testNodes = nodes.slice(0, 5);

for (const nodeAddr of testNodes) {
  console.log(`--- Testing ${nodeAddr} ---`);
  try {
    const client = new DAPIClient({
      network: 'testnet',
      dapiAddresses: [nodeAddr],
      timeout: 15000,
    });

    // Get current height
    const height = await client.core.getBestBlockHeight();
    console.log(`  Height: ${height}`);

    // Open stream from 100 blocks back
    const dashcore = await import('@dashevo/dashcore-lib');
    const { BloomFilter, Transaction, Address } = dashcore.default || dashcore;
    const BLOOM_UPDATE_ALL = Transaction?.BloomFilter?.BLOOM_UPDATE_ALL ?? 2;
    const filter = BloomFilter.create(1, 0.001, 0, BLOOM_UPDATE_ALL);
    // Add our address hash to the filter
    const addr = new Address(testAddress, 'testnet');
    filter.insert(addr.hashBuffer);

    const stream = await client.core.subscribeToTransactionsWithProofs(filter, {
      fromBlockHeight: Math.max(1, height - 100),
      count: 0,
    });

    let messageCount = 0;
    let isLockCount = 0;
    let txCount = 0;
    let merkleCount = 0;

    const timeout = setTimeout(() => {
      console.log(`  Messages: ${messageCount} (tx: ${txCount}, merkle: ${merkleCount}, IS lock: ${isLockCount})`);
      console.log(`  IS lock delivery: ${isLockCount > 0 ? '✅ YES' : '❌ NO'}`);
      console.log('');
      try { stream.cancel(); } catch (_) {}
    }, 15000);

    try {
      for await (const msg of stream) {
        messageCount++;
        const isLock = msg.getInstantSendLockMessages?.();
        const rawTx = msg.getRawTransactions?.();
        const merkle = msg.getRawMerkleBlock?.();

        if (isLock != null) {
          isLockCount++;
          const messages = isLock.getMessagesList?.() || [];
          console.log(`  IS LOCK message! (${messages.length} locks)`);
        }
        if (rawTx != null) txCount++;
        if (merkle != null) merkleCount++;
      }
    } catch (e) {
      if (e.code !== 1) { // Not CANCELLED
        console.log(`  Error: ${e.message}`);
      }
    }
    clearTimeout(timeout);
    console.log(`  Final: ${messageCount} messages (tx: ${txCount}, merkle: ${merkleCount}, IS lock: ${isLockCount})`);
    console.log('');
  } catch (e) {
    console.log(`  Failed: ${e.message}`);
    console.log('');
  }
}

console.log('Done.');
process.exit(0);
