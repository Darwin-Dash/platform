/**
 * BloomFilterBuilder - Create bloom filters for address sets
 *
 * Consolidated from dash-utxo-finder and instantsend-chainlock-monitor implementations.
 * Used to efficiently filter transactions from DAPI stream.
 *
 * CRITICAL: Must use dashcore-lib's BloomFilter.create() - custom implementations
 * are incompatible with DAPI's bloom filter expectations.
 */
import { BloomFilterParams } from '../types/dapi-types.js';
/**
 * Default false positive rate for bloom filters
 * Matches js-dash-sdk false positive rate for consistent behavior
 * Lower = more bandwidth, Higher = more false positives
 */
export declare const DEFAULT_BLOOM_FALSE_POSITIVE_RATE = 0.0001;
export declare class BloomFilterBuilder {
    private static readonly BLOOM_FALSE_POSITIVE_RATE;
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
    static build(addresses: string[], network: string, falsePositiveRate?: number): BloomFilterParams;
    /**
     * Create a bloom filter from a single address (convenience method)
     * @param address - Single Dash address
     * @param network - 'mainnet', 'testnet', or 'regtest'
     * @param falsePositiveRate - Optional custom false positive rate
     * @returns Bloom filter as plain object
     */
    static buildForAddress(address: string, network: string, falsePositiveRate?: number): BloomFilterParams;
    /**
     * Create a bloom filter from address hashes directly
     * Useful if you already have the hash buffers
     * @param addressHashes - Array of address hash buffers
     * @param falsePositiveRate - Optional custom false positive rate
     * @returns Bloom filter as plain object with vData, nHashFuncs, nTweak, nFlags
     */
    static buildFromHashes(addressHashes: Buffer[], falsePositiveRate?: number): BloomFilterParams;
    /**
     * Convert a BloomFilter instance to plain object params
     * @param filter - BloomFilter from dashcore-lib
     * @returns Plain object with vData, nHashFuncs, nTweak, nFlags
     */
    private static filterToParams;
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
    };
}
//# sourceMappingURL=BloomFilterBuilder.d.ts.map