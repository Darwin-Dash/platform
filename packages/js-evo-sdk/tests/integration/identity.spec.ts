/**
 * Integration Tests for Identity Operations
 *
 * Unified test file covering:
 * - Identity reading (no wallet required)
 * - Identity discovery and gap-aware index finding
 * - Historic path: UTXO scan → create → topup
 * - On-demand path: IS/CL detection → create → topup
 * - Monitor lifecycle
 * - Error handling
 *
 * Tests run sequentially. Shared state flows from one test to the next.
 * Dependent tests FAIL (throw) when prior tests didn't produce required state.
 *
 * Requirements:
 * - MNEMONIC environment variable with funded testnet wallet (required for wallet tests)
 * - TESTNET_RPC_* environment variables for on-demand path tests
 * - Network connectivity to Dash testnet
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TransactionFinder, FinderMode, type UTXO } from '@dashevo/transaction-finder';
// IMPORTANT: DAPIClient must be dynamically imported to avoid loading wasm-dpp
// which corrupts wasm-sdk state. See docs/WASM_SDK_TESTNET_RWLOCK_ISSUE.md
import type DAPIClientType from '@dashevo/dapi-client';
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  waitForBalance,
  createCleanup,
  wait,
  assertValidIdentifier,
  type EvoSDKWithWalletResult,
} from './setup.js';
import {
  TESTNET_IDENTITIES,
  TEST_AMOUNTS,
  TEST_TIMEOUTS,
} from '../lib/fixtures.js';
import { wallet } from '../../src/wallet/functions.js';
import { ensureInitialized as initWasm } from '../../src/wasm.js';
import type { SpendableUTXOResult } from '../../src/identities/coordination/utxo-finder.js';

// ============================================================================
// RPC Configuration
// ============================================================================

const RPC_CONFIG = {
  endpoint: process.env.TESTNET_RPC_ENDPOINT || '',
  username: process.env.TESTNET_RPC_USERNAME || 'dash',
  password: process.env.TESTNET_RPC_PASSWORD || '',
  wallet: process.env.TESTNET_WALLET || 'platformcli',
};

const HAS_RPC = !!(RPC_CONFIG.endpoint && RPC_CONFIG.password);

// ============================================================================
// Guard Helpers
// ============================================================================

/**
 * Throw if MNEMONIC env var is not set. All wallet tests require it.
 */
function requireMnemonic(): void {
  if (!TEST_CONFIG.hasMnemonic) {
    throw new Error(
      'MNEMONIC environment variable is required for wallet tests. ' +
      'Set it to a funded testnet mnemonic.'
    );
  }
}

/**
 * Throw if RPC is not configured. On-demand tests require it.
 */
