/**
 * IdentityCreator Facade - Create new identities
 *
 * Provides operations for:
 * - Creating identities with wallet coordination (new architecture)
 * - Creating identities with pre-synced accounts (deprecated)
 *
 * Architecture: Uses modular coordinators (WalletCoordinator, TransactionBuilder, AssetLockProofManager)
 * Completely independent of wallet-lib Wallet class.
 */

import type { EvoSDK } from '../../sdk.js';
import { WalletCoordinator } from '../coordination/wallet-coordinator.js';
import { TransactionBuilder } from '../coordination/transaction-builder.js';
import { IdentityKeyGenerator } from '../coordination/identity-key-generator.js';
import { AssetLockProofManager } from '../coordination/asset-lock-proof-manager.js';
import { TransactionOptionsBuilder } from '../utils/transaction-options-builder.js';
import { IdentityDiscovery } from './identity-discovery.js';
import {
  IDENTITY_CONFIG,
  BLOCKCHAIN_CONFIG,
  WALLET_CONFIG,
  WORKER_CONFIG,
} from '../config/operation-config.js';
import { createLogger } from '../utils/identity-logger.js';
import {
  ValidationError,
  WalletSetupError,
  TransactionCreationError,
  TransactionBroadcastError,
  ConfirmationTimeoutError,
  PlatformSubmissionError,
} from '../errors/identity-errors.js';
import type { OperationEvent } from '../contracts/operation-events.js';
import { OperationEventFactory } from '../contracts/operation-events.js';

const logger = createLogger('IdentityCreator');

/**
 * Identity creation result
 */
export interface IdentityCreationResult {
  status: 'success' | 'failure';
  identityId: string;
  balance: number;
  publicKeysCount: number;
  transactionHash: string;
  identityIndex?: number;
  sourceAddress?: string;
  changeRoutedToSource: boolean;
  message: string;
}

/**
 * IdentityCreator - Create new identities with wallet coordination
 *
 * Manages the complete identity creation flow:
 * 1. Wallet setup (HD derivation, UTXO discovery)
 * 2. Address and identity discovery
 * 3. Transaction creation and signing
 * 4. Broadcast and confirmation waiting
 * 5. Identity creation on Platform
 *
 * Uses new modular architecture - no wallet-lib dependency.
 */
export class IdentityCreator {
  constructor(private sdk: EvoSDK) {}

