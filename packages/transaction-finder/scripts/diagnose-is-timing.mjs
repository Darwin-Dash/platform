#!/usr/bin/env node
/**
 * diagnose-is-timing.mjs — Test if stream opened RIGHT AFTER broadcast catches IS
 *
 * Theory: open stream immediately after broadcast, before IS finality (~1-2s).
 * If the stream can catch the live ZMQ IS event, we get the hex.
 *
 * Also tests: does the existing stream (opened before broadcast) ever deliver
 * live data or does it truly stall after initial messages?
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

let healthyNodes = [];
const nodesPath = path.join(__dirname, '../../js-evo-sdk/demo/healthy-nodes.json');
try {
  const data = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
  healthyNodes = data.nodes || [];
  console.log(`Loaded ${healthyNodes.length} healthy DAPI nodes`);
} catch {}

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
    const hasISLock = typeof msg.getInstantSendLockMessages === 'function';

    // Transactions
    const rawTxs = typeof msg.getRawTransactions === 'function' ? msg.getRawTransactions() : null;
    if (rawTxs) {
      const txList = typeof rawTxs.getTransactionsList === 'function'
        ? rawTxs.getTransactionsList() : (Array.isArray(rawTxs) ? rawTxs : null);
      if (txList && txList.length > 0) {
        for (const txBuf of txList) {
          try {
            const tx = new Transaction(Buffer.from(txBuf));
            const isOurs = broadcastTxid && tx.hash === broadcastTxid;
            if (isOurs) {
              txDetected = true;
              console.log(`${elapsed()} [${label}] ✅ TX detected: ${tx.hash}`);
            }
          } catch {}
        }
      }
    }

    // InstantLock
    if (hasISLock) {
      const isLockMessages = msg.getInstantSendLockMessages();
      if (isLockMessages) {
        const lockList = typeof isLockMessages.getMessagesList === 'function'
          ? isLockMessages.getMessagesList() : (Array.isArray(isLockMessages) ? isLockMessages : null);
        if (lockList && lockList.length > 0) {
          for (const lockBuf of lockList) {
            try {
              const lock = InstantLock.fromBuffer(Buffer.from(lockBuf));
              const lockTxid = lock.txid.toString('hex');
              const hex = Buffer.from(lockBuf).toString('hex');
              const isOurs = broadcastTxid && lockTxid === broadcastTxid;
              console.log(`${elapsed()} [${label}] 🔒 IS: ${lockTxid}${isOurs ? ' *** OUR TX ***' : ''} hex=${hex.length} chars`);
              if (isOurs) {
                isDetected = true;
                isHex = hex;
              }
            } catch {}
          }
        }
      }
    }
  });

  rawStream.on('end', () => console.log(`${elapsed()} [${label}] STREAM END`));
  rawStream.on('error', (err) => {
    if (err.code !== 1) console.log(`${elapsed()} [${label}] STREAM ERROR: ${err.code}: ${err.message}`);
  });

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

  // Step 1: Broadcast immediately (no stream yet)
  console.log(`\n${elapsed()} === Broadcast FIRST, then open stream ===`);
  const result = await broadcaster.sendToAddress(TEST_ADDRESS, 1);
  const broadcastTxid = result.txid;
  console.log(`${elapsed()} Broadcast: ${broadcastTxid}`);

  // Step 2: Open stream IMMEDIATELY (try to catch IS before it finalizes)
  console.log(`${elapsed()} Opening stream immediately after broadcast...`);
  let stream = dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
    fromBlockHeight: height,
    count: 0,
  });
  if (stream && typeof stream.then === 'function') stream = await stream;
  const monitor = logStreamMessages(stream, 'FAST', broadcastTxid);
  console.log(`${elapsed()} Stream opened`);

  // Step 3: Wait 15s
  console.log(`${elapsed()} Waiting 15s...`);
  for (let i = 0; i < 8; i++) {
    await sleep(2000);
    console.log(`${elapsed()} msgs=${monitor.getMsgCount()}, tx=${monitor.getTxDetected()}, is=${monitor.getIsDetected()}`);
    if (monitor.getIsDetected()) break;
  }

  // Step 4: Also try reconnect to see if IS comes from mempool scan
  console.log(`\n${elapsed()} === Reconnecting to check mempool IS ===`);
  if (typeof stream.on === 'function') stream.on('error', () => {});
  if (typeof stream.cancel === 'function') try { stream.cancel(); } catch (_) {}

  let stream2 = dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
    fromBlockHeight: Math.max(1, height - 1),
    count: 0,
  });
  if (stream2 && typeof stream2.then === 'function') stream2 = await stream2;
  const monitor2 = logStreamMessages(stream2, 'RECONNECT2', broadcastTxid);

  console.log(`${elapsed()} Waiting 10s for reconnected stream...`);
  for (let i = 0; i < 5; i++) {
    await sleep(2000);
    console.log(`${elapsed()} reconnect: msgs=${monitor2.getMsgCount()}, tx=${monitor2.getTxDetected()}, is=${monitor2.getIsDetected()}`);
    if (monitor2.getIsDetected()) break;
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Broadcast txid: ${broadcastTxid}`);
  console.log(`Fast stream: tx=${monitor.getTxDetected()}, is=${monitor.getIsDetected()}`);
  console.log(`Reconnect stream: tx=${monitor2.getTxDetected()}, is=${monitor2.getIsDetected()}`);

  if (monitor.getIsHex() || monitor2.getIsHex()) {
    const hex = monitor.getIsHex() || monitor2.getIsHex();
    console.log(`\n✅ IS hex obtained: ${hex.substring(0, 64)}...`);
  } else {
    console.log(`\n❌ No IS hex from any stream path`);
  }

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
