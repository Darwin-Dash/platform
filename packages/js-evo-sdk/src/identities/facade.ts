/**
 * IdentitiesFacade - Unified Identity Operations API
 *
 * Main entry point for all identity operations. Delegates to specialized facades:
 * - IdentityFetcher: Read identity data
 * - CreditOperations: Transfer and withdraw credits
 * - IdentityCreation: Create new identities
 * - IdentityUpdater: Top up existing identities
 * - IdentityDiscovery: Discover identities from addresses
 *
 * Architecture:
 * - Completely independent of wallet-lib
 * - Uses modular coordinators and stateless components
 * - Clean separation of concerns
 * - Composable and extensible
 */

import * as wasm from '../wasm.js';
import type { EvoSDK } from '../sdk.js';
import { IdentityFetcher } from './facades/identity-fetcher.js';
import { CreditOperations } from './facades/credit-operations.js';
import { IdentityCreator } from './facades/identity-creator.js';
import { IdentityUpdater } from './facades/identity-updater.js';
import { IdentityDiscovery } from './facades/identity-discovery.js';
import { createLogger } from './utils/identity-logger.js';

const logger = createLogger('IdentitiesFacade');

/**
 * IdentitiesFacade - Unified API for all identity operations
 *
 * Provides comprehensive identity operations including:
 * - Fetching identities and keys from Platform
 * - Creating new identities with wallet coordination
 * - Topping up existing identities
 * - Transferring credits between identities
 * - Withdrawing credits to blockchain addresses
 * - Discovering identities from wallet addresses
 *
 * @example
 * ```typescript
 * const sdk = new EvoSDK(...);
 * const identities = sdk.identities;
 *
 * // Fetch an identity
 * const identity = await identities.fetch(identityId);
 *
 * // Create a new identity
 * const result = await identities.createWithWallet(
 *   mnemonic,
 *   200000,
 *   { onProgress: (e) => console.log(e.message) }
 * );
 *
 * // Top up an identity
 * await identities.topUpWithWallet(identityId, 50000, mnemonic);
 *
 * // Transfer credits between identities
 * await identities.creditTransfer({
 *   senderId: id1,
 *   recipientId: id2,
 *   amount: 100000,
 *   privateKeyWif: key
 * });
 * ```
 */
export class IdentitiesFacade {
  private sdk: EvoSDK;
  private fetcher: IdentityFetcher;
  private creditOps: CreditOperations;
  private creator: IdentityCreator;
  private updater: IdentityUpdater;
  private discovery: IdentityDiscovery;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
    this.fetcher = new IdentityFetcher(sdk);
    this.creditOps = new CreditOperations(sdk);
    this.creator = new IdentityCreator(sdk);
    this.updater = new IdentityUpdater(sdk);
    this.discovery = new IdentityDiscovery(sdk);

