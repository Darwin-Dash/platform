/**
 * Send transaction only (no monitoring)
 *
 * Tests the RPC transaction broadcasting using exact consolidation pattern.
 * Does NOT monitor for confirmations - just broadcasts and exits.
 *
 * Usage:
 *   NETWORK=testnet node tests/send-transaction.js
 */

import { DashRpcClient, TransactionBroadcaster } from '../dist/index.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const NETWORK = process.env.NETWORK || 'testnet';

// RPC configuration
const RPC_CONFIG = {
  testnet: {
    network: 'testnet',
    url: process.env.TESTNET_RPC_URL || 'http://localhost:19998',
    user: process.env.TESTNET_RPC_USER || 'dash',
    pass: process.env.TESTNET_RPC_PASS || 'dash',
    wallet: process.env.TESTNET_WALLET || 'platformcli',
  },
  mainnet: {
    network: 'mainnet',
    url: process.env.MAINNET_RPC_URL || 'http://localhost:9998',
    user: process.env.MAINNET_RPC_USER || 'dash',
    pass: process.env.MAINNET_RPC_PASS || '',
    wallet: process.env.MAINNET_WALLET || 'main_wallet',
  },
};

async function sendTransactionOnly() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('📡 RPC Transaction Broadcaster Test (Send Only)');
  console.log('═'.repeat(70));
  console.log(`Network: ${NETWORK}`);
  console.log('Pattern: UTXO Consolidation (all funds → same address, fixed fee 0.00001 DASH)');
  console.log('');

  // Get RPC config for network
  const rpcConfig = RPC_CONFIG[NETWORK];
  if (!rpcConfig) {
    console.error(`❌ Invalid network: ${NETWORK}`);
    process.exit(1);
  }

  if (!rpcConfig.pass) {
    console.error('❌ RPC password not configured');
    console.error(`   Set ${NETWORK.toUpperCase()}_RPC_PASS environment variable`);
    process.exit(1);
  }

  // Initialize RPC client
  console.log('🔌 Connecting to Dash Core RPC...');
  const rpcClient = new DashRpcClient(rpcConfig);
  const broadcaster = new TransactionBroadcaster(rpcClient);

  // Test RPC connection
  try {
    const connected = await rpcClient.testConnection();
    if (!connected) {
      throw new Error('RPC connection test failed');
    }

    const height = await rpcClient.getBlockCount();
    const balance = await rpcClient.getBalance();

    console.log(`✅ Connected to ${NETWORK} at height ${height}`);
    console.log(`   Wallet: ${rpcConfig.wallet || '(default)'}`);
    console.log(`   Balance: ${balance.toFixed(8)} DASH`);
    console.log('');

    // Check balance
    const minRequired = 0.00001; // Just the fee
    if (balance < minRequired) {
      throw new Error(
        `Insufficient balance: ${balance} DASH (need at least ${minRequired} DASH for fee)`
      );
    }
  } catch (error) {
    console.error('❌ RPC connection failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error(`1. Ensure Dash Core is running: dashd ${NETWORK === 'testnet' ? '-testnet' : ''}`);
    console.error(`2. Check RPC credentials in .env file`);
    console.error(`3. Verify wallet is loaded: dash-cli ${NETWORK === 'testnet' ? '-testnet' : ''} listwallets`);
    process.exit(1);
  }

  // Use address from environment or get new one
  let testAddress = process.env.TESTNET_ADDRESS || process.env.MAINNET_ADDRESS;

  if (!testAddress) {
    console.log('📬 Generating new address for test...');
    try {
      testAddress = await broadcaster.getNewAddress('tx_test');
      console.log(`   Address: ${testAddress}`);
    } catch (error) {
      console.error('❌ Failed to generate new address:', error.message);
      console.error('   Set TESTNET_ADDRESS or MAINNET_ADDRESS in .env file instead');
      process.exit(1);
    }
  } else {
    console.log('📬 Using address from environment:');
    console.log(`   Address: ${testAddress}`);
  }
  console.log('');

  // Get UTXOs for this address
  console.log('🔍 Checking for UTXOs...');
  const utxos = await broadcaster.listUnspent(0, 9999999, [testAddress]);
  console.log(`   Found: ${utxos.length} UTXO(s)`);

  if (utxos.length === 0) {
    console.log('');
    console.log('⚠️  No UTXOs available for this address');
    console.log('   You need to send some testnet DASH to this address first:');
    console.log('');
    console.log(`   dash-cli ${NETWORK === 'testnet' ? '-testnet' : ''} sendtoaddress "${testAddress}" 0.01`);
    console.log('');
    console.log('   Or use the testnet faucet: https://testnet-faucet.dash.org');
    console.log('');
    process.exit(0);
  }

  const totalInput = utxos.reduce((sum, u) => sum + u.amount, 0);
  console.log(`   Total: ${totalInput.toFixed(8)} DASH`);
  console.log('');

  // Broadcast transaction using consolidation pattern
  console.log('📡 Broadcasting consolidation transaction...');
  console.log('   (All UTXOs → single output to same address, no change)');
  console.log('');

  try {
    const startTime = Date.now();

    // Consolidation: all funds back to same address
    const result = await broadcaster.sendToAddress(testAddress);

    const elapsedMs = Date.now() - startTime;

    console.log('✅ Transaction broadcast successful!');
    console.log('');
    console.log('Transaction Details:');
    console.log(`   TXID: ${result.txid}`);
    console.log(`   Amount: ${result.amount} DASH`);
    console.log(`   Fee: 0.00001 DASH (fixed)`);
    console.log(`   Inputs: ${utxos.length} UTXO(s)`);
    console.log(`   Outputs: 1 (consolidation to same address)`);
    console.log(`   Broadcast time: ${elapsedMs} ms`);
    console.log('');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Next steps:');
    console.log(`1. View transaction: https://${NETWORK === 'testnet' ? 'testnet-' : ''}insight.dashevo.org/insight/tx/${result.txid}`);
    console.log(`2. Monitor for InstantLock (should arrive in 1-3 seconds)`);
    console.log(`3. Monitor for ChainLock (should arrive in 1-3 minutes)`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Transaction broadcast failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

sendTransactionOnly().catch((error) => {
  console.error('');
  console.error('❌ Test error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
