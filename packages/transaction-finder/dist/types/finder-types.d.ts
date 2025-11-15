/**
 * Transaction finder mode types
 */
/**
 * Operating mode for the transaction finder
 * - HISTORIC: Blockchain scanning for past transactions (UTXO discovery)
 * - REALTIME: Real-time InstantSend/ChainLock monitoring
 * - HYBRID: Combined historic scanning + realtime monitoring
 */
export declare enum FinderMode {
    HISTORIC = "historic",
    REALTIME = "realtime",
    HYBRID = "hybrid"
}
/**
 * Base configuration for all finder modes
 */
export interface BaseFinderConfig {
    /** Network to operate on */
    network: 'mainnet' | 'testnet' | 'regtest';
    /** Addresses to monitor/discover transactions for */
    addresses: string[];
    /** DAPI client instance */
    dapiClient?: any;
    /** DAPI addresses (for direct connection) */
    dapiAddresses?: string[];
    /** DNS seeds (alternative to dapiAddresses) */
    seeds?: string[];
    /** Connection timeout in milliseconds */
    timeout?: number;
    /** Number of retry attempts */
    retries?: number;
    /** Bloom filter false positive rate */
    bloomFalsePositiveRate?: number;
    /** Log level for debug output */
    logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}
/**
 * Configuration specific to historic finding
 */
export interface HistoricFinderConfig extends BaseFinderConfig {
    mode: FinderMode.HISTORIC;
    /** Starting block height for scan */
    fromHeight: number;
    /** Ending block height for scan (optional, defaults to current tip) */
    toHeight?: number;
    /** Required amount in satoshis (scan stops when found) */
    requiredAmount?: number;
    /** Storage adapter for caching (optional) */
    storageAdapter?: any;
    /** Progress callback */
    onProgress?: (progress: SyncProgress) => void;
}
/**
 * Configuration specific to realtime monitoring
 */
export interface RealtimeFinderConfig extends BaseFinderConfig {
    mode: FinderMode.REALTIME;
    /** Maximum stream reconnection attempts */
    maxReconnectAttempts?: number;
    /** Base reconnection delay in milliseconds */
    reconnectDelay?: number;
    /** Enable DAPI node failover on connection failure */
    enableDAPIFailover?: boolean;
    /** Minimum time before retrying a failed DAPI node */
    dapiNodeRetryDelay?: number;
    /** Auto-prune transactions after ChainLock confirmation */
    autoPruneOnConfirmation?: boolean;
    /** Maximum tracked transactions before throwing error */
    maxTrackedTransactions?: number;
    /** Enable adaptive polling for ChainLock height */
    adaptivePolling?: boolean;
    /** Base ChainLock polling interval in milliseconds */
    basePollInterval?: number;
    /** Maximum ChainLock polling interval during failures */
    maxPollInterval?: number;
    /** Minimum allowed polling interval to prevent DAPI abuse */
    minPollInterval?: number;
}
/**
 * Configuration specific to hybrid mode
 */
export interface HybridFinderConfig extends BaseFinderConfig {
    mode: FinderMode.HYBRID;
    /** Historic scan configuration */
    historic: Omit<HistoricFinderConfig, 'mode' | 'network' | 'addresses' | 'dapiClient' | 'dapiAddresses' | 'seeds'>;
    /** Realtime monitoring configuration */
    realtime: Omit<RealtimeFinderConfig, 'mode' | 'network' | 'addresses' | 'dapiClient' | 'dapiAddresses' | 'seeds'>;
}
/**
 * Unified configuration type that supports all modes
 */
export type TransactionFinderConfig = HistoricFinderConfig | RealtimeFinderConfig | HybridFinderConfig;
/**
 * Progress event emitted during historic transaction sync
 */
export interface SyncProgress {
    /** Progress percentage (0-100) */
    progress: number;
    /** Number of blocks synced */
    syncedBlocks: number;
    /** Total blocks to sync */
    totalBlocks: number;
    /** Current block height */
    currentHeight: number;
}
//# sourceMappingURL=finder-types.d.ts.map