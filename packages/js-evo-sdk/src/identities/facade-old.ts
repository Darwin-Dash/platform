// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } };

import * as wasm from '../wasm.js';
import { asJsonString } from '../util.js';
import type { EvoSDK } from '../sdk.js';
import { EnvironmentConfig } from '../environment.js';
import { UtxoValidator } from './utils/utxo-validation.js';
import { CoinSelector } from './utils/coin-selection.js';
import { TransactionOptionsBuilder } from './utils/transaction-options-builder.js';
import { WalletCoordinator } from './coordination/wallet-coordinator.js';
import { TransactionBuilder } from './coordination/transaction-builder.js';
import { IdentityKeyGenerator } from './coordination/identity-key-generator.js';
import {
  IDENTITY_CONFIG,
  BLOCKCHAIN_CONFIG,
  WALLET_CONFIG,
  WORKER_CONFIG,
  DAPI_CONFIG
} from './config/operation-config.js';
import { createLogger } from './utils/identity-logger.js';
// @ts-ignore - No type definitions available
import InMem from '@dashevo/wallet-lib/src/adapters/InMem.js';
// NOTE: dashcore-lib imports kept for potential future use
// TransactionBuilder handles all transaction operations now
// @ts-ignore - No type definitions available
import dashcoreLib from '@dashevo/dashcore-lib';
// @ts-ignore - Extract classes from dashcore-lib
const { Transaction, Script, Opcode, Address, PrivateKey } = dashcoreLib;

/**
 * IdentitiesFacade - Identity Lifecycle Management
 *
 * Provides comprehensive identity operations for Dash Platform, coordinating
 * wallet-lib (HD wallet), wasm-sdk (Platform operations), and DAPI (network).
 *
 * Architecture (Refactored 2025-10-07):
 * - 4 Coordination Classes: WalletCoordinator, TransactionBuilder, IdentityKeyGenerator, AssetLockProofManager
 * - 2 Utilities: UtxoValidator, CoinSelector
 * - Reduced from 1961 → 946 lines (-52%)
 */
