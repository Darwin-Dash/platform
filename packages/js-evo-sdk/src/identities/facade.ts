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
import { IdentityCreator, type IdentityCreationResult } from './facades/identity-creator.js';
import { IdentityUpdater, type IdentityTopUpResult } from './facades/identity-updater.js';
import { IdentityDiscovery } from './facades/identity-discovery.js';
import { UTXOFinder, type SpendableUTXOResult, type UTXOSearchProgress } from './coordination/utxo-finder.js';
import { type DerivedAddressInfo } from './coordination/wallet-coordinator.js';
import { type UTXO } from '@dashevo/transaction-finder';
import { createLogger } from './utils/identity-logger.js';
import { DAPI_CONFIG } from './config/operation-config.js';

const logger = createLogger('IdentitiesFacade');

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } } | undefined;

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
  private utxoFinder: UTXOFinder;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
    this.fetcher = new IdentityFetcher(sdk);
    this.creditOps = new CreditOperations(sdk);
    this.creator = new IdentityCreator(sdk);
    this.updater = new IdentityUpdater(sdk);
    this.discovery = new IdentityDiscovery(sdk);
    this.utxoFinder = new UTXOFinder(sdk);

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

  // ============================================================================
  // UTXO-First Operations (Modular Flow)
  // ============================================================================

  /**
   * Find a spendable UTXO from wallet addresses
   *
   * Uses TransactionFinder in HISTORIC mode to scan blockchain for UTXOs.
   * Returns the latest UTXO meeting minimum amount requirements along with
   * derived addresses for reuse in subsequent create/topup operations.
   *
   * This is Step 1 of the modular UTXO-first workflow:
   * 1. findSpendableUTXO() - Find UTXO
   * 2. createWithUTXO() or topupWithUTXO() - Use the found UTXO
   *
   * @param options UTXO search options
   * @returns Spendable UTXO with derived addresses and scan statistics
   *
   * @example
   * ```typescript
   * // Find UTXO
   * const result = await sdk.identities.findSpendableUTXO({
   *   mnemonic,
   *   startHeight: 1000000,
   *   minAmount: 200000,
   *   onProgress: (event) => console.log(event.message)
   * });
   *
   * console.log(`Found ${result.balance} duffs at ${result.address}`);
   *
   * // Then create identity with the UTXO
   * await sdk.identities.createWithUTXO({
   *   mnemonic,
   *   utxo: result.utxo,
   *   amount: 200000,
   *   derivedAddresses: result.derivedAddresses
   * });
   * ```
   */
  async findSpendableUTXO(options: {
    mnemonic: string;
    startHeight?: number;
    toHeight?: number;
    minAmount?: number;
    addressCount?: number;
    onProgress?: (event: UTXOSearchProgress) => void;
  }): Promise<SpendableUTXOResult> {
    return this.utxoFinder.findSpendableUTXO(options);
  }

  /**
   * Create a new identity with a pre-found UTXO
   *
   * Unlike createWithWallet which scans the blockchain for UTXOs, this method
   * uses a UTXO that was already found via findSpendableUTXO(). This provides:
   * - Faster execution (no redundant blockchain scan)
   * - Separation between UTXO finding and identity creation
   * - Ability to show user the balance before committing
   *
   * @param options Creation options with pre-found UTXO
   * @returns Identity creation result
   *
   * @example
   * ```typescript
   * // Use after findSpendableUTXO
   * const result = await sdk.identities.createWithUTXO({
   *   mnemonic,
   *   utxo: utxoResult.utxo,
   *   amount: 200000,
   *   derivedAddresses: utxoResult.derivedAddresses, // Reuse to avoid re-deriving
   *   onProgress: (event) => console.log(event.message)
   * });
   * console.log('Created identity:', result.identityId);
   * ```
   */
  async createWithUTXO(options: {
    mnemonic: string;
    utxo: UTXO;
    amount: number;
    identityIndex?: number;
    skipDiscovery?: boolean;
    useSourceAsChangeAddress?: boolean;
    derivedAddresses?: {
      external: DerivedAddressInfo[];
      internal: DerivedAddressInfo[];
    };
    onProgress?: (event: any) => void;
  }): Promise<IdentityCreationResult> {
    return this.creator.createWithUTXO(options);
  }

  /**
   * Top up an existing identity with a pre-found UTXO
   *
   * Unlike topUpWithWallet which scans the blockchain for UTXOs, this method
   * uses a UTXO that was already found via findSpendableUTXO(). This provides:
   * - Faster execution (no redundant blockchain scan)
   * - Separation between UTXO finding and top-up operation
   * - Ability to show user the balance before committing
   *
   * @param options Top-up options with pre-found UTXO
   * @returns Top-up result
   *
   * @example
   * ```typescript
   * // Use after findSpendableUTXO
   * const result = await sdk.identities.topupWithUTXO({
   *   mnemonic,
   *   identityId: 'identityId...',
   *   utxo: utxoResult.utxo,
   *   amount: 50000,
   *   derivedAddresses: utxoResult.derivedAddresses,
   *   onProgress: (event) => console.log(event.message)
   * });
   * console.log('New balance:', result.newBalance);
   * ```
   */
  async topupWithUTXO(options: {
    mnemonic: string;
    identityId: string;
    utxo: UTXO;
    amount: number;
    useSourceAsChangeAddress?: boolean;
    derivedAddresses?: {
      external: DerivedAddressInfo[];
      internal: DerivedAddressInfo[];
    };
    onProgress?: (event: any) => void;
  }): Promise<IdentityTopUpResult> {
    return this.updater.topupWithUTXO(options);
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
      onProgress?: (state: { currentIndex: number; foundCount: number; batchNumber: number }) => void;
    } = {}
  ): Promise<
    Array<{
      index: number;
      identityId: string;
      publicKeyHash: string;
      balance?: number;
      revision?: number;
      /** Full identity JSON from Platform (no need to re-fetch) */
      identityJson?: any;
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
    const network = this.sdk.networkConfig.network;

    // Import required modules - NO wallet-lib dependency!
    const DAPIClient = (await import('@dashevo/dapi-client')).default;
    const wasmSdk = await import('@dashevo/wasm-sdk');
    const initWasm = wasmSdk.default;
    // Note: Identity class (not IdentityWasm) with fromBytes (not fromBuffer)
    const { Identity } = wasmSdk;
    const { wallet: walletFunctions } = await import('../wallet/functions.js');
    const dashcoreLib = (await import('@dashevo/dashcore-lib')).default;

    // Initialize wasm-sdk for key derivation and Identity.fromBytes() decoding
    await initWasm();

    // Get DAPI addresses - prioritize env var, then healthy nodes file, then whitelist
    let dapiAddresses: string[] | undefined;
    if (typeof process !== 'undefined' && process?.env?.DAPI_ADDRESSES) {
      dapiAddresses = process.env.DAPI_ADDRESSES.split(',').map((a: string) => a.trim());
      logger.debug(`Using explicit DAPI addresses: ${dapiAddresses.join(', ')}`);
    } else if (network === 'testnet') {
      // Testnet: Try to load pre-built healthy nodes, fall back to whitelist
      // Try healthy-nodes.json in both Node.js and browser
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        // Browser environment - use fetch
        try {
          const response = await fetch('./healthy-nodes.json');
          if (response.ok) {
            const data = await response.json();
            if (data.nodes && data.nodes.length > 0) {
              dapiAddresses = data.nodes;
              logger.debug(`Using ${data.nodes.length} pre-built healthy nodes`);
            }
          }
        } catch {
          // File not found or fetch error - fall through to whitelist
        }
      } else if (typeof process !== 'undefined') {
        // Node.js environment - use fs
        try {
          const fs = await import('fs');
          const path = await import('path');
          const url = await import('url');
          const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
          // Look for healthy-nodes.json in demo folder (relative to dist/identities/)
          const healthyNodesPath = path.join(__dirname, '../../demo/healthy-nodes.json');
          if (fs.existsSync(healthyNodesPath)) {
            const data = JSON.parse(fs.readFileSync(healthyNodesPath, 'utf-8'));
            if (data.nodes && data.nodes.length > 0) {
              dapiAddresses = data.nodes;
              logger.debug(`Using ${data.nodes.length} pre-built healthy nodes from ${healthyNodesPath}`);
            }
          }
        } catch {
          // File not found or read error - fall through to whitelist
        }
      }

      // Fallback to full whitelist if no healthy nodes loaded
      if (!dapiAddresses) {
        try {
          const networkConfigs = await import('@dashevo/dapi-client/lib/networkConfigs.js')
            .then((m: any) => m.default || m);
          const whitelist = networkConfigs?.testnet?.dapiAddressesWhiteList;
          if (whitelist && whitelist.length > 0) {
            dapiAddresses = whitelist;
            logger.debug(`Using ${whitelist.length} whitelist nodes for testnet`);
          }
        } catch (err) {
          logger.debug(`Could not load network configs, using default testnet config`);
        }
      }
    }

    // Create DAPI client with proper configuration
    const client = new DAPIClient({
      network,
      timeout: DAPI_CONFIG.TIMEOUT_MS,
      retries: DAPI_CONFIG.MAX_RETRIES,
      baseBanTime: DAPI_CONFIG.BAN_TIME_MS,
      ...(dapiAddresses && { dapiAddresses }),
    });

    // DIP13: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
    // coin_type: 1 for testnet, 5 for mainnet
    // keyIndex 0 = MASTER key (used for identity lookup)
    const coinType = network === 'mainnet' ? 5 : 1;

    const foundIdentities: Array<{
      index: number;
      identityId: string;
      publicKeyHash: string;
      balance?: number;
      revision?: number;
      identityJson?: any;
    }> = [];

    let consecutiveNotFound = 0;
    let currentIndex = 0;
    let batchNumber = 0;

    // Iterative discovery with gap limit
    while (consecutiveNotFound < gapLimit) {
      batchNumber++;

      // Process batch
      for (let i = 0; i < batchSize && consecutiveNotFound < gapLimit; i++) {
        const index = currentIndex++;

        try {
          // Build DIP13 identity key derivation path for key 0 (MASTER)
          // Format: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
          const path = `m/9'/${coinType}'/5'/0'/0'/${index}'/0'`;

          // Use WASM SDK wallet function to derive key
          const childKey = await walletFunctions.deriveKeyFromSeedWithPath({
            mnemonic,
            passphrase: null,
            path,
            network
          });

          // Get public key and compute hash
          const publicKeyHex = childKey.public_key;

          // Use dashcore-lib to compute public key hash (RIPEMD160(SHA256(pubkey)))
          const PublicKey = dashcoreLib.PublicKey;
          const pubKey = new PublicKey(publicKeyHex);
          const publicKeyHashHex = pubKey.toAddress(network).hashBuffer.toString('hex');

          // Query Platform directly via DAPI
          try {
            const hashBuffer = Buffer.from(publicKeyHashHex, 'hex');
            const response = await client.platform.getIdentityByPublicKeyHash(hashBuffer, { prove: false });

            if (response.identity && response.identity.length > 0) {
              // Decode identity buffer using Identity.fromBytes()
              const identity = Identity.fromBytes(response.identity);
              const identityJson = identity.toJSON();
              const identityId = identityJson.id;

              // Store the full identity JSON (no need to re-fetch later)
              foundIdentities.push({
                index,
                identityId,
                publicKeyHash: publicKeyHashHex,
                balance: identityJson.balance,
                revision: identityJson.revision,
                identityJson,
              });
              consecutiveNotFound = 0;
              logger.debug(`  [${index}] ${identityId} (balance: ${identityJson.balance})`);
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
        } catch (error: any) {
          logger.debug(`Key derivation error for index ${index}: ${error.message}`);
          consecutiveNotFound++;
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
            batchNumber,
          });
        } catch {
          // Non-fatal callback error
        }
      }
    }

    logger.info(`Discovery complete: ${foundIdentities.length} identities found`);
    return foundIdentities;
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
      onProgress?: (state: { currentIndex: number; foundCount: number; batchNumber: number }) => void;
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
