/**
 * Asset Lock Proof Manager - InstantSend/ChainLock Confirmation
 *
 * Manages the asset lock proof generation using TransactionFinder (Realtime Mode).
 * Waits for either InstantLock or ChainLock confirmation before creating identity.
 *
 * Confirmation Strategy:
 * 1. FIRST: Poll for InstantLock (fastest, ~2 seconds via DAPI streams)
 * 2. FALLBACK: Poll for ChainLock height advancement (reliable, ~30-60 seconds)
 *
 * The monitor receives InstantLock messages via DAPI streams and stores them
 * in its internal tracker. We poll the tracker for the InstantLock hex.
 *
 * Timeout: 60 seconds (configurable via PROOF_CONFIG.MAX_WAIT_MS)
 */

import type { TransactionFinder } from '@dashevo/transaction-finder';
import { PROOF_CONFIG } from '../config/operation-config.js';
import { createLogger } from '../utils/identity-logger.js';

const logger = createLogger('AssetLockProofManager');

/**
 * Transaction data with proof information
 */
export interface AssetLockProofResult {
  transactionId: string;
  transactionHex: string;
  instantLockHex: string | null;
  coreChainLockedHeight: number | null;
  proofType: 'instant' | 'chain';
}

/**
 * SDK interface for Platform operations (for Platform sync checking)
 */
interface SDKInterface {
  epoch: {
    epochsInfo(params: { startEpoch: number; count: number }): Promise<any>;
  };
}

/**
 * Asset Lock Proof Manager
 *
 * Coordinates asset lock proof generation using TransactionFinder (Realtime Mode).
 * Much simpler than the wallet-lib version - monitor handles all the complexity.
 */
export class AssetLockProofManager {
  private sdk: SDKInterface;
  private readonly timeoutMs: number = PROOF_CONFIG.MAX_WAIT_MS;
  private readonly platformSyncInterval: number = PROOF_CONFIG.POLL_INTERVAL_MS;

  constructor(sdk: SDKInterface) {
    this.sdk = sdk;
  }

  /**
   * Wait for transaction confirmation via TransactionFinder (Realtime Mode)
   *
   * This replaces the complex three-promise race pattern with a simple
   * call to monitor.waitForConfirmation(), which handles all the complexity.
   *
   * @param monitor - TransactionFinder instance (in Realtime or Hybrid mode)
   * @param transactionId - Transaction ID to wait for
   * @param transactionHex - Transaction hex for proof
   * @param addresses - Addresses involved in transaction (for stream filtering)
   * @returns Promise that resolves with proof data
   */
  async waitForConfirmation(
    monitor: TransactionFinder,
    transactionId: string,
    transactionHex: string,
    addresses: string[]
  ): Promise<AssetLockProofResult> {
    const raceStart = Date.now();
    const INSTANT_LOCK_POLL_INTERVAL = 500; // Poll for InstantLock every 500ms

    logger.info('⏳ Waiting for transaction confirmation...');
    logger.debug(`   Transaction ID: ${transactionId}`);
    logger.debug(`   Monitoring ${addresses.length} addresses`);

    try {
      const monitorStatus = monitor.getStatus();
      logger.info(`📊 Monitor status: active=${monitorStatus.active}, chainLockHeight=${monitorStatus.chainLockHeight}`);
      logger.info('🔄 Waiting for InstantLock (preferred) or ChainLock (fallback)...');

      const startChainLockHeight = monitorStatus.chainLockHeight || 0;
      const pollStart = Date.now();
      let currentChainLockHeight = startChainLockHeight;
      let lastLogTime = 0;

      while (Date.now() - pollStart < this.timeoutMs) {
        // PRIORITY 1: Check for InstantLock in the tracker
        // The monitor stores InstantLocks received via DAPI streams
        const tx = monitor.getTransaction(transactionId);
        if (tx && tx.instantLockHex) {
          const totalTime = ((Date.now() - raceStart) / 1000).toFixed(1);
          logger.info(`✅ InstantLock received! (${totalTime}s)`);
          logger.debug(`   InstantLock hex: ${tx.instantLockHex.substring(0, 32)}...`);

          // InstantLock proofs don't require Platform sync waiting
          return {
            transactionId,
            transactionHex,
            instantLockHex: tx.instantLockHex,
            coreChainLockedHeight: null,
            proofType: 'instant' as const
          };
        }

        // PRIORITY 2: Check for ChainLock height advancement
        const status = monitor.getStatus();
        currentChainLockHeight = status.chainLockHeight || 0;

        if (currentChainLockHeight > startChainLockHeight) {
          const totalTime = ((Date.now() - raceStart) / 1000).toFixed(1);
          logger.info(`✅ ChainLock advanced from ${startChainLockHeight} to ${currentChainLockHeight} (${totalTime}s)`);

          // Wait for Platform to sync to this height
          logger.info('⏳ Waiting for Platform to sync to ChainLock height...');
          await this.waitForPlatformSync(currentChainLockHeight);
          logger.info('✅ Platform synced to ChainLock height');

          return {
            transactionId,
            transactionHex,
            instantLockHex: null,
            coreChainLockedHeight: currentChainLockHeight,
            proofType: 'chain' as const
          };
        }

        // Log progress every 10 seconds
        if (Date.now() - lastLogTime > 10000) {
          const elapsed = ((Date.now() - pollStart) / 1000).toFixed(0);
          logger.info(`   ⏳ Waiting: no InstantLock yet, ChainLock height ${currentChainLockHeight} (${elapsed}s elapsed)`);
          lastLogTime = Date.now();
        }

        // Use faster polling for InstantLock detection
        await new Promise(resolve => setTimeout(resolve, INSTANT_LOCK_POLL_INTERVAL));
      }

      // Timeout - check if we can use current ChainLock height anyway
      const totalTime = ((Date.now() - raceStart) / 1000).toFixed(1);
      if (currentChainLockHeight > 0) {
        logger.warn(`⚠️ Timeout after ${totalTime}s, using current ChainLock height ${currentChainLockHeight}`);

        // Wait for Platform sync before returning
        await this.waitForPlatformSync(currentChainLockHeight);

        return {
          transactionId,
          transactionHex,
          instantLockHex: null,
          coreChainLockedHeight: currentChainLockHeight,
          proofType: 'chain' as const
        };
      }

      throw new Error(`Timeout: No confirmation after ${totalTime}s (no InstantLock or ChainLock)`);
    } catch (error) {
      const err = error as Error;

      // Enhanced error message
      const waitMinutes = (this.timeoutMs / 60000).toFixed(0);
      const errorMessage = [
        `Asset lock proof creation failed: ${err.message}`,
        '',
        `Timeout: ${waitMinutes} minutes`,
        '',
        '💡 Troubleshooting:',
        '   1. Transaction may not have been confirmed on blockchain',
        '   2. InstantLock/ChainLock may be delayed',
        '   3. DAPI servers may be temporarily unavailable',
        '   4. Network may be experiencing congestion',
        '',
        '🔍 Suggestions:',
        '   - Check transaction status on blockchain explorer',
        '   - Verify wallet has sufficient balance for fees',
        '   - Try again in a few minutes',
        '   - Check DAPI server status if persistent',
      ].join('\n');

      throw new Error(errorMessage);
    }
  }