export class IdentitiesFacade {
  private sdk: EvoSDK;
  private logger = createLogger('IdentitiesFacade');

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  /**
   * Fetch identity by ID
   * @param identityId Identity ID in Base58 format
   * @returns Identity object from Platform
   */
  async fetch(identityId: string): Promise<wasm.IdentityWasm> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentity(identityId);
  }

  /**
   * Fetch identity with proof
   * @param identityId Identity ID in Base58 format
   * @returns Identity with proof information
   */
  async fetchWithProof(identityId: string): Promise<any> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityWithProofInfo(identityId);
  }

  /**
   * Fetch identity without proof (faster)
   * @param identityId Identity ID in Base58 format
   * @returns Identity object without proof
   */
  async fetchUnproved(identityId: string): Promise<wasm.IdentityWasm> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityUnproved(identityId);
  }

  async getKeys(args: { identityId: string; keyRequestType: 'all' | 'specific' | 'search'; specificKeyIds?: number[]; searchPurposeMap?: unknown; limit?: number; offset?: number }): Promise<any> {
    const { identityId, keyRequestType, specificKeyIds, searchPurposeMap, limit, offset } = args;
    const mapJson = asJsonString(searchPurposeMap);
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityKeys(
      identityId,
      keyRequestType,
      specificKeyIds ? Uint32Array.from(specificKeyIds) : null,
      mapJson ?? null,
      limit ?? null,
      offset ?? null,
    );
  }

  async create(args: { assetLockProof: unknown; assetLockPrivateKeyWif: string; publicKeys: unknown[] }): Promise<any> {
    const { assetLockProof, assetLockPrivateKeyWif, publicKeys } = args;
    const w = await this.sdk.getWasmSdkConnected();
    return w.identityCreate(asJsonString(assetLockProof)!, assetLockPrivateKeyWif, asJsonString(publicKeys)!);
  }

  async topUp(args: { identityId: string; assetLockProof: unknown; assetLockPrivateKeyWif: string }): Promise<any> {
    const { identityId, assetLockProof, assetLockPrivateKeyWif } = args;
    const w = await this.sdk.getWasmSdkConnected();
    return w.identityTopUp(identityId, asJsonString(assetLockProof)!, assetLockPrivateKeyWif);
  }

  async creditTransfer(args: { senderId: string; recipientId: string; amount: number | bigint | string; privateKeyWif: string; keyId?: number }): Promise<any> {
    const { senderId, recipientId, amount, privateKeyWif, keyId } = args;
    const w = await this.sdk.getWasmSdkConnected();
    return w.identityCreditTransfer(senderId, recipientId, BigInt(amount), privateKeyWif, keyId ?? null);
  }

  async creditWithdrawal(args: { identityId: string; toAddress: string; amount: number | bigint | string; coreFeePerByte?: number; privateKeyWif: string; keyId?: number }): Promise<any> {
    const { identityId, toAddress, amount, coreFeePerByte = 1, privateKeyWif, keyId } = args;
    const w = await this.sdk.getWasmSdkConnected();
    return w.identityCreditWithdrawal(identityId, toAddress, BigInt(amount), coreFeePerByte ?? null, privateKeyWif, keyId ?? null);
  }

  async update(args: { identityId: string; addPublicKeys?: unknown[]; disablePublicKeyIds?: number[]; privateKeyWif: string }): Promise<any> {
    const { identityId, addPublicKeys, disablePublicKeyIds, privateKeyWif } = args;
    const w = await this.sdk.getWasmSdkConnected();
    return w.identityUpdate(
      identityId,
      addPublicKeys ? asJsonString(addPublicKeys)! : null,
      disablePublicKeyIds ? Uint32Array.from(disablePublicKeyIds) : null,
      privateKeyWif,
    );
  }

  // Wallet-coordinated methods for unified HD wallet + identity operations

  /**
   * Create identity with pre-synced account - no wallet sync triggered
   * Accepts pre-synced account for web app integration with fresh funds pattern
   * @param account Pre-synced wallet-lib Account instance
   * @param amount Amount in duffs to fund the identity creation
   * @param options Advanced options for targeting specific UTXOs/addresses
   * @returns Promise that resolves to identity creation result
   * @example
   * ```typescript
   * // Web app pattern: Generate address, wait for funds, create identity
   * const account = await wallet.getAccount({ index: 0 });
   * const { address } = await sdk.wallet.getNewAddress(account);
   * await sdk.wallet.waitForPaymentToAddress(account, address);
   * const result = await sdk.identities.createWithAccount(account, 200000, {
   *   targetAddress: address
   * });
   * ```
   */
  async createWithAccount(
    account: any,
    amount: number,
    options: {
      targetAddress?: string;
      targetUtxo?: { txid: string; vout: number };
      identityIndex?: number;
      useSourceAsChangeAddress?: boolean;
    } = {}
  ): Promise<any> {
    if (!account) {
      throw new Error('Account is required');
    }

    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.CREATE_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new Error(`Invalid amount: must be between ${IDENTITY_CONFIG.CREATE_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT} duffs (got ${amount})`);
    }

    try {
      this.logger.info(`Creating identity with pre-synced account (${amount} duffs)`);

      // Import cleanup utility
      const { waitForWalletCleanup } = await import('./utils/wallet-cleanup.js');

      // Get wallet and DAPIClient from account storage
      let wallet: any;
      let dapiClient: any;

      // Try to get wallet from account (may not be available)
      try {
        wallet = account.wallet;
        if (!wallet) {
          throw new Error('Account wallet not available - use createWithWallet for full control');
        }
      } catch (error) {
        throw new Error('Account wallet reference missing - account must be created via wallet-lib Wallet instance');
      }

      // Step 1: Build transaction options with optional targeting
      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account,
        amount,
        useSourceAsChangeAddress: options.useSourceAsChangeAddress !== false,
        validateUtxoFreshness: false,
        targetAddress: options.targetAddress,
        targetUtxo: options.targetUtxo
      });

      this.logger.debug(`Built transaction with ${utxos.length} UTXO(s)`);

      // Step 2: Create type 8 asset lock transaction
      const txBuilder = new TransactionBuilder();
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        account,
        changeAddress: transactionOptions.change,
        utxos: utxos,
        network: this.sdk.networkConfig.network
      });

      const signedTransaction = txResult.transaction;
      const assetLockPrivateKeyWif = txResult.assetLockPrivateKeyWif;

      // Step 3: Broadcast transaction via wallet-lib (for InstantLock support)
      const transactionIdString = await txBuilder.broadcastTransaction(
        signedTransaction,
        account  // Use account for InstantLock support
      );

      this.logger.info(`Transaction broadcasted: ${transactionIdString}`);

      // Step 4: Discover or use provided identity index
      let identityIndex = options.identityIndex;

      if (identityIndex === undefined) {
        // Discover existing identities
        this.logger.debug('Discovering existing identities...');
        const discoveredIdentities = await this.getIdentityIds(account, {
          gapLimit: 20,
          batchSize: 50
        });

        identityIndex = discoveredIdentities.length > 0
          ? Math.max(...discoveredIdentities.map(item => item.index)) + 1
          : 0;

        this.logger.info(`Discovered ${discoveredIdentities.length} identities, next index: ${identityIndex}`);
      }

      // Step 5: Generate identity keys
      const keyGenerator = new IdentityKeyGenerator();
      const identityKeys = await keyGenerator.generateFromWallet(account, identityIndex);

      // Step 6: Complete wallet operations before WASM
      this.logger.debug('Completing wallet operations...');
      await waitForWalletCleanup(account, WALLET_CONFIG.CLEANUP_DELAY_MS);

      // Step 7: Generate asset lock proof
      const { AssetLockProofManager } = await import('./coordination/asset-lock-proof-manager.js');
      const proofManager = new AssetLockProofManager(this.sdk);
      const transactionHexForProof = signedTransaction.toString();
      const transactionData = await proofManager.executeRace(
        account,
        transactionIdString,
        transactionHexForProof
      );

      // Step 8: Create identity in worker
      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');
      const result = await runWasmOperation('identity-create', {
        transactionData,
        assetLockPrivateKeyWif,
        publicKeys: identityKeys
      }, {
        network: this.sdk.networkConfig.network,
        timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS
      });

      // Step 9: Store identity in wallet storage
      const walletStore = account.storage.getWalletStore(account.walletId);
      walletStore.insertIdentityIdAtIndex(result.identityId, identityIndex);

      this.logger.info(`Identity created successfully at index ${identityIndex}`);

      return {
        status: 'success',
        identityId: result.identityId,
        balance: result.balance,
        publicKeysCount: identityKeys.length,
        transactionHash: transactionIdString,
        identityIndex,
        message: 'Identity created successfully with pre-synced account'
      };

    } catch (error) {
      throw new Error(`Identity creation with account failed: ${(error as Error).message}`);
    }
  }

  /**
   * Top up identity with pre-synced account - no wallet sync triggered
   * Accepts pre-synced account for web app integration with fresh funds pattern
   * @param identityId Identity ID to top up (Base58 format)
   * @param account Pre-synced wallet-lib Account instance
   * @param amount Amount in duffs to add to the identity
   * @param options Advanced options for targeting specific UTXOs/addresses
   * @returns Promise that resolves to identity top-up result
   * @example
   * ```typescript
   * // Web app pattern: Use fresh funds to top up existing identity
   * const account = await wallet.getAccount({ index: 0 });
   * const { address } = await sdk.wallet.getNewAddress(account);
   * await sdk.wallet.waitForPaymentToAddress(account, address);
   * const result = await sdk.identities.topUpWithAccount(identityId, account, 50000, {
   *   targetAddress: address
   * });
   * ```
   */
  async topUpWithAccount(
    identityId: string,
    account: any,
    amount: number,
    options: {
      targetAddress?: string;
      targetUtxo?: { txid: string; vout: number };
      useSourceAsChangeAddress?: boolean;
    } = {}
  ): Promise<any> {
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    if (!account) {
      throw new Error('Account is required');
    }

    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.TOPUP_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new Error(`Invalid amount: must be between ${IDENTITY_CONFIG.TOPUP_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT} duffs (got ${amount})`);
    }

    try {
      this.logger.info(`Topping up identity ${identityId} with pre-synced account (${amount} duffs)`);

      // Import cleanup utility
      const { waitForWalletCleanup } = await import('./utils/wallet-cleanup.js');

      // Get wallet and DAPIClient from account
      let wallet: any;
      let dapiClient: any;

      try {
        wallet = account.wallet;
        if (!wallet) {
          throw new Error('Account wallet not available - use topUpWithWallet for full control');
        }
      } catch (error) {
        throw new Error('Account wallet reference missing - account must be created via wallet-lib Wallet instance');
      }

      // Step 1: Build transaction options with optional targeting and freshness validation
      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account,
        amount,
        useSourceAsChangeAddress: options.useSourceAsChangeAddress !== false,
        validateUtxoFreshness: true,  // topUp ALWAYS validates freshness
        targetAddress: options.targetAddress,
        targetUtxo: options.targetUtxo
      });

      this.logger.debug(`Built transaction with ${utxos.length} UTXO(s)`);

      // Step 2: Create type 8 asset lock transaction
      const txBuilder = new TransactionBuilder();
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        account,
        changeAddress: transactionOptions.change,
        utxos: utxos,
        network: this.sdk.networkConfig.network
      });

      const signedTransaction = txResult.transaction;
      const assetLockPrivateKeyWif = txResult.assetLockPrivateKeyWif;

      // Step 3: Broadcast transaction via wallet-lib (CRITICAL for InstantLock monitoring)
      this.logger.info('Step 3: Broadcasting transaction...');

      const transactionIdString = await txBuilder.broadcastTransaction(
        signedTransaction,
        account  // Use account for InstantLock support
      );

      this.logger.info(`Step 3 complete - Transaction broadcasted: ${transactionIdString}`);

      // Step 5: Generate asset lock proof
      const { AssetLockProofManager } = await import('./coordination/asset-lock-proof-manager.js');
      const proofManager = new AssetLockProofManager(this.sdk);
      const transactionHexForProof = signedTransaction.toString();
      const transactionData = await proofManager.executeRace(
        account,
        transactionIdString,
        transactionHexForProof
      );

      // Step 6: Submit topUp to Platform in worker
      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');
      const result = await runWasmOperation('identity-topup', {
        identityId,
        transactionData,
        assetLockPrivateKeyWif
      }, {
        network: this.sdk.networkConfig.network,
        timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS
      });

      this.logger.info(`Identity topped up successfully - new balance: ${result.newBalance}`);

      return {
        status: 'success',
        identityId,
        newBalance: result.newBalance,
        addedAmount: result.toppedUpAmount,
        transactionHash: transactionIdString,
        message: 'Identity topped up successfully with pre-synced account'
      };

    } catch (error) {
      throw new Error(`Identity top-up with account failed: ${(error as Error).message}`);
    }
  }

  /**
   * Create a new identity with wallet coordination - orchestrates wallet-lib and wasm-sdk
   * @param mnemonic HD wallet mnemonic for key derivation and funding
   * @param amount Amount in duffs to fund the identity creation
   * @param keyIndex HD derivation index (default: 0)
   * @param useSourceAsChangeAddress Route transaction change back to source address (default: true)
   * @param startHeight Wallet sync start height (default: 1)
   * @returns Promise that resolves to identity creation result with wallet coordination
   */
  async createWithWallet(
    mnemonic: string,
    amount: number,
    keyIndex: number = 0,
    useSourceAsChangeAddress: boolean = true,
    startHeight: number = 1
  ): Promise<any> {
    // Input validation
    if (!mnemonic) {
      throw new Error('Mnemonic is required as first parameter');
    }

    // Validate mnemonic format (12-word BIP39)
    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 12) {
      throw new Error(`Invalid mnemonic: expected 12 words, got ${mnemonicWords.length}`);
    }

    // Validate amount bounds (200,000 to 100B duffs)
    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.CREATE_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new Error(`Invalid amount: must be between ${IDENTITY_CONFIG.CREATE_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT} duffs (got ${amount})`);
    }

    // Validate startHeight
    if (typeof startHeight !== 'number' || isNaN(startHeight) ||
        startHeight < BLOCKCHAIN_CONFIG.MIN_START_HEIGHT || startHeight > BLOCKCHAIN_CONFIG.MAX_START_HEIGHT) {
      throw new Error(`Invalid startHeight: must be between ${BLOCKCHAIN_CONFIG.MIN_START_HEIGHT} and ${BLOCKCHAIN_CONFIG.MAX_START_HEIGHT.toLocaleString()} (got ${startHeight})`);
    }

    // Warn if keyIndex is provided (it's ignored)
    if (keyIndex !== 0) {
      this.logger.warn(`keyIndex parameter (${keyIndex}) is ignored - identity index is discovered automatically via wallet sync`);
    }

    try {
      this.logger.debug('createWithWallet start');
      this.logger.debug(`  this.sdk: ${typeof this.sdk}`);
      this.logger.debug(`  this.sdk.networkConfig: ${typeof this.sdk?.networkConfig}`);
      this.logger.debug(`  this.sdk.networkConfig.network: ${this.sdk?.networkConfig?.network}`);

      // Import cleanup utility once at function scope
      const { waitForWalletCleanup } = await import('./utils/wallet-cleanup.js');

      // Declare walletStore at function scope for use in Step 9
      let walletStore: any;

      // Universal implementation: Works in both Node.js and browser
      const environment = EnvironmentConfig.getEnvironment();

      this.logger.info(`Creating identity in ${environment} environment`);

      // Step 1: PARALLEL wallet sync and identity discovery (Phase B optimization)
      // This replaces sequential execution with parallel Promise.all()
      this.logger.info('Starting parallel wallet sync and identity discovery...');

      const coordinator = new WalletCoordinator(this.sdk);
      const { wallet: setupWallet, account: setupAccount, dapiClient } = await coordinator.setupWallet({
        mnemonic,
        network: this.sdk.networkConfig.network,
        startHeight,
        disableIdentitySync: true // ALWAYS disable worker-based sync - we use direct discovery instead
      });

      // Run wallet sync AND identity discovery in parallel
      const [syncStatus, discoveredIdentities] = await Promise.all([
        // Promise 1: Wallet sync (UTXOs)
        coordinator.waitForSync(setupWallet, setupAccount, {
          needIdentitySync: false,
          timeoutMs: 10000
        }),

        // Promise 2: Identity discovery (runs simultaneously)
        this.getIdentityIds(setupAccount, {
          gapLimit: 20,
          batchSize: 50
        })
      ]);

      if (!syncStatus.walletSyncComplete) {
        throw new Error('Wallet sync timeout - no UTXOs available');
      }

      this.logger.info(`Parallel sync complete - UTXOs available, ${discoveredIdentities.length} identities discovered`);

      // Use the synced account for subsequent operations
      const freshAccount = setupAccount;

      // Step 2: Build transaction options with coin selection and change routing
      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account: freshAccount,
        amount,
        useSourceAsChangeAddress,
        validateUtxoFreshness: false // createWithWallet doesn't need validation
      });

      // Step 3: Create type 8 asset lock transaction using TransactionBuilder
      // TransactionBuilder imports dashcore-lib directly (module caching ensures single instance)
      const txBuilder = new TransactionBuilder();
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        account: freshAccount,
        changeAddress: transactionOptions.change,
        utxos: utxos,
        network: 'testnet'
      });

      const signedTransaction = txResult.transaction;
      const assetLockAddress = txResult.assetLockAddress;
      const assetLockPrivateKeyWif = txResult.assetLockPrivateKeyWif;

      // Step 3a: Broadcast transaction via wallet-lib (CRITICAL for InstantLock monitoring)
      this.logger.info('Broadcasting transaction...');

      const transactionIdString = await txBuilder.broadcastTransaction(
        signedTransaction,
        freshAccount  // Use freshAccount for InstantLock support
      );

      this.logger.info(`Transaction broadcasted: ${transactionIdString}`);

      // Step 4: Store discovered identities in wallet storage (already discovered in parallel)
      walletStore = freshAccount.storage.getWalletStore(freshAccount.walletId);
      for (const { index, identityId } of discoveredIdentities) {
        walletStore.insertIdentityIdAtIndex(identityId, index);
      }

      // Step 4a: Calculate next available identity index (already discovered in parallel)
      const identityIndex = discoveredIdentities.length > 0
        ? Math.max(...discoveredIdentities.map(item => item.index)) + 1
        : 0;

      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`Direct discovery found ${discoveredIdentities.length} existing identities`);
        discoveredIdentities.forEach(({ index, identityId }) => {
          this.logger.debug(`  [${index}] ${identityId}`);
        });
        this.logger.debug(`Next available identity index: ${identityIndex}`);
      } else {
        this.logger.info(`Discovered ${discoveredIdentities.length} existing identities - next index: ${identityIndex}`);
      }

      // Step 4b: Generate identity keys using wallet-lib HD derivation
      // CRITICAL: Use discovered identityIndex, NOT the keyIndex parameter
      const keyGenerator = new IdentityKeyGenerator();
      const identityKeys = await keyGenerator.generateFromWallet(freshAccount, identityIndex);

      // Step 6: THREE-PROMISE RACE for asset lock proof (same pattern as topUpWithWallet)
      this.logger.debug('Starting three-promise race for asset lock proof...');

      const transactionHexForProof = signedTransaction.toString();

      // Use AssetLockProofManager for height polling
      const { AssetLockProofManager } = await import('./coordination/asset-lock-proof-manager.js');
      const proofManager = new AssetLockProofManager(this.sdk);
      const transactionData = await proofManager.executeRace(
        freshAccount,
        transactionIdString,
        transactionHexForProof
      );

      // Step 5: Create identity via isolated worker (no SDK cleanup needed - worker isolation is sufficient)
      this.logger.info('Creating identity in isolated worker...');
      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation('identity-create', {
        transactionData,
        assetLockPrivateKeyWif,
        publicKeys: identityKeys
      }, {
        network: this.sdk.networkConfig.network,
        timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS
      });

      this.logger.debug('Identity created successfully via generic worker');

      // Step 9: Store identity in wallet-lib storage
      // CRITICAL: Store at discovered identityIndex, NOT the keyIndex parameter
      walletStore = freshAccount.storage.getWalletStore(freshAccount.walletId);
      walletStore.insertIdentityIdAtIndex(result.identityId, identityIndex);

      // Step 10: Cleanup wallet connections to allow process to exit
      try {
        if (setupWallet && typeof setupWallet.disconnect === 'function') {
          await setupWallet.disconnect();
        }
      } catch (cleanupError) {
        // Non-fatal - just log if debug enabled
        this.logger.debug('Wallet cleanup non-fatal error:', cleanupError);
      }

      return {
        status: 'success',
        identityId: result.identityId,
        balance: result.balance,
        publicKeysCount: identityKeys.length,
        transactionHash: transactionIdString,
        sourceAddress: transactionOptions.change || 'new_change_address',
        changeRoutedToSource: useSourceAsChangeAddress,
        message: 'Identity created successfully with wallet coordination'
      };

    } catch (error) {
      throw new Error(`Wallet-coordinated identity creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Top up an existing identity with wallet coordination - orchestrates wallet-lib and wasm-sdk
   * @param identityId Identity ID to top up (Base58 format)
   * @param amount Amount in duffs to add to the identity
   * @param mnemonic HD wallet mnemonic for funding
   * @param keyIndex HD derivation index (default: 0)
   * @param useSourceAsChangeAddress Route transaction change back to source address (default: true)
   * @param startHeight Wallet sync start height (default: 1)
   * @returns Promise that resolves to identity top-up result with wallet coordination
   */
  async topUpWithWallet(
    identityId: string,
    amount: number,
    mnemonic: string,
    keyIndex: number = 0,
    useSourceAsChangeAddress: boolean = true,
    startHeight: number = 1
  ): Promise<any> {
    // Input validation
    if (!mnemonic) {
      throw new Error('Mnemonic is required as third parameter');
    }

    // Validate mnemonic format (12-word BIP39)
    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 12) {
      throw new Error(`Invalid mnemonic: expected 12 words, got ${mnemonicWords.length}`);
    }

    // Validate amount bounds (50,000 to 100B duffs for top-up)
    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.TOPUP_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new Error(`Invalid amount: must be between ${IDENTITY_CONFIG.TOPUP_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT} duffs (got ${amount})`);
    }

    // Validate startHeight
    if (typeof startHeight !== 'number' || isNaN(startHeight) ||
        startHeight < BLOCKCHAIN_CONFIG.MIN_START_HEIGHT || startHeight > BLOCKCHAIN_CONFIG.MAX_START_HEIGHT) {
      throw new Error(`Invalid startHeight: must be between ${BLOCKCHAIN_CONFIG.MIN_START_HEIGHT} and ${BLOCKCHAIN_CONFIG.MAX_START_HEIGHT.toLocaleString()} (got ${startHeight})`);
    }

    // Warn if keyIndex is provided (it's ignored)
    if (keyIndex !== 0) {
      this.logger.warn(`keyIndex parameter (${keyIndex}) is ignored - not used for identity top-up operations`);
    }

    try {
      // Import cleanup utility once at function scope
      const { waitForWalletCleanup } = await import('./utils/wallet-cleanup.js');

      // Step 0: REMOVED pre-emptive cleanup - causes "already locked to a reader"
      // The static wasm.WasmSdk.prefetchTrustedQuorums() creates global WASM locks
      // that persist across instance resets, causing lock conflicts on reconnect

      // Step 1: Setup wallet using WalletCoordinator (Phase 3.1 refactoring)
      const coordinator = new WalletCoordinator(this.sdk);
      const { wallet, account: freshAccount, dapiClient } = await coordinator.setupWallet({
        mnemonic,
        network: this.sdk.networkConfig.network,
        startHeight,
        disableIdentitySync: true // Top-up: disable identity sync, keep SPV for UTXO discovery
      });

      // Step 1a: Wait for wallet sync to complete (explicit for consistency)
      // Note: topUpWithWallet doesn't need identity discovery, only wallet UTXO sync
      this.logger.debug('Waiting for wallet sync (UTXOs only)...');
      const syncStatus = await coordinator.waitForSync(wallet, freshAccount, {
        needIdentitySync: false, // topup doesn't need identity discovery
        timeoutMs: 10000
      });

      if (!syncStatus.walletSyncComplete) {
        throw new Error('Wallet sync timeout - no UTXOs available for top-up');
      }

      this.logger.info('Wallet sync complete - UTXOs available');

      // EXPERIMENTAL: Allow TransactionsSyncWorker continuous sync stream to fully initialize
      // Hypothesis: Fresh wallet creation doesn't give stream enough time to become active
      // js-dash-sdk uses long-lived wallet where stream runs for hours/days before broadcast
      this.logger.info('⏳ Waiting 10 seconds for TransactionsSyncWorker stream initialization...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      this.logger.info('✅ Stream initialization delay complete');

      // Step 2: Build transaction options with validation, coin selection, and change routing
      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account: freshAccount,
        amount,
        useSourceAsChangeAddress,
        validateUtxoFreshness: true // topUpWithWallet needs freshness validation
      });

      // Log step completion with UTXO summary
      const totalSats = utxos.reduce((sum: number, u: any) => sum + u.satoshis, 0);
      this.logger.info(`Step 1 complete - ${utxos.length} UTXOs available (${(totalSats / 100000000).toFixed(8)} DASH)`);

      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`Found ${utxos.length} validated UTXOs`);
        utxos.forEach((utxo: any, index: number) => {
          const txid = utxo.txid || utxo.txId;
          const vout = utxo.vout !== undefined ? utxo.vout : utxo.outputIndex;
          const addr = typeof utxo.address === 'string' ? utxo.address : utxo.address?.toString();
          this.logger.debug(`  UTXO ${index}: ${txid}:${vout} = ${utxo.satoshis} duffs (${addr})`);
        });
      }

      // Step 3: Create type 8 asset lock transaction using TransactionBuilder
      this.logger.info(`Step 2: Creating asset lock transaction (${amount} duffs)...`);

      const txBuilder = new TransactionBuilder();
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        account: freshAccount,
        changeAddress: transactionOptions.change,
        utxos: transactionOptions.utxos,
        network: 'testnet'
      });

      const signedTransaction = txResult.transaction;
      const assetLockPrivateKeyWif = txResult.assetLockPrivateKeyWif;

      this.logger.info('Step 2 complete (0.0s)');

      // Step 3: Broadcast transaction via wallet-lib (CRITICAL for InstantLock monitoring)
      this.logger.info('Step 3: Broadcasting transaction...');

      const transactionIdString = await txBuilder.broadcastTransaction(
        signedTransaction,
        freshAccount  // Use freshAccount for InstantLock support
      );

      this.logger.info('Step 3 complete (0.0s)');
      this.logger.debug(`Transaction broadcast successful: ${transactionIdString}`);

      // Step 4: THREE-PROMISE RACE for asset lock proof (js-dash-sdk pattern)
      // Wait for either InstantLock OR (TxMetadata + Platform sync) with timeout
      this.logger.info('Step 4: Waiting for confirmation...');
      this.logger.debug('  Promise 1: InstantLock (preferred, fast)');
      this.logger.debug('  Promise 2: TxMetadata + Platform sync');
      this.logger.debug('  Promise 3: Timeout (15 minutes)');
      const raceStart = Date.now();

      const transactionHexForProof = signedTransaction.toString();

      let result: any; // Declare outside try block for return statement

      try {
        // Use AssetLockProofManager for height polling
        const { AssetLockProofManager } = await import('./coordination/asset-lock-proof-manager.js');
        const proofManager = new AssetLockProofManager(this.sdk);
        const transactionData = await proofManager.executeRace(
          freshAccount,
          transactionIdString,
          transactionHexForProof
        );

        const totalRaceTime = ((Date.now() - raceStart) / 1000).toFixed(1);
        this.logger.info(`Step 4 complete (${totalRaceTime}s) - ${transactionData.proofType} proof`);

        // Step 5: Submit to Platform via isolated worker
        // Note: Working code does NOT cleanup SDK before worker - worker isolation is sufficient
        this.logger.info('Step 5: Submitting to Platform...');
        this.logger.debug('Spawning WASM worker for Platform submission...');
        const workerStart = Date.now();
        const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

        // Map JS LOG_LEVEL to WASM SDK log level
        const wasmLogLevel = (() => {
          const jsLevel = (typeof process !== 'undefined' ? process.env?.LOG_LEVEL : undefined)?.toLowerCase();
          if (jsLevel === 'trace') return 'trace';
          if (jsLevel === 'debug') return 'debug';
          if (jsLevel === 'info') return 'info';
          if (jsLevel === 'warn') return 'warn';
          if (jsLevel === 'error') return 'error';
          return 'warn'; // Default: show warnings/errors only
        })();

        result = await runWasmOperation('identity-topup', {
          identityId,
          transactionData,
          assetLockPrivateKeyWif
        }, {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
          logs: wasmLogLevel // Dynamic based on LOG_LEVEL environment variable
        });

        const workerTime = ((Date.now() - workerStart) / 1000).toFixed(1);
        this.logger.info(`Step 5 complete (${workerTime}s)`);
      } catch (wasmError) {
        this.logger.error('Identity top-up failed:', wasmError.message);

        // Apply cleanup even on error
        this.logger.debug('Applying cleanup after error...');
        try {
          await this.sdk.resetWasmSdk();
          await waitForWalletCleanup(freshAccount, WALLET_CONFIG.CLEANUP_DELAY_MS);
        } catch (cleanupError) {
          this.logger.warn('Cleanup after error failed:', cleanupError.message);
        }

        throw new Error(`Identity top-up failed: ${wasmError.message}`);
      }

      // Step 10: Final cleanup delay as per successful pattern from PRD
      this.logger.debug('Waiting for final background workers cleanup...');
      await waitForWalletCleanup(freshAccount, WALLET_CONFIG.CLEANUP_DELAY_MS);
      this.logger.debug('Post-operation cleanup completed');

      // Step 11: Cleanup wallet connections to allow process to exit
      try {
        if (wallet && typeof wallet.disconnect === 'function') {
          await wallet.disconnect();
        }
      } catch (cleanupError) {
        // Non-fatal - just log if debug enabled
        this.logger.debug('Wallet cleanup non-fatal error:', cleanupError);
      }

      return {
        status: 'success',
        identityId,
        newBalance: result.newBalance,
        addedAmount: result.toppedUpAmount,
        transactionHash: transactionIdString,
        sourceAddress: transactionOptions.change || 'new_change_address',
        changeRoutedToSource: useSourceAsChangeAddress,
        message: 'Identity topped up successfully with wallet coordination'
      };

    } catch (error) {
      throw new Error(`Wallet-coordinated identity top-up failed: ${(error as Error).message}`);
    }
  }

  /**
   * Discover identity by public key hash - replaces wasm-dpp usage in wallet-lib
   * Used by IdentitySyncWorker for identity discovery during wallet sync
   * @param publicKeyHashHex Public key hash in hex format (40 characters)
   * @returns Promise that resolves to discovery result with found flag and optional identity data
   */
  async discoverIdentityByPublicKeyHash(publicKeyHashHex: string): Promise<{
    found: boolean;
    identityId?: string;
    balance?: number;
    revision?: number;
  }> {
    if (!publicKeyHashHex || publicKeyHashHex.length !== 40) {
      throw new Error(`Invalid public key hash: expected 40 hex characters, got ${publicKeyHashHex?.length || 0}`);
    }

    try {
      // Use worker system for complete isolation
      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation('identity-discover', {
        publicKeyHashHex
      }, {
        network: this.sdk.networkConfig.network,
        timeout: WORKER_CONFIG.DISCOVERY_TIMEOUT_MS
      });

      return result;
    } catch (error) {
      throw new Error(`Identity discovery failed: ${(error as Error).message}`);
    }
  }

  /**
   * Discover multiple identities by public key hashes in a single batch
   * Optimized for IdentitySyncWorker - spawns ONE worker for all discoveries
   * @param publicKeyHashHexArray Array of public key hashes in hex format (40 characters each)
   * @returns Promise that resolves to array of discovery results
   */
  async discoverIdentityByPublicKeyHashBatch(publicKeyHashHexArray: string[]): Promise<Array<{
    found: boolean;
    identityId?: string;
    balance?: number;
    revision?: number;
  }>> {
    if (!publicKeyHashHexArray || publicKeyHashHexArray.length === 0) {
      return [];
    }

    try {
      // Use batch worker system for optimized discovery (single worker, single prefetch)
      const { runBatchWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const results = await runBatchWasmOperation('identity-discover',
        publicKeyHashHexArray.map(hash => ({ publicKeyHashHex: hash })),
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.BATCH_DISCOVERY_TIMEOUT_MS
        }
      );

      return results;
    } catch (error) {
      throw new Error(`Batch identity discovery failed: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve identity by wallet mnemonic and key index - uses wallet-lib storage patterns
   * @param mnemonic HD wallet mnemonic for accessing stored identities
   * @param keyIndex HD derivation index (default: 0)
   * @returns Promise that resolves to identity ID if found, null if not found
   */
  async getIdentityByWallet(mnemonic: string, keyIndex: number = 0): Promise<string | null> {
    if (!mnemonic) {
      throw new Error('Mnemonic is required as first parameter');
    }

    try {
      // Create wallet-lib wallet and freshAccount to access storage
      const { Wallet } = await this.importWalletLib();

      const wallet = new Wallet({
        mnemonic,
        network: this.sdk.networkConfig.network, // Use network directly: 'mainnet' or 'testnet'
        offlineMode: true,
        startHeight: 1 // Use minimal start height for storage access
      });

      const freshAccount = await wallet.createAccount({
        disableIdentitySync: true
      });

      // Use wallet-lib storage to retrieve identity by index
      const walletStore = freshAccount.storage.getWalletStore(freshAccount.walletId);
      const identityId = walletStore.getIdentityIdByIndex(keyIndex);

      return identityId || null;

    } catch (error) {
      throw new Error(`Failed to retrieve identity: ${(error as Error).message}`);
    }
  }

  /**
   * Discover all identities associated with an account by scanning HD key indices
   *
   * Extracted from IdentitySyncWorker - provides direct identity discovery without worker overhead.
   * Uses existing discoverIdentityByPublicKeyHashBatch() internally for efficient batch discovery.
   *
   * @param account wallet-lib Account instance with initialized identities.keyChain
   * @param options Discovery configuration options
   * @param options.gapLimit Number of consecutive unused indices before stopping (default: 20)
   * @param options.batchSize Number of indices to check per batch (default: 50)
   * @param options.onProgress Optional callback invoked after each batch with progress state
   * @returns Promise that resolves to array of { index, identityId } objects for found identities
   *
   * @example
   * ```typescript
   * // With progress callback
   * const identities = await sdk.identities.getIdentityIds(account, {
   *   gapLimit: 20,
   *   batchSize: 50,
   *   onProgress: (state) => {
   *     console.log(`Batch ${state.batchNumber}: ${state.foundCount} identities found`);
   *   }
   * });
   * ```
   */
  async getIdentityIds(
    account: any,
    options: {
      gapLimit?: number;
      batchSize?: number;
      onProgress?: (state: {
        currentIndex: number;
        foundCount: number;
        batchNumber: number;
        consecutiveNotFound: number;
      }) => void;
    } = {}
  ): Promise<Array<{ index: number; identityId: string }>> {
    const gapLimit = options.gapLimit ?? 20;
    const batchSize = options.batchSize ?? 50;
    const onProgress = options.onProgress;

    // Validate account has required identities structure
    if (!account?.identities?.getIdentityHDKeyByIndex) {
      throw new Error('Invalid account: missing identities.getIdentityHDKeyByIndex method');
    }

    const foundIdentities: Array<{ index: number; identityId: string }> = [];
    let consecutiveNotFound = 0;
    let currentIndex = 0;
    let batchNumber = 0;

    try {
      this.logger.debug(`Starting identity discovery (gapLimit: ${gapLimit}, batchSize: ${batchSize})`);

      // ITERATIVE BATCH DISCOVERY: Continue until gap limit reached
      while (consecutiveNotFound < gapLimit) {
        batchNumber++;
        const batchStartIndex = currentIndex;

        // Collect hashes for this batch (up to batchSize indices)
        const hashesToDiscover: Array<{ index: number; publicKeyHashHex: string }> = [];
        for (let i = 0; i < batchSize && consecutiveNotFound < gapLimit; i++) {
          const index = currentIndex++;

          // Derive HD key for this index (DIP-13 identity key derivation)
          const { privateKey } = account.identities.getIdentityHDKeyByIndex(index, 0);
          const publicKey = privateKey.toPublicKey();
          const publicKeyHashHex = publicKey.hash.toString('hex');

          hashesToDiscover.push({ index, publicKeyHashHex });
        }

        this.logger.debug(
          `Batch ${batchNumber}: Checking indices ${batchStartIndex}-${batchStartIndex + hashesToDiscover.length - 1} (${hashesToDiscover.length} hashes)`
        );

        // Batch discovery for this batch
        const hashes = hashesToDiscover.map(item => item.publicKeyHashHex);
        const results = await this.discoverIdentityByPublicKeyHashBatch(hashes);

        // Process results for this batch
        let foundInBatch = 0;
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const item = hashesToDiscover[i];

          if (result.found && result.identityId) {
            // Identity found - add to results
            foundIdentities.push({
              index: item.index,
              identityId: result.identityId
            });

            foundInBatch++;
            consecutiveNotFound = 0; // Reset gap counter
            this.logger.debug(`  [${item.index}] ${result.identityId}`);
          } else {
            // Identity not found - increment gap counter
            consecutiveNotFound++;

            // CRITICAL FIX: Stop processing mid-batch if gap limit reached
            // This prevents wasting queries on remaining indices in this batch
            if (consecutiveNotFound >= gapLimit) {
              this.logger.debug(`  Gap limit (${gapLimit}) reached mid-batch at index ${item.index} - stopping processing`);
              break;
            }
          }
        }

        this.logger.debug(
          `Batch ${batchNumber} complete: Found ${foundInBatch} identities (total: ${foundIdentities.length}, consecutive not found: ${consecutiveNotFound})`
        );

        // Invoke progress callback if provided
        if (onProgress) {
          try {
            onProgress({
              currentIndex,
              foundCount: foundIdentities.length,
              batchNumber,
              consecutiveNotFound
            });
          } catch (callbackError) {
            // Non-fatal: log but continue discovery
            this.logger.warn('Progress callback error (non-fatal):', callbackError);
          }
        }

        // Stop if gap limit reached
        if (consecutiveNotFound >= gapLimit) {
          this.logger.debug(`Gap limit (${gapLimit}) reached - stopping discovery`);
          break;
        }
      }

      this.logger.debug(
        `Discovery complete: ${foundIdentities.length} total identities found across ${batchNumber} batches`
      );

      return foundIdentities;

    } catch (error) {
      // Handle unexpected errors
      if (error.message && error.message.includes('not found')) {
        // No identities found - return empty array
        this.logger.debug('No identities found (empty wallet)');
        return [];
      } else {
        throw new Error(`Identity discovery failed: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Synchronize wallet and discover identities in parallel for optimal performance
   *
   * Runs wallet UTXO synchronization and identity discovery simultaneously,
   * reducing total execution time from sum(wallet+identity) to max(wallet,identity).
   *
   * @param mnemonic HD wallet mnemonic
   * @param startHeight Wallet sync start height
   * @param options Sync and discovery options
   * @param options.gapLimit Identity discovery gap limit (default: 20)
   * @param options.batchSize Identity discovery batch size (default: 50)
   * @param options.onWalletProgress Optional callback for wallet sync progress
   * @param options.onIdentityProgress Optional callback for identity discovery progress
   * @returns Promise resolving to combined wallet and identity state
   *
   * @example
   * ```typescript
   * const { wallet, identities } = await sdk.identities.syncWalletAndIdentities(
   *   mnemonic,
   *   startHeight,
   *   {
   *     onWalletProgress: (state) => console.log(`Wallet: ${state.utxosFound} UTXOs`),
   *     onIdentityProgress: (state) => console.log(`Batch ${state.batchNumber}: ${state.foundCount} identities`)
   *   }
   * );
   * ```
   */
  async syncWalletAndIdentities(
    mnemonic: string,
    startHeight: number,
    options: {
      gapLimit?: number;
      batchSize?: number;
      onWalletProgress?: (state: {
        walletSyncComplete: boolean;
        identitySyncComplete: boolean;
      }) => void;
      onIdentityProgress?: (state: {
        currentIndex: number;
        foundCount: number;
        batchNumber: number;
        consecutiveNotFound: number;
      }) => void;
    } = {}
  ): Promise<{
    wallet: {
      account: any;
      utxos: any[];
      syncComplete: boolean;
    };
    identities: {
      discovered: Array<{ index: number; identityId: string }>;
      nextAvailableIndex: number;
    };
  }> {
    const {
      gapLimit = 20,
      batchSize = 50,
      onWalletProgress,
      onIdentityProgress
    } = options;

    // Input validation
    if (!mnemonic) {
      throw new Error('Mnemonic is required');
    }

    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 12) {
      throw new Error(`Invalid mnemonic: expected 12 words, got ${mnemonicWords.length}`);
    }

    try {
      this.logger.info('Starting parallel wallet sync and identity discovery...');

      // Step 1: Setup wallet (doesn't wait for sync)
      const coordinator = new WalletCoordinator(this.sdk);
      const { wallet, account, dapiClient } = await coordinator.setupWallet({
        mnemonic,
        network: this.sdk.networkConfig.network,
        startHeight,
        disableIdentitySync: true // Use direct discovery instead
      });

      this.logger.debug('Wallet setup complete - starting parallel operations');

      // Step 2: Run wallet sync AND identity discovery in PARALLEL
      const [walletSyncResult, discoveredIdentities] = await Promise.all([
        // Promise 1: Wallet UTXO synchronization
        coordinator.waitForSync(wallet, account, {
          needIdentitySync: false,
          timeoutMs: 10000
        }).then(syncStatus => {
          if (onWalletProgress) {
            try {
              onWalletProgress(syncStatus);
            } catch (error) {
              this.logger.warn('Wallet progress callback error:', error);
            }
          }
          return syncStatus;
        }),

        // Promise 2: Identity discovery (runs simultaneously)
        this.getIdentityIds(account, {
          gapLimit,
          batchSize,
          onProgress: onIdentityProgress
        })
      ]);

      this.logger.info(`Parallel sync complete - wallet: ${walletSyncResult.walletSyncComplete}, identities: ${discoveredIdentities.length} found`);

      // Step 3: Get UTXOs after sync
      const utxos = account.getUTXOS();
      const utxoArray = Object.values(utxos);

      // Step 4: Calculate next available identity index
      const nextAvailableIndex = discoveredIdentities.length > 0
        ? Math.max(...discoveredIdentities.map(item => item.index)) + 1
        : 0;

      return {
        wallet: {
          account,
          utxos: utxoArray,
          syncComplete: walletSyncResult.walletSyncComplete
        },
        identities: {
          discovered: discoveredIdentities,
          nextAvailableIndex
        }
      };

    } catch (error) {
      throw new Error(`Parallel sync failed: ${(error as Error).message}`);
    }
  }

  // Private helper methods for wallet coordination

  private async importWalletLib(): Promise<any> {
    try {
      // Attempt dynamic import - may fail in some environments
      return await import('@dashevo/wallet-lib');
    } catch (error) {
      const env = EnvironmentConfig.getEnvironment();
      throw new Error(`wallet-lib import failed in ${env} environment. For universal compatibility, ensure wallet-lib is available in both Node.js and browser builds.`);
    }
  }

  private async importDAPIClient(): Promise<any> {
    try {
      // Import DAPIClient for js-dash-sdk pattern
      const dapiClientModule = await import('@dashevo/dapi-client');
      return dapiClientModule.default || dapiClientModule;
    } catch (error) {
      const env = EnvironmentConfig.getEnvironment();
      throw new Error(`dapi-client import failed in ${env} environment. For js-dash-sdk pattern, ensure @dashevo/dapi-client is available.`);
    }
  }

  private async importDAPIClientTransport(): Promise<any> {
    try {
      // Import DAPIClientTransport for js-dash-sdk pattern
      const transportModule = await import('@dashevo/wallet-lib/src/transport/DAPIClientTransport/DAPIClientTransport.js');
      return transportModule.default || transportModule;
    } catch (error) {
      const env = EnvironmentConfig.getEnvironment();
      throw new Error(`DAPIClientTransport import failed in ${env} environment. For js-dash-sdk pattern, ensure DAPIClientTransport is available.`);
    }
  }

  /**
   * Extract address from UTXO object handling various wallet-lib formats
   * @private
   */
  private _extractUtxoAddress(utxo: any): string | null {
    if (typeof utxo.address === 'string') {
      return utxo.address;
    } else if (utxo.address && typeof utxo.address.toString === 'function') {
      return utxo.address.toString();
    } else if (utxo.address && utxo.address.address) {
      return utxo.address.address;
    } else if (utxo.script) {
      return typeof utxo.script === 'string' ? utxo.script : utxo.script.toAddress().toString();
    }
    return null;
  }

}
