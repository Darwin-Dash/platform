/**
 * BloomFilterBuilder - Create bloom filters for address sets
 * Used to efficiently filter transactions from DAPI stream
 */

import dashcore from '@dashevo/dashcore-lib';
const { BloomFilter, Address } = dashcore;
import { BloomFilterParams } from './types.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('BloomFilterBuilder');

export class BloomFilterBuilder {
  // Matches js-dash-sdk false positive rate for consistent behavior
  // See: wallet-lib/src/transport/DAPIClientTransport/methods/subscribeToTransactionsWithProofs.js
  private static readonly BLOOM_FALSE_POSITIVE_RATE = 0.0001;

  /**
   * Build a bloom filter for a set of Dash addresses
   * @param addresses - Array of Dash addresses (mainnet/testnet/change formats supported)
   * @param network - 'mainnet' or 'testnet'
   * @returns Bloom filter as plain object with vData, nHashFuncs, nTweak, nFlags
   */
  static build(addresses: string[], network: string): BloomFilterParams {
    // Handle empty address array - return minimal valid bloom filter
    if (addresses.length === 0) {
      const emptyFilter = BloomFilter.create(
        1, // nElements - minimum size
        this.BLOOM_FALSE_POSITIVE_RATE,
        0, // nTweak
        BloomFilter.BLOOM_UPDATE_ALL
      );
      return this.filterToParams(emptyFilter);
    }

    // Create bloom filter with appropriate size and false positive rate
    // Use 10 elements per address as a reasonable estimate
    // False positive rate matches js-dash-sdk pattern for consistency
    const filter = BloomFilter.create(
      addresses.length * 10, // nElements
      this.BLOOM_FALSE_POSITIVE_RATE,
      0, // nTweak
      BloomFilter.BLOOM_UPDATE_ALL
    );

    // Add each address's hash to the filter
    addresses.forEach((addressString) => {
      try {
        const address = Address.fromString(addressString, network);
        // Add the address hash buffer to the bloom filter
        filter.insert(address.hashBuffer);
      } catch (error) {
        // Skip invalid addresses
        logger.warn(`Invalid address: ${addressString}`, error);
      }
    });

    return this.filterToParams(filter);
  }

  /**
   * Create a bloom filter from address hashes directly
   * Useful if you already have the hash buffers
   * @param addressHashes - Array of address hash buffers
   * @returns Bloom filter as plain object with vData, nHashFuncs, nTweak, nFlags
   */
  static buildFromHashes(addressHashes: Buffer[]): BloomFilterParams {
    // Handle empty hash array
    if (addressHashes.length === 0) {
      const emptyFilter = BloomFilter.create(
        1, // nElements - minimum size
        this.BLOOM_FALSE_POSITIVE_RATE,
        0,
        BloomFilter.BLOOM_UPDATE_ALL
      );
      return this.filterToParams(emptyFilter);
    }

    const filter = BloomFilter.create(
      addressHashes.length * 10,
      this.BLOOM_FALSE_POSITIVE_RATE,
      0,
      BloomFilter.BLOOM_UPDATE_ALL
    );

    addressHashes.forEach((hash) => {
      filter.insert(hash);
    });

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
}
