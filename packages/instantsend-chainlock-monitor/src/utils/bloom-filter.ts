/**
 * Bloom Filter Utilities
 *
 * Creates bloom filters for DAPI stream subscriptions using dashcore-lib.
 * This is the PROVEN pattern that fixed the "DAPI stream delivers ZERO data events" issue.
 *
 * CRITICAL: Must use dashcore-lib's BloomFilter.create() - custom implementations
 * are incompatible with DAPI's bloom filter expectations.
 */

import dashcore from '@dashevo/dashcore-lib';

const { BloomFilter, Address } = dashcore;

/**
 * Default false positive rate for bloom filters
 * Lower = more bandwidth, Higher = more false positives
 */
export const DEFAULT_BLOOM_FALSE_POSITIVE_RATE = 0.0001;

/**
 * Create a bloom filter for monitoring specific Dash addresses
 *
 * @param addresses Single address or array of addresses to monitor
 * @param network Network name (mainnet, testnet, regtest)
 * @param falsePositiveRate False positive rate (default: 0.0001)
 * @returns Bloom filter ready for DAPI subscription
 *
 * @example
 * ```typescript
 * const filter = createAddressBloomFilter(
 *   'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
 *   'testnet'
 * );
 * const stream = await dapiClient.core.subscribeToTransactionsWithProofs(filter, {...});
 * ```
 */
export function createAddressBloomFilter(
  addresses: string | string[],
  network: string,
  falsePositiveRate: number = DEFAULT_BLOOM_FALSE_POSITIVE_RATE
): any {
  const addressArray = Array.isArray(addresses) ? addresses : [addresses];

  // Create bloom filter with size based on number of addresses
  const bloomFilter = (BloomFilter as any).create(addressArray.length, falsePositiveRate);

  // Insert each address into the filter
  for (const addressString of addressArray) {
    const addressModel = new Address(addressString, network);
    bloomFilter.insert((addressModel as any).hashBuffer);
  }

  return bloomFilter;
}

/**
 * Get bloom filter statistics
 * Useful for debugging and optimization
 */
export function getBloomFilterStats(bloomFilter: any): {
  size: number;
  hashFunctions: number;
  falsePositiveRate: number;
} {
  return {
    size: bloomFilter.vData.length,
    hashFunctions: bloomFilter.nHashFuncs,
    falsePositiveRate: bloomFilter.getFalsePositiveRate?.() || 0,
  };
}
