/**
 * TransactionSyncer - Sync transactions from DAPI stream
 * Handles transaction and merkle block messages with metadata extraction
 */

import dashcore from '@dashevo/dashcore-lib';
const { Transaction, MerkleBlock, InstantLock, ChainLock } = dashcore;

import {
  TransactionWithMetadata,
  TransactionMetadata,
  SyncProgress,
  BloomFilterParams,
  InstantLockData,
  ChainLockData,
  DAPIClientLike,
} from './types.js';
import { makeAsyncIterable } from './StreamWrapper.js';
import { Logger, createLogger } from '../../../utils/logger.js';

export class TransactionSyncer {
  private dapiClient: DAPIClientLike; // ResilientDAPIClient or DAPIClient
  private network: string;
  private syncInProgress: boolean = false;
  private readonly logger: Logger;

  // Header cache for fast metadata lookup (avoids async getBlockByHash calls)
  // Maps blockHash → {height, time} for instant access during merkle block processing
  // Following wallet-lib pattern: pre-sync headers before transactions
  private headerCache = new Map<string, { height: number; time: number }>();

  // Maximum value for uint32 (protobuf constraint)
  private static readonly MAX_UINT32 = 4294967295;

  constructor(dapiClient: DAPIClientLike, network: string = 'testnet') {
    this.dapiClient = dapiClient;
    this.network = network;
    this.logger = createLogger('TransactionSyncer');
  }

  /**
   * Set the network for the syncer
   * @param network - 'mainnet' or 'testnet'
   */
  setNetwork(network: string): void {
    this.network = network;
  }

  /**
   * Get the current network
   * @returns The current network ('mainnet' or 'testnet')
   */
  getNetwork(): string {
    return this.network;
  }

  /**
   * Validate block height for protobuf serialization
   * Block heights must be valid uint32 values (0 to 4294967295)
   * @param height - The block height to validate
   * @param fieldName - Name of the field for error messages
   * @returns Validated block height as integer
   * @throws Error if height is invalid
   * @private
   */
  private validateBlockHeight(height: number | undefined, fieldName: string): number {
    // Check if undefined or null
    if (height === undefined || height === null) {
      throw new Error(`${fieldName} is required but was not provided`);
    }

    // Convert to number if needed
    const heightNum = Number(height);

    // Check if valid number
    if (!Number.isFinite(heightNum)) {
      throw new Error(
        `${fieldName} must be a valid number, got: ${height} (type: ${typeof height})`
      );
    }

    // Check if non-negative
    if (heightNum < 0) {
      throw new Error(`${fieldName} must be non-negative, got: ${heightNum}`);
    }

    // Check if within uint32 range (protobuf requirement)
    if (heightNum > TransactionSyncer.MAX_UINT32) {
      throw new Error(
        `${fieldName} exceeds maximum value (${TransactionSyncer.MAX_UINT32}), got: ${heightNum}`
      );
    }

    // Return as integer
    return Math.floor(heightNum);
  }

