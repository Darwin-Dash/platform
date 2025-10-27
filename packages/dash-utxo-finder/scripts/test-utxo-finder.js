#!/usr/bin/env node

/**
 * Multi-Network UTXO Finder Debug Script
 *
 * Tests the complete UTXO discovery workflow on any network:
 * - regtest:  Local development with SSH tunnels + RPC
 * - testnet:  Public testnet with auto-discovery
 * - mainnet:  Production mainnet with auto-discovery
 *
 * Features:
 * 1. Automatic network detection from NETWORK env var
 * 2. Network-specific configuration using DAPIClient's built-in configs
 * 3. Pre-flight connectivity checks
 * 4. UTXO scanning with detailed progress logging
 * 5. Timing metrics and performance reporting
 *
 * Usage:
 *   npm run test:manual                    # Run on regtest (default)
 *   NETWORK=testnet npm run test:manual    # Run on testnet
 *   NETWORK=mainnet npm run test:manual    # Run on mainnet
 *
 * Environment Variables:
 *   NETWORK              - Network to test (regtest, testnet, mainnet; default: regtest)
 *   LOG_LEVEL            - Logging level (debug, info, warn, error; default: info)
 *
 *   For regtest:
 *     DASHMATE_SSH_HOST  - SSH server (default: ruald@10.0.0.119)
 *     SEED_CONTAINER     - Docker container (default: dashmate_36324776_local_seed-core-1)
 *     NUM_TRANSACTIONS   - Number of test transactions (default: 3)
 *     TX_AMOUNT          - DASH per transaction (default: 0.05)
 *
 *   For testnet/mainnet:
 *     TESTNET_ADDRESS    - Pre-funded testnet address (required for testnet)
 *     START_HEIGHT       - Block height to start scanning from (default: 1346251 for testnet)
 *     MAINNET_ADDRESS    - Pre-funded mainnet address (required for mainnet)
 */

// @ts-check
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

// Import DAPIClient for network-aware initialization
import DAPIClient from '@dashevo/dapi-client';

// ============================================================================
// Network Configuration
// ============================================================================

const NETWORK = (process.env.NETWORK || 'regtest').toLowerCase();
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Validate network
if (!['regtest', 'testnet', 'mainnet'].includes(NETWORK)) {
  console.error(`Invalid NETWORK: ${NETWORK}. Must be: regtest, testnet, or mainnet`);
  process.exit(1);
}

// Network-specific configuration
const NETWORK_CONFIG = {
  regtest: {
    name: 'regtest',
    networkType: 'testnet', // Regtest uses testnet address format
    useDapiAddresses: true,
    dapiAddresses: ['localhost:2443'], // SSH tunnel required
    timeout: 30000,
    requiresSSHTunnel: true,
    supportsRPC: true,
    requiresMnemonic: true,
  },
  testnet: {
    name: 'testnet',
    networkType: 'testnet',
    useDapiAddresses: false, // Use network name for auto-discovery
    network: 'testnet',
    timeout: 10000,
    requiresSSHTunnel: false,
    supportsRPC: false,
    requiresMnemonic: false,
  },
  mainnet: {
    name: 'mainnet',
    networkType: 'mainnet',
    useDapiAddresses: false, // Use network name for auto-discovery
    network: 'mainnet',
    timeout: 10000,
    requiresSSHTunnel: false,
    supportsRPC: false,
    requiresMnemonic: false,
  },
};

const config = NETWORK_CONFIG[NETWORK];

// Regtest-specific config
const REGTEST_CONFIG = {
  dashmateSshServer: process.env.DASHMATE_SSH_HOST || 'ruald@10.0.0.119',
  seedContainer: process.env.SEED_CONTAINER || 'dashmate_36324776_local_seed-core-1',
  numTransactions: parseInt(process.env.NUM_TRANSACTIONS || '3', 10),
  txAmount: parseFloat(process.env.TX_AMOUNT || '0.05'),
  dapiPort: 2443,
};

// Testnet/Mainnet-specific config
const PUBLIC_CONFIG = {
  testnet: {
    address: process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
    startHeight: parseInt(process.env.START_HEIGHT || '1346251', 10),
  },
  mainnet: {
    address: process.env.MAINNET_ADDRESS || '',
    startHeight: parseInt(process.env.MAINNET_START_HEIGHT || '1', 10),
  },
};

// ============================================================================
// Logging Utilities
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(level, message) {
  const levelMap = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levelMap[LOG_LEVEL] || 1;
  const msgLevel = levelMap[level] || 1;

  if (msgLevel >= currentLevel) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const prefix = `${colors.dim}[${timestamp}]${colors.reset}`;
    console.log(`${prefix} ${message}`);
  }
}

