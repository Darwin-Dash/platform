/**
 * TransactionSyncer - Sync transactions from DAPI stream
 * Handles transaction and merkle block messages with metadata extraction
 */
import { TransactionWithMetadata, SyncProgress, BloomFilterParams, DAPIClientLike } from '../types/index.js';
export declare class TransactionSyncer {
    private dapiClient;
    private network;
    private syncInProgress;
    private readonly logger;
    private headerCache;
    private static readonly MAX_UINT32;
    constructor(dapiClient: DAPIClientLike, network?: string);
    /**
     * Set the network for the syncer
     * @param network - 'mainnet' or 'testnet'
     */
    setNetwork(network: string): void;
    /**
     * Get the current network
     * @returns The current network ('mainnet' or 'testnet')
     */
    getNetwork(): string;
    /**
     * Validate block height for protobuf serialization
     * Block heights must be valid uint32 values (0 to 4294967295)
     * @param height - The block height to validate
     * @param fieldName - Name of the field for error messages
     * @returns Validated block height as integer
     * @throws Error if height is invalid
     * @private
     */
    private validateBlockHeight;
    /**
     * Get core client
     * @private
     */
    private getCore;
    /**
     * Retry helper for DAPI operations that may fail with NOT_FOUND
     * Some DAPI nodes may be pruned/behind and not have recent blocks.
     *
     * This is a workaround for @dashevo/dapi-client not retrying NOT_FOUND errors.
     * See: packages/resilient-dapi-client/KNOWN_ISSUES.md#issue-1
     *
     * Enhanced to ban failing nodes before retry to ensure node rotation.
     * gRPC transport doesn't ban nodes on error (unlike JSON-RPC), so we
     * explicitly ban them to force selection of a different node.
     *
     * @param operation - The async operation to retry
     * @param operationName - Name for logging
     * @param maxRetries - Maximum number of retry attempts (default: 5)
     * @returns The result of the operation
     * @private
     */
    private retryOnNotFound;
    /**
     * Ban the last used DAPI node to force rotation on retry
     *
     * gRPC transport in DAPIClient has a known issue where it doesn't mark nodes
     * as banned on error (unlike JSON-RPC transport). This method explicitly bans
     * the failing node to ensure the next retry uses a different node.
     *
     * @returns The host of the banned node (if available) for logging, or undefined
     * @private
     */
    private banLastUsedNode;
    /**
     * Sync transactions for addresses via DAPI stream
     *
     * IMPORTANT: This syncer maintains a stateless design where all addresses are provided
     * upfront (before sync starts). This prevents the race condition described in
     * PRD Section 5.1-5.4 where dynamic address discovery during sync could cause
     * incomplete UTXO discovery due to bloom filter not being expanded in time.
     *
     * See: PRD_UTXO_FINDER.md Section 5.1-5.4 "Race Condition Bug"
     *
     * @param bloomFilter - Bloom filter params { vData, nHashFuncs, nTweak, nFlags }
     * @param fromHeight - Start block height
     * @param toHeight - End block height (current if omitted)
     * @param onProgress - Optional progress callback
     * @param timeout - Optional timeout in milliseconds for stream operations (default: undefined for no timeout)
     * @returns Array of transactions with metadata
     * @throws Error if sync is already in progress (prevents concurrent syncs)
     */
    syncTransactions(bloomFilter: BloomFilterParams, fromHeight: number, toHeight?: number, onProgress?: (progress: SyncProgress) => void, timeout?: number): Promise<TransactionWithMetadata[]>;
    /**
     * Pre-sync block headers to build metadata cache
     * Uses streaming API (subscribeToBlockHeadersWithChainLocks) for efficiency
     * Following wallet-lib pattern: streaming batched headers, not individual calls
     * @private
     */
    private syncHeaders;
    /**
     * Validate and normalize block height parameters
     * Handles missing toHeight, validates ranges, and ensures genesis block constraints
     * @private
     */
    private validateHeightParameters;
    /**
     * Extract and process raw transactions from stream message
     * @private
     */
    private extractRawTransactions;
    /**
     * Process merkle block message and update transaction metadata
     * @private
     */
    private processMerkleBlock;
    /**
     * Process instant lock messages from stream
     * @private
     */
    private processInstantLocks;
    /**
     * Process chain lock messages from stream
     * @private
     */
    private processChainLocks;
    /**
     * Internal sync implementation
     * @private
     */
    private _performSync;
    /**
     * Parse InstantSend Lock message from DAPI stream
     * Extracts transaction ID, inputs, and BLS signature
     *
     * @param isdlockBuffer - Raw InstantLock message buffer from DAPI
     * @returns Parsed InstantLock data with txId for matching
     * @private
     */
    private parseInstantSendLock;
    /**
     * Parse ChainLock message from DAPI stream
     * Extracts block height, block hash, and BLS signature
     *
     * @param chainlockBuffer - Raw ChainLock message buffer from DAPI
     * @returns Parsed ChainLock data with height and blockHash for matching
     * @private
     */
    private parseChainLock;
    /**
     * Get block height for a given block hash
     * @param blockHash - Block hash
     * @returns Block height
     */
    private getBlockHeight;
}
//# sourceMappingURL=TransactionSyncer.d.ts.map