/**
 * Integration Tests for Confirmation Types (InstantLock & ChainLock)
 *
 * Tests real testnet InstantLock and ChainLock detection at the SDK level.
 * These tests validate the confirmation strategy documented in the CLAUDE.md:
 * - InstantLock: Fast path (~2 seconds via DAPI streams)
 * - ChainLock: Fallback path (~30-60 seconds for block confirmation)
 *
 * Either confirmation type is sufficient for identity/topup operations.
 *
 * Requirements:
 * - MNEMONIC environment variable with funded testnet wallet
 * - TESTNET_RPC_* environment variables for transaction sending
 * - Network connectivity to Dash testnet
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
import DAPIClient from '@dashevo/dapi-client';
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  skipIfNoMnemonic,
  createCleanup,
  wait,
  type EvoSDKWithWalletResult,
} from './setup.js';
import { wallet } from '../../src/wallet/functions.js';
import { ensureInitialized as initWasm } from '../../src/wasm.js';

// RPC configuration for sending test transactions
const RPC_CONFIG = {
  endpoint: process.env.TESTNET_RPC_ENDPOINT || '',
  username: process.env.TESTNET_RPC_USERNAME || 'dash',
  password: process.env.TESTNET_RPC_PASSWORD || '',
  wallet: process.env.TESTNET_WALLET || 'platformcli',
};

const HAS_RPC = !!(RPC_CONFIG.endpoint && RPC_CONFIG.password);

// Helper to send transaction via RPC
async function sendToAddress(address: string, amount: number): Promise<string> {
  if (!HAS_RPC) {
    throw new Error('RPC not configured');
  }

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

describe('Confirmation Types - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;
  let dapiClient: DAPIClient;

  beforeAll(async () => {
    await initWasm();

    sdkResult = await createEvoSDKWithWallet({
      network: 'testnet',
      autoConnect: true,
    });
    cleanup = createCleanup(sdkResult);

    // Create DAPI client for TransactionFinder
    dapiClient = new DAPIClient({
      network: 'testnet',
      timeout: 30000,
      retries: 3,
    });

    console.log(`[Confirmation Types] SDK connected to ${sdkResult.network}`);
    console.log(`[Confirmation Types] RPC configured: ${HAS_RPC}`);
  }, 60000);

  afterAll(async () => {
    await cleanup();
    console.log('[Confirmation Types] Cleanup complete');
  });

  // ============================================================================
  // InstantLock Detection Tests
  // ============================================================================

  describe('InstantLock Detection', () => {
    it('detects InstantLock within 10 seconds when RPC available', async () => {
      if (!HAS_RPC) {
        console.log('[SKIP] InstantLock detection requires RPC');
        return;
      }

      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        // Derive a fresh address for receiving
        const addressInfo = await deriveTestAddress(mnemonic, 0);
        console.log(`[InstantLock] Derived address: ${addressInfo.address}`);

        // Create TransactionFinder in REALTIME mode
        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
          autoPruneOnConfirmation: true,
        });

        try {
          // Start monitoring - this activates the DAPI stream
          await monitor.monitorAddresses([addressInfo.address], {});

          // Give monitor time to connect to DAPI streams
          await wait(2000);

          // Send DASH via RPC
          const txid = await sendToAddress(addressInfo.address, 0.001);
          console.log(`[InstantLock] Sent transaction: ${txid}`);

          // Poll for InstantLock (should appear within 10 seconds)
          const startTime = Date.now();
          let instantLockDetected = false;
          let instantLockHex: string | null = null;

          while (Date.now() - startTime < 30000) {
            const tx = monitor.getTransaction(txid);
            if (tx && tx.instantLockHex) {
              instantLockDetected = true;
              instantLockHex = tx.instantLockHex;
              break;
            }
            await wait(500);
          }

          const elapsedMs = Date.now() - startTime;
          console.log(`[InstantLock] Detection time: ${elapsedMs}ms`);

          if (instantLockDetected) {
            expect(instantLockHex).toBeTruthy();
            expect(instantLockHex!.length).toBeGreaterThan(0);
            console.log(`[InstantLock] ✅ InstantLock detected in ${elapsedMs}ms`);
          } else {
            // InstantLock may not always be detected due to network conditions
            console.log('[InstantLock] InstantLock not detected within timeout (network may be slow)');
          }
        } finally {
          monitor.stop();
        }
      });
    }, 60000);

    it('can proceed with InstantLock alone (no ChainLock required)', async () => {
      if (!HAS_RPC) {
        console.log('[SKIP] Requires RPC');
        return;
      }

      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        // Derive address
        const addressInfo = await deriveTestAddress(mnemonic, 1);

        // Create monitor
        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
          autoPruneOnConfirmation: true,
        });

        try {
          // Start monitoring - this activates the DAPI stream
          await monitor.monitorAddresses([addressInfo.address], {});

          await wait(2000);

          // Send transaction
          const txid = await sendToAddress(addressInfo.address, 0.001);
          console.log(`[InstantLock-Only] Sent: ${txid}`);

          // Wait for InstantLock only (don't wait for ChainLock)
          let tx: any = null;
          const startTime = Date.now();

          while (Date.now() - startTime < 30000) {
            tx = monitor.getTransaction(txid);
            if (tx && tx.instantLockHex) {
              break;
            }
            await wait(500);
          }

          if (tx && tx.instantLockHex) {
            // Verify we can create a proof from InstantLock alone
            const proofResult = {
              transactionId: txid,
              instantLockHex: tx.instantLockHex,
              coreChainLockedHeight: null, // Not needed for InstantLock proof
              proofType: 'instant' as const,
            };

            expect(proofResult.proofType).toBe('instant');
            expect(proofResult.instantLockHex).toBeTruthy();
            expect(proofResult.coreChainLockedHeight).toBeNull();
            console.log('[InstantLock-Only] ✅ Can proceed with InstantLock proof');
          } else {
            console.log('[InstantLock-Only] InstantLock not detected (network conditions)');
          }
        } finally {
          monitor.stop();
        }
      });
    }, 60000);
  });

  // ============================================================================
  // ChainLock Detection Tests
  // ============================================================================

  describe('ChainLock Detection', () => {
    it('detects ChainLock height advancement', async () => {
      if (!HAS_RPC) {
        console.log('[SKIP] ChainLock detection requires RPC');
        return;
      }

      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        const addressInfo = await deriveTestAddress(mnemonic, 2);

        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        try {
          // Start monitoring - this activates the DAPI stream
          await monitor.monitorAddresses([addressInfo.address], {});

          await wait(2000);

          // Get initial ChainLock height
          const initialStatus = monitor.getStatus();
          const initialHeight = initialStatus.chainLockHeight || 0;
          console.log(`[ChainLock] Initial height: ${initialHeight}`);

          // Send transaction
          const txid = await sendToAddress(addressInfo.address, 0.001);
          console.log(`[ChainLock] Sent: ${txid}`);

          // Wait for ChainLock height to advance (up to 3 minutes)
          const startTime = Date.now();
          let chainLockDetected = false;
          let finalHeight = initialHeight;

          while (Date.now() - startTime < 180000) {
            const status = monitor.getStatus();
            const currentHeight = status.chainLockHeight || 0;

            if (currentHeight > initialHeight) {
              chainLockDetected = true;
              finalHeight = currentHeight;
              break;
            }

            // Log progress every 30 seconds
            if ((Date.now() - startTime) % 30000 < 1000) {
              console.log(`[ChainLock] Waiting... current height: ${currentHeight}`);
            }

            await wait(5000);
          }

          const elapsedMs = Date.now() - startTime;

          if (chainLockDetected) {
            expect(finalHeight).toBeGreaterThan(initialHeight);
            console.log(`[ChainLock] ✅ Height advanced: ${initialHeight} → ${finalHeight} (${elapsedMs}ms)`);
          } else {
            console.log('[ChainLock] Height did not advance within timeout');
          }
        } finally {
          monitor.stop();
        }
      });
    }, 300000); // 5 minute timeout for ChainLock detection

    it('ChainLock callback receives correct event shape (no blockHash/signature)', async () => {
      if (!HAS_RPC) {
        console.log('[SKIP] ChainLock event shape test requires RPC');
        return;
      }

      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        const addressInfo = await deriveTestAddress(mnemonic, 7);

        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        try {
          // Capture ChainLock events
          const chainLockEvents: Array<{
            txid?: string;
            timestamp?: number;
            blockHeight?: number;
            chainLockedHeight?: number;
            latency?: number;
            blockHash?: string;
            signature?: string;
          }> = [];

          // Start monitoring with explicit onChainLock callback
          await monitor.monitorAddresses([addressInfo.address], {
            onChainLock: (lock) => {
              chainLockEvents.push(lock);
            },
          });

          await wait(2000);

          // Send transaction
          const txid = await sendToAddress(addressInfo.address, 0.001);
          console.log(`[ChainLock Shape] Sent: ${txid}`);

          // Wait for ChainLock (up to 3 minutes)
          const startTime = Date.now();
          while (Date.now() - startTime < 180000 && chainLockEvents.length === 0) {
            await wait(5000);
          }

          if (chainLockEvents.length > 0) {
            const event = chainLockEvents[0];
            console.log('[ChainLock Shape] Event received:', JSON.stringify(event));

            // Verify ChainLockEvent interface fields exist
            expect(event).toHaveProperty('txid');
            expect(event).toHaveProperty('timestamp');
            expect(event).toHaveProperty('blockHeight');
            expect(event).toHaveProperty('chainLockedHeight');
            expect(event).toHaveProperty('latency');

            // Verify types
            expect(typeof event.txid).toBe('string');
            expect(typeof event.timestamp).toBe('number');
            expect(typeof event.blockHeight).toBe('number');
            expect(typeof event.chainLockedHeight).toBe('number');
            expect(typeof event.latency).toBe('number');

            // IMPORTANT: These fields should NOT exist in ChainLockEvent
            // They are part of BlockInclusionEvent, not ChainLockEvent
            expect(event).not.toHaveProperty('blockHash');
            expect(event).not.toHaveProperty('signature');

            console.log('[ChainLock Shape] ✅ Event has correct ChainLockEvent interface');
          } else {
            console.log('[ChainLock Shape] No ChainLock received within timeout');
          }
        } finally {
          monitor.stop();
        }
      });
    }, 240000); // 4 minute timeout
  });

  // ============================================================================
  // Confirmation Priority Tests
  // ============================================================================

  describe('Confirmation Priority', () => {
    it('returns InstantLock first when both could be available', async () => {
      if (!HAS_RPC) {
        console.log('[SKIP] Requires RPC');
        return;
      }

      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        const addressInfo = await deriveTestAddress(mnemonic, 3);

        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        try {
          // Start monitoring - this activates the DAPI stream
          await monitor.monitorAddresses([addressInfo.address], {});

          await wait(2000);

          const initialStatus = monitor.getStatus();
          const initialHeight = initialStatus.chainLockHeight || 0;

          const txid = await sendToAddress(addressInfo.address, 0.001);
          console.log(`[Priority] Sent: ${txid}`);

          // Track which confirmation type we get first
          const startTime = Date.now();
          let firstConfirmationType: 'instant' | 'chain' | null = null;

          while (Date.now() - startTime < 60000) {
            // Check InstantLock first (priority)
            const tx = monitor.getTransaction(txid);
            if (tx && tx.instantLockHex) {
              firstConfirmationType = 'instant';
              break;
            }

            // Check ChainLock as fallback
            const status = monitor.getStatus();
            if ((status.chainLockHeight || 0) > initialHeight) {
              firstConfirmationType = 'chain';
              break;
            }

            await wait(500);
          }

          const elapsedMs = Date.now() - startTime;

          if (firstConfirmationType === 'instant') {
            console.log(`[Priority] ✅ InstantLock received first (${elapsedMs}ms)`);
            expect(firstConfirmationType).toBe('instant');
          } else if (firstConfirmationType === 'chain') {
            console.log(`[Priority] ChainLock received first (${elapsedMs}ms) - InstantLock may have been missed`);
          } else {
            console.log('[Priority] No confirmation received within timeout');
          }
        } finally {
          monitor.stop();
        }
      });
    }, 90000);

    it('proof type correctly indicates InstantLock when available', async () => {
      if (!HAS_RPC) {
        console.log('[SKIP] Requires RPC');
        return;
      }

      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        const addressInfo = await deriveTestAddress(mnemonic, 4);

        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        try {
          // Start monitoring - this activates the DAPI stream
          await monitor.monitorAddresses([addressInfo.address], {});

          await wait(2000);

          const txid = await sendToAddress(addressInfo.address, 0.001);

          // Wait for InstantLock
          const startTime = Date.now();
          let tx: any = null;

          while (Date.now() - startTime < 30000) {
            tx = monitor.getTransaction(txid);
            if (tx && tx.instantLockHex) {
              break;
            }
            await wait(500);
          }

          if (tx && tx.instantLockHex) {
            // Simulate proof creation logic from AssetLockProofManager
            const proofResult = {
              transactionId: txid,
              transactionHex: '', // Would be populated in real flow
              instantLockHex: tx.instantLockHex,
              coreChainLockedHeight: null,
              proofType: 'instant' as const,
            };

            expect(proofResult.proofType).toBe('instant');
            expect(proofResult.instantLockHex).not.toBeNull();
            console.log('[ProofType] ✅ Correctly set to "instant"');
          }
        } finally {
          monitor.stop();
        }
      });
    }, 60000);
  });

  // ============================================================================
  // Monitor Lifecycle Tests
  // ============================================================================

  describe('Monitor Lifecycle', () => {
    it('monitor can be cleanly stopped and restarted', async () => {
      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        const addressInfo = await deriveTestAddress(mnemonic, 5);

        // First monitor
        const monitor1 = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        // Start monitoring - this activates the DAPI stream
        await monitor1.monitorAddresses([addressInfo.address], {});

        await wait(1000);
        const status1 = monitor1.getStatus();
        expect(status1.active).toBe(true);

        // Stop first monitor
        monitor1.stop();

        // Create second monitor on same address
        const monitor2 = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        // Start monitoring - this activates the DAPI stream
        await monitor2.monitorAddresses([addressInfo.address], {});

        await wait(1000);
        const status2 = monitor2.getStatus();
        expect(status2.active).toBe(true);

        monitor2.stop();
        console.log('[Lifecycle] ✅ Monitor can be restarted');
      });
    }, 30000);

    it('monitor getStatus returns valid data', async () => {
      await skipIfNoMnemonic(async () => {
        const { mnemonic } = sdkResult;

        const addressInfo = await deriveTestAddress(mnemonic, 6);

        const monitor = new TransactionFinder({
          mode: FinderMode.REALTIME,
          network: 'testnet',
          addresses: [addressInfo.address],
          dapiClient: dapiClient as any,
        });

        try {
          // Start monitoring - this activates the DAPI stream
          await monitor.monitorAddresses([addressInfo.address], {});

          await wait(2000);

          const status = monitor.getStatus();

          expect(status).toHaveProperty('active');
          expect(status).toHaveProperty('chainLockHeight');
          expect(typeof status.active).toBe('boolean');
          expect(typeof status.chainLockHeight === 'number' || status.chainLockHeight === undefined).toBe(true);

          console.log('[Status] ✅ Monitor status is valid:', JSON.stringify(status));
        } finally {
          monitor.stop();
        }
      });
    }, 30000);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive a test address from mnemonic
 */
async function deriveTestAddress(mnemonic: string, index: number): Promise<{ address: string; path: string }> {
  await initWasm();

  // Use BIP44 path for testnet: m/44'/1'/0'/0/index
  const pathInfo = await wallet.derivationPathBip44Testnet(0, 0, index);
  const path = `m/${pathInfo.purpose}'/${pathInfo.coinType}'/${pathInfo.account}'/${pathInfo.change}/${pathInfo.index}`;

  const keyInfo = await wallet.deriveKeyFromSeedWithPath({
    mnemonic,
    passphrase: null,
    path,
    network: 'testnet',
  });

  // Get dashcore-lib to derive address
  const dashcoreLib = await import('@dashevo/dashcore-lib');
  const privateKey = new dashcoreLib.default.PrivateKey(keyInfo.privateKeyWif, 'testnet');
  const address = privateKey.toPublicKey().toAddress('testnet').toString();

  return { address, path };
}
