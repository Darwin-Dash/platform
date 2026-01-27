/**
 * Test helpers for js-evo-sdk integration tests
 *
 * Provides utilities for:
 * - Creating EvoSDK instances with wallet support
 * - Waiting for state transition propagation
 * - Common test patterns and utilities
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EvoSDK, type EvoSDKOptions, type ConnectionOptions } from '../../src/sdk.js';
import { ensureInitialized as initWasm } from '../../src/wasm.js';
import { wallet } from '../../src/wallet/functions.js';
import { DAPI_CONFIG } from '../../src/identities/config/operation-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

/**
 * Load healthy DAPI nodes from JSON file (built by scripts/build-healthy-nodes.js)
 *
 * Checks multiple locations:
 * 1. SDK root: healthy-nodes.json
 * 2. Demo folder: demo/healthy-nodes.json
 * 3. Demo web: demo/web/healthy-nodes.json
 *
 * @returns Array of healthy node addresses, or empty array if not found
 */
function loadHealthyNodes(): string[] {
  // Locations relative to tests/lib/ directory
  const locations = [
    path.join(__dirname, '../../healthy-nodes.json'),           // SDK root
    path.join(__dirname, '../../demo/healthy-nodes.json'),      // demo folder
    path.join(__dirname, '../../demo/web/healthy-nodes.json'),  // demo/web folder
  ];

  for (const location of locations) {
    try {
      if (fs.existsSync(location)) {
        const data = JSON.parse(fs.readFileSync(location, 'utf-8'));
        if (data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
          console.log(`[TEST_CONFIG] Loaded ${data.nodes.length} healthy nodes from ${path.basename(location)} (generated: ${data.generated})`);
          return data.nodes;
        }
      }
    } catch (error) {
      // Try next location
    }
  }

  console.log('[TEST_CONFIG] No healthy-nodes.json found, using network defaults');
  return []; // Return empty if not found (will use default network nodes)
}

// Pre-load healthy nodes once at module load time
const HEALTHY_NODES = loadHealthyNodes();

/**
 * Default configuration for test helpers
 */
export const TEST_CONFIG = {
  /** Default network for tests */
  network: (process.env.TEST_NETWORK || 'testnet') as 'testnet' | 'mainnet' | 'local',

  /** Default timeout for operations (ms) */
  timeout: parseInt(process.env.TEST_TIMEOUT || '120000', 10),

  /** State transition propagation interval (ms) */
  stPropagationInterval: parseInt(process.env.ST_EXECUTION_INTERVAL || '3000', 10),

  /** Default mnemonic for tests (DO NOT use with real funds!) */
  mnemonic: process.env.TEST_MNEMONIC || '',

  /** Whether a test mnemonic is available */
  hasMnemonic: !!process.env.TEST_MNEMONIC,

  /** DAPI addresses: env var takes priority, then healthy nodes from JSON, then empty (network defaults) */
  dapiAddresses: process.env.DAPI_ADDRESSES?.split(',').map((a) => a.trim()).filter(Boolean)
    || HEALTHY_NODES,

  /** SDK connection settings for tests (imported from centralized config) */
  sdkSettings: {
    timeoutMs: DAPI_CONFIG.TIMEOUT_MS,
    retries: DAPI_CONFIG.MAX_RETRIES,
    banFailedAddress: DAPI_CONFIG.BAN_FAILED_ADDRESS,
  },
};

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating an EvoSDK instance with wallet support
 */
export interface CreateEvoSDKWithWalletOptions extends ConnectionOptions {
  /** 12-word BIP39 mnemonic. If not provided, generates a new one. */
  mnemonic?: string;

  /** Network to connect to */
  network?: 'testnet' | 'mainnet' | 'local';

  /** Custom DAPI addresses to use */
  addresses?: string[];

  /** Whether to connect immediately after creation */
  autoConnect?: boolean;

  /** Whether to validate the mnemonic before use */
  validateMnemonic?: boolean;
}

/**
 * Result from createEvoSDKWithWallet
 */
export interface EvoSDKWithWalletResult {
  /** The EvoSDK instance */
  sdk: EvoSDK;

  /** The mnemonic used (either provided or generated) */
  mnemonic: string;

  /** Whether the mnemonic was generated (true) or provided (false) */
  isNewMnemonic: boolean;