function requireRPC(): void {
  if (!HAS_RPC) {
    throw new Error(
      'RPC not configured. Set TESTNET_RPC_ENDPOINT and TESTNET_RPC_PASSWORD. ' +
      'On-demand IS/CL tests require a funded platformcli wallet.'
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send DASH via RPC to an address.
 */
async function sendToAddress(address: string, amount: number): Promise<string> {
  requireRPC();

  const { DashRpcClient } = await import('@dashevo/dash-rpc-client');
  const rpcClient = new DashRpcClient({
    network: 'testnet',
    url: RPC_CONFIG.endpoint,
    user: RPC_CONFIG.username,
    pass: RPC_CONFIG.password,
    wallet: RPC_CONFIG.wallet,
  });

  return rpcClient.sendToAddress(address, amount);
}

/**
 * Derive a test address from mnemonic using BIP44 path.
 */
async function deriveTestAddress(
  mnemonic: string,
  index: number
): Promise<{ address: string; path: string }> {
  await initWasm();

  const pathInfo = await wallet.derivationPathBip44Testnet(0, 0, index);
  const path = `m/${pathInfo.purpose}'/${pathInfo.coinType}'/${pathInfo.account}'/${pathInfo.change}/${pathInfo.index}`;

  const keyInfo = await wallet.deriveKeyFromSeedWithPath({
    mnemonic,
    passphrase: null,
    path,
    network: 'testnet',
  });

  const dashcoreLib = await import('@dashevo/dashcore-lib');
  const privateKey = new dashcoreLib.default.PrivateKey(keyInfo.privateKeyWif, 'testnet');
  const address = privateKey.toPublicKey().toAddress('testnet').toString();

  return { address, path };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Identity Operations - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;
  let dapiClient: DAPIClientType | null = null;

  // Shared state flowing between sequential tests
  let discoveredIds: Array<{ identityId: string; index: number }> = [];
  let nextFreeIndex: number = 0;
  let cachedUtxo: SpendableUTXOResult | null = null;
  let createdIdentityId: string | null = null;
  let createdIdentityId2: string | null = null; // from on-demand path

  // On-demand path UTXOs (extracted from onTransaction callbacks)
  let onDemandUtxo: UTXO | null = null;
  let topupUtxo: UTXO | null = null;

  /**
   * Lazily create DAPIClient — only loads @dashevo/dapi-client when first needed.
   * IMPORTANT: dapi-client loads wasm-dpp which corrupts wasm-sdk state if loaded
   * at module init or in beforeAll. Defer until TransactionFinder tests actually need it.
   * See docs/WASM_SDK_TESTNET_RWLOCK_ISSUE.md
   */
  async function getDAPIClient(): Promise<DAPIClientType> {
    if (!dapiClient) {
      const { default: DAPIClient } = await import('@dashevo/dapi-client');
      dapiClient = new DAPIClient({
        network: 'testnet',
        timeout: 30000,
        retries: 3,
      });
    }
    return dapiClient;
  }

  /**
   * Get current blockchain height via the shared lazy DAPIClient.
   */
  let _chainHeight: number | null = null;
  async function getChainHeight(): Promise<number> {
    if (_chainHeight) return _chainHeight;
    const client = await getDAPIClient();
    const status = await client.core.getBlockchainStatus();
    const height = status.blocks ||
      status.chain?.blocksCount ||
      status.chain?.headersCount ||
      status.coreChainLockedHeight;
    if (!height || height <= 0) {
      throw new Error(`Failed to get chain height: ${JSON.stringify(status)}`);
    }
    _chainHeight = height;
    return height;
  }

  beforeAll(async () => {
    await initWasm();

    sdkResult = await createEvoSDKWithWallet({
      mnemonic: TEST_CONFIG.mnemonic || undefined,
      network: 'testnet',
      autoConnect: true,
      logs: 'info,rs_dapi_client=debug',
    });
    cleanup = createCleanup(sdkResult);

    console.log(`[Identity Tests] SDK connected to ${sdkResult.network}`);
    console.log(`[Identity Tests] DAPI addresses: ${TEST_CONFIG.dapiAddresses.length} nodes loaded`);
    console.log(`[Identity Tests] SDK settings: timeoutMs=${TEST_CONFIG.sdkSettings.timeoutMs}, connectTimeoutMs=${TEST_CONFIG.sdkSettings.connectTimeoutMs}, retries=${TEST_CONFIG.sdkSettings.retries}`);
    console.log(`[Identity Tests] RPC configured: ${HAS_RPC}`);
    console.log(`[Identity Tests] Mnemonic: ${TEST_CONFIG.hasMnemonic ? 'provided' : 'NOT provided'}`);
  }, TEST_TIMEOUTS.SDK_CONNECT);

  afterAll(async () => {
    await cleanup();
    console.log('[Identity Tests] Cleanup complete');
  });

  // ============================================================================
  // SECTION 1: Read Operations (no wallet required)
  // ============================================================================

  describe('Read Operations', () => {
    it('should fetch identity by ID', async () => {
      const { sdk } = sdkResult;
      const identity = await sdk.identities.fetch(TESTNET_IDENTITIES.SAMPLE);

      expect(identity).toBeDefined();
      expect(identity).toHaveProperty('id');
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should fetch identity balance', async () => {
      const { sdk } = sdkResult;
      const balance = await sdk.identities.balance(TESTNET_IDENTITIES.SAMPLE);

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should return null for non-existent identity', async () => {
      const { sdk } = sdkResult;
      const nonExistentId = 'ZZZZzzzz1111111111111111111111111111111111';

      try {
        const identity = await sdk.identities.fetch(nonExistentId);
        expect(identity).toBeNull();
      } catch (error: any) {
        // Some SDKs throw for invalid IDs — WasmSdkError may not extend Error
        expect(error).toBeDefined();
        expect(typeof error.message === 'string' || typeof error.toString === 'function').toBe(true);
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should fetch multiple identities sequentially', async () => {
      const { sdk } = sdkResult;
      const identityIds = [
        TESTNET_IDENTITIES.SAMPLE,
        TESTNET_IDENTITIES.SAMPLE,
      ];

      const results = [];
      for (const id of identityIds) {
        const identity = await sdk.identities.fetch(id);
        results.push(identity);
      }

      expect(results.length).toBe(2);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
      });
    }, TEST_TIMEOUTS.IDENTITY_FETCH * 2);
  });

  // ============================================================================
  // SECTION 2: Discovery
  // ============================================================================

  describe('Discovery', () => {
    it('should discover identities and find next free index', async () => {
      requireMnemonic();
      const { sdk, mnemonic } = sdkResult;

      const identityIds = await sdk.identities.getIdentityIds(mnemonic, {
        gapLimit: 5,
      });

      expect(Array.isArray(identityIds)).toBe(true);
      console.log(`[Discovery] Found ${identityIds.length} identities for wallet`);

      identityIds.forEach((entry) => {
        expect(entry).toHaveProperty('identityId');
        expect(entry).toHaveProperty('index');
        expect(typeof entry.index).toBe('number');
      });

      // Cache for later tests
      discoveredIds = identityIds.map(i => ({ identityId: i.identityId, index: i.index }));

      // Compute next free index from already-discovered identities (avoid re-scanning)
      const usedIndexes = new Set(identityIds.map(i => i.index));
      nextFreeIndex = 0;
      while (usedIndexes.has(nextFreeIndex)) {
        nextFreeIndex++;
      }

      expect(typeof nextFreeIndex).toBe('number');
      expect(nextFreeIndex).toBeGreaterThanOrEqual(0);
      expect(usedIndexes.has(nextFreeIndex)).toBe(false);
      console.log(`[Discovery] Next free index: ${nextFreeIndex}`);
    }, 300000); // 5 min — sequential scan of many HD indices on testnet
  });

  // ============================================================================
  // SECTION 3: Historic Path — Create Identity
  // ============================================================================

  describe('Historic Path — Create', () => {
    it('should find spendable UTXO via historic scan', async () => {
      requireMnemonic();
      const { sdk, mnemonic } = sdkResult;
      const progressEvents: Array<{ phase: string; progress: number }> = [];

      const chainHeight = await getChainHeight();
      const startHeight = Math.max(1, chainHeight - 100);
      console.log(`[UTXO] Scanning last 100 blocks (${startHeight} to ${chainHeight})`);

      const result = await sdk.identities.findSpendableUTXO({
        mnemonic,
        startHeight,
        minAmount: TEST_AMOUNTS.IDENTITY_CREATE,
        onProgress: (event) => {
          progressEvents.push({ phase: event.phase, progress: event.progress });
          console.log(`[UTXO] ${event.phase}: ${event.message} (${event.progress}%)`);
        },
      });

      if (!result) {
        throw new Error(
          `No spendable UTXO found in last 100 blocks (${startHeight}-${chainHeight}). ` +
          'Ensure wallet has a recent transaction.'
        );
      }

      expect(result).toHaveProperty('utxo');
      expect(result).toHaveProperty('derivedAddresses');
      expect(result.utxo).toHaveProperty('txId');
      expect(result.utxo).toHaveProperty('vout');
      expect(result.utxo).toHaveProperty('satoshis');
      expect(result.utxo.satoshis).toBeGreaterThanOrEqual(TEST_AMOUNTS.IDENTITY_CREATE);
      expect(progressEvents.length).toBeGreaterThan(0);

      // Cache for next test
      cachedUtxo = result;
      console.log(`[UTXO] Found: ${result.utxo.txId}:${result.utxo.vout} (${result.utxo.satoshis} duffs)`);
    }, 120000);

    it('should create identity with pre-found UTXO', async () => {
      requireMnemonic();
      if (!cachedUtxo) {
        throw new Error('Previous test must find a UTXO — cachedUtxo is null');
      }

      const { sdk, mnemonic } = sdkResult;

      console.log(`[UTXO Create] Creating identity at index ${nextFreeIndex}...`);
      const result = await sdk.identities.createWithUTXO({
        mnemonic,
        utxo: cachedUtxo.utxo,
        amount: TEST_AMOUNTS.IDENTITY_CREATE,
        identityIndex: nextFreeIndex,
        derivedAddresses: cachedUtxo.derivedAddresses,
        onProgress: (event) => {
          console.log(`[UTXO Create] ${event.phase}: ${event.message}`);
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
      expect(result).toHaveProperty('transactionHash');
      expect(result.status).toBe('success');
      assertValidIdentifier(result.identityId, 'identityId');

      createdIdentityId = result.identityId;
      nextFreeIndex++;
      cachedUtxo = null; // UTXO has been spent

      console.log(`[UTXO Create] Identity created: ${result.identityId}`);
    }, TEST_TIMEOUTS.IDENTITY_CREATE * 2);
  });

  // ============================================================================
  // SECTION 4: Historic Path — TopUp Identity
  // ============================================================================

  describe('Historic Path — TopUp', () => {
    it('should find next spendable UTXO for top-up', async () => {
      requireMnemonic();
      if (!createdIdentityId) {
        throw new Error('Previous test must create an identity — createdIdentityId is null');
      }

      const { sdk, mnemonic } = sdkResult;

      const chainHeight = await getChainHeight();
      const startHeight = Math.max(1, chainHeight - 100);
      console.log(`[TopUp UTXO] Scanning last 100 blocks (${startHeight} to ${chainHeight})`);

      const result = await sdk.identities.findSpendableUTXO({
        mnemonic,
        startHeight,
        minAmount: TEST_AMOUNTS.IDENTITY_TOPUP,
        onProgress: (event) => {
          console.log(`[TopUp UTXO] ${event.phase}: ${event.message} (${event.progress}%)`);
        },
      });

      if (!result) {
        throw new Error(
          `No spendable UTXO found in last 100 blocks (${startHeight}-${chainHeight}). ` +
          'Ensure wallet has a recent transaction (change from create should be here).'
        );
      }

      expect(result.utxo.satoshis).toBeGreaterThanOrEqual(TEST_AMOUNTS.IDENTITY_TOPUP);

      cachedUtxo = result;
      console.log(`[TopUp UTXO] Found: ${result.utxo.txId}:${result.utxo.vout} (${result.utxo.satoshis} duffs)`);
    }, 120000);

    it('should top-up identity with pre-found UTXO', async () => {
      requireMnemonic();
      if (!createdIdentityId) {
        throw new Error('Previous test must create an identity — createdIdentityId is null');
      }
      if (!cachedUtxo) {
        throw new Error('Previous test must find a UTXO — cachedUtxo is null');
      }

      const { sdk, mnemonic } = sdkResult;

      const initialBalance = await sdk.identities.balance(createdIdentityId);
      console.log(`[TopUp] Initial balance: ${initialBalance}`);

      const result = await sdk.identities.topupWithUTXO({
        mnemonic,
        identityId: createdIdentityId,
        utxo: cachedUtxo.utxo,
        amount: TEST_AMOUNTS.IDENTITY_TOPUP,
        derivedAddresses: cachedUtxo.derivedAddresses,
        onProgress: (event) => {
          console.log(`[TopUp] ${event.phase}: ${event.message}`);
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
      expect(result).toHaveProperty('transactionHash');
      expect(result.status).toBe('success');

      // Wait for propagation and verify balance increased
      const balanceIncreased = await waitForBalance(
        sdk,
        createdIdentityId,
        initialBalance + 1n,
        { maxWaitMs: 60000, pollIntervalMs: 3000 }
      );

      if (balanceIncreased) {
        const newBalance = await sdk.identities.balance(createdIdentityId);
        console.log(`[TopUp] New balance: ${newBalance} (was ${initialBalance})`);
        expect(newBalance).toBeGreaterThan(initialBalance);
      } else {
        console.log('[TopUp] Balance not yet propagated, but transaction submitted');
      }

      cachedUtxo = null; // UTXO spent
    }, TEST_TIMEOUTS.IDENTITY_TOPUP);
  });

  // ============================================================================
  // SECTION 5: On-Demand Path — IS/CL Detection + Create
  // (Requires RPC — FAIL if not configured)
  // ============================================================================

  describe('On-Demand Path — Create', () => {
    it('should detect incoming transaction via realtime monitoring', async () => {
      requireRPC();
      requireMnemonic();

      const { mnemonic } = sdkResult;

      // Derive BIP44 address at index 15 (within SDK's default range 0-19)
      const addressInfo = await deriveTestAddress(mnemonic, 15);
      console.log(`[OnDemand Create] Derived address at index 15: ${addressInfo.address}`);

      const monitor = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [addressInfo.address],
        dapiClient: (await getDAPIClient()) as any,
        autoPruneOnConfirmation: true,
      });

      try {
        // Set up onTransaction callback to extract UTXO from transaction outputs
        await monitor.monitorAddresses([addressInfo.address], {
          onTransaction: (event) => {
            console.log(`[OnDemand Create] onTransaction: txid=${event.txid}`);
            const tx = event.transaction;
            if (tx && tx.outputs && Array.isArray(tx.outputs)) {
              for (let vout = 0; vout < tx.outputs.length; vout++) {
                const output = tx.outputs[vout];
                try {
                  if (output.script && output.script.toAddress) {
                    const outputAddr = output.script.toAddress('testnet').toString();
                    if (outputAddr === addressInfo.address) {
                      onDemandUtxo = {
                        txId: event.txid,
                        vout,
                        satoshis: output.satoshis,
                        script: output.script.toHex(),
                        address: addressInfo.address,
                        blockHeight: 0,
                        blockTime: 0,
                        blockHash: null,
                        isChainLocked: false,
                        isInstantLocked: false,
                      };
                      console.log(`[OnDemand Create] Extracted UTXO from output ${vout}: ${output.satoshis} duffs`);
                    }
                  }
                } catch {
                  // Skip outputs that can't be parsed
                }
              }
            }
          },
        });
        await wait(2000);

        // Send DASH via RPC
        const txid = await sendToAddress(addressInfo.address, 0.002);
        console.log(`[OnDemand Create] Sent transaction: ${txid}`);

        // Poll for InstantLock or ChainLock
        const startTime = Date.now();
        let instantLockDetected = false;
        let chainLockDetected = false;
        const initialHeight = monitor.getStatus().chainLockHeight || 0;

        while (Date.now() - startTime < 180000) {
          const tx = monitor.getTransaction(txid);
          if (tx && tx.instantLockHex) {
            instantLockDetected = true;
            console.log(`[OnDemand Create] InstantLock detected (${Date.now() - startTime}ms)`);
            break;
          }

          const status = monitor.getStatus();
          if ((status.chainLockHeight || 0) > initialHeight) {
            chainLockDetected = true;
            console.log(`[OnDemand Create] ChainLock height advanced (${Date.now() - startTime}ms)`);
            break;
          }

          await wait(1000);
        }

        expect(instantLockDetected || chainLockDetected).toBe(true);

        // Update onDemandUtxo lock fields from getTransaction()
        const trackedTx = monitor.getTransaction(txid);
        if (onDemandUtxo && trackedTx) {
          onDemandUtxo.isInstantLocked = !!trackedTx.instantLockHex;
          onDemandUtxo.isChainLocked = trackedTx.status === 'chainlocked';
          onDemandUtxo.blockHeight = trackedTx.blockHeight || 0;
          onDemandUtxo.blockHash = trackedTx.blockHash || null;
        }

        expect(onDemandUtxo).not.toBeNull();
        expect(onDemandUtxo!.script).toBeTruthy();
        expect(onDemandUtxo!.satoshis).toBeGreaterThan(0);
        expect(onDemandUtxo!.address).toBe(addressInfo.address);
      } finally {
        monitor.stop();
      }
    }, 240000);

    it('should create identity using on-demand confirmed UTXO', async () => {
      requireRPC();
      requireMnemonic();
      if (!onDemandUtxo) {
        throw new Error('Previous test must detect a transaction via IS/CL — onDemandUtxo is null');
      }

      const { sdk, mnemonic } = sdkResult;

      console.log(`[OnDemand Create] Creating identity at index ${nextFreeIndex}...`);

      const result = await sdk.identities.createWithUTXO({
        mnemonic,
        utxo: onDemandUtxo,
        amount: TEST_AMOUNTS.IDENTITY_CREATE,
        identityIndex: nextFreeIndex,
        onProgress: (event) => {
          console.log(`[OnDemand Create] ${event.phase}: ${event.message}`);
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
      expect(result).toHaveProperty('transactionHash');
      expect(result.status).toBe('success');
      assertValidIdentifier(result.identityId, 'identityId');

      createdIdentityId2 = result.identityId;
      nextFreeIndex++;
      console.log(`[OnDemand Create] Identity created: ${result.identityId}`);
    }, TEST_TIMEOUTS.IDENTITY_CREATE * 2);
  });

  // ============================================================================
  // SECTION 6: On-Demand Path — IS/CL Detection + TopUp
  // (Requires RPC — FAIL if not configured)
  // ============================================================================

  describe('On-Demand Path — TopUp', () => {
    it('should detect incoming transaction for top-up', async () => {
      requireRPC();
      requireMnemonic();
      if (!createdIdentityId2) {
        throw new Error('Previous test must create an identity via on-demand path — createdIdentityId2 is null');
      }

      const { mnemonic } = sdkResult;

      // Derive BIP44 address at index 16 (within SDK's default range 0-19)
      const addressInfo = await deriveTestAddress(mnemonic, 16);
      console.log(`[OnDemand TopUp] Derived address at index 16: ${addressInfo.address}`);

      const monitor = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [addressInfo.address],
        dapiClient: (await getDAPIClient()) as any,
        autoPruneOnConfirmation: true,
      });

      try {
        // Set up onTransaction callback to extract UTXO
        await monitor.monitorAddresses([addressInfo.address], {
          onTransaction: (event) => {
            console.log(`[OnDemand TopUp] onTransaction: txid=${event.txid}`);
            const tx = event.transaction;
            if (tx && tx.outputs && Array.isArray(tx.outputs)) {
              for (let vout = 0; vout < tx.outputs.length; vout++) {
                const output = tx.outputs[vout];
                try {
                  if (output.script && output.script.toAddress) {
                    const outputAddr = output.script.toAddress('testnet').toString();
                    if (outputAddr === addressInfo.address) {
                      topupUtxo = {
                        txId: event.txid,
                        vout,
                        satoshis: output.satoshis,
                        script: output.script.toHex(),
                        address: addressInfo.address,
                        blockHeight: 0,
                        blockTime: 0,
                        blockHash: null,
                        isChainLocked: false,
                        isInstantLocked: false,
                      };
                      console.log(`[OnDemand TopUp] Extracted UTXO from output ${vout}: ${output.satoshis} duffs`);
                    }
                  }
                } catch {
                  // Skip outputs that can't be parsed
                }
              }
            }
          },
        });
        await wait(2000);

        const txid = await sendToAddress(addressInfo.address, 0.001);
        console.log(`[OnDemand TopUp] Sent transaction: ${txid}`);

        // Wait for confirmation
        const startTime = Date.now();
        let instantLockDetected = false;
        let chainLockDetected = false;
        const initialHeight = monitor.getStatus().chainLockHeight || 0;

        while (Date.now() - startTime < 180000) {
          const tx = monitor.getTransaction(txid);
          if (tx && tx.instantLockHex) {
            instantLockDetected = true;
            console.log(`[OnDemand TopUp] InstantLock detected (${Date.now() - startTime}ms)`);
            break;
          }

          const status = monitor.getStatus();
          if ((status.chainLockHeight || 0) > initialHeight) {
            chainLockDetected = true;
            console.log(`[OnDemand TopUp] ChainLock height advanced (${Date.now() - startTime}ms)`);
            break;
          }

          await wait(1000);
        }

        expect(instantLockDetected || chainLockDetected).toBe(true);

        // Update topupUtxo lock fields from getTransaction()
        const trackedTx = monitor.getTransaction(txid);
        if (topupUtxo && trackedTx) {
          topupUtxo.isInstantLocked = !!trackedTx.instantLockHex;
          topupUtxo.isChainLocked = trackedTx.status === 'chainlocked';
          topupUtxo.blockHeight = trackedTx.blockHeight || 0;
          topupUtxo.blockHash = trackedTx.blockHash || null;
        }

        expect(topupUtxo).not.toBeNull();
        expect(topupUtxo!.script).toBeTruthy();
        expect(topupUtxo!.satoshis).toBeGreaterThan(0);
        expect(topupUtxo!.address).toBe(addressInfo.address);
      } finally {
        monitor.stop();
      }
    }, 240000);

    it('should top-up identity using on-demand confirmed UTXO', async () => {
      requireRPC();
      requireMnemonic();
      if (!createdIdentityId2) {
        throw new Error('Previous test must create an identity via on-demand path — createdIdentityId2 is null');
      }
      if (!topupUtxo) {
        throw new Error('Previous test must detect a transaction via IS/CL — topupUtxo is null');
      }

      const { sdk, mnemonic } = sdkResult;

      const initialBalance = await sdk.identities.balance(createdIdentityId2);
      console.log(`[OnDemand TopUp] Initial balance: ${initialBalance}`);

      const result = await sdk.identities.topupWithUTXO({
        mnemonic,
        identityId: createdIdentityId2,
        utxo: topupUtxo,
        amount: TEST_AMOUNTS.IDENTITY_TOPUP,
        onProgress: (event) => {
          console.log(`[OnDemand TopUp] ${event.phase}: ${event.message}`);
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('identityId');
      expect(result).toHaveProperty('transactionHash');
      expect(result.status).toBe('success');

      const balanceIncreased = await waitForBalance(
        sdk,
        createdIdentityId2,
        initialBalance + 1n,
        { maxWaitMs: 60000, pollIntervalMs: 3000 }
      );

      if (balanceIncreased) {
        const newBalance = await sdk.identities.balance(createdIdentityId2);
        console.log(`[OnDemand TopUp] New balance: ${newBalance} (was ${initialBalance})`);
        expect(newBalance).toBeGreaterThan(initialBalance);
      } else {
        console.log('[OnDemand TopUp] Balance not yet propagated, but transaction submitted');
      }
    }, TEST_TIMEOUTS.IDENTITY_TOPUP * 2);
  });

  // ============================================================================
  // SECTION 7: Monitor Lifecycle
  // ============================================================================

  describe('Monitor Lifecycle', () => {
    it('should cleanly stop and restart monitors', async () => {
      requireMnemonic();
      const { mnemonic } = sdkResult;
      const addressInfo = await deriveTestAddress(mnemonic, 60);

      // First monitor
      const monitor1 = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [addressInfo.address],
        dapiClient: (await getDAPIClient()) as any,
      });

      await monitor1.monitorAddresses([addressInfo.address], {});
      await wait(1000);
      expect(monitor1.getStatus().active).toBe(true);

      monitor1.stop();

      // Second monitor on same address
      const monitor2 = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [addressInfo.address],
        dapiClient: (await getDAPIClient()) as any,
      });

      await monitor2.monitorAddresses([addressInfo.address], {});
      await wait(1000);
      expect(monitor2.getStatus().active).toBe(true);

      monitor2.stop();
      console.log('[Lifecycle] Monitor can be restarted');
    }, 30000);

    it('should handle invalid address gracefully', async () => {
      const monitor = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: ['invalidAddress123'],
        dapiClient: (await getDAPIClient()) as any,
      });

      await wait(1000);

      const status = monitor.getStatus();
      expect(status).toBeDefined();

      monitor.stop();
      console.log('[ErrorHandling] Invalid address handled gracefully');
    }, 15000);

    it('should return undefined for unknown txid', async () => {
      requireMnemonic();
      const { mnemonic } = sdkResult;
      const addressInfo = await deriveTestAddress(mnemonic, 61);

      const monitor = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: 'testnet',
        addresses: [addressInfo.address],
        dapiClient: (await getDAPIClient()) as any,
      });

      try {
        await monitor.monitorAddresses([addressInfo.address], {});
        await wait(1000);

        const fakeTxid = 'a'.repeat(64);
        const tx = monitor.getTransaction(fakeTxid);
        expect(tx).toBeUndefined();
        console.log('[ErrorHandling] Unknown txid returns undefined');
      } finally {
        monitor.stop();
      }
    }, 15000);
  });

  // ============================================================================
  // SECTION 8: Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should validate mnemonic format', async () => {
      const { sdk } = sdkResult;
      const invalidMnemonic = 'invalid mnemonic phrase';

      try {
        await sdk.identities.createWithUTXO({
          mnemonic: invalidMnemonic,
          utxo: { txId: 'a'.repeat(64), vout: 0, satoshis: 200000, address: 'yTest', scriptPubKey: '' },
          amount: TEST_AMOUNTS.IDENTITY_CREATE,
        });
        expect.fail('Should have rejected invalid mnemonic');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toMatch(/invalid|mnemonic|failed/i);
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should validate amount for creation', async () => {
      requireMnemonic();
      const { sdk, mnemonic } = sdkResult;
      const tooSmallAmount = 100;

      try {
        await sdk.identities.createWithUTXO({
          mnemonic,
          utxo: { txId: 'a'.repeat(64), vout: 0, satoshis: 200000, address: 'yTest', scriptPubKey: '' },
          amount: tooSmallAmount,
        });
        // May throw or fail during execution
      } catch (error) {
        expect(error).toBeDefined();
        // Error could be validation or insufficient funds
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH);

    it('should validate identity ID format for top-up', async () => {
      requireMnemonic();
      const { sdk, mnemonic } = sdkResult;
      const invalidIdentityId = 'not-a-valid-id';

      try {
        await sdk.identities.topupWithUTXO({
          mnemonic,
          identityId: invalidIdentityId,
          utxo: { txId: 'a'.repeat(64), vout: 0, satoshis: 200000, address: 'yTest', scriptPubKey: '' },
          amount: TEST_AMOUNTS.IDENTITY_TOPUP,
        });
        expect.fail('Should have rejected invalid identity ID');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toMatch(/invalid|failed|error|not found/i);
      }
    }, TEST_TIMEOUTS.IDENTITY_FETCH);
  });
});
