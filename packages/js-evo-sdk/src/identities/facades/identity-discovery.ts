/**
 * IdentityDiscovery Facade - Stateless identity discovery from Platform
 *
 * Provides operations for:
 * - Discovering identities by public key hash
 * - Batch identity discovery
 * - Identity scanning with gap detection
 *
 * Architecture: Completely stateless - no wallet-lib dependency
 * Uses WASM worker system for Platform queries
 */

import type { EvoSDK } from '../../sdk.js';
import { createLogger } from '../utils/identity-logger.js';
import { WORKER_CONFIG } from '../config/operation-config.js';

const logger = createLogger('IdentityDiscovery');

/**
 * Identity discovered from Platform
 */
export interface DiscoveredIdentity {
  index: number;
  publicKeyHash: string;
  identityId: string;
  balance?: number;
  revision?: number;
}

/**
 * Identity discovery options
 */
export interface DiscoveryOptions {
  gapLimit?: number;
  batchSize?: number;
  onProgress?: (state: {
    currentIndex: number;
    foundCount: number;
    batchNumber: number;
    consecutiveNotFound: number;
  }) => void;
}

/**
 * IdentityDiscovery - Stateless identity discovery
 *
 * Discovers identities associated with addresses by:
 * 1. Deriving public key hashes from addresses
 * 2. Querying Platform for identities using those hashes
 * 3. Implementing gap-based search (stop after N consecutive not found)
 *
 * Completely independent of wallet-lib. Can be used with any source of addresses.
 */
export class IdentityDiscovery {
  constructor(private sdk: EvoSDK) {}

