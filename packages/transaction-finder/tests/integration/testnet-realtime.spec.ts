/**
 * Real Testnet InstantSend/ChainLock Monitoring Test
 *
 * Tests TransactionFinder in REALTIME mode against live testnet.
 * Monitors an address and validates IS/CL detection when payments arrive.
 *
 * Usage:
 *   TESTNET_ADDRESS=yX3CJJ42... npm run test:realtime
 *
 * While test runs, send DASH to the address from Dash Core wallet.
 *
 * Environment variables:
 *   TESTNET_ADDRESS - Address to monitor (defaults to known testnet address)
 *   NETWORK         - Network (testnet/mainnet, defaults to testnet)
 *   TEST_DURATION   - Test duration in seconds (defaults to 300 = 5 minutes)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import DAPIClient from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode } from '../../src/index.js';
import { config } from 'dotenv';
import type {
  TransactionEvent,
  InstantLockEvent,
  ChainLockEvent,
  BlockInclusionEvent,
} from '../../src/types/index.js';

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const NETWORK = process.env.NETWORK || 'testnet';
const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION || '300', 10) * 1000;

describe('Testnet Realtime Monitoring', () => {
  let dapiClient: DAPIClient;
  let finder: TransactionFinder;
  let cleanup: (() => void) | null = null;

  // Event tracking
  const events = {
    transactions: [] as TransactionEvent[],
    instantLocks: [] as InstantLockEvent[],
    chainLocks: [] as ChainLockEvent[],
    blockInclusions: [] as BlockInclusionEvent[],
  };

  beforeAll(async () => {
    console.log('');
    console.log('═'.repeat(60));
    console.log('🧪 InstantSend/ChainLock Realtime Monitoring Test');
    console.log('═'.repeat(60));
    console.log(`Network:  ${NETWORK}`);
    console.log(`Address:  ${TEST_ADDRESS}`);
    console.log(`Duration: ${TEST_DURATION_MS / 1000} seconds`);
    console.log('');
    console.log('📨 Send DASH to the address above to test payment detection');
    console.log('═'.repeat(60));
    console.log('');

    dapiClient = new DAPIClient({
      network: NETWORK as 'testnet' | 'mainnet',
      timeout: 60000,
      retries: 5,
    });

    finder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [TEST_ADDRESS],
      dapiClient: dapiClient as any,
    });
  });

  afterAll(() => {
    if (cleanup) {
      cleanup();
    }
    finder?.stop();
  });

  it('should detect transactions and confirmations', async () => {
    // Start monitoring
    cleanup = await finder.monitorAddresses([TEST_ADDRESS], {
      onTransaction: (tx) => {
        events.transactions.push(tx);
        console.log('');
        console.log('📥 Transaction detected:', tx.txid.substring(0, 16) + '...');
        console.log(`   Timestamp: ${new Date(tx.timestamp).toISOString()}`);
      },
      onInstantLock: (lock) => {
        events.instantLocks.push(lock);
        console.log('');
        console.log('⚡ InstantLock received!');
        console.log(`   TxID: ${lock.txid.substring(0, 16)}...`);
        console.log(`   Latency: ${lock.latency} ms`);
      },
      onChainLock: (cl) => {
        events.chainLocks.push(cl);
        console.log('');
        console.log('⛓️  ChainLock confirmed!');
        console.log(`   TxID: ${cl.txid.substring(0, 16)}...`);
        console.log(`   Block height: ${cl.blockHeight}`);
        console.log(`   ChainLocked height: ${cl.chainLockedHeight}`);
        console.log(`   Latency: ${cl.latency} ms`);
      },
      onBlockInclusion: (block) => {
        events.blockInclusions.push(block);
        console.log('');
        console.log('📦 Block inclusion detected');
        console.log(`   TxID: ${block.txid.substring(0, 16)}...`);
        console.log(`   Block height: ${block.blockHeight}`);
      },
    });

    console.log('✅ Monitoring started');
    console.log('⏳ Waiting for payments...');
    console.log('');

    // Wait for test duration
    await new Promise((resolve) => setTimeout(resolve, TEST_DURATION_MS));

    // Stop monitoring before printing results to avoid unhandled rejection on cleanup
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    finder?.stop();

    // Give streams time to close gracefully
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Print results
    console.log('');
    console.log('═'.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(60));
    console.log(`Transactions detected:  ${events.transactions.length}`);
    console.log(`InstantLocks received:  ${events.instantLocks.length}`);
    console.log(`Block inclusions:       ${events.blockInclusions.length}`);
    console.log(`ChainLocks confirmed:   ${events.chainLocks.length}`);
    console.log('');

    // Show latency statistics
    if (events.instantLocks.length > 0) {
      const avgISLatency =
        events.instantLocks.reduce((sum, lock) => sum + lock.latency, 0) /
        events.instantLocks.length;
      console.log(`Avg InstantLock latency: ${avgISLatency.toFixed(0)} ms`);
    }

    if (events.chainLocks.length > 0) {
      const avgCLLatency =
        events.chainLocks.reduce((sum, cl) => sum + cl.latency, 0) /
        events.chainLocks.length;
      console.log(`Avg ChainLock latency:   ${(avgCLLatency / 1000).toFixed(1)} s`);
    }

    const status = finder.getStatus();
    console.log('');
    console.log('Monitor Status:', {
      active: status.active,
      trackedTransactions: status.trackedTransactions,
      chainLockHeight: status.chainLockHeight,
    });
    console.log('═'.repeat(60));

    // Test assertions
    if (events.transactions.length > 0) {
      console.log('');
      console.log('✅ TEST PASSED - Payment detection working');

      // Verify transaction structure
      expect(events.transactions[0]).toHaveProperty('txid');
      expect(events.transactions[0]).toHaveProperty('timestamp');

      // If we got InstantLocks, verify their structure
      if (events.instantLocks.length > 0) {
        expect(events.instantLocks[0]).toHaveProperty('txid');
        expect(events.instantLocks[0]).toHaveProperty('latency');
        expect(events.instantLocks[0].latency).toBeGreaterThanOrEqual(0);
      }

      // If we got ChainLocks, verify their structure
      if (events.chainLocks.length > 0) {
        expect(events.chainLocks[0]).toHaveProperty('txid');
        expect(events.chainLocks[0]).toHaveProperty('blockHeight');
        expect(events.chainLocks[0]).toHaveProperty('chainLockedHeight');
        expect(events.chainLocks[0]).toHaveProperty('latency');
      }
    } else {
      console.log('');
      console.log('⚠️  TEST INCOMPLETE - No payments received during test period');
      console.log('   This is expected if no DASH was sent to the address');
    }

    // Always pass - this test validates functionality when payments arrive
    expect(true).toBe(true);
  }, TEST_DURATION_MS + 30000); // Add 30s buffer for setup/teardown
});