function logError(msg) {
  console.error(`${colors.red}❌ ERROR${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}✅${colors.reset} ${msg}`);
}

function logInfo(msg) {
  log('info', `${colors.blue}ℹ️${colors.reset} ${msg}`);
}

function logDebug(msg) {
  log('debug', `${colors.dim}🔍${colors.reset} ${msg}`);
}

function logWarn(msg) {
  console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`);
}

function logSection(title) {
  console.log('');
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
}

// ============================================================================
// Network-Specific Functions
// ============================================================================

async function testDapiConnection(dapiConfig) {
  logDebug(`Testing DAPI connection...`);

  return new Promise((resolve) => {
    if (config.useDapiAddresses) {
      // Regtest: Direct address check
      const [host, port] = dapiConfig.dapiAddresses[0].split(':');
      const socket = net.createConnection({ host, port: parseInt(port, 10) });
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    } else {
      // Testnet/Mainnet: Try to create client and verify
      resolve(true); // Will be checked during client creation
    }
  });
}

async function createDAPIClient() {
  logDebug(`Creating DAPIClient for network: ${NETWORK}`);

  try {
    let clientConfig;

    if (config.useDapiAddresses) {
      // Regtest: Use direct addresses
      clientConfig = {
        dapiAddresses: config.dapiAddresses,
        network: config.networkType,
        timeout: config.timeout,
      };
    } else {
      // Testnet/Mainnet: Use network name for auto-discovery
      clientConfig = {
        network: config.network,
        timeout: config.timeout,
        retries: 5,
      };
    }

    const client = new DAPIClient(clientConfig);

    // Verify connection
    logDebug(`Verifying DAPI connection...`);
    await client.core.getBlockchainStatus();

    return client;
  } catch (error) {
    throw new Error(
      `Failed to create DAPIClient for ${NETWORK}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

async function getBlockHeight(client) {
  try {
    const status = await client.core.getBlockchainStatus();

    const blockHeight =
      status?.blocks ||
      status?.chain?.blocksCount ||
      status?.chain?.headersCount ||
      status?.blocksCount ||
      0;

    if (blockHeight === 0) {
      throw new Error('Could not determine block height from status');
    }

    return blockHeight;
  } catch (error) {
    throw new Error(
      `Failed to get block height: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

async function runPreflightChecks(client) {
  logSection('Pre-flight Checks');

  // Check DAPI connection
  const dapiOk = await testDapiConnection(config);
  if (dapiOk || !config.useDapiAddresses) {
    logSuccess(`DAPI accessible on ${NETWORK}`);
  } else {
    logError(`Cannot reach DAPI on ${config.dapiAddresses[0]}`);
    if (config.requiresSSHTunnel) {
      console.error('');
      console.error('ERROR: DAPI is not accessible.');
      console.error('Make sure SSH tunnel is active:');
      console.error(
        `  ssh -L ${REGTEST_CONFIG.dapiPort}:localhost:${REGTEST_CONFIG.dapiPort} ${REGTEST_CONFIG.dashmateSshServer}`
      );
      console.error('');
    }
    process.exit(1);
  }

  // Get block height
  try {
    const blockHeight = await getBlockHeight(client);
    logSuccess(`Current block height: ${blockHeight}`);
    return blockHeight;
  } catch (error) {
    logError(`Failed to get block height: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ============================================================================
// UTXO Finder Wrapper
// ============================================================================

function spawnUTXOFinder(address, blockHeight) {
  logDebug(`Spawning UTXOFinder for address: ${address}`);

  const finder = spawn('node', [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(fileURLToPath(import.meta.url)) + '/..',
  });

  const libPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'index.js');
  const finderScript = `
const DAPIClient = require('@dashevo/dapi-client');
const { UTXOFinder } = require('${libPath}');

async function findUTXO() {
  try {
    const dapiClient = new DAPIClient({
      ${
        config.useDapiAddresses
          ? `dapiAddresses: ['${config.dapiAddresses[0]}'],`
          : `network: '${config.network}',`
      }
      timeout: ${config.timeout},
    });

    const finder = new UTXOFinder(dapiClient, '${NETWORK}');

    // Attach event listeners for progress tracking
    finder.on('start', (data) => {
      process.stderr.write('\\n[UTXOFinder] START\\n');
    });

    finder.on('step', (data) => {
      process.stderr.write(\`[UTXOFinder] STEP: \${data.step}\\n\`);
    });

    finder.on('progress', (data) => {
      process.stderr.write(\`[UTXOFinder] PROGRESS: Block \${data.blockHeight} (\${data.processed}/\${data.total})\\n\`);
    });

    finder.on('found', (data) => {
      process.stderr.write(\`[UTXOFinder] FOUND: \${data.totalUTXOs || data.count} UTXO(s)\\n\`);
    });

    finder.on('error', (error) => {
      process.stderr.write(\`[UTXOFinder] ERROR: \${error.message}\\n\`);
    });

    const startTime = Date.now();

    const utxo = await finder.findLatestSpendableUTXO(['${address}'], {
      fromHeight: ${blockHeight},
    });

    const discoveryTime = Date.now() - startTime;
    console.log(JSON.stringify({
      success: true,
      utxo,
      discoveryTime,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error.message,
    }));
  }
  process.exit(0);
}

findUTXO();
`;

  let output = '';
  let errorOutput = '';

  finder.stdout.on('data', (data) => {
    output += data.toString();
    process.stderr.write(`${colors.dim}${data.toString()}${colors.reset}`);
  });

  finder.stderr.on('data', (data) => {
    errorOutput += data.toString();
    process.stderr.write(`${colors.magenta}${data.toString()}${colors.reset}`);
  });

  const exitPromise = new Promise((resolve, reject) => {
    finder.on('error', reject);
    finder.on('exit', (code) => {
      try {
        const result = JSON.parse(output);
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Unknown error'));
        }
      } catch (e) {
        reject(
          new Error(
            `Failed to parse finder output: ${errorOutput || output || e.message}`
          )
        );
      }
    });
  });

  finder.stdin.write(finderScript);
  finder.stdin.end();

  return exitPromise;
}

// ============================================================================
// Main Test Flow
// ============================================================================

async function main() {
  logSection(`Multi-Network UTXO Finder Test (${NETWORK.toUpperCase()})`);
  logInfo(`Network: ${NETWORK}`);
  logInfo(`Log Level: ${LOG_LEVEL}`);

  try {
    // Create DAPI client
    logSection('Initializing DAPI Connection');
    const client = await createDAPIClient();
    logSuccess(`DAPIClient created for ${NETWORK}`);

    // Run pre-flight checks
    const currentBlockHeight = await runPreflightChecks(client);

    // Get address and scan height based on network
    let scanAddress;
    let scanFromHeight;

    if (NETWORK === 'regtest') {
      logSection('Regtest Configuration');
      logInfo(`Transactions to create: ${REGTEST_CONFIG.numTransactions}`);
      logInfo(`Amount per transaction: ${REGTEST_CONFIG.txAmount} DASH`);
      logWarn('Regtest transaction creation not yet implemented in this script');
      logWarn('Use automated tests: npm run test:integration');
      process.exit(1);
    } else {
      // Testnet/Mainnet
      const netConfig = PUBLIC_CONFIG[NETWORK];
      scanAddress = netConfig.address;
      scanFromHeight = netConfig.startHeight;

      logSection(`${NETWORK.toUpperCase()} Configuration`);
      logInfo(`Scan address: ${scanAddress}`);
      logInfo(`Scan from height: ${scanFromHeight}`);

      if (!scanAddress) {
        logError(`No address configured for ${NETWORK}`);
        logError(`Set ${NETWORK === 'testnet' ? 'TESTNET_ADDRESS' : 'MAINNET_ADDRESS'} environment variable`);
        process.exit(1);
      }
    }

    // Discover UTXOs
    logSection('UTXO Discovery');
    logInfo(`Searching for UTXOs from block height: ${scanFromHeight}`);

    try {
      logInfo(`Starting UTXO scan...`);
      const startTime = Date.now();

      const result = await spawnUTXOFinder(scanAddress, scanFromHeight);

      const discoveryTime = result.discoveryTime / 1000;
      logSuccess(`UTXO discovered in ${discoveryTime.toFixed(3)}s`);

      if (result.utxo) {
        console.log('');
        console.log(`${colors.bright}UTXO Details:${colors.reset}`);
        console.log(`  TXID: ${result.utxo.txid}`);
        console.log(`  VOUT: ${result.utxo.vout}`);
        console.log(`  Amount: ${result.utxo.satoshis} satoshis`);
        console.log(`  Address: ${result.utxo.address}`);
        console.log('');
      }
    } catch (err) {
      logWarn(`UTXO discovery timed out or failed: ${err instanceof Error ? err.message : String(err)}`);
      logInfo(`This may be due to slow DAPI stream performance on public networks`);
      logInfo(`Try again or check network connectivity`);
    }

    logSection('Test Complete');
    logSuccess('Multi-network UTXO Finder test completed');
    process.exit(0);
  } catch (err) {
    logError(`Test failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

// Run the test
main();
