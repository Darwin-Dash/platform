/**
 * Real Testnet UTXO Finding Tests
 *
 * These tests connect to the real Dash testnet to find UTXOs.
 * Uses standard DAPIClient (not ResilientDAPIClient).
 *
 * Environment variables (from js-evo-sdk/.env):
 *   TESTNET_ADDRESS - Address to scan for UTXOs
 *   START_HEIGHT    - Block height to start scanning from
 *   NETWORK         - Network (testnet/mainnet)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import DAPIClient from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode } from '../../src/index.js';
import { config } from 'dotenv';

// Load .env from js-evo-sdk
config({ path: '../js-evo-sdk/.env' });

const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const START_HEIGHT = parseInt(process.env.START_HEIGHT || '1363870', 10);
const NETWORK = process.env.NETWORK || 'testnet';

describe('Testnet UTXO Finding', () => {
  let dapiClient: DAPIClient;
  let currentHeight: number;

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Testnet UTXO Finding Test');
    console.log('========================================');
    console.log(`Address: ${TEST_ADDRESS}`);
    console.log(`Start Height: ${START_HEIGHT}`);
    console.log(`Network: ${NETWORK}`);
    console.log('');

    dapiClient = new DAPIClient({
      network: NETWORK as 'testnet' | 'mainnet',
      timeout: 30000,
      retries: 3,
    });

    // Get current height
    const status = await dapiClient.core.getBlockchainStatus();
    currentHeight = status.chain?.blocksCount || status.blocks;
    console.log(`Current blockchain height: ${currentHeight}`);
    console.log(`Will scan ${currentHeight - START_HEIGHT} blocks`);
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
      fromHeight: START_HEIGHT,
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
      fromHeight: START_HEIGHT,
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
    }

    console.log(`Duration: ${duration}s`);
    console.log('========================================');

    expect(utxos).toBeDefined();
    expect(Array.isArray(utxos)).toBe(true);
  }, 300000); // 5 minute timeout
});