  /** Network the SDK is configured for */
  network: 'testnet' | 'mainnet' | 'local';

  /** Whether the SDK is connected */
  isConnected: boolean;
}

/**
 * Options for waiting for transaction/state transition propagation
 */
export interface WaitForTransactionOptions {
  /** Maximum time to wait in milliseconds (default: 60000) */
  maxWaitMs?: number;

  /** Polling interval in milliseconds (default: 2000) */
  pollIntervalMs?: number;

  /** Optional callback for progress updates */
  onProgress?: (attempt: number, elapsedMs: number) => void;
}

/**
 * Options for waiting for state transition propagation
 */
export interface WaitForSTPropagatedOptions {
  /** Time to wait in milliseconds (default: ST_EXECUTION_INTERVAL env or 3000ms) */
  intervalMs?: number;
}

// ============================================================================
// SDK Creation Helpers
// ============================================================================

/**
 * Create an EvoSDK instance configured with wallet support
 *
 * This helper adapts the pattern from platform-test-suite's createClientWithFundedWallet
 * for use with the EvoSDK. It handles:
 * - WASM initialization
 * - Mnemonic generation or validation
 * - Network configuration
 * - Optional auto-connection
 *
 * @param options Configuration options
 * @returns SDK instance with mnemonic information
 *
 * @example
 * ```typescript
 * // Create with new mnemonic
 * const { sdk, mnemonic } = await createEvoSDKWithWallet({
 *   network: 'testnet',
 *   autoConnect: true,
 * });
 *
 * // Create with existing mnemonic
 * const { sdk } = await createEvoSDKWithWallet({
 *   mnemonic: 'abandon abandon abandon ...',
 *   network: 'testnet',
 * });
 *
 * // Create for local development
 * const { sdk } = await createEvoSDKWithWallet({
 *   network: 'local',
 *   addresses: ['https://127.0.0.1:1443'],
 * });
 * ```
 */
export async function createEvoSDKWithWallet(
  options: CreateEvoSDKWithWalletOptions = {}
): Promise<EvoSDKWithWalletResult> {
  const {
    mnemonic: providedMnemonic,
    network = TEST_CONFIG.network,
    addresses = TEST_CONFIG.dapiAddresses.length > 0 ? TEST_CONFIG.dapiAddresses : undefined,
    autoConnect = false,
    validateMnemonic: shouldValidate = true,
    ...connectionOptions
  } = options;

  // Initialize WASM SDK first
  await initWasm();

  // Handle mnemonic
  let mnemonic: string;
  let isNewMnemonic: boolean;

  if (providedMnemonic) {
    mnemonic = providedMnemonic;
    isNewMnemonic = false;

    // Validate if requested
    if (shouldValidate) {
      const isValid = await wallet.validateMnemonic(mnemonic);
      if (!isValid) {
        throw new Error('Invalid mnemonic provided');
      }
    }
  } else {
    // Generate a new mnemonic
    mnemonic = await wallet.generateMnemonic();
    isNewMnemonic = true;
  }

  // Create SDK options with centralized DAPI settings
  const sdkOptions: EvoSDKOptions = {
    network,
    ...connectionOptions,
    settings: TEST_CONFIG.sdkSettings,  // Apply resilience settings from DAPI_CONFIG
  };

  // Add custom addresses if provided, otherwise use healthy nodes from JSON
  if (addresses && addresses.length > 0) {
    sdkOptions.addresses = addresses;
  } else if (TEST_CONFIG.dapiAddresses.length > 0) {
    sdkOptions.addresses = TEST_CONFIG.dapiAddresses;
  }

  // Create SDK instance
  const sdk = new EvoSDK(sdkOptions);

  // Connect if requested
  let isConnected = false;
  if (autoConnect) {
    await sdk.connect();
    isConnected = true;
  }

  return {
    sdk,
    mnemonic,
    isNewMnemonic,
    network,
    isConnected,
  };
}

/**
 * Create a test SDK instance with default test configuration
 *
 * Convenience wrapper that uses TEST_CONFIG values.
 * Uses TEST_MNEMONIC environment variable if available.
 *
 * @param autoConnect Whether to connect immediately
 * @returns SDK with wallet result
 */