  /**
   * Create a new identity with wallet coordination
   *
   * Orchestrates the complete identity creation flow using:
   * - WalletCoordinator for HD key derivation and UTXO discovery
   * - TransactionBuilder for asset lock transaction creation
   * - AssetLockProofManager for transaction confirmation
   * - IdentityDiscovery for finding existing identities
   *
   * @param mnemonic 12-word BIP39 mnemonic for wallet
   * @param amount Amount in duffs to fund identity with
   * @param options Advanced options
   * @param options.startHeight Blockchain height to start wallet sync (default: 1)
   * @param options.useSourceAsChangeAddress Route change back to source address (default: true)
   * @param options.onProgress Optional callback for progress updates
   * @returns Identity creation result
   * @throws ValidationError if inputs invalid
   * @throws WalletSetupError if wallet setup fails
   * @throws TransactionCreationError if transaction creation fails
   * @throws TransactionBroadcastError if broadcast fails
   * @throws ConfirmationTimeoutError if confirmation times out
   * @throws PlatformSubmissionError if identity creation fails
   *
   * @example
   * ```typescript
   * const result = await creator.createWithWallet(
   *   'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
   *   200000,
   *   {
   *     startHeight: 1,
   *     useSourceAsChangeAddress: true,
   *     onProgress: (event) => console.log(event.message)
   *   }
   * );
   *
   * console.log('Identity created:', result.identityId);
   * ```
   */
  async createWithWallet(
    mnemonic: string,
    amount: number,
    options: {
      startHeight?: number;
      useSourceAsChangeAddress?: boolean;
      skipDiscovery?: boolean; // Skip identity discovery (create at index 0)
      identityIndex?: number;  // Explicit identity index (overrides discovery)
      onProgress?: (event: OperationEvent) => void;
    } = {}
  ): Promise<IdentityCreationResult> {
    const startHeight = options.startHeight ?? 1;
    const useSourceAsChangeAddress = options.useSourceAsChangeAddress !== false;
    const skipDiscovery = options.skipDiscovery === true;
    const explicitIndex = options.identityIndex;
    const onProgress = options.onProgress;

    // Input validation
    this.validateInputs(mnemonic, amount, startHeight);

    try {
      logger.info(`Starting identity creation (${amount} duffs)`);

      // Emit start event
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'wallet_setup',
            'Initializing wallet and deriving keys...'
          )
        );
      }

      // Step 1: Setup wallet with key derivation and UTXO discovery
      const coordinator = new WalletCoordinator(this.sdk);
      const walletSetup = await coordinator.setupWallet({
        mnemonic,
        network: this.sdk.networkConfig.network,
        startHeight,
      });

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseProgress(
            'wallet_setup',
            100,
            `Wallet setup complete - ${walletSetup.utxos.length} UTXOs available`
          )
        );
      }

      // Validate we have UTXOs
      if (!walletSetup.latestUTXO) {
        throw new WalletSetupError(
          'utxo_discovery',
          'No UTXOs available in wallet - cannot create identity',
          false, // Not recoverable
          { availableUTXOs: walletSetup.utxos.length }
        );
      }

      // Step 2: Determine identity index
      // Either use explicit index, skip discovery (use 0), or discover existing identities
      let identityIndex: number;

      if (explicitIndex !== undefined) {
        // Explicit index provided - use it directly
        identityIndex = explicitIndex;
        logger.info(`Using explicit identity index: ${identityIndex}`);
        if (onProgress) {
          onProgress(
            OperationEventFactory.phaseComplete(
              'identity_discovery',
              `Using explicit index: ${identityIndex}`
            )
          );
        }
      } else if (skipDiscovery) {
        // Skip discovery - use index 0 (for new wallets or testing)
        identityIndex = 0;
        logger.info('Skipping identity discovery - using index 0');
        if (onProgress) {
          onProgress(
            OperationEventFactory.phaseComplete(
              'identity_discovery',
              'Skipped (using index 0)'
            )
          );
        }
      } else {
        // Full discovery - scan for existing identities
        logger.debug('Discovering existing identities...');
        if (onProgress) {
          onProgress(
            OperationEventFactory.phaseStart('identity_discovery', 'Scanning for existing identities...')
          );
        }

        // Use the working getIdentityIds from facade (direct DAPI, no RwLock issues)
        const { IdentitiesFacade } = await import('../facade.js');
        const facade = new IdentitiesFacade(this.sdk);
        const discoveredIdentities = await facade.getIdentityIds(mnemonic, {
          gapLimit: 20,
          batchSize: 10,
        });

        if (onProgress) {
          onProgress(
            OperationEventFactory.phaseComplete(
              'identity_discovery',
              `${discoveredIdentities.length} identities found`
            )
          );
        }

        // Calculate next identity index
        identityIndex = discoveredIdentities.length > 0
          ? Math.max(...discoveredIdentities.map(i => i.index)) + 1
          : 0;
      }

      logger.info(`Next available identity index: ${identityIndex}`);

      // Step 4: Create asset lock transaction
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart('transaction_creation', 'Building transaction...')
        );
      }

      const txBuilder = new TransactionBuilder();
      const allAddresses = [...walletSetup.addresses.external, ...walletSetup.addresses.internal];
      const sourceAddress = allAddresses[0]; // Use first external address

      // Determine change address based on preference
      // If useSourceAsChangeAddress, route change back to source
      // Otherwise use next internal address
      const changeAddress = useSourceAsChangeAddress
        ? sourceAddress.address
        : walletSetup.addresses.internal[0]?.address || sourceAddress.address;

      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        utxo: walletSetup.latestUTXO,
        sourceAddress,
        changeAddress,
        network: this.sdk.networkConfig.network,
      });

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete(
            'transaction_creation',
            'Transaction created and signed'
          )
        );
      }

      // Step 6: Start IS/CL monitoring BEFORE broadcast
      // This is critical - the DAPI stream must be active to receive InstantLock messages
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'instantlock_wait',
            'Starting InstantSend/ChainLock monitoring...'
          )
        );
      }

      logger.info('🔌 Starting IS/CL monitoring BEFORE transaction broadcast...');
      await walletSetup.monitor.monitorAddresses([sourceAddress.address], {
        onInstantLock: (lock) => {
          logger.info(`🔒 InstantLock received for ${lock.txid} (latency: ${lock.latency}ms)`);
        },
        onChainLock: (cl) => {
          logger.info(`⛓️ ChainLock received at height ${cl.blockHeight}`);
        },
        onTransaction: (tx) => {
          logger.debug(`📨 Transaction detected: ${tx.txid}`);
        },
      });

      const monitorStatus = walletSetup.monitor.getStatus();
      logger.info(`📊 Monitor active: ${monitorStatus.active}, chainLockHeight: ${monitorStatus.chainLockHeight}`);

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseProgress(
            'instantlock_wait',
            50,
            'IS/CL monitoring active, ready for broadcast'
          )
        );
      }

      // Step 7: Pre-register txid BEFORE broadcast
      // This ensures InstantLocks are captured even if they arrive before waitForConfirmation()
      const expectedTxid = txResult.transactionId;
      logger.info(`📝 Pre-registering txid for monitoring: ${expectedTxid}`);
      walletSetup.monitor.preRegisterTransaction(expectedTxid);

      // Step 8: Broadcast transaction (monitoring already active, txid pre-registered)
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'transaction_broadcast',
            'Broadcasting transaction to network...'
          )
        );
      }

      const transactionIdString = await txBuilder.broadcastTransaction(
        txResult.transactionHex,
        walletSetup.dapiClient
      );

      logger.info(`Transaction broadcasted: ${transactionIdString}`);

      // Verify txid matches expected
      if (transactionIdString !== expectedTxid) {
        logger.warn(`⚠️ Broadcast txid ${transactionIdString} differs from expected ${expectedTxid}`);
      }

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete(
            'transaction_broadcast',
            `Transaction ID: ${transactionIdString}`
          )
        );
      }

      // Step 9: Wait for transaction confirmation
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'confirmation_wait',
            'Waiting for InstantLock or ChainLock...'
          )
        );
      }

      const proofManager = new AssetLockProofManager(this.sdk);
      const transactionData = await proofManager.waitForConfirmation(
        walletSetup.monitor,
        transactionIdString,
        txResult.transactionHex,
        [sourceAddress.address]
      );

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete(
            'confirmation_wait',
            `Confirmed via ${transactionData.proofType}`
          )
        );
      }

      // Step 10: Generate identity keys
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart('identity_creation', 'Generating identity keys...')
        );
      }

      const keyGenerator = new IdentityKeyGenerator();
      // Use mnemonic-based key generation (no wallet-lib dependency)
      const identityKeys = await keyGenerator.generateFromMnemonic(
        mnemonic,
        identityIndex,
        this.sdk.networkConfig.network as 'testnet' | 'mainnet'
      );

      // Step 11: Submit to Platform via worker
      logger.info('Submitting identity creation to Platform...');

      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation(
        'identity-create',
        {
          transactionData,
          assetLockPrivateKeyWif: txResult.assetLockPrivateKeyWif,
          publicKeys: identityKeys,
        },
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
        }
      );

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete(
            'finalization',
            'Identity created successfully'
          )
        );
      }

      logger.info(`Identity created successfully: ${result.identityId} at index ${identityIndex}`);

      return {
        status: 'success',
        identityId: result.identityId,
        balance: result.balance,
        publicKeysCount: identityKeys.length,
        transactionHash: transactionIdString,
        identityIndex,
        sourceAddress: sourceAddress.address,
        changeRoutedToSource: useSourceAsChangeAddress,
        message: 'Identity created successfully with wallet coordination',
      };
    } catch (error) {
      logger.error('Identity creation failed:', error);

      // Re-throw domain errors as-is
      if (error instanceof ValidationError ||
          error instanceof WalletSetupError ||
          error instanceof TransactionCreationError ||
          error instanceof TransactionBroadcastError ||
          error instanceof ConfirmationTimeoutError ||
          error instanceof PlatformSubmissionError) {
        throw error;
      }

      // Wrap other errors
      if (error instanceof Error) {
        throw new PlatformSubmissionError(
          'identity_create',
          `Identity creation failed: ${error.message}`,
          undefined,
          false,
          { originalError: error.message }
        );
      }

      throw new Error(`Identity creation failed: ${String(error)}`);
    }
  }

  /**
   * Create identity with pre-synced account (DEPRECATED)
   *
   * @deprecated Use createWithWallet() instead
   * This method is maintained for backward compatibility but uses the old pattern.
   * Consider migrating to createWithWallet() for better architecture.
   *
   * @param account Pre-synced wallet-lib account
   * @param amount Amount in duffs
   * @param options Advanced options
   * @returns Identity creation result
   */
  async createWithAccount(
    account: any,
    amount: number,
    options: {
      identityIndex?: number;
      useSourceAsChangeAddress?: boolean;
      onProgress?: (event: OperationEvent) => void;
    } = {}
  ): Promise<IdentityCreationResult> {
    logger.warn(
      'createWithAccount() is deprecated - use createWithWallet() instead for cleaner architecture'
    );

    if (!account) {
      throw new ValidationError(
        'account_validation',
        'Account is required',
        'account',
        false
      );
    }

    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.CREATE_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new ValidationError(
        'amount_validation',
        `Invalid amount: must be between ${IDENTITY_CONFIG.CREATE_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT} duffs`,
        'amount',
        false,
        { amount }
      );
    }

    try {
      const onProgress = options.onProgress;

      logger.info(`Creating identity with pre-synced account (${amount} duffs)`);

      // Build transaction using account's UTXOs
      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account,
        amount,
        useSourceAsChangeAddress: options.useSourceAsChangeAddress !== false,
        validateUtxoFreshness: false,
      });

      // Create and broadcast transaction
      const txBuilder = new TransactionBuilder();
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        account, // Still need account for key derivation in old pattern
        changeAddress: transactionOptions.change,
        utxos: utxos as any,  // UTXO type compatibility across modules
        network: this.sdk.networkConfig.network,
      });

      const transactionIdString = await txBuilder.broadcastTransaction(
        txResult.transactionHex,
        account
      );

      logger.info(`Transaction broadcasted: ${transactionIdString}`);

      // Use provided identity index or default to 0
      const identityIndex = options.identityIndex ?? 0;
      logger.debug(`Using identity index: ${identityIndex}`);

      // Generate keys
      const keyGenerator = new IdentityKeyGenerator();
      const identityKeys = await keyGenerator.generateFromWallet(account, identityIndex);

      // Wait for confirmation
      const proofManager = new AssetLockProofManager(this.sdk);
      const transactionData = await proofManager.waitForConfirmation(
        undefined as any, // Simplified - would need monitor
        transactionIdString,
        txResult.transactionHex,
        [transactionOptions.change]
      );

      // Submit to Platform
      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation(
        'identity-create',
        {
          transactionData,
          assetLockPrivateKeyWif: txResult.assetLockPrivateKeyWif,
          publicKeys: identityKeys,
        },
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
        }
      );

      return {
        status: 'success',
        identityId: result.identityId,
        balance: result.balance,
        publicKeysCount: identityKeys.length,
        transactionHash: transactionIdString,
        identityIndex,
        changeRoutedToSource: options.useSourceAsChangeAddress !== false,
        message: 'Identity created with pre-synced account (deprecated method)',
      };
    } catch (error) {
      logger.error('Identity creation with account failed:', error);
      throw new PlatformSubmissionError(
        'identity_create',
        `Identity creation failed: ${(error as Error).message}`,
        undefined,
        false
      );
    }
  }

  /**
   * Validate creation inputs
   */
  private validateInputs(mnemonic: string, amount: number, startHeight: number): void {
    if (!mnemonic) {
      throw new ValidationError(
        'mnemonic_validation',
        'Mnemonic is required',
        'mnemonic',
        false
      );
    }

    const mnemonicWords = mnemonic.trim().split(/\s+/);
    if (mnemonicWords.length !== 12) {
      throw new ValidationError(
        'mnemonic_validation',
        `Invalid mnemonic: expected 12 words, got ${mnemonicWords.length}`,
        'mnemonic',
        false,
        { wordCount: mnemonicWords.length }
      );
    }

    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.CREATE_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new ValidationError(
        'amount_validation',
        `Invalid amount: must be between ${IDENTITY_CONFIG.CREATE_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT}`,
        'amount',
        false,
        { amount }
      );
    }

    if (typeof startHeight !== 'number' || isNaN(startHeight) ||
        startHeight < BLOCKCHAIN_CONFIG.MIN_START_HEIGHT || startHeight > BLOCKCHAIN_CONFIG.MAX_START_HEIGHT) {
      throw new ValidationError(
        'startHeight_validation',
        `Invalid startHeight: must be between ${BLOCKCHAIN_CONFIG.MIN_START_HEIGHT} and ${BLOCKCHAIN_CONFIG.MAX_START_HEIGHT}`,
        'startHeight',
        false,
        { startHeight }
      );
    }
  }

  /**
   * Derive identity public key hash at given index
   * This is a helper for identity discovery
   *
   * Uses DIP-9 identity key derivation path: m/9'/COIN'/ACCOUNT'/0/INDEX
   * For testnet: m/9'/1'/0'/0/INDEX
   * For mainnet: m/9'/5'/0'/0/INDEX
   */
  private async deriveIdentityPublicKeyHash(mnemonic: string, index: number): Promise<string> {
    // Import wallet functions for HD derivation
    const { wallet: walletFunctions } = await import('../../wallet/functions.js');
    const { createHash } = await import('crypto');

    // Build DIP-9 identity path as a string
    // DIP-9: m/9'/coin_type'/account'/0/index
    // Testnet coin_type = 1, Mainnet coin_type = 5
    const coinType = this.sdk.networkConfig.network === 'mainnet' ? 5 : 1;
    const path = `m/9'/${coinType}'/0'/0/${index}`;

    // Derive HD key for this identity index
    const childKey = await walletFunctions.deriveKeyFromSeedWithPath(
      mnemonic,
      null,
      path,
      this.sdk.networkConfig.network
    );

    // Get public key hash (Hash160 = RIPEMD160(SHA256(pubkey)))
    // childKey.public_key is hex string of compressed public key
    const publicKeyBuffer = Buffer.from(childKey.public_key, 'hex');
    const sha256Hash = createHash('sha256').update(publicKeyBuffer).digest();
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();
    const publicKeyHash = ripemd160Hash.toString('hex');

    return publicKeyHash;
  }
}
