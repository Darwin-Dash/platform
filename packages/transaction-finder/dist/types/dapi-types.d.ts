/**
 * DAPI client and stream type definitions
 */
/**
 * DAPI Client interface - supports both legacy DAPIClient and ResilientDAPIClient
 * This allows for gradual migration and backward compatibility
 */
export interface DAPIClientLike {
    core: {
        subscribeToBlockHeadersWithChainLocks: (options: any) => any;
        subscribeToTransactionsWithProofs: (filter: any, options: any) => any;
        getBlockchainStatus: () => Promise<any>;
        getBlockByHash: (hash: string) => Promise<any>;
    };
    platform?: {
        getEpochsInfo?: (options?: any) => Promise<any>;
    };
}
/**
 * Bloom filter parameters for DAPI transaction filtering
 * Expected by subscribeToTransactionsWithProofs as a plain object
 */
export interface BloomFilterParams {
    /** The filter data */
    vData: Buffer;
    /** Number of hash functions */
    nHashFuncs: number;
    /** Tweak value */
    nTweak: number;
    /** Flags (update behavior) */
    nFlags: number;
}
//# sourceMappingURL=dapi-types.d.ts.map