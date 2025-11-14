#!/usr/bin/env node

/**
 * Check testnet address for UTXOs using RPC
 * This will prove whether the address has transactions in our scan range
 */

const http = require('http');

const TEST_ADDRESS = process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
const RPC_ENDPOINT = process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:19998';
const RPC_USERNAME = process.env.TESTNET_RPC_USERNAME || 'dash';
const RPC_PASSWORD = process.env.TESTNET_RPC_PASSWORD || 'dash';
const WALLET_NAME = 'platformcli'; // Required wallet for RPC calls

console.log('=== Testnet Address RPC Check ===\n');
console.log(`Address: ${TEST_ADDRESS}`);
console.log(`RPC Endpoint: ${RPC_ENDPOINT}\n`);

/**
 * Make RPC call to testnet node
 * @param {string} method - RPC method name
 * @param {Array} params - RPC method parameters
 * @param {boolean} useWallet - Whether to use wallet endpoint
 */
async function rpcCall(method, params = [], useWallet = false) {
  const url = new URL(RPC_ENDPOINT);

  const postData = JSON.stringify({
    jsonrpc: '2.0',
    id: 'check-address',
    method,
    params,
  });

  const auth = Buffer.from(`${RPC_USERNAME}:${RPC_PASSWORD}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || 19998,
      path: useWallet ? `/wallet/${WALLET_NAME}` : '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Basic ${auth}`,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(`RPC Error: ${JSON.stringify(response.error)}`));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(new Error(`Failed to parse RPC response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`HTTP request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  try {
    // Get blockchain height
    console.log('Fetching blockchain status...');
    const blockchainInfo = await rpcCall('getblockchaininfo');
    const currentHeight = blockchainInfo.blocks;
    console.log(`Current chain height: ${currentHeight}\n`);

    // Get UTXOs for the address using listunspent with wallet endpoint
    console.log(`Fetching UTXOs from wallet '${WALLET_NAME}'...\n`);

    const utxos = await rpcCall('listunspent', [0, 9999999, [TEST_ADDRESS]], true);

    console.log(`Found ${utxos.length} UTXOs\n`);

    if (utxos.length === 0) {
      console.log('❌ NO UTXOs FOUND for this address!');
      console.log('This confirms the address has no spendable transactions.\n');
      return;
    }

    // Analyze UTXOs
    utxos.forEach((utxo, index) => {
      console.log(`UTXO ${index + 1}:`);
      console.log(`  txid: ${utxo.txid}`);
      console.log(`  vout: ${utxo.vout}`);
      console.log(`  amount: ${utxo.amount} DASH (${utxo.amount * 1e8} satoshis)`);
      console.log(`  confirmations: ${utxo.confirmations}`);
      console.log(`  address: ${utxo.address}`);
      console.log(`  scriptPubKey: ${utxo.scriptPubKey}`);
      console.log(`  spendable: ${utxo.spendable}`);
      console.log('');
    });

    // Get block heights for UTXOs
    console.log('Fetching block heights for UTXOs...\n');
    for (const utxo of utxos) {
      try {
        const tx = await rpcCall('getrawtransaction', [utxo.txid, true]);
        const blockHeight = tx.height || (tx.blockhash ? await getBlockHeight(tx.blockhash) : null);

        console.log(`UTXO ${utxo.txid}:${utxo.vout}`);
        console.log(`  Block Height: ${blockHeight || 'unknown'}`);
        console.log(`  Block Hash: ${tx.blockhash || 'unconfirmed'}`);
        console.log(`  In scan range (1353325-${currentHeight}): ${blockHeight >= 1353325 && blockHeight <= currentHeight ? '✅ YES' : '❌ NO'}`);
        console.log('');
      } catch (error) {
        console.log(`  ⚠️  Could not fetch transaction details: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ RPC Error:', error.message);
    console.error('\nPossible reasons:');
    console.error('  1. Testnet node is not running');
    console.error('  2. RPC credentials are incorrect');
    console.error('  3. RPC endpoint is not accessible');
    console.error(`\nCheck your configuration:`);
    console.error(`  TESTNET_RPC_ENDPOINT=${RPC_ENDPOINT}`);
    console.error(`  TESTNET_RPC_USERNAME=${RPC_USERNAME}`);
    console.error(`  TESTNET_RPC_PASSWORD=***`);
    process.exit(1);
  }
}

async function getBlockHeight(blockHash) {
  try {
    const block = await rpcCall('getblock', [blockHash]);
    return block.height;
  } catch (error) {
    return null;
  }
}

main();
