/**
 * Asset Lock Proof Manager - InstantSend/ChainLock Confirmation
 *
 * Manages the asset lock proof generation using InstantSendChainLockMonitor.
 * Waits for either InstantLock or ChainLock confirmation before creating identity.
 *
 * Confirmation Paths:
 * 1. InstantLock (fast, preferred) - ~1-3 seconds
 * 2. ChainLock - ~1-3 minutes
 * 3. Timeout - 15 minutes
 *
 * Whichever occurs first will be used for proof generation.
 */
import { PROOF_CONFIG } from '../config/operation-config.js';
import { createLogger } from '../utils/identity-logger.js';
const logger = createLogger('AssetLockProofManager');
/**
 * Asset Lock Proof Manager
 *
 * Coordinates asset lock proof generation using TransactionFinder (Realtime Mode).
 * Much simpler than the wallet-lib version - monitor handles all the complexity.
 */
export class AssetLockProofManager {
    sdk;
    timeoutMs = PROOF_CONFIG.MAX_WAIT_MS;
    platformSyncInterval = PROOF_CONFIG.POLL_INTERVAL_MS;
    constructor(sdk) {
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
    async waitForConfirmation(monitor, transactionId, transactionHex, addresses) {
        const raceStart = Date.now();
        logger.info('⏳ Waiting for transaction confirmation...');
        logger.debug(`   Transaction ID: ${transactionId}`);
        logger.debug(`   Monitoring ${addresses.length} addresses`);
        try {
            // First, start monitoring the addresses if not already active
            // The monitor should already be initialized and monitoring from WalletCoordinator
            // But we'll check status to ensure it's active
            const monitorStatus = monitor.getStatus();
            if (!monitorStatus.active) {
                logger.debug('Monitor not active, starting address monitoring...');
                await monitor.monitorAddresses(addresses, {});
            }
            // Wait for confirmation via monitor - it handles InstantLock vs ChainLock internally
            const result = await monitor.waitForConfirmation(transactionId, {
                requireInstantLock: true, // Prefer InstantLock (fast)
                requireChainLock: false, // Don't require ChainLock (fallback only)
                timeout: this.timeoutMs, // 15 minutes default
                onProgress: (progress) => {
                    if (logger.isDebugEnabled()) {
                        logger.debug(`   ${progress.status}: ${progress.message} (${(progress.elapsedMs / 1000).toFixed(1)}s)`);
                    }
                    else {
                        // Log important milestones at info level
                        if (progress.status === 'instantlocked' || progress.status === 'chainlocked') {
                            logger.info(`   ✅ ${progress.message}`);
                        }
                    }
                }
            });
            const totalTime = ((Date.now() - raceStart) / 1000).toFixed(1);
            logger.info(`✅ Confirmation received via ${result.method} (${totalTime}s)`);
            // If we got ChainLock confirmation, we need to wait for Platform to sync
            if (result.method === 'chainlock') {
                logger.info('⏳ ChainLock confirmed - waiting for Platform to sync...');
                if (result.blockHeight) {
                    await this.waitForPlatformSync(result.blockHeight);
                    logger.info('✅ Platform synced to transaction height');
                }
                else {
                    logger.warn('⚠️ ChainLock has no blockHeight - Platform sync may be unreliable');
                }
            }
            // Convert monitor result to our proof result format
            return {
                transactionId,
                transactionHex,
                instantLockHex: result.method === 'instantlock' ? 'TODO_GET_FROM_MONITOR' : null,
                coreChainLockedHeight: result.blockHeight || null,
                proofType: result.method === 'chainlock' ? 'chain' : 'instant'
            };
        }
        catch (error) {
            const err = error;
            // Enhanced error message
            const waitMinutes = (this.timeoutMs / 60000).toFixed(0);
            const errorMessage = [
                `Asset lock proof creation failed: ${err.message}`,
                '',
                `Timeout: ${waitMinutes} minutes`,
                '',
                '💡 Troubleshooting:',
                '   1. Transaction may not have been confirmed on blockchain',
                '   2. InstantSend may be delayed on testnet',
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
    async waitForPlatformSync(expectedCoreHeight) {
        const interval = this.platformSyncInterval; // 5000ms default
        let pollCount = 0;
        let lastLoggedHeight = 0;
        return new Promise((resolve, reject) => {
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
                            }
                            else {
                                logger.info(`   ℹ️ Normal sync delay - should complete in 10-30 seconds`);
                            }
                        }
                        else if (heightDelta === 0) {
                            logger.info(`⏳ Platform at transaction height ${coreChainLockedHeight} - waiting for +1 block safety buffer`);
                        }
                        else if (heightDelta > 0 && heightDelta <= 2) {
                            logger.debug(`Platform ahead by ${heightDelta} block(s) - ready to proceed`);
                        }
                        lastLoggedHeight = coreChainLockedHeight;
                    }
                    else if (pollCount % 6 === 0) {
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
                }
                catch (error) {
                    logger.error(`❌ Failed to query Platform height: ${error.message}`);
                    reject(error);
                }
            };
            checkCoreHeight();
        });
    }
}
