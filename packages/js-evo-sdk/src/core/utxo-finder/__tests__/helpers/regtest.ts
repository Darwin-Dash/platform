/**
 * Regtest Helpers for Integration Testing
 * Utilities for connecting to and interacting with local regtest network
 */

import { execSync } from 'child_process';
import DAPIClient from '@dashevo/dapi-client';
import { DashRPCClient, createRPCClient } from './rpc-client';

/**
 * SSH Tunnel configuration
 */
export interface SSHTunnelConfig {
  remoteHost: string;
  remotePort: number;
  localPort: number;
  sshHost: string;
}

/**
 * Standard SSH tunnel configurations for regtest
 */
export const SSH_TUNNELS = {
  dapi: {
    remoteHost: '127.0.0.1',
    remotePort: 2443,
    localPort: 2443,
    sshHost: process.env.DASHMATE_SSH_HOST || 'ruald@10.0.0.119',
  },
  rpc: {
    remoteHost: '127.0.0.1',
    remotePort: 20002,
    localPort: 20002,
    sshHost: process.env.DASHMATE_SSH_HOST || 'ruald@10.0.0.119',
  },
};

/**
 * Regtest configuration
 */
export const REGTEST_CONFIG = {
  // Standard regtest DAPI server addresses
  dapi: {
    // SSH tunnel to remote Dashmate server
    addresses: [
      'localhost:2443', // SSH tunnel to DAPI
      'localhost:2543', // DAPI fallback
    ],
    timeout: 30000,
  },

  // Network parameters
  network: 'regtest',
  networkType: 'testnet', // Regtest uses testnet address format

  // Common test addresses and keys
  testData: {
    // Example test mnemonic (generate new ones for actual tests)
    mnemonic:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',

    // Typical gap limit for address derivation
    gapLimit: 20,

    // Standard derivation account
    accountIndex: 0,
  },
};

/**
 * Check if an SSH tunnel already exists on a given port
 * @param port - Local port to check
 * @returns true if tunnel is listening on the port
 * @private
 */
