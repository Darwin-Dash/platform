#!/usr/bin/env node
/**
 * diagnose-is-reconnect.mjs — Test if reconnecting AFTER broadcast catches tx + IS
 *
 * Hypothesis: DAPI streams go silent after initial data. Reconnecting forces
 * the server to re-scan history + mempool, catching the tx and IS.
 *
 * Test sequence:
 *   1. Open stream (initial data arrives)
 *   2. Broadcast tx
 *   3. Wait 2-3s for tx to propagate and get IS locked
 *   4. RECONNECT stream
 *   5. Check if reconnected stream delivers tx + IS bytes
 */

import DAPIClient from '@dashevo/dapi-client';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dashcore from '@dashevo/dashcore-lib';

const { BloomFilter, Address, Transaction, InstantLock, MerkleBlock } = dashcore;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.join(__dirname, '../../js-evo-sdk/.env') });

const NETWORK = 'testnet';
const TEST_ADDRESS = process.env.TESTNET_ADDRESS;
const RPC_PASS = process.env.TESTNET_RPC_PASSWORD;

if (!RPC_PASS || !TEST_ADDRESS) {
  console.error('ERROR: TESTNET_RPC_PASSWORD and TESTNET_ADDRESS must be set');
  process.exit(1);
}

// Load healthy nodes
let healthyNodes = [];
const nodesPath = path.join(__dirname, '../../js-evo-sdk/demo/healthy-nodes.json');
try {
  const data = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
  healthyNodes = data.nodes || [];
  console.log(`Loaded ${healthyNodes.length} healthy DAPI nodes`);
} catch {}

// Suppress gRPC CANCELLED rejections
process.on('unhandledRejection', (err) => {
  if (err && typeof err === 'object' && err.code === 1 && err.details === 'Cancelled on client') return;
  console.error('Unhandled rejection:', err);
});

const t0 = Date.now();
const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

function buildBloomFilter() {
  const BF = BloomFilter;
  const filter = BF.create(10, 0.0001, 0, BF.BLOOM_UPDATE_ALL);
  const address = Address.fromString(TEST_ADDRESS, NETWORK);
  filter.insert(address.hashBuffer);
  return {
    vData: Buffer.from(filter.vData),
    nHashFuncs: filter.nHashFuncs,
    nTweak: filter.nTweak,
    nFlags: filter.nFlags,
  };
}

function logStreamMessages(rawStream, label, broadcastTxid) {
  let msgCount = 0;
  let txDetected = false;
  let isDetected = false;
  let isHex = null;

  rawStream.on('data', (msg) => {
    msgCount++;
    const hasRawTx = typeof msg.getRawTransactions === 'function';
    const hasRawMerkle = typeof msg.getRawMerkleBlock === 'function';
    const hasISLock = typeof msg.getInstantSendLockMessages === 'function';

    console.log(`\n${elapsed()} [${label} MSG #${msgCount}]`);

    // Transactions
    if (hasRawTx) {
      const rawTxs = msg.getRawTransactions();
      if (rawTxs) {
        const txList = typeof rawTxs.getTransactionsList === 'function'
          ? rawTxs.getTransactionsList()
          : (Array.isArray(rawTxs) ? rawTxs : null);
        if (txList && txList.length > 0) {
          for (const txBuf of txList) {
            try {
              const tx = new Transaction(Buffer.from(txBuf));
              const isOurs = broadcastTxid && tx.hash === broadcastTxid;
              console.log(`  TX: ${tx.hash}${isOurs ? ' *** OUR TX ***' : ''}`);
              if (isOurs) txDetected = true;
            } catch (e) {
              console.log(`  TX parse error: ${e.message}`);
            }
          }
        }
      }
    }

    // MerkleBlock
    if (hasRawMerkle) {
      const rawMerkle = msg.getRawMerkleBlock();
      if (rawMerkle) {
        try {
          const mb = new MerkleBlock(Buffer.from(rawMerkle));
          const txids = mb.hashes.map((h) => Buffer.from(String(h), 'hex').reverse().toString('hex'));
          console.log(`  MB: ${txids.length} txids`);
          for (const txid of txids) {
            const isOurs = broadcastTxid && txid === broadcastTxid;
            console.log(`    ${txid}${isOurs ? ' *** OUR TX ***' : ''}`);
          }
        } catch (e) {
          console.log(`  MB parse error: ${e.message}`);
        }
      }
    }

    // InstantLock
    if (hasISLock) {
      const isLockMessages = msg.getInstantSendLockMessages();
      if (isLockMessages) {
        const lockList = typeof isLockMessages.getMessagesList === 'function'
          ? isLockMessages.getMessagesList()
          : (Array.isArray(isLockMessages) ? isLockMessages : null);
        if (lockList && lockList.length > 0) {
          for (const lockBuf of lockList) {
            try {
              const lock = InstantLock.fromBuffer(Buffer.from(lockBuf));
              const lockTxid = lock.txid.toString('hex');
              const hex = Buffer.from(lockBuf).toString('hex');
              const isOurs = broadcastTxid && lockTxid === broadcastTxid;
              console.log(`  IS: ${lockTxid}${isOurs ? ' *** OUR TX ***' : ''}`);
              console.log(`  IS HEX: ${hex.substring(0, 64)}... (${hex.length} chars)`);
              if (isOurs) {
                isDetected = true;
                isHex = hex;
              }
            } catch (e) {
              console.log(`  IS parse error: ${e.message}`);
            }
          }
        }
      }
    }
  });

  rawStream.on('end', () => console.log(`${elapsed()} [${label} STREAM END]`));
  rawStream.on('error', (err) => console.log(`${elapsed()} [${label} STREAM ERROR] ${err.code}: ${err.message}`));

  return { getMsgCount: () => msgCount, getTxDetected: () => txDetected, getIsDetected: () => isDetected, getIsHex: () => isHex };
}