  /**
   * Wait for Platform's coreChainLockedHeight to reach expected height
   * Uses SDK epoch queries to poll Platform state directly
   *
   * This is only needed for ChainLock-based proofs (Platform must sync to block height)
   *
   * @param expectedCoreHeight - Transaction block height to wait for
   */
  private async waitForPlatformSync(expectedCoreHeight: number): Promise<void> {
    const interval = this.platformSyncInterval; // 5000ms default
    let pollCount = 0;
    let lastLoggedHeight = 0;

    return new Promise<void>((resolve, reject) => {
      const checkCoreHeight = async () => {
        try {
          pollCount++;

          // Query Platform's current coreChainLockedHeight via SDK epoch API
          const epochsInfo = await this.sdk.epoch.epochsInfo({ startEpoch: 0, count: 1 });

          // Extract coreChainLockedHeight from Platform metadata
          const metadata = epochsInfo.metadata || epochsInfo;
          const coreChainLockedHeight = metadata.coreChainLockedHeight || metadata.getCoreChainLockedHeight?.();

          const heightDelta = coreChainLockedHeight - expectedCoreHeight;

          // Enhanced progress logging
          if (coreChainLockedHeight !== lastLoggedHeight) {
            if (heightDelta < 0) {
              // Platform is behind
              const blocksBehind = Math.abs(heightDelta);
              logger.info(`⏳ Platform synchronizing: ${blocksBehind} block${blocksBehind > 1 ? 's' : ''} behind (Platform: ${coreChainLockedHeight}, Transaction: ${expectedCoreHeight})`);

              if (blocksBehind > 10) {
                logger.info(`   ℹ️ Platform significantly behind - this may take several minutes`);
              } else {
                logger.info(`   ℹ️ Normal sync delay - should complete in 10-30 seconds`);
              }
            } else if (heightDelta === 0) {
              logger.info(`⏳ Platform at transaction height ${coreChainLockedHeight} - waiting for +1 block safety buffer`);
            } else if (heightDelta > 0 && heightDelta <= 2) {
              logger.debug(`Platform ahead by ${heightDelta} block(s) - ready to proceed`);
            }

            lastLoggedHeight = coreChainLockedHeight;
          } else if (pollCount % 6 === 0) {
            // Log progress every 30 seconds even if height unchanged
            const waitTime = ((pollCount * interval) / 1000).toFixed(0);
            logger.info(`⏳ Still waiting for Platform sync... (${waitTime}s elapsed)`);
          }

          // Wait for Platform to reach transaction height
          if (coreChainLockedHeight >= expectedCoreHeight) {
            logger.info(`✅ Platform synced to height ${coreChainLockedHeight} (transaction at ${expectedCoreHeight})`);
            resolve();
            return;
          }

          // Not synced yet - continue polling
          setTimeout(checkCoreHeight, interval);
        } catch (error) {
          logger.error(`❌ Failed to query Platform height: ${(error as Error).message}`);
          reject(error);
        }
      };

      checkCoreHeight();
    });
  }
}
