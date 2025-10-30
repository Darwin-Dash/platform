#!/usr/bin/env node

/**
 * Diagnostic script to test UTXO metadata extraction
 *
 * This script tests a known testnet address with transactions
 * and outputs detailed diagnostics about metadata extraction.
 */

const DAPIClient = require('@dashevo/dapi-client');
const { UTXOFinder } = require('../lib/index.js');
require('dotenv').config();

// Test configuration from environment
const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const NETWORK = 'testnet';
const START_HEIGHT = parseInt(process.env.START_HEIGHT || '1353325', 10);

async function main() {
  console.log('=== UTXO Metadata Extraction Diagnostic ===\n');

  // Initialize DAPI client
  const dapiClient = new DAPIClient({
    network: NETWORK,
    timeout: 60000,
  });

  console.log('Initialized DAPI client\n');

  // Get current blockchain height
  console.log('Fetching current blockchain status...');
  const status = await dapiClient.core.getBlockchainStatus();
  const currentHeight = status?.chain?.blocksCount || status?.blocks || 0;

  if (currentHeight === 0) {
    console.error('❌ Could not determine current blockchain height');
    process.exit(1);
  }

  const fromHeight = START_HEIGHT;
  const toHeight = currentHeight;

  console.log('\nConfiguration:');
  console.log(`  Network: ${NETWORK}`);
  console.log(`  Test Address: ${TEST_ADDRESS}`);
  console.log(`  Current Chain Height: ${currentHeight}`);
  console.log(`  Scan From Block: ${fromHeight}`);
  console.log(`  Scan To Block: ${toHeight}`);
  console.log(`  Block Range: ${toHeight - fromHeight} blocks\n`);

  // Initialize UTXO finder
  const utxoFinder = new UTXOFinder(dapiClient, NETWORK);

  console.log('=== Starting UTXO Discovery ===\n');

  try {
    // Find UTXOs with detailed logging enabled
    const utxos = await utxoFinder.findAllUTXOs(
      [TEST_ADDRESS],
      {
        fromHeight: fromHeight,
        toHeight: toHeight,
        onProgress: (progress) => {
          console.log(`\nProgress: ${progress.progress.toFixed(1)}% (${progress.syncedBlocks}/${progress.totalBlocks} blocks)`);
        }
      }
    );

    console.log('\n=== Discovery Complete ===\n');
    console.log(`Total UTXOs found: ${utxos.length}\n`);

    // Analyze each UTXO
    utxos.forEach((utxo, index) => {
      console.log(`\n--- UTXO ${index + 1}/${utxos.length} ---`);
      console.log(`  TX Hash: ${utxo.txId}`);
      console.log(`  Output Index: ${utxo.vout}`);
      console.log(`  Amount: ${utxo.satoshis} satoshis (${(utxo.satoshis / 1e8).toFixed(8)} DASH)`);
      console.log(`  Address: ${utxo.address}`);
      console.log(`  Script: ${utxo.script}`);
      console.log(`\n  Metadata:`);
      console.log(`    Block Height: ${utxo.blockHeight}`);
      console.log(`    Block Hash: ${utxo.blockHash || 'none'}`);
      console.log(`    Block Time: ${utxo.blockTime ? new Date(utxo.blockTime).toISOString() : 'none'}`);
      console.log(`    Chain Locked: ${utxo.isChainLocked}`);
      console.log(`    Instant Locked: ${utxo.isInstantLocked}`);
      console.log(`\n  Spendability:`);
      console.log(`    Block Height > 0: ${utxo.blockHeight > 0}`);
      console.log(`    Has Block Hash: ${!!utxo.blockHash}`);
      console.log(`    Has confirmations (height > 0): ${utxo.blockHeight > 0}`);

      // Identify potential issues
      const issues = [];
      if (utxo.blockHeight === 0) {
        issues.push('Block height is 0 (metadata not extracted)');
      }
      if (!utxo.blockHash) {
        issues.push('Block hash is missing');
      }
      if (!utxo.timestamp) {
        issues.push('Timestamp is missing');
      }
      if (utxo.confirmations === 0) {
        issues.push('No confirmations recorded');
      }

      if (issues.length > 0) {
        console.log(`\n  ⚠️  Issues Detected:`);
        issues.forEach(issue => console.log(`    - ${issue}`));
      } else {
        console.log(`\n  ✓ All metadata fields populated correctly`);
      }
    });

    // Summary statistics
    console.log('\n=== Summary Statistics ===\n');
    const withMetadata = utxos.filter(u => u.blockHeight > 0).length;
    const withoutMetadata = utxos.filter(u => u.blockHeight === 0).length;

    // Calculate spendability using same logic as LatestUTXOSelector
    const spendable = utxos.filter(u => {
      const hasConfirmations = u.blockHeight && u.blockHeight > 0;
      const isChainLocked = u.isChainLocked === true;
      const isInstantLocked = u.isInstantLocked === true;
      return hasConfirmations || isChainLocked || isInstantLocked;
    }).length;
    const unspendable = utxos.length - spendable;

    const chainLocked = utxos.filter(u => u.isChainLocked).length;
    const instantLocked = utxos.filter(u => u.isInstantLocked).length;

    console.log(`Total UTXOs: ${utxos.length}`);
    console.log(`With Metadata: ${withMetadata} (${((withMetadata / utxos.length) * 100).toFixed(1)}%)`);
    console.log(`Without Metadata: ${withoutMetadata} (${((withoutMetadata / utxos.length) * 100).toFixed(1)}%)`);
    console.log(`Spendable: ${spendable} (${((spendable / utxos.length) * 100).toFixed(1)}%)`);
    console.log(`Unspendable: ${unspendable} (${((unspendable / utxos.length) * 100).toFixed(1)}%)`);
    console.log(`Chain Locked: ${chainLocked}`);
    console.log(`Instant Locked: ${instantLocked}`);

    // Overall diagnostic result
    console.log('\n=== Diagnostic Result ===\n');
    if (utxos.length === 0) {
      console.log('❌ No UTXOs found - check if address has transactions in block range');
    } else if (withoutMetadata > 0) {
      console.log(`⚠️  ISSUE CONFIRMED: ${withoutMetadata} UTXOs missing metadata`);
      console.log('   This indicates the TransactionSyncer is not properly extracting metadata');
      console.log('   Review the logs above to identify the root cause:');
      console.log('   - Are merkle blocks being received?');
      console.log('   - Is getBlockHeight() succeeding?');
      console.log('   - Are transaction hashes matching correctly?');
    } else if (unspendable > 0) {
      console.log(`⚠️  ${unspendable} UTXOs marked as unspendable despite having metadata`);
      console.log('   Check confirmation requirements and chain/instant lock status');
    } else {
      console.log('✓ All UTXOs have complete metadata and are marked as spendable');
      console.log('  Metadata extraction is working correctly!');
    }

  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run diagnostic
main().catch((error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});
