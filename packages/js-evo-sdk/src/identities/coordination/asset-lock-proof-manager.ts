/**
 * Asset Lock Proof Manager - InstantSend/ChainLock Confirmation
 *
 * Manages the asset lock proof generation using TransactionFinder (Realtime Mode).
 * Delegates to monitor.waitForConfirmation() which correctly handles IS/CL detection
 * via both DAPI streams and the TransactionStatusPoller.
 *
 * Confirmation Strategy:
 * 1. PREFERRED: InstantLock with raw proof bytes (~2s via DAPI streams)
 * 2. FALLBACK: ChainLock confirmation (~30-60s, requires Platform sync)
 *
 * Timeout: 60 seconds (configurable via PROOF_CONFIG.MAX_WAIT_MS)
 */

import type { TransactionFinder, ConfirmationResult } from '@dashevo/transaction-finder';
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
 * Delegates confirmation detection to monitor.waitForConfirmation() which handles
 * both stream-based and poller-based IS/CL detection correctly.
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
   * Delegates to monitor.waitForConfirmation() which correctly tracks
   * confirmation status via both DAPI streams and the TransactionStatusPoller.
   * This avoids reimplementing IS/CL detection logic with subtle bugs.
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

    logger.info('Waiting for transaction confirmation...');
    logger.debug(`   Transaction ID: ${transactionId}`);
    logger.debug(`   Monitoring ${addresses.length} addresses`);

    try {
      const monitorStatus = monitor.getStatus();
      logger.info(`Monitor status: active=${monitorStatus.active}, chainLockHeight=${monitorStatus.chainLockHeight}`);
      logger.info('Waiting for InstantLock (preferred) or ChainLock (fallback)...');

      // Delegate to monitor.waitForConfirmation() which correctly handles:
      // - InstantLock via DAPI streams (instantLockHex available)
      // - InstantLock via TransactionStatusPoller (status='instantlocked', no hex)
      // - ChainLock via ChainLockHeightMonitor (verifies TX block height <= CL height)
      const confirmation = await monitor.waitForConfirmation(transactionId, {
        requireInstantLock: true,
        requireChainLock: false,
        timeout: this.timeoutMs,
        onProgress: (progress) => {
          logger.info(`   Confirmation progress: ${progress.status} (${(progress.elapsedMs / 1000).toFixed(0)}s elapsed)`);
        },
      });

      return await this.processConfirmationResult(
        confirmation, monitor, transactionId, transactionHex, raceStart
      );
    } catch (error) {
      const err = error as Error;

      const waitMinutes = (this.timeoutMs / 60000).toFixed(0);
      const errorMessage = [
        `Asset lock proof creation failed: ${err.message}`,
        '',
        `Timeout: ${waitMinutes} minutes`,
        '',
        'Troubleshooting:',
        '   1. Transaction may not have been confirmed on blockchain',
        '   2. InstantLock/ChainLock may be delayed',
        '   3. DAPI servers may be temporarily unavailable',
        '   4. Network may be experiencing congestion',
        '',
        'Suggestions:',
        '   - Check transaction status on blockchain explorer',
        '   - Verify wallet has sufficient balance for fees',
        '   - Try again in a few minutes',
        '   - Check DAPI server status if persistent',
      ].join('\n');

      throw new Error(errorMessage);
    }
  }

  /**
   * Process a ConfirmationResult from monitor.waitForConfirmation()
   * into an AssetLockProofResult for identity creation/topup.
   */
  private async processConfirmationResult(
    confirmation: ConfirmationResult,
    monitor: TransactionFinder,
    transactionId: string,
    transactionHex: string,
    raceStart: number
  ): Promise<AssetLockProofResult> {
    const totalTime = ((Date.now() - raceStart) / 1000).toFixed(1);

    if (confirmation.method === 'instantlock' && confirmation.instantLockHex) {
      // Best case: InstantLock with raw proof bytes from DAPI stream
      logger.info(`InstantLock received with proof! (${totalTime}s)`);
      logger.debug(`   InstantLock hex: ${confirmation.instantLockHex.substring(0, 32)}...`);

      return {
        transactionId,
        transactionHex,
        instantLockHex: confirmation.instantLockHex,
        coreChainLockedHeight: null,
        proofType: 'instant' as const
      };
    }

    if (confirmation.method === 'instantlock' && !confirmation.instantLockHex) {
      // IS confirmed by poller (status='instantlocked') but no raw proof bytes.
      // Re-check tracker — the stream may have delivered hex between the poller
      // detection and now.
      const tx = monitor.getTransaction(transactionId);
      if (tx && tx.instantLockHex) {
        logger.info(`InstantLock proof found in tracker after poller detection (${totalTime}s)`);
        return {
          transactionId,
          transactionHex,
          instantLockHex: tx.instantLockHex,
          coreChainLockedHeight: null,
          proofType: 'instant' as const
        };
      }

      // No raw IS proof available — fall back to ChainLock.
      // The poller confirmed IS via DAPI getTransaction() boolean flag,
      // but we need either raw IS bytes or a ChainLock height for the proof.
      logger.info(`InstantLock confirmed by poller but no raw proof bytes, waiting for ChainLock...`);
      const clConfirmation = await monitor.waitForConfirmation(transactionId, {
        requireInstantLock: false,
        requireChainLock: true,
        timeout: this.timeoutMs,
        onProgress: (progress) => {
          logger.info(`   ChainLock wait: ${progress.status} (${(progress.elapsedMs / 1000).toFixed(0)}s elapsed)`);
        },
      });

      return this.handleChainLockResult(clConfirmation, transactionId, transactionHex, raceStart);
    }

    if (confirmation.method === 'chainlock') {
      return this.handleChainLockResult(confirmation, transactionId, transactionHex, raceStart);
    }

    // method === 'timeout'
    // Check if ChainLock height is available as last resort
    const tx = monitor.getTransaction(transactionId);
    const chainLockHeight = tx?.chainLockBlockHeight || confirmation.blockHeight;
    const status = monitor.getStatus();
    const fallbackHeight = chainLockHeight || status.chainLockHeight;

    if (fallbackHeight && fallbackHeight > 0) {
      const timeoutTime = ((Date.now() - raceStart) / 1000).toFixed(1);
      logger.warn(`Timeout after ${timeoutTime}s, using available ChainLock height ${fallbackHeight}`);
      await this.waitForPlatformSync(fallbackHeight);

      return {
        transactionId,
        transactionHex,
        instantLockHex: null,
        coreChainLockedHeight: fallbackHeight,
        proofType: 'chain' as const
      };
    }

    throw new Error(`Timeout: No confirmation after ${totalTime}s (no InstantLock or ChainLock)`);
  }

  /**
   * Handle a ChainLock confirmation result: extract block height and wait for Platform sync.
   */
  private async handleChainLockResult(
    confirmation: ConfirmationResult,
    transactionId: string,
    transactionHex: string,
    raceStart: number
  ): Promise<AssetLockProofResult> {
    const totalTime = ((Date.now() - raceStart) / 1000).toFixed(1);
    const chainLockHeight = confirmation.blockHeight || 0;

    logger.info(`ChainLock confirmed at height ${chainLockHeight} (${totalTime}s)`);

    logger.info('Waiting for Platform to sync to ChainLock height...');
    await this.waitForPlatformSync(chainLockHeight);
    logger.info('Platform synced to ChainLock height');

    return {
      transactionId,
      transactionHex,
      instantLockHex: null,
      coreChainLockedHeight: chainLockHeight,
      proofType: 'chain' as const
    };
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
