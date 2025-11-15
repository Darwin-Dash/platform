/**
 * BloomFilterBuilder - Create bloom filters for address sets
 *
 * Consolidated from dash-utxo-finder and instantsend-chainlock-monitor implementations.
 * Used to efficiently filter transactions from DAPI stream.
 *
 * CRITICAL: Must use dashcore-lib's BloomFilter.create() - custom implementations
 * are incompatible with DAPI's bloom filter expectations.
 */

import dashcore from '@dashevo/dashcore-lib';
const { BloomFilter, Address } = dashcore;
import { BloomFilterParams } from '../types/dapi-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BloomFilterBuilder');

// Type assertion for BloomFilter API (runtime JavaScript methods not in TypeScript defs)
const BF: any = BloomFilter;

/**
 * Default false positive rate for bloom filters
 * Matches js-dash-sdk false positive rate for consistent behavior
 * Lower = more bandwidth, Higher = more false positives
 */
export const DEFAULT_BLOOM_FALSE_POSITIVE_RATE = 0.0001;

export class BloomFilterBuilder {
  private static readonly BLOOM_FALSE_POSITIVE_RATE = DEFAULT_BLOOM_FALSE_POSITIVE_RATE;

  /**
   * Build a bloom filter for a set of Dash addresses
   * @param addresses - Array of Dash addresses (mainnet/testnet/change formats supported)
   * @param network - 'mainnet', 'testnet', or 'regtest'
   * @param falsePositiveRate - Optional custom false positive rate (defaults to 0.0001)
   * @returns Bloom filter as plain object with vData, nHashFuncs, nTweak, nFlags
   *
   * @example
   * ```typescript
   * const filter = BloomFilterBuilder.build(
   *   ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
   *   'testnet'
   * );
   * const stream = await dapiClient.core.subscribeToTransactionsWithProofs(filter, {...});
   * ```
   */
  static build(
    addresses: string[],
    network: string,
    falsePositiveRate: number = this.BLOOM_FALSE_POSITIVE_RATE
  ): BloomFilterParams {
    // Handle empty address array - return minimal valid bloom filter
    if (addresses.length === 0) {
      logger.warn('Building bloom filter with zero addresses');
      const emptyFilter = BF.create(
        1, // nElements - minimum size
        falsePositiveRate,
        0, // nTweak
        BF.BLOOM_UPDATE_ALL
      );
      return this.filterToParams(emptyFilter);
    }

    // Create bloom filter with appropriate size and false positive rate
    // Use 10 elements per address as a reasonable estimate
    // False positive rate matches js-dash-sdk pattern for consistency
    const filter = BF.create(
      addresses.length * 10, // nElements
      falsePositiveRate,
      0, // nTweak
      BF.BLOOM_UPDATE_ALL
    );

    logger.debug(`Building bloom filter for ${addresses.length} addresses`);

    // Add each address's hash to the filter
    let validAddresses = 0;
    addresses.forEach((addressString) => {
      try {
        const address = Address.fromString(addressString, network);
        // Add the address hash buffer to the bloom filter
        filter.insert(address.hashBuffer);
        validAddresses++;
      } catch (error) {
        // Skip invalid addresses but warn
        logger.warn(`Skipping invalid address: ${addressString}`, error);
      }
    });

    if (validAddresses === 0) {
      throw new Error('No valid addresses provided for bloom filter');
    }

    logger.debug(`Bloom filter created with ${validAddresses} valid addresses`);
    return this.filterToParams(filter);
  }

  /**
   * Create a bloom filter from a single address (convenience method)
   * @param address - Single Dash address
   * @param network - 'mainnet', 'testnet', or 'regtest'
   * @param falsePositiveRate - Optional custom false positive rate
   * @returns Bloom filter as plain object
   */
  static buildForAddress(
    address: string,
    network: string,
    falsePositiveRate: number = this.BLOOM_FALSE_POSITIVE_RATE
  ): BloomFilterParams {
    return this.build([address], network, falsePositiveRate);
  }

  /**
   * Create a bloom filter from address hashes directly
   * Useful if you already have the hash buffers
   * @param addressHashes - Array of address hash buffers
   * @param falsePositiveRate - Optional custom false positive rate
   * @returns Bloom filter as plain object with vData, nHashFuncs, nTweak, nFlags
   */
  static buildFromHashes(
    addressHashes: Buffer[],
    falsePositiveRate: number = this.BLOOM_FALSE_POSITIVE_RATE
  ): BloomFilterParams {
    // Handle empty hash array
    if (addressHashes.length === 0) {
      logger.warn('Building bloom filter with zero address hashes');
      const emptyFilter = BF.create(
        1, // nElements - minimum size
        falsePositiveRate,
        0,
        BF.BLOOM_UPDATE_ALL
      );
      return this.filterToParams(emptyFilter);
    }

    const filter = BF.create(
      addressHashes.length * 10,
      falsePositiveRate,
      0,
      BF.BLOOM_UPDATE_ALL
    );

    addressHashes.forEach((hash) => {
      filter.insert(hash);
    });

    logger.debug(`Bloom filter created with ${addressHashes.length} address hashes`);
    return this.filterToParams(filter);
  }

  /**
   * Convert a BloomFilter instance to plain object params
   * @param filter - BloomFilter from dashcore-lib
   * @returns Plain object with vData, nHashFuncs, nTweak, nFlags
   */
  private static filterToParams(filter: any): BloomFilterParams {
    // BloomFilter already has the properties we need
    return {
      vData: Buffer.from(filter.vData), // Convert array to Buffer if needed
      nHashFuncs: filter.nHashFuncs,
      nTweak: filter.nTweak,
      nFlags: filter.nFlags,
    };
  }

  /**
   * Get bloom filter statistics
   * Useful for debugging and optimization
   * @param filter - Bloom filter params or instance
   * @returns Statistics about the bloom filter
   */
  static getStats(filter: BloomFilterParams | any): {
    size: number;
    hashFunctions: number;
    estimatedFalsePositiveRate?: number;
  } {
    return {
      size: filter.vData.length,
      hashFunctions: filter.nHashFuncs,
      estimatedFalsePositiveRate: filter.getFalsePositiveRate?.(),
    };
  }
}