  /**
   * Discover single identity by public key hash
   *
   * @param publicKeyHashHex 20-byte public key hash in hex format (40 characters)
   * @returns Discovery result with identity ID if found
   * @throws Error if hash format invalid or query fails
   *
   * @example
   * ```typescript
   * const result = await discovery.discoverByHash(
   *   'abc123def456abc123def456abc123def456abc1'
   * );
   * if (result.found) {
   *   console.log('Identity found:', result.identityId);
   * }
   * ```
   */
  async discoverByHash(publicKeyHashHex: string): Promise<{
    found: boolean;
    identityId?: string;
    balance?: number;
    revision?: number;
  }> {
    // Validate hash format
    if (!publicKeyHashHex || publicKeyHashHex.length !== 40) {
      throw new Error(
        `Invalid public key hash: expected 40 hex characters, got ${publicKeyHashHex?.length || 0}`
      );
    }

    try {
      logger.debug(`Discovering identity by hash: ${publicKeyHashHex}`);

      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation(
        'identity-discover',
        { publicKeyHashHex },
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.DISCOVERY_TIMEOUT_MS,
        }
      );

      if (result.found) {
        logger.debug(`Identity found: ${result.identityId}`);
      } else {
        logger.debug(`No identity found for hash: ${publicKeyHashHex}`);
      }

      return result;
    } catch (error) {
      logger.error(`Discovery failed for hash ${publicKeyHashHex}:`, error);
      throw new Error(`Identity discovery failed: ${(error as Error).message}`);
    }
  }

  /**
   * Discover multiple identities by public key hashes in a single batch
   * More efficient than multiple discoverByHash() calls
   *
   * @param publicKeyHashesHex Array of 20-byte public key hashes (40 hex chars each)
   * @returns Array of discovery results (one per input hash)
   * @throws Error if any hash format invalid or query fails
   *
   * @example
   * ```typescript
   * const hashes = [
   *   'abc123def456abc123def456abc123def456abc1',
   *   'def456abc123def456abc123def456abc123def4'
   * ];
   * const results = await discovery.discoverByHashBatch(hashes);
   * results.forEach((r, i) => {
   *   console.log(`Hash ${i}:`, r.found ? r.identityId : 'not found');
   * });
   * ```
   */
  async discoverByHashBatch(publicKeyHashesHex: string[]): Promise<
    Array<{
      found: boolean;
      identityId?: string;
      balance?: number;
      revision?: number;
    }>
  > {
    if (!publicKeyHashesHex || publicKeyHashesHex.length === 0) {
      return [];
    }

    // Validate all hashes
    for (let i = 0; i < publicKeyHashesHex.length; i++) {
      const hash = publicKeyHashesHex[i];
      if (!hash || hash.length !== 40) {
        throw new Error(
          `Invalid public key hash at index ${i}: expected 40 hex characters, got ${hash?.length || 0}`
        );
      }
    }

    try {
      logger.debug(
        `Batch discovering ${publicKeyHashesHex.length} identities by hash (batch discovery)`
      );

      const { runBatchWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const results = await runBatchWasmOperation(
        'identity-discover',
        publicKeyHashesHex.map(hash => ({ publicKeyHashHex: hash })),
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.BATCH_DISCOVERY_TIMEOUT_MS,
        }
      );

      const foundCount = results.filter(r => r.found).length;
      logger.debug(
        `Batch discovery complete: ${foundCount} identities found out of ${publicKeyHashesHex.length}`
      );

      return results;
    } catch (error) {
      logger.error(`Batch discovery failed (${publicKeyHashesHex.length} hashes):`, error);
      throw new Error(`Batch identity discovery failed: ${(error as Error).message}`);
    }
  }

  /**
   * Scan and discover identities by iterating through public key hashes
   *
   * Useful for discovering all identities in an HD wallet by:
   * 1. Deriving HD keys at sequential indices
   * 2. Computing public key hash for each
   * 3. Querying Platform
   * 4. Stopping after gap limit (N consecutive not found)
   *
   * This method handles the batching and gap logic efficiently.
   *
   * @param publicKeyHashGenerator Function that generates hash at given index
   * @param options Discovery options (gap limit, batch size, progress callback)
   * @returns Array of discovered identities with their indices
   *
   * @example
   * ```typescript
   * // Discover identities in HD wallet
   * const discovered = await discovery.scanByIndex(
   *   async (index) => {
   *     const key = await wallet.deriveIdentityKey(index, 0);
   *     return key.publicKey.hash.toString('hex');
   *   },
   *   { gapLimit: 20, batchSize: 50 }
   * );
   *
   * discovered.forEach(({ index, identityId }) => {
   *   console.log(`Index ${index}: ${identityId}`);
   * });
   * ```
   */
  async scanByIndex(
    publicKeyHashGenerator: (index: number) => Promise<string>,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveredIdentity[]> {
    const gapLimit = options.gapLimit ?? 20;
    const batchSize = options.batchSize ?? 50;
    const onProgress = options.onProgress;

    if (typeof publicKeyHashGenerator !== 'function') {
      throw new Error('publicKeyHashGenerator must be a function');
    }

    if (gapLimit <= 0 || !Number.isInteger(gapLimit)) {
      throw new Error(`Invalid gapLimit: ${gapLimit}. Must be positive integer`);
    }

    if (batchSize <= 0 || !Number.isInteger(batchSize)) {
      throw new Error(`Invalid batchSize: ${batchSize}. Must be positive integer`);
    }

    const foundIdentities: DiscoveredIdentity[] = [];
    let consecutiveNotFound = 0;
    let currentIndex = 0;
    let batchNumber = 0;

    try {
      logger.debug(`Starting identity scan (gapLimit: ${gapLimit}, batchSize: ${batchSize})`);

      // Iterative batch discovery - continue until gap limit reached
      while (consecutiveNotFound < gapLimit) {
        batchNumber++;
        const batchStartIndex = currentIndex;

        // Generate hashes for this batch
        const hashesToDiscover: Array<{ index: number; publicKeyHash: string }> = [];

        for (let i = 0; i < batchSize && consecutiveNotFound < gapLimit; i++) {
          const index = currentIndex++;

          try {
            const publicKeyHash = await publicKeyHashGenerator(index);

            // Validate hash
            if (!publicKeyHash || publicKeyHash.length !== 40) {
              throw new Error(
                `Invalid hash from generator at index ${index}: expected 40 hex chars, got ${publicKeyHash?.length || 0}`
              );
            }

            hashesToDiscover.push({ index, publicKeyHash });
          } catch (error) {
            logger.error(`Failed to generate hash at index ${index}:`, error);
            throw new Error(
              `Hash generation failed at index ${index}: ${(error as Error).message}`
            );
          }
        }

        logger.debug(
          `Batch ${batchNumber}: Scanning indices ${batchStartIndex}-${batchStartIndex + hashesToDiscover.length - 1}`
        );

        // Batch discovery for this set of hashes
        const hashes = hashesToDiscover.map(item => item.publicKeyHash);
        const results = await this.discoverByHashBatch(hashes);

        // Process results
        let foundInBatch = 0;
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const item = hashesToDiscover[i];

          if (result.found && result.identityId) {
            // Identity found
            foundIdentities.push({
              index: item.index,
              publicKeyHash: item.publicKeyHash,
              identityId: result.identityId,
              balance: result.balance,
              revision: result.revision,
            });

            foundInBatch++;
            consecutiveNotFound = 0; // Reset gap counter

            logger.debug(`  [${item.index}] ${result.identityId}`);
          } else {
            // Identity not found - increment gap counter
            consecutiveNotFound++;

            // Stop immediately if gap limit reached
            if (consecutiveNotFound >= gapLimit) {
              logger.debug(
                `  Gap limit (${gapLimit}) reached at index ${item.index} - stopping scan`
              );
              break;
            }
          }
        }

        logger.debug(
          `Batch ${batchNumber} complete: Found ${foundInBatch} identities ` +
            `(total: ${foundIdentities.length}, gap: ${consecutiveNotFound})`
        );

        // Progress callback
        if (onProgress) {
          try {
            onProgress({
              currentIndex,
              foundCount: foundIdentities.length,
              batchNumber,
              consecutiveNotFound,
            });
          } catch (callbackError) {
            logger.warn('Progress callback error (non-fatal):', callbackError);
          }
        }

        // Stop if gap limit reached
        if (consecutiveNotFound >= gapLimit) {
          logger.debug(`Gap limit (${gapLimit}) reached - stopping scan`);
          break;
        }
      }

      logger.info(
        `Scan complete: ${foundIdentities.length} identities found ` +
          `across ${batchNumber} batches`
      );

      return foundIdentities;
    } catch (error) {
      logger.error(`Identity scan failed:`, error);
      throw new Error(`Identity scan failed: ${(error as Error).message}`);
    }
  }
}
