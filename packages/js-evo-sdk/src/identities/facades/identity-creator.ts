/**
 * IdentityCreator Facade - Create new identities
 *
 * Provides operations for:
 * - Creating identities with pre-found UTXOs (mnemonic-based)
 *
 * Architecture: Uses modular coordinators (TransactionBuilder, AssetLockProofManager)
 * Completely independent of wallet-lib. Uses WASM SDK for HD derivation.
 */

import type { EvoSDK } from '../../sdk.js';
import { type DerivedAddressInfo } from '../coordination/wallet-coordinator.js';
import { TransactionBuilder } from '../coordination/transaction-builder.js';
import { IdentityKeyGenerator } from '../coordination/identity-key-generator.js';
import { AssetLockProofManager } from '../coordination/asset-lock-proof-manager.js';
import { IdentityDiscovery } from './identity-discovery.js';
import { UTXOFinder } from '../coordination/utxo-finder.js';
import { TransactionFinder, FinderMode, type UTXO } from '@dashevo/transaction-finder';
// IMPORTANT: DAPIClient is imported DYNAMICALLY to avoid loading wasm-dpp at module init time.
// Loading wasm-dpp statically conflicts with wasm-sdk's RwLock in single-threaded WASM runtime.
import type DAPIClientType from '@dashevo/dapi-client';

// Lazy-loaded DAPIClient to avoid wasm-dpp conflict
let DAPIClient: typeof DAPIClientType | null = null;
async function getDAPIClient(): Promise<typeof DAPIClientType> {
  if (!DAPIClient) {
    DAPIClient = (await import('@dashevo/dapi-client')).default;
  }
  return DAPIClient;
}
import {
  IDENTITY_CONFIG,
  WORKER_CONFIG,
  DAPI_CONFIG,
} from '../config/operation-config.js';
import { createLogger } from '../utils/identity-logger.js';
import { resourceTracker } from '../utils/resource-tracker.js';
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

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } } | undefined;

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
 * IdentityCreator - Create new identities with pre-found UTXOs
 *
 * Manages the identity creation flow:
 * 1. Address and identity discovery
 * 2. Transaction creation and signing
 * 3. Broadcast and confirmation waiting
 * 4. Identity creation on Platform
 *
 * Uses modular architecture - no wallet-lib dependency.
 */
export class IdentityCreator {
  constructor(private sdk: EvoSDK) {}

