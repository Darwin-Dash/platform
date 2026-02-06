#!/usr/bin/env node
/**
 * diagnose-is.mjs — Standalone diagnostic for InstantSend stream delivery
 *
 * Opens a DAPI stream, broadcasts a tx via RPC, and logs EVERY stream
 * message with timing to diagnose why IS proof bytes are not delivered.
 *
 * Usage:
 *   node scripts/diagnose-is.mjs
 *
 * Requires: TESTNET_RPC_PASSWORD in ../js-evo-sdk/.env
 */

import DAPIClient from '@dashevo/dapi-client';
import { DashRpcClient, TransactionBroadcaster } from '@dashevo/dash-rpc-client';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dashcore from '@dashevo/dashcore-lib';

const { BloomFilter, Address, Transaction, InstantLock } = dashcore;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
config({ path: path.join(__dirname, '../../js-evo-sdk/.env') });

const NETWORK = 'testnet';
const TEST_ADDRESS = process.env.TESTNET_ADDRESS;
const RPC_PASS = process.env.TESTNET_RPC_PASSWORD;

if (!RPC_PASS) {
  console.error('ERROR: TESTNET_RPC_PASSWORD not set in ../js-evo-sdk/.env');
  process.exit(1);
}
if (!TEST_ADDRESS) {
  console.error('ERROR: TESTNET_ADDRESS not set in ../js-evo-sdk/.env');
  process.exit(1);
}

// Load healthy nodes
let healthyNodes = [];
const nodesPath = path.join(__dirname, '../../js-evo-sdk/demo/healthy-nodes.json');
try {
  const data = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
  healthyNodes = data.nodes || [];
  console.log(`Loaded ${healthyNodes.length} healthy DAPI nodes`);
} catch {
  console.log('No healthy-nodes.json found, using defaults');
}

// Suppress gRPC CANCELLED rejections
process.on('unhandledRejection', (err) => {
  if (err && typeof err === 'object' && err.code === 1 && err.details === 'Cancelled on client') return;
  console.error('Unhandled rejection:', err);
});

const t0 = Date.now();
const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