async function main() {
  const rpc = new DashRpcClient({
    network: NETWORK,
    url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
    user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
    pass: RPC_PASS,
    wallet: process.env.TESTNET_WALLET,
  });
  const broadcaster = new TransactionBroadcaster(rpc);

  const height = await rpc.getBlockCount();
  console.log(`${elapsed()} Height: ${height}`);

  const bloomFilter = buildBloomFilter();
  const dapiClient = new DAPIClient({
    network: NETWORK,
    timeout: 60000,
    ...(healthyNodes.length > 0 ? { dapiAddresses: healthyNodes } : {}),
  });

  // Phase 1: Open initial stream
  console.log(`\n${elapsed()} === PHASE 1: Initial stream ===`);
  let stream1 = dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
    fromBlockHeight: height,
    count: 0,
  });
  if (stream1 && typeof stream1.then === 'function') stream1 = await stream1;
  const monitor1 = logStreamMessages(stream1, 'INITIAL', null);

  // Wait for initial data
  await sleep(3000);
  console.log(`\n${elapsed()} Initial stream got ${monitor1.getMsgCount()} messages`);

  // Phase 2: Broadcast
  console.log(`\n${elapsed()} === PHASE 2: Broadcasting ===`);
  const result = await broadcaster.sendToAddress(TEST_ADDRESS, 1);
  const broadcastTxid = result.txid;
  console.log(`${elapsed()} Broadcast: ${broadcastTxid} (${result.amount} DASH)`);

  // Wait for IS to happen (~2-3s)
  console.log(`${elapsed()} Waiting 4s for IS...`);
  await sleep(4000);
  console.log(`${elapsed()} Initial stream after broadcast: msgs=${monitor1.getMsgCount()}, tx=${monitor1.getTxDetected()}, is=${monitor1.getIsDetected()}`);

  // Phase 3: Reconnect
  console.log(`\n${elapsed()} === PHASE 3: Reconnecting stream ===`);
  // Cancel old stream
  if (typeof stream1.on === 'function') stream1.on('error', () => {});
  if (typeof stream1.cancel === 'function') try { stream1.cancel(); } catch (_) {}

  // Open new stream from same height
  const reconnectHeight = Math.max(1, height - 1);
  console.log(`${elapsed()} Reconnecting from height ${reconnectHeight}...`);
  let stream2 = dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
    fromBlockHeight: reconnectHeight,
    count: 0,
  });
  if (stream2 && typeof stream2.then === 'function') stream2 = await stream2;
  const monitor2 = logStreamMessages(stream2, 'RECONNECT', broadcastTxid);

  // Wait for reconnected stream data
  console.log(`${elapsed()} Waiting 10s for reconnected stream data...`);
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    console.log(`${elapsed()} reconnect: msgs=${monitor2.getMsgCount()}, tx=${monitor2.getTxDetected()}, is=${monitor2.getIsDetected()}`);
    if (monitor2.getTxDetected() && monitor2.getIsDetected()) break;
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('RECONNECT DIAGNOSIS');
  console.log('='.repeat(60));
  console.log(`Broadcast txid: ${broadcastTxid}`);
  console.log(`Initial stream - tx detected: ${monitor1.getTxDetected()}, IS detected: ${monitor1.getIsDetected()}`);
  console.log(`Reconnected stream - tx detected: ${monitor2.getTxDetected()}, IS detected: ${monitor2.getIsDetected()}`);

  if (monitor2.getIsHex()) {
    console.log(`\n✅ IS hex delivered on reconnected stream!`);
    console.log(`   Hex: ${monitor2.getIsHex().substring(0, 64)}...`);
    console.log(`\n🔑 FIX: Reconnect stream AFTER broadcast (not before)`);
    console.log(`   The stream should wait ~3s for IS, then reconnect to catch it.`);
  } else if (monitor2.getTxDetected()) {
    console.log(`\n⚠️  TX found on reconnect but no IS hex`);
    console.log(`   IS may not have been finalized yet, or DAPI node didn't relay it`);
  } else {
    console.log(`\n❌ Neither TX nor IS found on reconnect`);
    console.log(`   Try increasing delay or checking DAPI node health`);
  }

  // Cleanup
  if (typeof stream2.cancel === 'function') try { stream2.cancel(); } catch (_) {}
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