  /**
   * Create a new identity with a pre-found UTXO
   *
   * This method
   * uses a UTXO that was already found via findSpendableUTXO(). This provides:
   * - Faster execution (no redundant blockchain scan)
   * - Separation between UTXO finding and identity creation
   * - Ability to show user the balance before committing
   *
   * @param options Creation options with pre-found UTXO
   * @returns Identity creation result
   * @throws ValidationError if inputs invalid
   * @throws TransactionCreationError if transaction creation fails
   * @throws TransactionBroadcastError if broadcast fails
   * @throws ConfirmationTimeoutError if confirmation times out
   * @throws PlatformSubmissionError if identity creation fails
   *
   * @example
   * ```typescript
   * // Step 1: Find UTXO
   * const utxoResult = await sdk.identities.findSpendableUTXO({
   *   mnemonic,
   *   startHeight: 1000000,
   *   minAmount: 200000,
   * });
   *
   * // Step 2: Create identity with the found UTXO
   * const identity = await creator.createWithUTXO({
   *   mnemonic,
   *   utxo: utxoResult.utxo,
   *   amount: 200000,
   *   derivedAddresses: utxoResult.derivedAddresses, // Reuse to avoid re-deriving
   *   onProgress: (event) => console.log(event.message)
   * });
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
    onProgress?: (event: OperationEvent) => void;
  }): Promise<IdentityCreationResult> {
    const {
      mnemonic,
      utxo,
      amount,
      identityIndex: explicitIndex,
      skipDiscovery = false,
      useSourceAsChangeAddress = true,
      derivedAddresses: providedAddresses,
      onProgress,
    } = options;

    // Validate mnemonic and amount
    this.validateMnemonicAndAmount(mnemonic, amount);

    // Validate UTXO has sufficient balance
    if (utxo.satoshis < amount) {
      throw new ValidationError(
        'utxo_validation',
        `UTXO balance (${utxo.satoshis} duffs) is less than requested amount (${amount} duffs)`,
        'utxo',
        false,
        { utxoBalance: utxo.satoshis, requestedAmount: amount }
      );
    }

    // Track resources for cleanup
    let monitor: TransactionFinder | null = null;

    try {
      logger.info(`Starting identity creation with pre-found UTXO (${amount} duffs)`);
      logger.debug(`   UTXO: ${utxo.satoshis} duffs at ${utxo.address} (txid: ${utxo.txId}:${utxo.vout})`);

      // Emit start event
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'wallet_setup',
            'Setting up wallet with provided UTXO...'
          )
        );
      }

      // Step 1: Use provided addresses or derive fresh ones
      let derivedAddresses: {
        external: DerivedAddressInfo[];
        internal: DerivedAddressInfo[];
      };

      if (providedAddresses && providedAddresses.external.length > 0) {
        derivedAddresses = providedAddresses;
        logger.debug(`Using ${derivedAddresses.external.length} provided addresses`);
      } else {
        // Derive fresh addresses using UTXOFinder's logic
        logger.debug('Deriving fresh addresses...');
        const utxoFinder = new UTXOFinder(this.sdk);
        const result = await utxoFinder.findAllUTXOs({
          mnemonic,
          startHeight: 1,
          toHeight: 1, // Minimal scan - we just need addresses
          addressCount: 20,
        });
        derivedAddresses = result.derivedAddresses;
      }

      // Step 2: Find the DerivedAddressInfo that matches the UTXO address
      const allAddresses = [...derivedAddresses.external, ...derivedAddresses.internal];
      const sourceAddress = allAddresses.find(a => a.address === utxo.address);

      if (!sourceAddress) {
        throw new ValidationError(
          'utxo_validation',
          `UTXO address ${utxo.address} not found in derived addresses. The UTXO may not belong to this wallet.`,
          'utxo',
          false,
          { utxoAddress: utxo.address }
        );
      }

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete(
            'wallet_setup',
            `Using UTXO at ${sourceAddress.address}`
          )
        );
      }

      // Step 3: Determine identity index
      let identityIndex: number;

      if (explicitIndex !== undefined) {
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
      const changeAddress = useSourceAsChangeAddress
        ? sourceAddress.address
        : derivedAddresses.internal[0]?.address || sourceAddress.address;

      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        utxo,
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

      // Step 5: Setup REALTIME monitoring for transaction confirmation
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'instantlock_wait',
            'Starting InstantSend/ChainLock monitoring...'
          )
        );
      }

      // Create DAPI client for monitoring
      let dapiAddresses: string[] | undefined;
      if (typeof process !== 'undefined' && process?.env?.DAPI_ADDRESSES) {
        dapiAddresses = process.env.DAPI_ADDRESSES.split(',').map((a: string) => a.trim());
      }

      const DAPIClientClass = await getDAPIClient();
      const dapiClient = new DAPIClientClass({
        network: this.sdk.networkConfig.network as 'mainnet' | 'testnet' | 'regtest',
        timeout: DAPI_CONFIG.TIMEOUT_MS,
        retries: DAPI_CONFIG.MAX_RETRIES,
        baseBanTime: DAPI_CONFIG.BAN_TIME_MS,
        ...(dapiAddresses && { dapiAddresses }),
      });

      // Track DAPIClient for cleanup
      resourceTracker.track(dapiClient);

      // Create TransactionFinder in REALTIME mode for monitoring only (no historic scan)
      monitor = new TransactionFinder({
        mode: FinderMode.REALTIME,
        network: this.sdk.networkConfig.network as 'mainnet' | 'testnet' | 'regtest',
        addresses: [sourceAddress.address],
        dapiClient: dapiClient as any,
        logLevel: DAPI_CONFIG.LOG_LEVEL as any,
        autoPruneOnConfirmation: true,
      });

      logger.info('🔌 Starting IS/CL monitoring BEFORE transaction broadcast...');
      await monitor.monitorAddresses([sourceAddress.address], {
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

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseProgress(
            'instantlock_wait',
            50,
            'IS/CL monitoring active, ready for broadcast'
          )
        );
      }

      // Step 6: Pre-register txid BEFORE broadcast
      const expectedTxid = txResult.transactionId;
      logger.info(`📝 Pre-registering txid for monitoring: ${expectedTxid}`);
      monitor.preRegisterTransaction(expectedTxid);

      // Step 7: Broadcast transaction
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
        dapiClient
      );

      logger.info(`Transaction broadcasted: ${transactionIdString}`);

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

      // Step 8: Wait for transaction confirmation
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
        monitor,
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

      // Step 9: Generate identity keys
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart('identity_creation', 'Generating identity keys...')
        );
      }

      const keyGenerator = new IdentityKeyGenerator();
      const identityKeys = await keyGenerator.generateFromMnemonic(
        mnemonic,
        identityIndex,
        this.sdk.networkConfig.network as 'testnet' | 'mainnet'
      );

      // Step 10: Submit to Platform via worker
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
        message: 'Identity created successfully with pre-found UTXO',
      };
    } catch (error) {
      logger.error('Identity creation with UTXO failed:', error);

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
          `Identity creation with UTXO failed: ${error.message}`,
          undefined,
          false,
          { originalError: error.message }
        );
      }

      throw new Error(`Identity creation with UTXO failed: ${String(error)}`);
    } finally {
      // Cleanup resources - stop monitor to release WebSocket connections and event listeners
      if (monitor) {
        try {
          monitor.stop();
          logger.debug('Monitor stopped during cleanup');
        } catch (cleanupError) {
          logger.warn('Failed to stop monitor during cleanup:', cleanupError);
        }
      }
    }
  }

  /**
   * Validate mnemonic and amount
   */
  private validateMnemonicAndAmount(mnemonic: string, amount: number): void {
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
    const childKey = await walletFunctions.deriveKeyFromSeedWithPath({
      mnemonic,
      passphrase: null,
      path,
      network: this.sdk.networkConfig.network
    });

    // Get public key hash (Hash160 = RIPEMD160(SHA256(pubkey)))
    // childKey.public_key is hex string of compressed public key
    const publicKeyBuffer = Buffer.from(childKey.public_key, 'hex');
    const sha256Hash = createHash('sha256').update(publicKeyBuffer).digest();
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();
    const publicKeyHash = ripemd160Hash.toString('hex');

    return publicKeyHash;
  }
}