  /**
   * Get core client
   * @private
   */
  private getCore(): any {
    // ResilientDAPIClient always provides synchronous access to the core namespace
    return this.dapiClient.core;
  }

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
   * @returns Array of transactions with metadata
   * @throws Error if sync is already in progress (prevents concurrent syncs)
   */
  async syncTransactions(
    bloomFilter: BloomFilterParams,
    fromHeight: number,
    toHeight?: number,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<TransactionWithMetadata[]> {
    // Guard against concurrent syncs (Race condition prevention)
    // PRD Section 5.2: Dual-check strategy requires clean state transitions
    if (this.syncInProgress) {
      throw new Error(
        'Transaction sync already in progress. Wait for current sync to complete or create a new TransactionSyncer instance.'
      );
    }

    this.syncInProgress = true;

    try {
      return await this._performSync(bloomFilter, fromHeight, toHeight, onProgress);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Pre-sync block headers to build metadata cache
   * Uses streaming API (subscribeToBlockHeadersWithChainLocks) for efficiency
   * Following wallet-lib pattern: streaming batched headers, not individual calls
   * @private
   */
  private async syncHeaders(
    fromHeight: number,
    toHeight: number
  ): Promise<void> {
    this.logger.info(`Pre-syncing headers from ${fromHeight} to ${toHeight} via streaming API`);

    const core = this.getCore();
    const totalHeaders = toHeight - fromHeight + 1;
    let syncedHeaders = 0;
    let currentHeight = fromHeight;

    try {
      // Use streaming header API (efficient, batched)
      // This matches wallet-lib BlockHeadersProvider approach
      const stream = core.subscribeToBlockHeadersWithChainLocks({
        fromBlockHeight: fromHeight,
        count: toHeight - fromHeight,
      });

      // Handle both async and sync stream returns
      let actualStream = stream;
      if (actualStream && typeof actualStream.then === 'function') {
        actualStream = await actualStream;
      }

      // Convert to async iterable
      const asyncStream = makeAsyncIterable(actualStream);

      // Process batched headers from stream
      for await (const message of asyncStream) {
        const msg = message as any;

        // Extract block headers (protobuf getter pattern)
        const blockHeaders = typeof msg.getBlockHeaders === 'function'
          ? msg.getBlockHeaders()
          : msg.blockHeaders;

        if (blockHeaders) {
          // Get list of headers (may be nested protobuf)
          const headersList = typeof blockHeaders.getHeadersList === 'function'
            ? blockHeaders.getHeadersList()
            : (Array.isArray(blockHeaders) ? blockHeaders : []);

          // Process each header in the batch
          headersList.forEach((headerBuf: any) => {
            try {
              // Parse header buffer
              const BlockHeader = require('@dashevo/dashcore-lib').BlockHeader;
              const header = new BlockHeader(Buffer.from(headerBuf));

              // Cache header metadata
              // Height is sequential from stream position
              this.headerCache.set(header.hash, {
                height: currentHeight,
                time: header.time,
              });

              currentHeight++;
              syncedHeaders++;
            } catch (error) {
              this.logger.warn(`Failed to parse header:`, (error as Error).message);
            }
          });

          this.logger.info(`Cached ${syncedHeaders}/${totalHeaders} headers`);
        }
      }

      this.logger.info(`Header pre-sync complete: ${this.headerCache.size} headers cached`);
    } catch (error) {
      this.logger.error('Error during header pre-sync:', error);
      throw new Error(`Failed to pre-sync headers: ${error}`);
    }
  }

  /**
   * Validate and normalize block height parameters
   * Handles missing toHeight, validates ranges, and ensures genesis block constraints
   * @private
   */
  private async validateHeightParameters(
    fromHeight: number,
    toHeight?: number
  ): Promise<{ validatedFromHeight: number; validatedToHeight: number }> {
    // Validate fromHeight first
    let validatedFromHeight: number;
    try {
      validatedFromHeight = this.validateBlockHeight(fromHeight, 'fromHeight');
    } catch (error) {
      throw new Error(`Invalid fromHeight: ${error}`);
    }

    // Get current chain height if toHeight not specified
    let validatedToHeight: number;
    if (!toHeight) {
      try {
        const core = this.getCore();
        const status = await core.getBlockchainStatus();

        // Try multiple possible field names for block count
        toHeight =
          status?.chain?.blocksCount ||
          status?.chain?.headersCount ||
          status?.blocks ||
          undefined;

        if (!toHeight) {
          this.logger.warn(
            'Could not determine chain height from blockchain status, using fromHeight as fallback'
          );
          toHeight = validatedFromHeight;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get chain status: ${error instanceof Error ? error.message : String(error)}`
        );
        this.logger.warn('Using fromHeight as fallback for toHeight');
        toHeight = validatedFromHeight;
      }
    }

    // Validate toHeight
    try {
      validatedToHeight = this.validateBlockHeight(toHeight, 'toHeight');
    } catch (error) {
      throw new Error(`Invalid toHeight: ${error}`);
    }

    // Ensure fromHeight >= 1 (genesis block is non-spendable)
    if (validatedFromHeight < 1) {
      this.logger.warn(
        `fromHeight (${validatedFromHeight}) is less than 1 (genesis non-spendable), setting to 1`
      );
      validatedFromHeight = 1;
    }

    // Ensure toHeight >= fromHeight
    if (validatedToHeight < validatedFromHeight) {
      this.logger.warn(
        `toHeight (${validatedToHeight}) is less than fromHeight (${validatedFromHeight}), swapping values`
      );
      [validatedFromHeight, validatedToHeight] = [validatedToHeight, validatedFromHeight];
    }

    return { validatedFromHeight, validatedToHeight };
  }

  /**
   * Extract and process raw transactions from stream message
   * @private
   */
  private extractRawTransactions(
    msg: any,
    transactions: TransactionWithMetadata[]
  ): { txMessageCount: number } {
    let txMessageCount = 0;

    // Try both accessor patterns (protobuf getters vs plain properties)
    const rawTxs = typeof msg.getRawTransactions === 'function'
      ? msg.getRawTransactions()
      : msg.rawTransactions;

    if (rawTxs) {
      // Check if it's a protobuf object with getTransactionsList method
      const txList = typeof (rawTxs as any).getTransactionsList === 'function'
        ? (rawTxs as any).getTransactionsList()
        : (Array.isArray(rawTxs) ? rawTxs : null);

      if (txList && txList.length > 0) {
        txMessageCount++;
        const txs = txList.map(
          (buf: any) => new Transaction(Buffer.from(buf))
        );
        this.logger.debug(`Processing ${txs.length} raw transactions`);
        txs.forEach((tx: any) => {
          if (this.logger.isDebugEnabled()) {
            this.logger.debug(`Found TX: ${tx.hash}`);
          }
          transactions.push({
            tx,
            metadata: null, // Will be updated from merkle block
          });
        });
      }
    }

    return { txMessageCount };
  }

  /**
   * Process merkle block message and update transaction metadata
   * @private
   */
  private processMerkleBlock(
    msg: any,
    transactions: TransactionWithMetadata[],
    validatedFromHeight: number,
    syncedBlocks: { count: number },
    totalBlocks: number,
    onProgress?: (progress: SyncProgress) => void
  ): { merkleBlockCount: number } {
    let merkleBlockCount = 0;

    // Try both accessor patterns (protobuf getters vs plain properties)
    const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
      ? msg.getRawMerkleBlock()
      : msg.rawMerkleBlock;

    if (rawMerkle) {
      merkleBlockCount++;
      try {
        const merkleBlock = new MerkleBlock(Buffer.from(rawMerkle));
        const blockHash = merkleBlock.header.hash;

        // Lookup block height from pre-synced header cache (instant, no async call!)
        // This follows wallet-lib pattern: headers synced first, then instant lookup
        const cachedHeader = this.headerCache.get(blockHash);
        const blockHeight = cachedHeader?.height || 0;
        const blockTime = cachedHeader ? cachedHeader.time : merkleBlock.header.time;

        if (this.logger.isDebugEnabled()) {
          this.logger.debug(`Processing merkle block ${merkleBlockCount}:`, {
            blockHash,
            numHashes: merkleBlock.hashes?.length || 0,
            height: blockHeight,
            cached: !!cachedHeader,
            time: new Date(blockTime * 1000).toISOString(),
          });
        }

        if (!cachedHeader) {
          this.logger.warn(`WARNING: Block ${blockHash} not in header cache!`);
        }

        // Extract transaction hashes from merkle block
        const txHashesInBlock = new Set(
          merkleBlock.hashes.map((h: any) => {
            const hashStr = String(h);
            const buf = Buffer.from(hashStr, 'hex');
            const reversed = buf.reverse().toString('hex');
            if (this.logger.isDebugEnabled()) {
              this.logger.debug(`Merkle block TX hash: ${hashStr} -> reversed: ${reversed}`);
            }
            return reversed;
          })
        );

        if (this.logger.isDebugEnabled()) {
          this.logger.debug(`Attempting to match ${txHashesInBlock.size} merkle hashes with ${transactions.length} transactions`);
        }

        // Update metadata for transactions in this block
        let matchedCount = 0;
        transactions
          .filter(({ tx }) => {
            const match = txHashesInBlock.has(tx.hash);
            if (this.logger.isDebugEnabled()) {
              if (match) {
                this.logger.debug(`✓ Matched TX ${tx.hash} to merkle block`);
                matchedCount++;
              } else {
                this.logger.debug(`✗ TX ${tx.hash} not in merkle block`);
              }
            } else if (match) {
              matchedCount++;
            }
            return match;
          })
          .forEach((txData) => {
            txData.metadata = {
              blockHash: blockHash,
              height: blockHeight,
              time: new Date(blockTime * 1000),
              isChainLocked: false, // Updated from chainlock messages
              isInstantLocked: false, // Updated from instant lock messages
            };
          });

        if (this.logger.isDebugEnabled()) {
          this.logger.debug(`Matched ${matchedCount} transactions to merkle block`);
        }

        syncedBlocks.count++;
        if (onProgress) {
          onProgress({
            progress: (syncedBlocks.count / totalBlocks) * 100,
            syncedBlocks: syncedBlocks.count,
            totalBlocks,
            currentHeight: validatedFromHeight + syncedBlocks.count,
          });
        }
      } catch (error) {
        this.logger.warn('Failed to process merkle block:', error);
      }
    }

    return { merkleBlockCount };
  }

  /**
   * Process instant lock messages from stream
   * @private
   */
  private processInstantLocks(
    msg: any,
    transactions: TransactionWithMetadata[]
  ): void {
    // Try both accessor patterns (protobuf getters vs plain properties)
    const instantLocks = typeof msg.getInstantSendLockMessages === 'function'
      ? msg.getInstantSendLockMessages()
      : msg.instantSendLockMessages;

    if (instantLocks && Array.isArray(instantLocks)) {
      instantLocks.forEach((lockMsg: Buffer) => {
        try {
          // Parse InstantLock message to extract txId
          const instantLock = this.parseInstantSendLock(lockMsg);

          // Find matching transaction by txId (exact match)
          const txData = transactions.find(
            ({ tx }) => tx.hash === instantLock.txid
          );

          // Mark transaction as InstantLocked
          if (txData && txData.metadata) {
            txData.metadata.isInstantLocked = true;
          }
        } catch (error) {
          // Log warning but continue processing (non-critical)
          this.logger.warn('Failed to process instant lock message:', error);
        }
      });
    }
  }

  /**
   * Process chain lock messages from stream
   * @private
   */
  private processChainLocks(
    msg: any,
    transactions: TransactionWithMetadata[]
  ): void {
    // Try both accessor patterns (protobuf getters vs plain properties)
    const chainLocks = typeof msg.getChainLockMessages === 'function'
      ? msg.getChainLockMessages()
      : msg.chainLockMessages;

    if (chainLocks && Array.isArray(chainLocks)) {
      chainLocks.forEach((lockMsg: Buffer) => {
        try {
          // Parse ChainLock message to extract block height and hash
          const chainLock = this.parseChainLock(lockMsg);

          // Mark ALL transactions in this block as ChainLocked
          // ChainLock applies to entire block, not individual transactions
          transactions
            .filter(
              ({ metadata }) =>
                metadata && metadata.blockHash === chainLock.blockHash
            )
            .forEach((txData) => {
              if (txData.metadata) {
                txData.metadata.isChainLocked = true;
              }
            });
        } catch (error) {
          // Log warning but continue processing (non-critical)
          this.logger.warn('Failed to process chainlock message:', error);
        }
      });
    }
  }

  /**
   * Internal sync implementation
   * @private
   */
  private async _performSync(
    bloomFilter: BloomFilterParams,
    fromHeight: number,
    toHeight?: number,
    onProgress?: (progress: SyncProgress) => void
  ): Promise<TransactionWithMetadata[]> {
    // Validate and normalize height parameters
    const { validatedFromHeight, validatedToHeight } = await this.validateHeightParameters(
      fromHeight,
      toHeight
    );

    const transactions: TransactionWithMetadata[] = [];
    const totalBlocks = Math.max(1, validatedToHeight - validatedFromHeight);
    const syncedBlocks = { count: 0 };

    try {
      // PHASE 1: Pre-sync block headers
      // Following wallet-lib pattern: sync headers first to build metadata cache
      // This avoids slow/failing async getBlockByHash() calls during stream processing
      await this.syncHeaders(validatedFromHeight, validatedToHeight);

      // PHASE 2: Sync transactions with pre-cached header metadata
      // Get the core client
      const core = this.getCore();

      // Subscribe to transaction stream with bloom filter
      // Historical sync: count specifies exact block range to sync
      // timeout: undefined means no deadline on the stream (streaming can take time on public infrastructure)
      // This matches js-dash-sdk pattern for historical synchronization
      const blockRange = validatedToHeight - validatedFromHeight;

      // Log bloom filter details for diagnostics (debug level)
      if (this.logger.isDebugEnabled()) {
        this.logger.debug('Bloom filter details:', {
          hasBloomFilter: !!bloomFilter,
          vDataLength: bloomFilter?.vData?.length || 0,
          nHashFuncs: bloomFilter?.nHashFuncs,
          nTweak: bloomFilter?.nTweak,
          nFlags: bloomFilter?.nFlags,
        });
        this.logger.debug('Calling subscribeToTransactionsWithProofs:', {
          fromBlockHeight: validatedFromHeight,
          count: blockRange > 0 ? blockRange : 0,
          blockRange,
        });
      }

      let rawStream = core.subscribeToTransactionsWithProofs(
        bloomFilter,
        {
          fromBlockHeight: validatedFromHeight,
          count: blockRange > 0 ? blockRange : 0, // Specific range or 0 if same block
          timeout: undefined, // No deadline for historical streams
        }
      );

      // Handle both async and sync stream returns
      // Some DAPI client implementations return a Promise that resolves to a stream
      if (rawStream && typeof rawStream.then === 'function') {
        rawStream = await rawStream;
      }

      // Convert gRPC event-based stream to async iterable
      // gRPC streams use event emitters (on('data'), on('end'))
      // but we need async iterable for for-await loops
      const stream = makeAsyncIterable(rawStream);

      // Process stream messages
      let messageCount = 0;
      let txMessageCount = 0;
      let merkleBlockCount = 0;

      for await (const message of stream) {
        messageCount++;
        // Type assertion for DAPI stream message structure
        const msg = message as any;

        // Log message type for diagnostics (debug level)
        if (this.logger.isDebugEnabled()) {
          const hasGetters = typeof msg.getRawTransactions === 'function';
          const rawTxs = typeof msg.getRawTransactions === 'function'
            ? msg.getRawTransactions()
            : msg.rawTransactions;
          const rawMerkle = typeof msg.getRawMerkleBlock === 'function'
            ? msg.getRawMerkleBlock()
            : msg.rawMerkleBlock;
          const instantLocks = typeof msg.getInstantSendLockMessages === 'function'
            ? msg.getInstantSendLockMessages()
            : msg.instantSendLockMessages;
          const chainLocks = typeof msg.getChainLockMessages === 'function'
            ? msg.getChainLockMessages()
            : msg.chainLockMessages;

          this.logger.debug(`Message ${messageCount}:`, {
            isProtobuf: hasGetters,
            hasRawTransactions: !!rawTxs,
            hasRawMerkleBlock: !!rawMerkle,
            hasInstantSendLocks: !!instantLocks,
            hasChainLocks: !!chainLocks,
            messageKeys: Object.keys(msg).slice(0, 10),
          });
        }

        // Extract and process raw transactions using helper
        const txResult = this.extractRawTransactions(msg, transactions);
        txMessageCount += txResult.txMessageCount;

        // Process merkle block using helper
        const merkleResult = this.processMerkleBlock(
          msg,
          transactions,
          validatedFromHeight,
          syncedBlocks,
          totalBlocks,
          onProgress
        );
        merkleBlockCount += merkleResult.merkleBlockCount;

        // Process instant lock messages using helper
        this.processInstantLocks(msg, transactions);

        // Process chain lock messages using helper
        this.processChainLocks(msg, transactions);
      }

      // Log summary statistics
      this.logger.info(`Sync complete - Summary:`, {
        totalMessages: messageCount,
        txMessages: txMessageCount,
        merkleBlocks: merkleBlockCount,
        totalTransactions: transactions.length,
        transactionsWithMetadata: transactions.filter(({ metadata }) => metadata !== null).length,
        transactionsWithoutMetadata: transactions.filter(({ metadata }) => metadata === null).length,
      });

      // Log each transaction's final metadata state (debug level)
      if (this.logger.isDebugEnabled()) {
        transactions.forEach(({ tx, metadata }, index) => {
          this.logger.debug(`TX ${index + 1}/${transactions.length}:`, {
            hash: tx.hash,
            hasMetadata: !!metadata,
            blockHeight: metadata?.height || 0,
            blockHash: metadata?.blockHash || 'none',
            isChainLocked: metadata?.isChainLocked || false,
            isInstantLocked: metadata?.isInstantLocked || false,
          });
        });
      }
    } catch (error) {
      // Handle stream errors gracefully
      this.logger.error('Error during transaction sync:', error);
      throw new Error(`Failed to sync transactions: ${error}`);
    }

    return transactions;
  }

  /**
   * Parse InstantSend Lock message from DAPI stream
   * Extracts transaction ID, inputs, and BLS signature
   *
   * @param isdlockBuffer - Raw InstantLock message buffer from DAPI
   * @returns Parsed InstantLock data with txId for matching
   * @private
   */
  private parseInstantSendLock(isdlockBuffer: Buffer): InstantLockData {
    try {
      // Use dashcore-lib InstantLock class to parse buffer
      const instantLock: any = new InstantLock(isdlockBuffer);

      return {
        version: instantLock.version,
        inputs: instantLock.inputs || [],
        txid: instantLock.txid,
        cyclehash: instantLock.cyclehash,
        signature: instantLock.signature,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse InstantSend lock message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Parse ChainLock message from DAPI stream
   * Extracts block height, block hash, and BLS signature
   *
   * @param chainlockBuffer - Raw ChainLock message buffer from DAPI
   * @returns Parsed ChainLock data with height and blockHash for matching
   * @private
   */
  private parseChainLock(chainlockBuffer: Buffer): ChainLockData {
    try {
      // Use dashcore-lib ChainLock class to parse buffer
      const chainLock: any = new ChainLock(chainlockBuffer);

      return {
        height: chainLock.height,
        blockHash:
          typeof chainLock.blockHash === 'string'
            ? chainLock.blockHash
            : chainLock.blockHash.toString('hex'),
        signature:
          typeof chainLock.signature === 'string'
            ? chainLock.signature
            : chainLock.signature.toString('hex'),
      };
    } catch (error) {
      throw new Error(
        `Failed to parse ChainLock message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get block height for a given block hash
   * @param blockHash - Block hash
   * @returns Block height
   */
  private async getBlockHeight(blockHash: string): Promise<number> {
    if (this.logger.isDebugEnabled()) {
      this.logger.debug(`getBlockHeight called for hash: ${blockHash}`);
    }
    try {
      // Query DAPI for block info by hash
      const core = this.getCore();
      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`Calling core.getBlockByHash(${blockHash})`);
      }
      const blockInfo = await core.getBlockByHash(blockHash);
      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`getBlockByHash response:`, blockInfo);
      }
      const height = blockInfo.height || 0;
      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`Extracted height: ${height}`);
      }
      return height;
    } catch (error) {
      this.logger.warn(`Failed to get block height for hash ${blockHash}:`, error);
      return 0;
    }
  }
}