export async function createTestSDK(autoConnect = false): Promise<EvoSDKWithWalletResult> {
  return createEvoSDKWithWallet({
    mnemonic: TEST_CONFIG.mnemonic || undefined,
    network: TEST_CONFIG.network,
    autoConnect,
  });
}

// ============================================================================
// Transaction/State Transition Waiting Helpers
// ============================================================================

/**
 * Wait for state transition propagation
 *
 * Adapts the pattern from platform-test-suite's waitForSTPropagated.
 * This is a simple delay to allow state transitions to propagate across the network.
 *
 * @param options Wait options
 *
 * @example
 * ```typescript
 * // Basic usage - wait default interval
 * await waitForSTPropagated();
 *
 * // Custom interval
 * await waitForSTPropagated({ intervalMs: 5000 });
 * ```
 */
export async function waitForSTPropagated(options: WaitForSTPropagatedOptions = {}): Promise<void> {
  const { intervalMs = TEST_CONFIG.stPropagationInterval } = options;
  await wait(intervalMs);
}

/**
 * Wait for a transaction or state transition to be confirmed
 *
 * More advanced version that can poll for confirmation status.
 * Useful when you need to verify a specific transaction has been processed.
 *
 * @param checkFn Function that returns true when the condition is met
 * @param options Wait options
 * @returns true if condition was met, false if timeout
 *
 * @example
 * ```typescript
 * // Wait for identity balance to change
 * const confirmed = await waitForTransaction(
 *   async () => {
 *     const balance = await sdk.identities.balance(identityId);
 *     return balance > previousBalance;
 *   },
 *   { maxWaitMs: 60000, pollIntervalMs: 2000 }
 * );
 *
 * if (!confirmed) {
 *   throw new Error('Transaction did not confirm in time');
 * }
 * ```
 */
export async function waitForTransaction(
  checkFn: () => Promise<boolean>,
  options: WaitForTransactionOptions = {}
): Promise<boolean> {
  const { maxWaitMs = 60000, pollIntervalMs = 2000, onProgress } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    const elapsedMs = Date.now() - startTime;

    // Check if condition is met
    try {
      const result = await checkFn();
      if (result) {
        return true;
      }
    } catch {
      // Ignore errors during polling - they might be temporary
    }

    // Progress callback
    if (onProgress) {
      try {
        onProgress(attempt, elapsedMs);
      } catch {
        // Ignore callback errors
      }
    }

    // Wait before next poll
    await wait(pollIntervalMs);
  }

  return false;
}

/**
 * Wait for an identity to be found on the network
 *
 * Polls the network until the identity is available or timeout.
 *
 * @param sdk EvoSDK instance (should be connected)
 * @param identityId Identity ID to wait for
 * @param options Wait options
 * @returns true if identity was found, false if timeout
 *
 * @example
 * ```typescript
 * // After creating an identity, wait for it to propagate
 * const result = await sdk.identities.createWithWallet(mnemonic, 200000);
 * const found = await waitForIdentity(sdk, result.identityId);
 * if (!found) throw new Error('Identity did not propagate');
 * ```
 */
export async function waitForIdentity(
  sdk: EvoSDK,
  identityId: string,
  options: WaitForTransactionOptions = {}
): Promise<boolean> {
  return waitForTransaction(
    async () => {
      try {
        const identity = await sdk.identities.fetch(identityId);
        return identity !== null && identity !== undefined;
      } catch {
        return false;
      }
    },
    options
  );
}

/**
 * Wait for an identity's balance to reach a minimum value
 *
 * Useful after top-ups or credit transfers.
 *
 * @param sdk EvoSDK instance (should be connected)
 * @param identityId Identity ID to check
 * @param minBalance Minimum balance to wait for
 * @param options Wait options
 * @returns true if balance reached, false if timeout
 */
export async function waitForBalance(
  sdk: EvoSDK,
  identityId: string,
  minBalance: bigint | number,
  options: WaitForTransactionOptions = {}
): Promise<boolean> {
  const targetBalance = typeof minBalance === 'bigint' ? minBalance : BigInt(minBalance);

  return waitForTransaction(
    async () => {
      try {
        const balance = await sdk.identities.balance(identityId);
        return balance >= targetBalance;
      } catch {
        return false;
      }
    },
    options
  );
}