async function main() {
  // 1. Connect RPC
  console.log(`\n${elapsed()} Connecting to Dash Core RPC...`);
  const rpc = new DashRpcClient({
    network: NETWORK,
    url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
    user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
    pass: RPC_PASS,
    wallet: process.env.TESTNET_WALLET,
  });
  const broadcaster = new TransactionBroadcaster(rpc);

  const height = await rpc.getBlockCount();
  const balance = await rpc.getBalance();
  console.log(`${elapsed()} RPC connected: height=${height}, balance=${balance.toFixed(8)} DASH`);

  // 2. Build bloom filter
  console.log(`\n${elapsed()} Building bloom filter for address: ${TEST_ADDRESS}`);
  const BF = BloomFilter;
  const filter = BF.create(10, 0.0001, 0, BF.BLOOM_UPDATE_ALL);
  const address = Address.fromString(TEST_ADDRESS, NETWORK);
  filter.insert(address.hashBuffer);

  const bloomFilter = {
    vData: Buffer.from(filter.vData),
    nHashFuncs: filter.nHashFuncs,
    nTweak: filter.nTweak,
    nFlags: filter.nFlags,
  };
  console.log(`${elapsed()} Bloom filter: ${bloomFilter.vData.length} bytes, ${bloomFilter.nHashFuncs} hash funcs`);

  // 3. Open DAPI stream
  console.log(`\n${elapsed()} Opening DAPI stream from height ${height}...`);
  const dapiClient = new DAPIClient({
    network: NETWORK,
    timeout: 60000,
    ...(healthyNodes.length > 0 ? { dapiAddresses: healthyNodes } : {}),
  });

  let rawStream = dapiClient.core.subscribeToTransactionsWithProofs(bloomFilter, {
    fromBlockHeight: height,
    count: 0,
  });
  if (rawStream && typeof rawStream.then === 'function') {
    rawStream = await rawStream;
  }
  console.log(`${elapsed()} Stream opened. Type: ${typeof rawStream}, hasOn: ${typeof rawStream.on === 'function'}`);

  // 4. Attach raw event listeners to log EVERYTHING
  let msgCount = 0;
  let broadcastTxid = null;
  let txDetected = false;
  let isDetected = false;

  rawStream.on('data', (msg) => {
    msgCount++;
    const hasRawTx = typeof msg.getRawTransactions === 'function';
    const hasRawMerkle = typeof msg.getRawMerkleBlock === 'function';
    const hasISLock = typeof msg.getInstantSendLockMessages === 'function';

    console.log(`\n${elapsed()} [MSG #${msgCount}] data event`);
    console.log(`  hasRawTx=${hasRawTx}, hasMerkle=${hasRawMerkle}, hasISLock=${hasISLock}`);

    // Check rawTransactions
    if (hasRawTx) {
      const rawTxs = msg.getRawTransactions();
      if (rawTxs) {
        const txList = typeof rawTxs.getTransactionsList === 'function'
          ? rawTxs.getTransactionsList()
          : (Array.isArray(rawTxs) ? rawTxs : null);

        if (txList && txList.length > 0) {
          console.log(`  📦 Transactions: ${txList.length}`);
          for (const txBuf of txList) {
            try {
              const tx = new Transaction(Buffer.from(txBuf));
              const isOurs = broadcastTxid && tx.hash === broadcastTxid;
              console.log(`    TX: ${tx.hash}${isOurs ? ' *** OUR TX ***' : ''}`);
              if (isOurs) txDetected = true;
            } catch (e) {
              console.log(`    TX parse error: ${e.message}`);
            }
          }
        } else {
          console.log(`  📦 Transactions: (empty or null txList)`);
        }
      } else {
        console.log(`  📦 Transactions: null`);
      }
    }

    // Check MerkleBlock
    if (hasRawMerkle) {
      const rawMerkle = msg.getRawMerkleBlock();
      if (rawMerkle) {
        try {
          const mb = new dashcore.MerkleBlock(Buffer.from(rawMerkle));
          const txids = mb.hashes.map((h) => {
            const buf = Buffer.from(String(h), 'hex');
            return buf.reverse().toString('hex');
          });
          console.log(`  📦 MerkleBlock: ${txids.length} txids`);
          for (const txid of txids) {
            const isOurs = broadcastTxid && txid === broadcastTxid;
            console.log(`    MB TX: ${txid}${isOurs ? ' *** OUR TX ***' : ''}`);
          }
        } catch (e) {
          console.log(`  📦 MerkleBlock parse error: ${e.message}`);
        }
      } else {
        console.log(`  📦 MerkleBlock: null`);
      }
    }

    // Check InstantSendLockMessages
    if (hasISLock) {
      const isLockMessages = msg.getInstantSendLockMessages();
      if (isLockMessages) {
        const lockList = typeof isLockMessages.getMessagesList === 'function'
          ? isLockMessages.getMessagesList()
          : (Array.isArray(isLockMessages) ? isLockMessages : null);

        if (lockList && lockList.length > 0) {
          console.log(`  🔒 InstantLock messages: ${lockList.length}`);
          for (const lockBuf of lockList) {
            try {
              const lock = InstantLock.fromBuffer(Buffer.from(lockBuf));
              const lockTxid = lock.txid.toString('hex');
              const lockHex = Buffer.from(lockBuf).toString('hex');
              const isOurs = broadcastTxid && lockTxid === broadcastTxid;
              console.log(`    IS TX: ${lockTxid}${isOurs ? ' *** OUR TX ***' : ''}`);
              console.log(`    IS HEX: ${lockHex.substring(0, 64)}... (${lockHex.length} chars)`);
              if (isOurs) isDetected = true;
            } catch (e) {
              console.log(`    IS parse error: ${e.message}`);
            }
          }
        } else {
          console.log(`  🔒 InstantLock messages: ${lockList === null ? 'null list' : 'empty list'}`);
        }
      } else {
        console.log(`  🔒 InstantLock messages: null (getInstantSendLockMessages() returned null)`);
      }
    }
  });

  rawStream.on('end', () => {
    console.log(`\n${elapsed()} [STREAM END]`);
  });

  rawStream.on('error', (err) => {
    console.log(`\n${elapsed()} [STREAM ERROR] ${err.code}: ${err.message}`);
  });

  // 5. Wait for initial data, then broadcast
  console.log(`\n${elapsed()} Waiting 3s for initial stream data...`);
  await sleep(3000);

  console.log(`\n${elapsed()} Broadcasting consolidation tx to ${TEST_ADDRESS}...`);
  const result = await broadcaster.sendToAddress(TEST_ADDRESS, 1);
  broadcastTxid = result.txid;
  console.log(`${elapsed()} ✅ Broadcast: txid=${broadcastTxid}`);
  console.log(`${elapsed()}    Amount: ${result.amount} DASH`);

  // 6. Wait and observe stream
  console.log(`\n${elapsed()} Waiting 30s for stream to deliver tx and IS...`);

  // Poll every 2s to show progress
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    console.log(`${elapsed()} ... msgs=${msgCount}, txDetected=${txDetected}, isDetected=${isDetected}`);
    if (txDetected && isDetected) {
      console.log(`\n${elapsed()} ✅ SUCCESS: Both tx and IS detected on stream!`);
      break;
    }
  }

  // 7. Check IS via polling (getTransaction)
  console.log(`\n${elapsed()} Checking IS via getTransaction() poll...`);
  try {
    const txInfo = await rpc.getTransaction(broadcastTxid);
    console.log(`${elapsed()} getTransaction result:`);
    console.log(`  instantlock: ${txInfo.instantlock}`);
    console.log(`  confirmations: ${txInfo.confirmations}`);
    console.log(`  chainlock: ${txInfo.chainlock}`);
  } catch (e) {
    console.log(`${elapsed()} getTransaction error: ${e.message}`);
  }

  // 8. Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Stream messages received: ${msgCount}`);
  console.log(`Transaction detected on stream: ${txDetected ? 'YES' : 'NO'}`);
  console.log(`InstantLock detected on stream: ${isDetected ? 'YES' : 'NO'}`);
  console.log(`Broadcast txid: ${broadcastTxid}`);

  if (!txDetected) {
    console.log('\n❌ PROBLEM: Stream did not deliver our transaction');
    console.log('   Possible causes:');
    console.log('   1. DAPI node did not receive tx via P2P in time');
    console.log('   2. Bloom filter not matching (unlikely if address is correct)');
    console.log('   3. Stream connected to a stale/unhealthy DAPI node');
    console.log('   4. Stream ended/stalled after initial data');
  }

  if (txDetected && !isDetected) {
    console.log('\n❌ PROBLEM: Stream delivered tx but NOT InstantLock');
    console.log('   Possible causes:');
    console.log('   1. IS lock happened before stream was ready');
    console.log('   2. DAPI node did not relay IS ZMQ event to stream');
  }

  if (txDetected && isDetected) {
    console.log('\n✅ SUCCESS: Stream delivered both tx and InstantLock');
  }

  // Cleanup
  if (typeof rawStream.cancel === 'function') {
    try { rawStream.cancel(); } catch (_) {}
  }
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
