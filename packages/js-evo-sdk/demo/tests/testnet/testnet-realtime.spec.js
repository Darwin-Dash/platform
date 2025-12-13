/**
 * Real Testnet InstantSend/ChainLock Monitoring Test (Manual)
 *
 * Monitors a testnet address for incoming transactions.
 * User must send DASH during the test to trigger IS/CL events.
 *
 * Environment variables (from .env):
 *   TESTNET_ADDRESS - Address to monitor
 *   NETWORK         - Network (testnet/mainnet)
 *
 * Usage:
 *   npm run test:testnet:realtime
 *
 * During test:
 *   - Send testnet DASH to the displayed address
 *   - Watch for InstantLock and ChainLock confirmations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import {
  TransactionFinderService,
  resetTransactionFinderService
} from '../../services/transaction-finder-service.js';

// Load .env
config({ path: '.env' });
config({ path: '../js-evo-sdk/.env' });

// Configuration
const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const NETWORK = process.env.NETWORK || 'testnet';
const MONITOR_DURATION_MS = 300000; // 5 minutes

describe('Testnet Realtime Monitoring (Manual)', () => {
  let service;
  let cleanup;

  // Event tracking
  const events = {
    transactions: [],
    instantLocks: [],
    chainLocks: []
  };

  // Timing
  const timestamps = {
    monitorStart: 0,
    txDetected: 0,
    instantLock: 0,
    chainLock: 0
  };

  beforeAll(async () => {
    console.log('');
    console.log('='.repeat(70));
    console.log('Manual InstantSend/ChainLock Monitoring Test');
    console.log('='.repeat(70));
    console.log('');
    console.log('INSTRUCTIONS:');
    console.log('1. Send testnet DASH to the address below during this test');
    console.log('2. The test will detect the transaction and confirmations');
    console.log('3. Test duration: 5 minutes');
    console.log('');
    console.log(`ADDRESS TO FUND: ${TEST_ADDRESS}`);
    console.log('');
    console.log('Use Dash testnet faucet or another wallet to send DASH.');
    console.log('='.repeat(70));
    console.log('');

    // Reset and create service in REAL mode
    resetTransactionFinderService();
    service = new TransactionFinderService({
      useMockMode: false,
      network: NETWORK
    });

    await service.initialize();
    console.log('Service initialized, starting monitoring...');
  });

  afterAll(() => {
    if (cleanup) {
      cleanup();
    }
    if (service) {
      service.stop();
    }
    resetTransactionFinderService();
  });

  it('should monitor address for InstantSend and ChainLock', async () => {
    timestamps.monitorStart = Date.now();

    // Start monitoring
    cleanup = await service.monitorAddress(TEST_ADDRESS, {
      onTransaction: (tx) => {
        timestamps.txDetected = Date.now();
        events.transactions.push(tx);

        console.log('');
        console.log('='.repeat(50));
        console.log('TRANSACTION DETECTED!');
        console.log('='.repeat(50));
        console.log(`  TxID: ${tx.txid}`);
        console.log(`  Latency: ${timestamps.txDetected - timestamps.monitorStart}ms since monitoring started`);
        console.log('');
      },

      onInstantLock: (lock) => {
        timestamps.instantLock = Date.now();
        events.instantLocks.push(lock);

        console.log('');
        console.log('='.repeat(50));
        console.log('INSTANTLOCK CONFIRMED!');
        console.log('='.repeat(50));
        console.log(`  TxID: ${lock.txid}`);
        console.log(`  Latency: ${lock.latency || 'N/A'}ms`);
        if (timestamps.txDetected) {
          console.log(`  Time since TX: ${timestamps.instantLock - timestamps.txDetected}ms`);
        }
        console.log('');
      },

      onChainLock: (cl) => {
        timestamps.chainLock = Date.now();
        events.chainLocks.push(cl);

        console.log('');
        console.log('='.repeat(50));
        console.log('CHAINLOCK CONFIRMED!');
        console.log('='.repeat(50));
        console.log(`  TxID: ${cl.txid}`);
        console.log(`  Block Height: ${cl.blockHeight}`);
        console.log(`  Latency: ${cl.latency || 'N/A'}ms`);
        if (timestamps.txDetected) {
          const totalTime = (timestamps.chainLock - timestamps.txDetected) / 1000;
          console.log(`  Total TX → CL time: ${totalTime.toFixed(1)}s`);
        }
        console.log('');
      }
    });

    console.log('Monitoring started. Waiting for transactions...');
    console.log(`Will monitor for ${MONITOR_DURATION_MS / 1000} seconds.`);
    console.log('');

    // Wait for monitoring duration
    await new Promise(resolve => setTimeout(resolve, MONITOR_DURATION_MS));

    // Print results
    console.log('');
    console.log('='.repeat(70));
    console.log('MONITORING RESULTS');
    console.log('='.repeat(70));
    console.log(`Transactions detected: ${events.transactions.length}`);
    console.log(`InstantLocks received: ${events.instantLocks.length}`);
    console.log(`ChainLocks received:   ${events.chainLocks.length}`);

    if (events.transactions.length > 0) {
      console.log('');
      console.log('Detected Transaction IDs:');
      events.transactions.forEach(tx => {
        console.log(`  - ${tx.txid}`);
      });
    }

    if (timestamps.txDetected && timestamps.instantLock) {
      console.log('');
      console.log('Latency Metrics:');
      console.log(`  TX Detection: ${timestamps.txDetected - timestamps.monitorStart}ms`);
      console.log(`  TX → InstantLock: ${timestamps.instantLock - timestamps.txDetected}ms`);
      if (timestamps.chainLock) {
        console.log(`  TX → ChainLock: ${((timestamps.chainLock - timestamps.txDetected) / 1000).toFixed(1)}s`);
      }
    }
    console.log('='.repeat(70));

    // Assertions - test passes whether or not transactions were received
    // (user may not have sent any during the test)
    expect(service.isInitialized).toBe(true);

    if (events.transactions.length > 0) {
      // If we got transactions, verify they have proper structure
      expect(events.transactions[0].txid).toBeDefined();

      // InstantLock should have been received for any transaction
      if (events.instantLocks.length > 0) {
        expect(events.instantLocks[0].txid).toBe(events.transactions[0].txid);
      }
    } else {
      console.log('');
      console.log('No transactions detected during monitoring period.');
      console.log('This is expected if no DASH was sent to the test address.');
    }
  }, MONITOR_DURATION_MS + 60000); // Add buffer for setup/teardown
});
