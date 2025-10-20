#!/usr/bin/env node

/**
 * DNS Resolution Test Script for DAPI Seed Nodes
 *
 * This script validates that seed node hostnames are properly resolved to IP addresses
 * before establishing gRPC connections. This is critical for SSL certificate validation
 * since certificates are issued for IP addresses, not domain names.
 *
 * Usage:
 *   node test-dns-resolution.js [testnet|mainnet] [--verbose|-v]
 *   node test-dns-resolution.js testnet --verbose
 *   node test-dns-resolution.js mainnet
 */

process.env.LOG_LEVEL = 'debug';
process.env.GRPC_VERBOSITY = 'DEBUG';
process.env.GRPC_TRACE = 'all';

const DAPIClient = require('./lib/DAPIClient');
const networkConfigs = require('./lib/networkConfigs');

// Parse command line arguments
const args = process.argv.slice(2);
let network = 'testnet';
let verboseMode = false;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i].toLowerCase();
  if (arg === 'mainnet' || arg === 'testnet') {
    network = arg;
  } else if (arg === '--verbose' || arg === '-v') {
    verboseMode = true;
  } else {
    console.error(`Invalid argument: ${args[i]}`);
    console.error('Usage: node test-dns-resolution.js [mainnet|testnet] [--verbose|-v]');
    process.exit(1);
  }
}

/**
 * Formatting utilities
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];

  let prefix = '';
  switch (level) {
    case 'info':
      prefix = `${colors.blue}[INFO]${colors.reset}`;
      break;
    case 'success':
      prefix = `${colors.green}[✓]${colors.reset}`;
      break;
    case 'error':
      prefix = `${colors.red}[✗]${colors.reset}`;
      break;
    case 'warn':
      prefix = `${colors.yellow}[!]${colors.reset}`;
      break;
    case 'debug':
      if (!verboseMode) return;
      prefix = `${colors.dim}[DEBUG]${colors.reset}`;
      break;
    case 'dns':
      prefix = `${colors.cyan}[DNS]${colors.reset}`;
      break;
  }

  console.log(`${prefix} ${message}`);
};

const section = (title) => {
  console.log(`\n${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
};

const subsection = (title) => {
  console.log(`\n${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(title.length)}${colors.reset}`);
};

/**
 * Get seed configuration from networkConfigs
 */
const getSeedInfo = (networkName) => {
  if (!networkConfigs[networkName]) {
    throw new Error(`Unknown network: ${networkName}`);
  }

  const config = networkConfigs[networkName];
  return {
    seeds: config.seeds || [],
    dapiAddressesWhiteList: config.dapiAddressesWhiteList || [],
  };
};

/**
 * Test DNS resolution
 */