function isTunnelActive(port: number): boolean {
  try {
    // Use lsof to check if any process is listening on the port
    execSync(`lsof -i :${port} 2>/dev/null | grep -q LISTEN`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an SSH tunnel for accessing remote services
 * @param config - Tunnel configuration
 * @throws Error if tunnel creation fails
 */
export async function createSSHTunnel(config: SSHTunnelConfig): Promise<void> {
  // Check if tunnel already exists
  if (isTunnelActive(config.localPort)) {
    console.log(`✓ SSH tunnel already active on port ${config.localPort}`);
    return;
  }

  // Create SSH tunnel in background
  const tunnelCmd = `ssh -f -N -L ${config.localPort}:${config.remoteHost}:${config.remotePort} ${config.sshHost} 2>&1`;

  try {
    execSync(tunnelCmd, { timeout: 10000 });

    // Wait a bit for tunnel to establish
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify tunnel is listening
    let attempts = 5;
    while (attempts > 0 && !isTunnelActive(config.localPort)) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      attempts--;
    }

    if (!isTunnelActive(config.localPort)) {
      throw new Error(`Tunnel created but not listening on port ${config.localPort}`);
    }

    console.log(`✓ SSH tunnel created on port ${config.localPort}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create SSH tunnel to ${config.sshHost}:\n` +
      `  Error: ${errorMsg}\n` +
      `  Command: ${tunnelCmd}\n\n` +
      `To fix, manually create the tunnel:\n` +
      `  ssh -L ${config.localPort}:${config.remoteHost}:${config.remotePort} ${config.sshHost}\n\n` +
      `Or ensure you can SSH without password (use ssh-agent):\n` +
      `  ssh-add ~/.ssh/id_rsa`
    );
  }
}

/**
 * Set up all SSH tunnels for regtest (DAPI + RPC)
 * @throws Error if any tunnel fails to create
 */
export async function setupRegtestTunnels(): Promise<void> {
  console.log('Setting up SSH tunnels for regtest integration tests...');

  try {
    // Create DAPI tunnel
    try {
      await createSSHTunnel(SSH_TUNNELS.dapi);
    } catch (error) {
      console.warn(`⚠ DAPI tunnel failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    // Create RPC tunnel (optional - some tests might not need it)
    try {
      await createSSHTunnel(SSH_TUNNELS.rpc);
    } catch (error) {
      console.warn(`⚠ RPC tunnel failed (optional): ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw - RPC is optional for some tests
    }

    console.log('✓ SSH tunnels ready for regtest');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `SSH tunnel setup failed:\n${msg}\n\n` +
      `Integration tests require SSH access to the regtest server.\n` +
      `See STREAM_FIX_SUMMARY.md for setup instructions.`
    );
  }
}

/**
 * Connect to local regtest DAPI server
 * @param address - DAPI address (host:port)
 * @param timeout - Connection timeout in ms
 * @returns Connected DAPI client
 */
export async function connectToRegtest(
  address: string = REGTEST_CONFIG.dapi.addresses[0],
  timeout: number = REGTEST_CONFIG.dapi.timeout
): Promise<any> {
  try {
    // DAPIAddress format: host:port:no-ssl (no-ssl uses http, otherwise https)
    // SSH tunnels need 'no-ssl' to work properly
    const isLocalhost = address.startsWith('127.0.0.1') || address.startsWith('localhost');
    const dapiAddress = isLocalhost ? `${address}:no-ssl` : address;

    const client = new DAPIClient({
      dapiAddresses: [dapiAddress],
      timeout,
    });

    // Verify connection by getting blockchain status
    await client.core.getBlockchainStatus();

    return client;
  } catch (error) {
    throw new Error(
      `Failed to connect to regtest DAPI at ${address}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Get current regtest block height
 * @param client - DAPI client
 * @returns Current block height
 */
export async function getRegtestBlockHeight(client: any): Promise<number> {
  try {
    const status = await client.core.getBlockchainStatus();

    // Try multiple possible field names for block count
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
      `Failed to get regtest block height: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Wait for new blocks on regtest
 * @param client - DAPI client
 * @param blockCount - Number of blocks to wait for
 * @param timeout - Maximum wait time in ms
 * @returns Final block height
 */
export async function waitForBlocks(
  client: any,
  blockCount: number = 1,
  timeout: number = 60000
): Promise<number> {
  const startTime = Date.now();
  const startHeight = await getRegtestBlockHeight(client);
  const targetHeight = startHeight + blockCount;

  while (Date.now() - startTime < timeout) {
    const currentHeight = await getRegtestBlockHeight(client);

    if (currentHeight >= targetHeight) {
      return currentHeight;
    }

    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timeout waiting for ${blockCount} blocks on regtest`);
}

/**
 * Check if regtest is available
 * @param address - DAPI address to check
 * @returns true if reachable, false otherwise
 */
export async function isRegtestAvailable(
  address: string = REGTEST_CONFIG.dapi.addresses[0]
): Promise<boolean> {
  try {
    const client = await connectToRegtest(address, 5000);
    await getRegtestBlockHeight(client);
    return true;
  } catch {
    return false;
  }
}

/**
 * Skip test if regtest is not available
 * Useful for marking integration tests that require running regtest
 */
export function skipIfNoRegtest(): void {
  if (process.env.SKIP_REGTEST_TESTS === 'true') {
    throw new Error('SKIP_REGTEST_TESTS is set - skipping regtest integration tests');
  }
}

/**
 * Common test data setup
 */
export class RegtestSetup {
  private client: any | null = null;
  private blockHeight: number = 0;

  /**
   * Initialize regtest connection
   * Sets up SSH tunnels and connects to DAPI
   * @param address - DAPI address
   * @returns this for chaining
   */
  async init(address?: string): Promise<this> {
    // Try to set up SSH tunnels first
    try {
      await setupRegtestTunnels();
    } catch (error) {
      console.warn(
        `SSH tunnel setup warning: ${error instanceof Error ? error.message : String(error)}\n` +
        'Integration tests may fail if SSH tunnels are not available.'
      );
      // Continue anyway - tunnels might already exist or be configured differently
    }

    // Connect to regtest DAPI
    this.client = await connectToRegtest(address);
    this.blockHeight = await getRegtestBlockHeight(this.client);
    return this;
  }

  /**
   * Get connected DAPI client
   */
  getClient(): any {
    if (!this.client) {
      throw new Error('Regtest not initialized - call init() first');
    }
    return this.client;
  }

  /**
   * Get current block height
   */
  getBlockHeight(): number {
    return this.blockHeight;
  }

  /**
   * Refresh block height
   */
  async refreshBlockHeight(): Promise<number> {
    if (!this.client) {
      throw new Error('Regtest not initialized');
    }
    this.blockHeight = await getRegtestBlockHeight(this.client);
    return this.blockHeight;
  }

  /**
   * Wait for new blocks
   */
  async waitForBlocks(blockCount: number = 1): Promise<number> {
    if (!this.client) {
      throw new Error('Regtest not initialized');
    }
    const height = await waitForBlocks(this.client, blockCount);
    this.blockHeight = height;
    return height;
  }

  /**
   * Get a test address (from standard test data)
   * Note: These are placeholder addresses for testing network connectivity
   * For actual UTXO tests, use AddressDerivation.deriveAddress() with a test mnemonic
   */
  getTestAddress(index: number = 0): string {
    // Return a dynamically generated address from the wallet instead of hardcoded values
    // The hardcoded addresses had checksum issues
    // For integration tests, derive addresses from mnemonics instead
    try {
      // For basic connectivity tests, use a simple placeholder
      // Tests that need real addresses should use AddressDerivation.deriveAddress()
      return `ypaddress${index}`;  // This will fail address validation as intended for testing
    } catch {
      return `ypaddress${index}`;
    }
  }
}

/**
 * Known good regtest state for testing
 * Describes what we expect to find on a properly funded regtest network
 */
export interface RegtestState {
  blockHeight: number;
  lastBlockTime: Date;
  testAddresses: string[];
  fundedAddresses: Map<string, number>; // address -> satoshis
}

/**
 * Create a test-friendly regtest state description
 */
export function createRegtestState(
  blockHeight: number = 500,
  testAddresses: string[] = [],
  fundedAddresses: Map<string, number> = new Map()
): RegtestState {
  return {
    blockHeight,
    lastBlockTime: new Date(Date.now() - (1000 - blockHeight) * 600000), // ~10 min per block
    testAddresses,
    fundedAddresses,
  };
}

/**
 * RPC Configuration for transaction operations
 */
export const RPC_CONFIG = {
  // SSH/Docker connection details
  dashmateSshServer: process.env.DASHMATE_SERVER || 'ruald@10.0.0.119',
  seedContainer: process.env.SEED_CONTAINER || 'dashmate_36324776_local_seed-core-1',

  // Local tunnel ports
  rpcPort: parseInt(process.env.RPC_PORT || '20002', 10),
  rpcHost: 'localhost',

  // RPC endpoint (through SSH tunnel)
  rpcEndpoint: `http://localhost:${parseInt(process.env.RPC_PORT || '20002', 10)}`,
  rpcUsername: process.env.RPC_USERNAME || 'dash',
  rpcPassword: process.env.RPC_PASSWORD || 'dashpass',

  // Timeouts
  rpcTimeout: 10000,
  txWaitTimeout: 60000,
};

/**
 * RPC client instance for regtest operations
 * Initialized on demand, reused across test calls
 */
let rpcClient: DashRPCClient | null = null;

/**
 * Initialize RPC client for regtest operations
 *
 * @param endpoint Optional RPC endpoint override
 * @returns Initialized RPC client
 */
export async function initRegtestRPC(
  endpoint: string = RPC_CONFIG.rpcEndpoint
): Promise<DashRPCClient> {
  if (!rpcClient) {
    rpcClient = await createRPCClient({
      endpoint,
      username: RPC_CONFIG.rpcUsername,
      password: RPC_CONFIG.rpcPassword,
      loggerIdentifier: 'Regtest-RPC',
    });
  }
  return rpcClient;
}

/**
 * Send funds to an address via regtest RPC
 * Uses JSON-RPC through SSH tunnel to communicate with seed node
 *
 * @param address - Dash address to send to
 * @param amount - Amount in DASH
 * @returns Transaction ID
 */
export async function sendToAddress(
  address: string,
  amount: number
): Promise<string> {
  try {
    const client = await initRegtestRPC();
    return await client.sendToAddress(address, amount);
  } catch (error) {
    throw new Error(
      `Failed to send ${amount} DASH to ${address}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Generate blocks on regtest (mine new blocks)
 * Uses JSON-RPC through SSH tunnel to communicate with seed node
 *
 * @param blockCount - Number of blocks to generate
 * @returns Array of generated block hashes
 */
export async function generateBlocks(blockCount: number = 1): Promise<string[]> {
  try {
    const client = await initRegtestRPC();
    return await client.generateBlocks(blockCount);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate ${blockCount} blocks: ${errorMsg}`
    );
  }
}

/**
 * Get transaction details from RPC
 *
 * @param txid - Transaction ID
 * @returns Transaction details including confirmations, amount, address
 */
export async function getTransactionDetails(txid: string): Promise<any> {
  try {
    const client = await initRegtestRPC();
    return await client.getTransaction(txid);
  } catch (error) {
    throw new Error(
      `Failed to get transaction details for ${txid}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Get current block count from RPC
 *
 * @returns Current block height
 */
export async function getBlockCount(): Promise<number> {
  try {
    const client = await initRegtestRPC();
    return await client.getBlockCount();
  } catch (error) {
    throw new Error(
      `Failed to get block count: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Get a new address from the wallet
 *
 * @returns New Dash address
 */
export async function getNewAddress(): Promise<string> {
  try {
    const client = await initRegtestRPC();
    return await client.getNewAddress();
  } catch (error) {
    throw new Error(
      `Failed to get new address: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Wait for a transaction to appear in the mempool or blockchain
 *
 * @param txid - Transaction ID to wait for
 * @param timeout - Maximum time to wait in ms
 * @returns Transaction details when found
 */
export async function waitForTransaction(
  txid: string,
  timeout: number = RPC_CONFIG.txWaitTimeout
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const txDetails = await getTransactionDetails(txid);
      return txDetails;
    } catch {
      // Transaction not found yet, wait and retry
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Timeout waiting for transaction ${txid}`);
}

/**
 * Environment variable helpers for CI/CD
 */
export const RegtestEnv = {
  /**
   * Get DAPI address from environment or use default
   */
  getDAPIAddress(): string {
    return process.env.REGTEST_DAPI_ADDRESS || REGTEST_CONFIG.dapi.addresses[0];
  },

  /**
   * Check if running in CI/CD environment
   */
  isCI(): boolean {
    return process.env.CI === 'true' || !!process.env.GITHUB_ACTIONS;
  },

  /**
   * Check if integration tests are enabled
   */
  integrationsEnabled(): boolean {
    return process.env.SKIP_INTEGRATION_TESTS !== 'true';
  },

  /**
   * Check if regtest is required to run
   */
  regtestRequired(): boolean {
    return process.env.REGTEST_REQUIRED === 'true';
  },
};