/**
 * Wait for a document to be available
 *
 * Useful after document creation to ensure propagation.
 *
 * @param sdk EvoSDK instance (should be connected)
 * @param contractId Data contract ID
 * @param documentType Document type name
 * @param documentId Document ID
 * @param options Wait options
 * @returns true if document was found, false if timeout
 */
export async function waitForDocument(
  sdk: EvoSDK,
  contractId: string,
  documentType: string,
  documentId: string,
  options: WaitForTransactionOptions = {}
): Promise<boolean> {
  return waitForTransaction(
    async () => {
      try {
        const document = await sdk.documents.get(contractId, documentType, documentId);
        return document !== null && document !== undefined;
      } catch {
        return false;
      }
    },
    options
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple wait/sleep function
 *
 * @param ms Milliseconds to wait
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Skip a test if no mnemonic is configured
 *
 * @param testFn The test function to conditionally run
 * @returns The test function result or undefined if skipped
 *
 * @example
 * ```typescript
 * it('should create identity with wallet', async () => {
 *   await skipIfNoMnemonic(async () => {
 *     const { sdk, mnemonic } = await createTestSDK(true);
 *     const result = await sdk.identities.createWithWallet(mnemonic, 200000);
 *     expect(result.identityId).toBeDefined();
 *   });
 * });
 * ```
 */
export async function skipIfNoMnemonic<T>(testFn: () => T | Promise<T>): Promise<T | undefined> {
  if (!TEST_CONFIG.hasMnemonic) {
    console.log('  [SKIP] No TEST_MNEMONIC provided');
    return undefined;
  }
  return testFn();
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelayMs Base delay in milliseconds (doubles each retry)
 * @returns The function result
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const identity = await retry(
 *   () => sdk.identities.fetch(identityId),
 *   3,
 *   1000
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await wait(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Create a cleanup function for test teardown
 *
 * Helps manage SDK disconnection and cleanup in tests.
 *
 * @param sdkOrResult SDK instance or result from createEvoSDKWithWallet
 * @returns Cleanup function
 *
 * @example
 * ```typescript
 * describe('Identity tests', () => {
 *   let sdk: EvoSDK;
 *   let cleanup: () => Promise<void>;
 *
 *   beforeAll(async () => {
 *     const result = await createTestSDK(true);
 *     sdk = result.sdk;
 *     cleanup = createCleanup(result);
 *   });
 *
 *   afterAll(async () => {
 *     await cleanup();
 *   });
 * });
 * ```
 */
export function createCleanup(
  sdkOrResult: EvoSDK | EvoSDKWithWalletResult
): () => Promise<void> {
  const sdk = 'sdk' in sdkOrResult ? sdkOrResult.sdk : sdkOrResult;

  return async () => {
    try {
      if (sdk.isConnected) {
        sdk.resetWasmSdk();
      }
    } catch {
      // Ignore cleanup errors
    }
  };
}

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Assert that a value is a valid Dash identifier (Base58)
 *
 * @param value Value to check
 * @param name Name for error messages
 */
export function assertValidIdentifier(value: unknown, name: string = 'identifier'): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${name} to be a string, got ${typeof value}`);
  }

  // Base58 characters (no 0, O, I, l)
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (!base58Regex.test(value)) {
    throw new Error(`Expected ${name} to be a valid Base58 identifier, got "${value}"`);
  }

  // Typical identifier length (32 bytes = 44 Base58 chars)
  if (value.length < 40 || value.length > 50) {
    throw new Error(`Expected ${name} to have valid length (40-50 chars), got ${value.length}`);
  }
}

/**
 * Assert that a value is a valid mnemonic
 *
 * @param value Value to check
 */
export async function assertValidMnemonic(value: unknown): Promise<void> {
  if (typeof value !== 'string') {
    throw new Error(`Expected mnemonic to be a string, got ${typeof value}`);
  }

  const words = value.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(`Expected mnemonic to have 12 or 24 words, got ${words.length}`);
  }

  await initWasm();
  const isValid = await wallet.validateMnemonic(value);
  if (!isValid) {
    throw new Error('Mnemonic failed BIP39 validation');
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Re-export EvoSDK for convenience
  EvoSDK,
  // Re-export wallet functions
  wallet,
};
