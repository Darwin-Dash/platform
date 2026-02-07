/**
 * Real Testnet UTXO Finding Tests
 *
 * These tests connect to the real Dash testnet to find UTXOs.
 * Uses dynamic block height scanning instead of a fixed START_HEIGHT:
 *   - If a previous run saved state (.test-state.json), scans from there
 *   - Otherwise scans the last ~500 blocks from current height
 *
 * Environment variables (from js-evo-sdk/.env):
 *   TESTNET_ADDRESS - Address to scan for UTXOs
 *   NETWORK         - Network (testnet/mainnet)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import DAPIClient from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode } from '../../src/index.js';
import { config } from 'dotenv';
import { getDAPIClientOptions } from '../helpers/dapi-config.js';
import { loadTestState, saveTestState, getOptimalStartHeight } from '../helpers/test-state.js';
import type { TestState } from '../helpers/test-state.js';

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const NETWORK = process.env.NETWORK || 'testnet';

describe('Testnet UTXO Finding', () => {
  let dapiClient: DAPIClient;
  let currentHeight: number;
  let startHeight: number;
  let testState: TestState;

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Testnet UTXO Finding Test');
    console.log('========================================');
    console.log(`Address: ${TEST_ADDRESS}`);
    console.log(`Network: ${NETWORK}`);

    dapiClient = new DAPIClient(getDAPIClientOptions(NETWORK as 'testnet' | 'mainnet'));

    // Get current height via DAPI
    const status = await dapiClient.core.getBlockchainStatus();
    currentHeight = status.chain?.blocksCount || status.blocks;
    console.log(`Current blockchain height: ${currentHeight}`);

    // Load persisted state and calculate optimal start height
    testState = loadTestState();
    const envStartHeight = parseInt(process.env.START_HEIGHT || '0', 10);
    startHeight = getOptimalStartHeight(currentHeight, envStartHeight, testState);

    console.log(`Scan range: ${startHeight} -> ${currentHeight} (${currentHeight - startHeight} blocks)`);
    console.log('');
  });

  afterAll(() => {
    // DAPIClient doesn't have disconnect method
  });

  it('should find the latest spendable UTXO', async () => {
    const finder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [TEST_ADDRESS],
      dapiClient: dapiClient as any,
      fromHeight: startHeight,
      toHeight: currentHeight,
      requiredAmount: 10000, // Minimum 10000 duffs
      onProgress: (progress) => {
        if (Math.floor(progress.progress) % 10 === 0) {
          process.stdout.write(`\rProgress: ${progress.progress.toFixed(1)}%`);
        }
      },
    });

    console.log('Finding latest spendable UTXO...');
    const startTime = Date.now();

    const latestUTXO = await finder.findLatestSpendableUTXO();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('========================================');
    console.log('UTXO FOUND!');
    console.log('========================================');
    console.log(`TxID:         ${latestUTXO.txId}`);
    console.log(`Vout:         ${latestUTXO.vout}`);
    console.log(`Amount:       ${latestUTXO.satoshis} duffs (${(latestUTXO.satoshis / 100000000).toFixed(8)} DASH)`);
    console.log(`Address:      ${latestUTXO.address}`);
    console.log(`Block Height: ${latestUTXO.blockHeight}`);
    console.log(`Duration:     ${duration}s`);
    console.log('========================================');

    // Persist state for next run
    testState.lastTxBlockHeight = latestUTXO.blockHeight;
    testState.lastUtxo = {
      txId: latestUTXO.txId,
      vout: latestUTXO.vout,
      satoshis: latestUTXO.satoshis,
      script: latestUTXO.script || '',
      address: latestUTXO.address,
      blockHeight: latestUTXO.blockHeight,
    };
    saveTestState(testState);
    console.log('[state] Saved scan state for next run');

    expect(latestUTXO).toBeDefined();
    expect(latestUTXO.txId).toBeDefined();
    expect(latestUTXO.satoshis).toBeGreaterThan(0);
    expect(latestUTXO.address).toBe(TEST_ADDRESS);
  }, 300000); // 5 minute timeout

  it('should find all UTXOs for the address', async () => {
    const finder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: NETWORK as 'testnet' | 'mainnet',
      addresses: [TEST_ADDRESS],
      dapiClient: dapiClient as any,
      fromHeight: startHeight,
      toHeight: currentHeight,
      onProgress: (progress) => {
        if (Math.floor(progress.progress) % 10 === 0) {
          process.stdout.write(`\rProgress: ${progress.progress.toFixed(1)}%`);
        }
      },
    });

    console.log('Finding all UTXOs...');
    const startTime = Date.now();

    const utxos = await finder.findUTXOs();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('========================================');
    console.log(`Found ${utxos.length} UTXO(s)`);
    console.log('========================================');

    for (const utxo of utxos) {
      console.log(`  - ${utxo.satoshis} duffs at block ${utxo.blockHeight}`);
      console.log(`    TxID: ${utxo.txId}`);

      // Update state with the highest block height we've seen
      if (utxo.blockHeight > testState.lastTxBlockHeight) {
        testState.lastTxBlockHeight = utxo.blockHeight;
      }
    }

    // Persist updated state
    saveTestState(testState);

    console.log(`Duration: ${duration}s`);
    console.log('========================================');

    expect(utxos).toBeDefined();
    expect(Array.isArray(utxos)).toBe(true);
  }, 300000); // 5 minute timeout
});
