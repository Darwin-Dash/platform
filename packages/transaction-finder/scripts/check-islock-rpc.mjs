#!/usr/bin/env node
/**
 * Check if getrawtransaction verbose returns IS lock proof data
 */
import { DashRpcClient } from '@dashevo/dash-rpc-client';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../../js-evo-sdk/.env') });

const rpc = new DashRpcClient({
  network: 'testnet',
  url: process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998',
  user: process.env.TESTNET_RPC_USERNAME || 'dashrpc',
  pass: process.env.TESTNET_RPC_PASSWORD,
  wallet: process.env.TESTNET_WALLET,
});

async function main() {
  // Get recent txids
  const recentTxs = await rpc.call('listtransactions', ['*', 3]);
  console.log('Recent transactions:');
  for (const tx of recentTxs) {
    console.log(`  ${tx.txid} - ${tx.category} - ${tx.amount}`);
  }

  // Check getrawtransaction verbose for the most recent
  const txid = recentTxs[recentTxs.length - 1].txid;
  console.log(`\nChecking getrawtransaction verbose for: ${txid}`);

  const result = await rpc.call('getrawtransaction', [txid, true]);
  console.log('\nAll keys:', Object.keys(result).sort().join(', '));

  // Show all lock-related fields
  for (const key of Object.keys(result).sort()) {
    if (key.toLowerCase().includes('lock') || key.toLowerCase().includes('proof') || key.toLowerCase().includes('instant')) {
      console.log(`\n${key}:`, JSON.stringify(result[key], null, 2).substring(0, 500));
    }
  }

  // Also try getTransaction (wallet RPC)
  console.log('\n\n--- wallet getTransaction ---');
  const walletTx = await rpc.call('gettransaction', [txid, true]);
  console.log('Keys:', Object.keys(walletTx).sort().join(', '));
  for (const key of Object.keys(walletTx).sort()) {
    if (key.toLowerCase().includes('lock') || key.toLowerCase().includes('proof') || key.toLowerCase().includes('instant')) {
      console.log(`\n${key}:`, JSON.stringify(walletTx[key], null, 2).substring(0, 500));
    }
  }

  // Check if there's a quorum/islock RPC
  console.log('\n\n--- Checking quorum islock RPC ---');
  try {
    const islockResult = await rpc.call('quorum', ['getrecsigshr', 104, txid]);
    console.log('quorum getrecsigshr result:', JSON.stringify(islockResult, null, 2).substring(0, 500));
  } catch (e) {
    console.log('quorum getrecsigshr error:', e.message);
  }

  // Try to get IS lock via verifyislock
  try {
    const verifyResult = await rpc.call('verifyislock', [txid]);
    console.log('verifyislock result:', JSON.stringify(verifyResult, null, 2));
  } catch (e) {
    console.log('verifyislock error:', e.message);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
