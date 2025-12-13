/**
 * Real Testnet UTXO Finding Tests
 *
 * Tests TransactionFinderService in REAL mode against Dash testnet.
 * Finds actual UTXOs for the configured test wallet address.
 *
 * Environment variables (from .env):
 *   TESTNET_ADDRESS - Address to scan for UTXOs
 *   START_HEIGHT    - Block height to start scanning from
 *   NETWORK         - Network (testnet/mainnet)
 *
 * Usage:
 *   npm run test:testnet:utxo
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import {
  TransactionFinderService,
  resetTransactionFinderService
} from '../../services/transaction-finder-service.js';

// Load .env from demo folder
config({ path: '.env' });

// Also try loading from js-evo-sdk as fallback
config({ path: '../js-evo-sdk/.env' });

// Configuration
const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const START_HEIGHT = parseInt(process.env.START_HEIGHT || '1380190', 10);
const NETWORK = process.env.NETWORK || 'testnet';
const TIMEOUT_MS = 300000; // 5 minutes

describe('Testnet UTXO Finding', () => {
  let service;
  let currentHeight;

  beforeAll(async () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('Real Testnet UTXO Finding Test');
    console.log('='.repeat(60));
    console.log(`Address: ${TEST_ADDRESS}`);
    console.log(`Start Height: ${START_HEIGHT}`);
    console.log(`Network: ${NETWORK}`);
    console.log('');

    // Reset any existing singleton
    resetTransactionFinderService();

    // Create service in REAL mode
    service = new TransactionFinderService({
      useMockMode: false,
      network: NETWORK
    });

    // Initialize and get current height
    await service.initialize();
    currentHeight = await service.getCurrentBlockHeight();

    console.log(`Current blockchain height: ${currentHeight}`);
    console.log(`Will scan ${currentHeight - START_HEIGHT} blocks`);
    console.log('');
  });

  afterAll(() => {
    if (service) {
      service.stop();
    }
    resetTransactionFinderService();
  });

  it('should connect to testnet DAPI', async () => {
    expect(service.isInitialized).toBe(true);
    expect(service.dapiClient).toBeDefined();
    expect(currentHeight).toBeGreaterThan(0);
  });

  it('should get current block height', async () => {
    const height = await service.getCurrentBlockHeight();
    expect(height).toBeGreaterThan(1000000); // Testnet has many blocks
    console.log(`Current height: ${height}`);
  });

  it('should find UTXOs for test address with hour timeframe', async () => {
    const progressUpdates = [];

    service.on('scan-progress', (progress) => {
      progressUpdates.push(progress);
      if (Math.floor(progress.progress) % 20 === 0) {
        process.stdout.write(`\rProgress: ${progress.progress.toFixed(1)}%`);
      }
    });

    console.log('Finding UTXOs with hour timeframe...');
    const startTime = Date.now();

    const utxos = await service.findUTXOs([TEST_ADDRESS], {
      timeframe: 'hour'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('='.repeat(60));
    console.log(`Found ${utxos.length} UTXO(s) in ${duration}s`);
    console.log('='.repeat(60));

    for (const utxo of utxos) {
      console.log(`  TxID: ${utxo.txId}`);
      console.log(`  Vout: ${utxo.vout}`);
      console.log(`  Amount: ${utxo.satoshis} duffs (${(utxo.satoshis / 100000000).toFixed(8)} DASH)`);
      console.log(`  Block: ${utxo.blockHeight}`);
      console.log('');
    }

    // Assertions
    expect(Array.isArray(utxos)).toBe(true);
    expect(progressUpdates.length).toBeGreaterThan(0);

    // If UTXOs found, verify structure
    if (utxos.length > 0) {
      expect(utxos[0].txId).toBeDefined();
      expect(utxos[0].satoshis).toBeGreaterThan(0);
      expect(utxos[0].address).toBe(TEST_ADDRESS);
    }
  }, TIMEOUT_MS);

  it('should find UTXOs with day timeframe (more blocks)', async () => {
    console.log('Finding UTXOs with day timeframe...');
    const startTime = Date.now();

    const utxos = await service.findUTXOs([TEST_ADDRESS], {
      timeframe: 'day',
      onProgress: (p) => {
        if (Math.floor(p.progress) % 25 === 0) {
          process.stdout.write(`\rProgress: ${p.progress.toFixed(1)}%`);
        }
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nFound ${utxos.length} UTXO(s) in ${duration}s`);

    expect(Array.isArray(utxos)).toBe(true);
  }, TIMEOUT_MS);

  it('should calculate total balance from UTXOs', async () => {
    const utxos = await service.findUTXOs([TEST_ADDRESS], {
      timeframe: 'hour'
    });

    const balance = service.calculateBalance(utxos);
    const formatted = service.formatBalance(balance);
    const validation = service.validateBalance(balance);

    console.log('');
    console.log('Balance Summary:');
    console.log(`  Total: ${formatted}`);
    console.log(`  Valid: ${validation.valid}`);
    console.log(`  Status: ${validation.message}`);

    expect(typeof balance).toBe('number');
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(formatted).toContain('DASH');
  }, TIMEOUT_MS);

  it('should find latest spendable UTXO', async () => {
    console.log('Finding latest spendable UTXO...');

    const latestUTXO = await service.findLatestSpendableUTXO([TEST_ADDRESS], {
      timeframe: 'hour'
    });

    if (latestUTXO) {
      console.log('');
      console.log('Latest Spendable UTXO:');
      console.log(`  TxID: ${latestUTXO.txId}`);
      console.log(`  Amount: ${service.formatBalance(latestUTXO.satoshis)}`);
      console.log(`  Block: ${latestUTXO.blockHeight}`);

      expect(latestUTXO.txId).toBeDefined();
      expect(latestUTXO.satoshis).toBeGreaterThan(0);
    } else {
      console.log('No spendable UTXOs found');
    }
  }, TIMEOUT_MS);
});