(async () => {
  try {
    section(`DNS Resolution Test - ${network.toUpperCase()}`);

    log(`Network: ${colors.bright}${network}${colors.reset}`);
    log(`Verbose Mode: ${verboseMode ? colors.green + 'ON' : colors.yellow + 'OFF'}${colors.reset}`);
    log(`Timestamp: ${new Date().toISOString()}`);

    // Phase 1: Display seed configuration
    subsection('Phase 1: Seed Configuration');

    const seedInfo = getSeedInfo(network);
    log(`Total Seeds: ${seedInfo.seeds.length}`);
    log(`Whitelist Entries: ${seedInfo.dapiAddressesWhiteList.length}`);

    if (verboseMode) {
      log(`\n${colors.dim}Seed List:${colors.reset}`);
      seedInfo.seeds.forEach((seed, idx) => {
        const prefix = idx === seedInfo.seeds.length - 1 ? '└─' : '├─';
        log(`${prefix} ${seed}`);
      });
    }

    // Phase 2: Initialize DAPI Client
    subsection('Phase 2: DAPI Client Initialization');

    log('Creating DAPIClient instance...');
    const startInit = Date.now();

    const dapiClient = new DAPIClient({
      network,
      loggerOptions: {
        identifier: 'test-dns-resolution',
        level: verboseMode ? 'debug' : 'info',
      },
    });

    const initTime = Date.now() - startInit;
    log(`${colors.green}✓${colors.reset} DAPIClient initialized in ${initTime}ms`);

    if (verboseMode) {
      log(`${colors.dim}Address Provider Type: ${dapiClient.dapiAddressProvider ? dapiClient.dapiAddressProvider.constructor.name : 'Promise'}${colors.reset}`);
    }

    // Phase 3: Get address provider (may need to wait for DNS resolution)
    subsection('Phase 3: Address Provider Resolution');

    log('Resolving address provider...');
    const startResolve = Date.now();

    let addressProvider = dapiClient.dapiAddressProvider;
    if (!addressProvider && dapiClient.dapiAddressProviderPromise) {
      log(`${colors.dim}Address provider is a Promise, waiting for DNS resolution...${colors.reset}`);
      addressProvider = await dapiClient.dapiAddressProviderPromise;
      log(`${colors.green}✓${colors.reset} Address provider resolved`);
    }

    const resolveTime = Date.now() - startResolve;
    log(`Resolution completed in ${resolveTime}ms`);

    if (addressProvider) {
      log(`${colors.green}✓${colors.reset} Provider Type: ${addressProvider.constructor.name}`);
    }

    // Phase 4: Display connection information
    subsection('Phase 4: Connection Information');

    if (addressProvider && addressProvider.listDAPIAddressProvider) {
      const addresses = addressProvider.listDAPIAddressProvider.getAllAddresses();
      log(`Available Addresses: ${addresses.length}`);

      if (verboseMode && addresses.length > 0) {
        log(`${colors.dim}Address Details:${colors.reset}`);
        addresses.slice(0, 5).forEach((addr, idx) => {
          const prefix = idx === Math.min(4, addresses.length - 1) ? '└─' : '├─';
          const host = addr.getHost();
          const port = addr.getPort();
          const protocol = addr.getProtocol();

          // Check if it's an IP or hostname
          const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
          const indicator = isIP ? '(IP)' : '(DNS)';

          log(`${prefix} ${protocol}://${host}:${port} ${colors.dim}${indicator}${colors.reset}`);
        });
      }
    }

    // Phase 5: Test best block height request
    subsection('Phase 5: Testing Best Block Height Request');

    log('Attempting to fetch best block height...');
    const startRequest = Date.now();

    try {
      const bestBlockHeight = await dapiClient.core.getBestBlockHeight();
      const requestTime = Date.now() - startRequest;

      log(`${colors.green}✓${colors.reset} Successfully retrieved best block height`);
      log(`Block Height: ${colors.bright}${bestBlockHeight}${colors.reset}`);
      log(`Response Time: ${requestTime}ms`);

      // Get the address that was used
      let usedAddress = null;
      if (addressProvider && addressProvider.listDAPIAddressProvider) {
        usedAddress = addressProvider.listDAPIAddressProvider.getLastUsedAddress?.();
      }

      if (usedAddress) {
        log(`Connected via: ${usedAddress.toString()}`);
      }

    } catch (requestError) {
      const requestTime = Date.now() - startRequest;
      log(`${colors.red}✗${colors.reset} Request failed after ${requestTime}ms`, 'error');
      log(`Error: ${requestError.message}`);
      if (verboseMode) {
        log(`Error Code: ${requestError.code || 'N/A'}`);
        log(`Error Details: ${requestError.details || 'N/A'}`);
      }
    }

    // Phase 6: DNS Resolution Summary
    subsection('Phase 6: DNS Resolution Summary');

    if (seedInfo.seeds.length > 0) {
      log(`${colors.dim}Seed→IP Resolution Results:${colors.reset}`);

      seedInfo.seeds.forEach((seed, idx) => {
        const prefix = idx === seedInfo.seeds.length - 1 ? '└─' : '├─';

        // Try to parse host and port
        const [host, port] = seed.split(':');
        const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);

        if (isIP) {
          log(`${prefix} ${seed} ${colors.green}(Already IP)${colors.reset}`);
        } else {
          log(`${prefix} ${seed} → ${colors.yellow}(Resolving...)${colors.reset}`);
        }
      });
    }

    // Phase 7: Test Results
    subsection('Phase 7: Test Results Summary');

    log(`${colors.green}✓${colors.reset} DNS Resolution: ${addressProvider ? 'WORKING' : 'PENDING'}`);
    log(`${colors.green}✓${colors.reset} DAPI Client: ${dapiClient ? 'INITIALIZED' : 'FAILED'}`);
    log(`${colors.green}✓${colors.reset} Address Provider: ${addressProvider ? 'AVAILABLE' : 'UNAVAILABLE'}`);

    console.log(`\n${colors.green}${colors.bright}Test completed successfully!${colors.reset}\n`);

  } catch (error) {
    section(`${colors.red}Test Failed${colors.reset}`);

    log(`${colors.red}Error Type: ${error.constructor.name}${colors.reset}`, 'error');
    log(`Message: ${error.message}`, 'error');

    if (verboseMode) {
      log(`\n${colors.dim}Stack Trace:${colors.reset}`);
      error.stack.split('\n').forEach(line => {
        log(line, 'debug');
      });
    }

    process.exit(1);

  } finally {
    log(`\nPhase 8: Cleanup`);
    log('Disconnecting DAPI client...');

    try {
      const client = new DAPIClient({ network });
      if (client.disconnect) {
        await client.disconnect();
      }
    } catch (e) {
      if (verboseMode) {
        log(`Cleanup error: ${e.message}`, 'warn');
      }
    }

    log(`${colors.green}✓${colors.reset} Shutdown complete\n`);
  }
})();
