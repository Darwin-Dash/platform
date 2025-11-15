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

  // ============================================================================
  // Identity Creation (via IdentityCreator)
  // ============================================================================

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
}
