/**
 * Testnet Configuration for Integration Tests
 *
 * Provides real testnet DAPI addresses, intentionally bad nodes for failover testing,
 * and test identity/contract IDs for platform operations.
 */

import networkConfigs from '@dashevo/dapi-client/lib/networkConfigs.js';

/**
 * Testnet DAPI configuration
 */
export interface TestnetConfig {
  network: string;
  dapiAddresses: string[];
  badNodes: string[];
  timeout: {
    short: number;    // For retry testing
    normal: number;   // For standard operations
    long: number;     // For streaming
  };
  rpc: {
    url: string;
    user: string;
    pass: string;
    wallet: string;
    address: string;
  };
  testData: {
    identityId: string;           // Known testnet identity for testing
    dataContractId: string;        // DPNS contract ID
    documentType: string;          // DPNS document type
  };
}

/**
 * Get testnet configuration from environment or defaults
 */
export function getTestnetConfig(): TestnetConfig {
  // Get real testnet DAPI addresses
  const realNodes = networkConfigs.testnet.dapiAddressesWhiteList || [];

  // Add intentionally bad nodes for failover testing (20% of pool)
  const badNodes = [
    'https://invalid-node-1.example.com:1443',
    'https://invalid-node-2.example.com:1443',
    'https://10.255.255.1:1443', // Unreachable IP
    'https://192.0.2.1:1443',     // TEST-NET-1 (RFC 5737)
  ];

  return {
    network: process.env.NETWORK || 'testnet',

    // Mix real and bad nodes for realistic testing
    dapiAddresses: [...realNodes],
    badNodes,

    timeout: {
      short: parseInt(process.env.SHORT_TIMEOUT || '5000', 10),
      normal: parseInt(process.env.NORMAL_TIMEOUT || '60000', 10),
      long: parseInt(process.env.LONG_TIMEOUT || '300000', 10),
    },

    rpc: {
      url: process.env.TESTNET_RPC_URL || 'http://localhost:19998',
      user: process.env.TESTNET_RPC_USER || 'dash',
      pass: process.env.TESTNET_RPC_PASS || 'dash',
      wallet: process.env.TESTNET_WALLET || 'platformcli',
      address: process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
    },

    testData: {
      // DPNS contract ID (known on testnet)
      dataContractId: process.env.TEST_CONTRACT_ID ||
        'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',

      // Known identity on testnet (replace with actual test identity)
      identityId: process.env.TEST_IDENTITY_ID ||
        'BrmjhkNPPE1V6ghg9uH8bBx6PQ2bZqDJLGNjp8xdFH53',

      // DPNS document type
      documentType: 'domain',
    },
  };
}

/**
 * Get configuration with bad nodes mixed in (for failover testing)
 */
export function getConfigWithBadNodes(): TestnetConfig {
  const config = getTestnetConfig();

  // Shuffle and inject bad nodes at random positions
  const allNodes = [...config.dapiAddresses];
  const badNodes = [...config.badNodes];

  // Insert bad nodes at intervals (every 3-4 nodes)
  const result: string[] = [];
  let badNodeIndex = 0;

  for (let i = 0; i < allNodes.length; i++) {
    result.push(allNodes[i]);

    // Insert a bad node every 3-4 positions
    if (i % 3 === 0 && badNodeIndex < badNodes.length) {
      result.push(badNodes[badNodeIndex++]);
    }
  }

  // Add remaining bad nodes at the end
  while (badNodeIndex < badNodes.length) {
    result.push(badNodes[badNodeIndex++]);
  }

  return {
    ...config,
    dapiAddresses: result,
  };
}

/**
 * Get configuration with only bad nodes (for testing exhaustion scenarios)
 */
export function getConfigWithOnlyBadNodes(): TestnetConfig {
  const config = getTestnetConfig();
  return {
    ...config,
    dapiAddresses: config.badNodes,
  };
}

/**
 * Get configuration with short timeouts (for retry testing)
 */
export function getConfigWithShortTimeout(): TestnetConfig {
  const config = getTestnetConfig();
  return {
    ...config,
    timeout: {
      ...config.timeout,
      short: 100,   // Very short for immediate timeout
      normal: 1000, // Short for faster testing
    },
  };
}

/**
 * Validate RPC connection is available
 */
export async function validateRPCConnection(config: TestnetConfig): Promise<boolean> {
  try {
    const response = await fetch(config.rpc.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(
          `${config.rpc.user}:${config.rpc.pass}`
        ).toString('base64'),
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'test',
        method: 'getblockchaininfo',
        params: [],
      }),
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Print configuration summary (for debugging)
 */
export function printConfig(config: TestnetConfig): void {
  console.log('\n=== Testnet Configuration ===');
  console.log(`Network: ${config.network}`);
  console.log(`DAPI Nodes: ${config.dapiAddresses.length} total`);
  console.log(`Bad Nodes: ${config.badNodes.length} total`);
  console.log(`Timeouts: short=${config.timeout.short}ms, normal=${config.timeout.normal}ms`);
  console.log(`RPC: ${config.rpc.url}`);
  console.log(`Test Identity: ${config.testData.identityId}`);
  console.log(`Test Contract: ${config.testData.dataContractId}`);
  console.log('============================\n');
}