    logger.debug('IdentitiesFacade initialized');
  }

  // ============================================================================
  // Read Operations (via IdentityFetcher)
  // ============================================================================

  /**
   * Fetch identity by ID
   * @param identityId Identity ID in Base58 format
   * @returns Identity object from Platform
   */
  async fetch(identityId: string): Promise<wasm.IdentityWasm> {
    return this.fetcher.fetch(identityId);
  }

  /**
   * Get identity by ID (alias for fetch)
   * @param identityId Identity ID in Base58 format
   * @returns Identity object from Platform
   */
  async get(identityId: string): Promise<wasm.IdentityWasm> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentity(identityId);
  }

  /**
   * Get identity by ID with proof (alias for fetchWithProof)
   * @param identityId Identity ID in Base58 format
   * @returns Identity with proof information
   */
  async getWithProof(identityId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityWithProofInfo(identityId);
  }

  /**
   * Fetch identity with proof
   * @param identityId Identity ID in Base58 format
   * @returns Identity with proof information
   */
  async fetchWithProof(identityId: string): Promise<any> {
    return this.fetcher.fetchWithProof(identityId);
  }

  /**
   * Fetch identity without proof (faster)
   * @param identityId Identity ID in Base58 format
   * @returns Identity object without proof
   */
  async fetchUnproved(identityId: string): Promise<wasm.IdentityWasm> {
    return this.fetcher.fetchUnproved(identityId);
  }

  /**
   * Get identity keys
   * @param args Key retrieval options
   * @returns Keys for the identity
   */
  async getKeys(args: {
    identityId: string;
    keyRequestType: 'all' | 'specific' | 'search';
    specificKeyIds?: number[];
    searchPurposeMap?: unknown;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    return this.fetcher.getKeys(args);
  }

  /**
   * Get identity keys with proof
   * Note: WASM SDK's getIdentityKeysWithProofInfo does not support search_purpose_map.
   * If search is needed, use getKeys() instead.
   * @param args Key retrieval options
   * @returns Keys for the identity with proof
   */
  async getKeysWithProof(args: {
    identityId: string;
    keyRequestType: 'all' | 'specific' | 'search';
    specificKeyIds?: number[];
    searchPurposeMap?: unknown;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    const { identityId, keyRequestType, specificKeyIds, limit = 100, offset = 0 } = args;

    if (keyRequestType === 'search') {
      throw new Error('Search by purpose map with proof is not supported by the WASM SDK. Use getKeys() for search operations.');
    }

    const keyIds = specificKeyIds ? Uint32Array.from(specificKeyIds) : null;
    return w.getIdentityKeysWithProofInfo(identityId, keyRequestType, keyIds, limit, offset);
  }

  /**
   * Get identity nonce
   * @param identityId Identity ID in Base58 format
   * @returns Identity nonce
   */
  async nonce(identityId: string): Promise<bigint> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityNonce(identityId);
  }

  /**
   * Get identity nonce with proof
   * @param identityId Identity ID in Base58 format
   * @returns Identity nonce with proof
   */
  async nonceWithProof(identityId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityNonceWithProofInfo(identityId);
  }

  /**
   * Get identity contract nonce
   * @param identityId Identity ID in Base58 format
   * @param contractId Contract ID in Base58 format
   * @returns Contract nonce for identity
   */
  async contractNonce(identityId: string, contractId: string): Promise<bigint> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityContractNonce(identityId, contractId);
  }

  /**
   * Get identity contract nonce with proof
   * @param identityId Identity ID in Base58 format
   * @param contractId Contract ID in Base58 format
   * @returns Contract nonce with proof
   */
  async contractNonceWithProof(identityId: string, contractId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityContractNonceWithProofInfo(identityId, contractId);
  }

  /**
   * Get identity balance
   * @param identityId Identity ID in Base58 format
   * @returns Identity balance in duffs
   */
  async balance(identityId: string): Promise<bigint> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityBalance(identityId);
  }

  /**
   * Get identity balance with proof
   * @param identityId Identity ID in Base58 format
   * @returns Balance with proof
   */
  async balanceWithProof(identityId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityBalanceWithProofInfo(identityId);
  }

  /**
   * Get multiple identity balances
   * @param identityIds Array of identity IDs
   * @returns Balances for all identities
   */
  async balances(identityIds: string[]): Promise<bigint[]> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentitiesBalances(identityIds);
  }

  /**
   * Get multiple identity balances with proof
   * @param identityIds Array of identity IDs
   * @returns Balances with proof
   */
  async balancesWithProof(identityIds: string[]): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentitiesBalancesWithProofInfo(identityIds);
  }

  /**
   * Get identity balance and revision
   * @param identityId Identity ID in Base58 format
   * @returns Balance and revision
   */
  async balanceAndRevision(identityId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityBalanceAndRevision(identityId);
  }

  /**
   * Get identity balance and revision with proof
   * @param identityId Identity ID in Base58 format
   * @returns Balance and revision with proof
   */
  async balanceAndRevisionWithProof(identityId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityBalanceAndRevisionWithProofInfo(identityId);
  }

  /**
   * Get identity by public key hash
   * @param publicKeyHash Public key hash
   * @returns Identity
   */
  async byPublicKeyHash(publicKeyHash: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityByPublicKeyHash(publicKeyHash);
  }

  /**
   * Get identity by public key hash with proof
   * @param publicKeyHash Public key hash
   * @returns Identity with proof
   */
  async byPublicKeyHashWithProof(publicKeyHash: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityByPublicKeyHashWithProofInfo(publicKeyHash);
  }

  /**
   * Get identities by non-unique public key hash
   * @param publicKeyHash Public key hash
   * @param options Query options
   * @returns Array of identities
   */
  async byNonUniquePublicKeyHash(
    publicKeyHash: string,
    options?: { startAfter?: string }
  ): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    const cursor = options?.startAfter || null;
    return w.getIdentityByNonUniquePublicKeyHash(publicKeyHash, cursor);
  }

  /**
   * Get identities by non-unique public key hash with proof
   * @param publicKeyHash Public key hash
   * @returns Array of identities with proof
   */
  async byNonUniquePublicKeyHashWithProof(publicKeyHash: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityByNonUniquePublicKeyHashWithProofInfo(publicKeyHash, null);
  }

  /**
   * Get contract keys for identities
   * @param args Query options
   * @returns Contract keys
   */
  async contractKeys(args: {
    identityIds: string[];
    contractId: string;
    purposes?: number[];
  }): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    const { identityIds, contractId, purposes } = args;
    const purposesArray = purposes ? Uint32Array.from(purposes) : null;
    return w.getIdentitiesContractKeys(identityIds, contractId, purposesArray);
  }

  /**
   * Get contract keys for identities with proof
   * @param args Query options
   * @returns Contract keys with proof
   */
  async contractKeysWithProof(args: {
    identityIds: string[];
    contractId: string;
    purposes?: number[];
  }): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    const { identityIds, contractId, purposes } = args;
    const purposesArray = purposes ? Uint32Array.from(purposes) : null;
    return w.getIdentitiesContractKeysWithProofInfo(identityIds, contractId, purposesArray);
  }

  /**
   * Get token balances for identity
   * @param identityId Identity ID in Base58 format
   * @param tokenIds Array of token IDs
   * @returns Token balances
   */
  async tokenBalances(identityId: string, tokenIds: string[]): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityTokenBalances(identityId, tokenIds);
  }

  /**
   * Get token balances for identity with proof
   * @param identityId Identity ID in Base58 format
   * @param tokenIds Array of token IDs
   * @returns Token balances with proof
   */
  async tokenBalancesWithProof(identityId: string, tokenIds: string[]): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityTokenBalancesWithProofInfo(identityId, tokenIds);
  }

  // ============================================================================
  // Identity Creation (via IdentityCreator)
  // ============================================================================

  /**
   * Create a new identity with asset lock proof and keys
   *
   * @param args Creation options
   * @returns Identity creation result
   */
  async create(args: {
    assetLockProof: unknown;
    assetLockPrivateKeyWif: string;
    publicKeys: unknown[];
  }): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    const { assetLockProof, assetLockPrivateKeyWif, publicKeys } = args;
    const proofJson = JSON.stringify(assetLockProof);
    const keysJson = JSON.stringify(publicKeys);
    return w.identityCreate(proofJson, assetLockPrivateKeyWif, keysJson);
  }

  /**
   * Create a new identity with wallet coordination
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @param amount Amount in duffs to fund identity with
   * @param options Advanced options
   * @returns Identity creation result
   *
   * @example
   * ```typescript
   * const result = await identities.createWithWallet(
   *   'abandon abandon ... about',
   *   200000,
   *   { onProgress: (e) => console.log(e.message) }
   * );
   * console.log('Created:', result.identityId);
   * ```
   */
  async createWithWallet(
    mnemonic: string,
    amount: number,
    options?: {
      startHeight?: number;
      useSourceAsChangeAddress?: boolean;
      onProgress?: (event: any) => void;
    }
  ): Promise<any> {
    return this.creator.createWithWallet(mnemonic, amount, options);
  }

  /**
   * Create identity with pre-synced account (DEPRECATED)
   *
   * @deprecated Use createWithWallet() instead
   */
  async createWithAccount(account: any, amount: number, options?: any): Promise<any> {
    return this.creator.createWithAccount(account, amount, options);
  }

  // ============================================================================
  // Identity Top-Up (via IdentityUpdater)
  // ============================================================================

  /**
   * Top up an existing identity with asset lock proof
   *
   * @param args Top-up options
   * @returns Top-up result
   */
  async topUp(args: {
    identityId: string;
    assetLockProof: unknown;
    assetLockPrivateKeyWif: string;
  }): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    const { identityId, assetLockProof, assetLockPrivateKeyWif } = args;
    const proofJson = JSON.stringify(assetLockProof);
    return w.identityTopUp(identityId, proofJson, assetLockPrivateKeyWif);
  }

  /**
   * Top up an existing identity with wallet coordination
   *
   * @param identityId Identity to top up (Base58)
   * @param amount Amount in duffs
   * @param mnemonic 12-word BIP39 mnemonic for funding
   * @param options Advanced options
   * @returns Top-up result
   *
   * @example
   * ```typescript
   * const result = await identities.topUpWithWallet(
   *   identityId,
   *   50000,
   *   mnemonic,
   *   { onProgress: (e) => console.log(e.message) }
   * );
   * console.log('New balance:', result.newBalance);
   * ```
   */
  async topUpWithWallet(
    identityId: string,
    amount: number,
    mnemonic: string,
    options?: {
      startHeight?: number;
      useSourceAsChangeAddress?: boolean;
      onProgress?: (event: any) => void;
    }
  ): Promise<any> {
    return this.updater.topUpWithWallet(identityId, amount, mnemonic, options);
  }

  /**
   * Top up identity with pre-synced account (DEPRECATED)
   *
   * @deprecated Use topUpWithWallet() instead
   */
  async topUpWithAccount(identityId: string, account: any, amount: number, options?: any): Promise<any> {
    return this.updater.topUpWithAccount(identityId, account, amount, options);
  }

  // ============================================================================
  // Credit Operations (via CreditOperations)
  // ============================================================================

  /**
   * Transfer credits between identities
   *
   * @param args Transfer options
   * @returns Transfer result
   *
   * @example
   * ```typescript
   * const result = await identities.creditTransfer({
   *   senderId: 'sender...',
   *   recipientId: 'recipient...',
   *   amount: 100000,
   *   privateKeyWif: 'key...'
   * });
   * ```
   */
  async creditTransfer(args: {
    senderId: string;
    recipientId: string;
    amount: number | bigint | string;
    privateKeyWif: string;
    keyId?: number;
  }): Promise<any> {
    return this.creditOps.creditTransfer(args);
  }

  /**
   * Withdraw credits to a blockchain address
   *
   * @param args Withdrawal options
   * @returns Withdrawal result
   *
   * @example
   * ```typescript
   * const result = await identities.creditWithdrawal({
   *   identityId: 'identity...',
   *   toAddress: 'yXxxx...',
   *   amount: 100000,
   *   privateKeyWif: 'key...'
   * });
   * ```
   */
  async creditWithdrawal(args: {
    identityId: string;
    toAddress: string;
    amount: number | bigint | string;
    privateKeyWif: string;
    coreFeePerByte?: number;
    keyId?: number;
  }): Promise<any> {
    return this.creditOps.creditWithdrawal(args);
  }

  // ============================================================================
  // Identity Updates (via WASM SDK directly - keep as-is for now)
  // ============================================================================

  /**
   * Update identity with new keys
   *
   * @param args Update options
   * @returns Update result
   */
  async update(args: {
    identityId: string;
    addPublicKeys?: unknown[];
    disablePublicKeyIds?: number[];
    privateKeyWif: string;
  }): Promise<any> {
    const { identityId, addPublicKeys, disablePublicKeyIds, privateKeyWif } = args;
    const w = await this.sdk.getWasmSdkConnected();

    const { asJsonString } = await import('../util.js');

    return w.identityUpdate(
      identityId,
      addPublicKeys ? asJsonString(addPublicKeys)! : null,
      disablePublicKeyIds ? Uint32Array.from(disablePublicKeyIds) : null,
      privateKeyWif
    );
  }

  // ============================================================================
  // Identity Discovery (via IdentityDiscovery)
  // ============================================================================

  /**
   * Discover identity by public key hash
   *
   * @param publicKeyHashHex 20-byte public key hash (40 hex chars)
   * @returns Discovery result with identity ID if found
   */
  async discoverByHash(publicKeyHashHex: string): Promise<{
    found: boolean;
    identityId?: string;
    balance?: number;
    revision?: number;
  }> {
    return this.discovery.discoverByHash(publicKeyHashHex);
  }

  /**
   * Discover multiple identities by public key hashes in batch
   *
   * @param publicKeyHashesHex Array of public key hashes (40 hex chars each)
   * @returns Array of discovery results
   */
  async discoverByHashBatch(publicKeyHashesHex: string[]): Promise<
    Array<{
      found: boolean;
      identityId?: string;
      balance?: number;
      revision?: number;
    }>
  > {
    return this.discovery.discoverByHashBatch(publicKeyHashesHex);
  }

  /**
   * Scan and discover identities by index with gap detection
   *
   * @param publicKeyHashGenerator Function that generates hash at given index
   * @param options Discovery options
   * @returns Array of discovered identities
   */
  async scanByIndex(
    publicKeyHashGenerator: (index: number) => Promise<string>,
    options?: {
      gapLimit?: number;
      batchSize?: number;
      onProgress?: (state: any) => void;
    }
  ): Promise<any[]> {
    return this.discovery.scanByIndex(publicKeyHashGenerator, options);
  }

  /**
   * Get all identity IDs for a wallet mnemonic
   *
   * Discovers all identities associated with a wallet by:
   * 1. Deriving HD keys at sequential indices
   * 2. Computing public key hash for each
   * 3. Querying Platform for identities via DAPI
   * 4. Stopping after gap limit (N consecutive not found)
   *
   * NOTE: This method uses DAPI-client directly (not the worker system)
   * to avoid WASM RwLock conflicts that occur with the batch worker.
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @param options Discovery options
   * @returns Array of discovered identities with their indices
   *
   * @example
   * ```typescript
   * const identities = await sdk.identities.getIdentityIds(mnemonic);
   * identities.forEach(({ index, identityId }) => {
   *   console.log(`Index ${index}: ${identityId}`);
   * });
   * ```
   */
  async getIdentityIds(
    mnemonic: string,
    options: {
      gapLimit?: number;
      batchSize?: number;
      onProgress?: (state: { currentIndex: number; foundCount: number }) => void;
    } = {}
  ): Promise<
    Array<{
      index: number;
      identityId: string;
      publicKeyHash: string;
      balance?: number;
      revision?: number;
    }>
  > {
    // Validate mnemonic
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12) {
      throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
    }

    const gapLimit = options.gapLimit ?? 20;
    const batchSize = options.batchSize ?? 10;
    const onProgress = options.onProgress;

    // Import required modules
    const { Wallet } = await import('@dashevo/wallet-lib');
    const DAPIClient = (await import('@dashevo/dapi-client')).default;
    const wasmSdk = await import('@dashevo/wasm-sdk');
    const initWasm = wasmSdk.default;
    const { IdentityWasm } = wasmSdk;

    // Initialize wasm-sdk for IdentityWasm.fromBuffer() decoding
    await initWasm();

    // Create DAPI client
    const client = new DAPIClient({ network: this.sdk.networkConfig.network });

    // Create offline wallet for key derivation only
    const wallet = new Wallet({
      mnemonic,
      network: this.sdk.networkConfig.network,
      offlineMode: true,
    });

    const foundIdentities: Array<{
      index: number;
      identityId: string;
      publicKeyHash: string;
      balance?: number;
      revision?: number;
    }> = [];

    try {
      // wallet-lib doesn't have TypeScript types, use `as any` to avoid strict checking
      const account = await wallet.getAccount({
        index: 0,
        disableIdentitySync: true,
      } as any);

      let consecutiveNotFound = 0;
      let currentIndex = 0;
      let batchNumber = 0;

      // Iterative discovery with gap limit
      while (consecutiveNotFound < gapLimit) {
        batchNumber++;

        // Process batch
        for (let i = 0; i < batchSize && consecutiveNotFound < gapLimit; i++) {
          const index = currentIndex++;

          // Derive HD key for this index
          const { privateKey } = account.identities.getIdentityHDKeyByIndex(index, 0);
          const publicKey = privateKey.toPublicKey();
          const publicKeyHashHex = publicKey.hash.toString('hex');

          // Query Platform directly via DAPI
          try {
            const hashBuffer = Buffer.from(publicKeyHashHex, 'hex');
            const response = await client.platform.getIdentityByPublicKeyHash(hashBuffer, { prove: false });

            if (response.identity && response.identity.length > 0) {
              // Decode identity buffer using IdentityWasm.fromBuffer()
              const identity = IdentityWasm.fromBuffer(response.identity);
              const identityJson = identity.toJSON();
              const identityId = identityJson.id;

              foundIdentities.push({
                index,
                identityId,
                publicKeyHash: publicKeyHashHex,
              });
              consecutiveNotFound = 0;
              logger.debug(`  [${index}] ${identityId}`);
            } else {
              consecutiveNotFound++;
            }
          } catch (error: any) {
            // Not found is expected for most indices
            if (error.message && error.message.includes('not found')) {
              consecutiveNotFound++;
            } else {
              logger.debug(`Discovery error for index ${index}: ${error.message}`);
              consecutiveNotFound++;
            }
          }

          // Check gap limit
          if (consecutiveNotFound >= gapLimit) {
            logger.debug(`Gap limit (${gapLimit}) reached at index ${index}`);
            break;
          }
        }

        // Progress callback
        if (onProgress) {
          try {
            onProgress({
              currentIndex,
              foundCount: foundIdentities.length,
            });
          } catch {
            // Non-fatal callback error
          }
        }
      }

      logger.info(`Discovery complete: ${foundIdentities.length} identities found`);
      return foundIdentities;
    } finally {
      // Cleanup wallet
      if (wallet && typeof wallet.disconnect === 'function') {
        try {
          await wallet.disconnect();
        } catch {
          // Non-fatal cleanup error
        }
      }
    }
  }

  /**
   * Get the next available HD index for identity creation
   *
   * Discovers all existing identities and returns the next unused index.
   * If no identities exist, returns 0.
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @param options Discovery options
   * @returns Next available index for identity creation
   *
   * @example
   * ```typescript
   * const nextIndex = await sdk.identities.getNextAvailableIndex(mnemonic);
   * console.log(`Next available index: ${nextIndex}`);
   *
   * // Use for identity creation
   * await sdk.identities.createWithWallet(mnemonic, 200000, { identityIndex: nextIndex });
   * ```
   */
  async getNextAvailableIndex(
    mnemonic: string,
    options?: {
      gapLimit?: number;
      batchSize?: number;
      onProgress?: (state: { currentIndex: number; foundCount: number }) => void;
    }
  ): Promise<number> {
    const identities = await this.getIdentityIds(mnemonic, options);

    if (identities.length === 0) {
      return 0;
    }

    const maxIndex = Math.max(...identities.map(i => i.index));
    return maxIndex + 1;
  }
}
