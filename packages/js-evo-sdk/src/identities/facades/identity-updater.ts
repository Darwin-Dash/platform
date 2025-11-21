/**
 * IdentityUpdater Facade - Update existing identities (topUp operations)
 *
 * Provides operations for:
 * - Topping up existing identities with wallet coordination (new architecture)
 * - Topping up with pre-synced accounts (deprecated)
 *
 * Architecture: Uses modular coordinators (WalletCoordinator, TransactionBuilder, AssetLockProofManager)
 * Completely independent of wallet-lib Wallet class.
 */

import type { EvoSDK } from '../../sdk.js';
import { WalletCoordinator } from '../coordination/wallet-coordinator.js';
import { TransactionBuilder } from '../coordination/transaction-builder.js';
import { AssetLockProofManager } from '../coordination/asset-lock-proof-manager.js';
import { TransactionOptionsBuilder } from '../utils/transaction-options-builder.js';
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

const logger = createLogger('IdentityUpdater');

/**
 * Identity top-up result
 */
export interface IdentityTopUpResult {
  status: 'success' | 'failure';
  identityId: string;
  newBalance: number;
  addedAmount: number;
  transactionHash: string;
  sourceAddress?: string;
  changeRoutedToSource: boolean;
  message: string;
}

/**
 * IdentityUpdater - Top up existing identities with wallet coordination
 *
 * Manages identity top-up operations:
 * 1. Wallet setup (HD derivation, UTXO discovery)
 * 2. Transaction creation and signing
 * 3. Broadcast and confirmation waiting
 * 4. Identity top-up on Platform
 *
 * Uses new modular architecture - no wallet-lib dependency.
 */
export class IdentityUpdater {
  constructor(private sdk: EvoSDK) {}

  /**
   * Top up an existing identity with wallet coordination
   *
   * Orchestrates the identity top-up flow:
   * - Wallet setup with UTXO discovery
   * - Asset lock transaction creation
   * - Broadcast and confirmation
   * - Platform identity top-up submission
   *
   * @param identityId Identity ID to top up (Base58 format)
   * @param amount Amount in duffs to add
   * @param mnemonic 12-word BIP39 mnemonic for wallet funding
   * @param options Advanced options
   * @param options.startHeight Blockchain height to start wallet sync (default: 1)
   * @param options.useSourceAsChangeAddress Route change back to source address (default: true)
   * @param options.onProgress Optional callback for progress updates
   * @returns Top-up result
   * @throws ValidationError if inputs invalid
   * @throws WalletSetupError if wallet setup fails
   * @throws TransactionCreationError if transaction creation fails
   * @throws TransactionBroadcastError if broadcast fails
   * @throws ConfirmationTimeoutError if confirmation times out
   * @throws PlatformSubmissionError if top-up fails
   *
   * @example
   * ```typescript
   * const result = await updater.topUpWithWallet(
   *   'identityId...',
   *   50000,
   *   'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
   *   {
   *     startHeight: 1,
   *     onProgress: (event) => console.log(event.message)
   *   }
   * );
   *
   * console.log('Top-up successful. New balance:', result.newBalance);
   * ```
   */
  async topUpWithWallet(
    identityId: string,
    amount: number,
    mnemonic: string,
    options: {
      startHeight?: number;
      useSourceAsChangeAddress?: boolean;
      onProgress?: (event: OperationEvent) => void;
    } = {}
  ): Promise<IdentityTopUpResult> {
    const startHeight = options.startHeight ?? 1;
    const useSourceAsChangeAddress = options.useSourceAsChangeAddress !== false;
    const onProgress = options.onProgress;

    // Input validation
    this.validateInputs(identityId, amount, mnemonic, startHeight);

    try {
      logger.info(`Starting identity top-up: ${identityId} (${amount} duffs)`);

      // Emit start event
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart(
            'wallet_setup',
            'Initializing wallet and discovering UTXOs...'
          )
        );
      }

      // Step 1: Setup wallet
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

      // Validate UTXOs
      if (!walletSetup.latestUTXO) {
        throw new WalletSetupError(
          'utxo_discovery',
          'No UTXOs available - cannot top up identity',
          false,
          { availableUTXOs: walletSetup.utxos.length }
        );
      }

      // Step 2: Build transaction options (with freshness validation for top-up)
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart('transaction_creation', 'Building transaction...')
        );
      }

      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account: null,
        amount,
        useSourceAsChangeAddress,
        validateUtxoFreshness: true, // Top-up ALWAYS validates freshness
      });

      // Step 3: Create asset lock transaction
      const txBuilder = new TransactionBuilder();
      const sourceAddress = walletSetup.addresses.external[0];
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        utxo: walletSetup.latestUTXO,
        sourceAddress,
        changeAddress: transactionOptions.change,
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

      // Step 4: Broadcast transaction
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

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete(
            'transaction_broadcast',
            `Transaction ID: ${transactionIdString}`
          )
        );
      }

      // Step 5: Wait for confirmation
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

      // Step 6: Submit to Platform
      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseStart('identity_topup', 'Submitting top-up to Platform...')
        );
      }

      logger.info('Submitting identity top-up to Platform...');

      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation(
        'identity-topup',
        {
          identityId,
          transactionData,
          assetLockPrivateKeyWif: txResult.assetLockPrivateKeyWif,
        },
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
        }
      );

      if (onProgress) {
        onProgress(
          OperationEventFactory.phaseComplete('finalization', 'Top-up completed successfully')
        );
      }

      logger.info(`Identity top-up successful: new balance ${result.newBalance}`);

      return {
        status: 'success',
        identityId,
        newBalance: result.newBalance,
        addedAmount: result.toppedUpAmount,
        transactionHash: transactionIdString,
        sourceAddress: sourceAddress.address,
        changeRoutedToSource: useSourceAsChangeAddress,
        message: 'Identity topped up successfully with wallet coordination',
      };
    } catch (error) {
      logger.error('Identity top-up failed:', error);

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
          'identity_topup',
          `Top-up failed: ${error.message}`,
          identityId,
          false,
          { originalError: error.message }
        );
      }

      throw new Error(`Top-up failed: ${String(error)}`);
    }
  }

  /**
   * Top up identity with pre-synced account (DEPRECATED)
   *
   * @deprecated Use topUpWithWallet() instead
   * This method is maintained for backward compatibility but uses the old pattern.
   * Consider migrating to topUpWithWallet() for better architecture.
   *
   * @param identityId Identity to top up
   * @param account Pre-synced wallet-lib account
   * @param amount Amount in duffs
   * @param options Advanced options
   * @returns Top-up result
   */
  async topUpWithAccount(
    identityId: string,
    account: any,
    amount: number,
    options: {
      useSourceAsChangeAddress?: boolean;
      onProgress?: (event: OperationEvent) => void;
    } = {}
  ): Promise<IdentityTopUpResult> {
    logger.warn(
      'topUpWithAccount() is deprecated - use topUpWithWallet() instead for cleaner architecture'
    );

    if (!identityId) {
      throw new ValidationError(
        'identityId_validation',
        'Identity ID is required',
        'identityId',
        false
      );
    }

    if (!account) {
      throw new ValidationError(
        'account_validation',
        'Account is required',
        'account',
        false
      );
    }

    if (typeof amount !== 'number' || isNaN(amount) ||
        amount < IDENTITY_CONFIG.TOPUP_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new ValidationError(
        'amount_validation',
        `Invalid amount: must be between ${IDENTITY_CONFIG.TOPUP_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT}`,
        'amount',
        false,
        { amount }
      );
    }

    try {
      logger.info(`Topping up identity ${identityId} with pre-synced account (${amount} duffs)`);

      // Build transaction using account's UTXOs
      const txOptionsBuilder = new TransactionOptionsBuilder();
      const { transactionOptions, utxos } = await txOptionsBuilder.buildTransactionOptions({
        account,
        amount,
        useSourceAsChangeAddress: options.useSourceAsChangeAddress !== false,
        validateUtxoFreshness: true,
      });

      // Create and broadcast transaction
      const txBuilder = new TransactionBuilder();
      const txResult = await txBuilder.createAssetLockTransaction({
        amount,
        account,
        changeAddress: transactionOptions.change,
        utxos: utxos as any,  // UTXO type compatibility across modules
        network: this.sdk.networkConfig.network,
      });

      const transactionIdString = await txBuilder.broadcastTransaction(
        txResult.transactionHex,
        account
      );

      logger.info(`Transaction broadcasted: ${transactionIdString}`);

      // Wait for confirmation
      const proofManager = new AssetLockProofManager(this.sdk);
      const transactionData = await proofManager.waitForConfirmation(
        undefined as any,
        transactionIdString,
        txResult.transactionHex,
        [transactionOptions.change]
      );

      // Submit to Platform
      const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');

      const result = await runWasmOperation(
        'identity-topup',
        {
          identityId,
          transactionData,
          assetLockPrivateKeyWif: txResult.assetLockPrivateKeyWif,
        },
        {
          network: this.sdk.networkConfig.network,
          timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
        }
      );

      return {
        status: 'success',
        identityId,
        newBalance: result.newBalance,
        addedAmount: result.toppedUpAmount,
        transactionHash: transactionIdString,
        changeRoutedToSource: options.useSourceAsChangeAddress !== false,
        message: 'Identity topped up with pre-synced account (deprecated method)',
      };
    } catch (error) {
      logger.error('Identity top-up with account failed:', error);
      throw new PlatformSubmissionError(
        'identity_topup',
        `Top-up failed: ${(error as Error).message}`,
        identityId,
        false
      );
    }
  }

  /**
   * Validate top-up inputs
   */
  private validateInputs(
    identityId: string,
    amount: number,
    mnemonic: string,
    startHeight: number
  ): void {
    if (!identityId) {
      throw new ValidationError(
        'identityId_validation',
        'Identity ID is required',
        'identityId',
        false
      );
    }

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
        amount < IDENTITY_CONFIG.TOPUP_MIN_AMOUNT || amount > IDENTITY_CONFIG.MAX_AMOUNT) {
      throw new ValidationError(
        'amount_validation',
        `Invalid amount: must be between ${IDENTITY_CONFIG.TOPUP_MIN_AMOUNT} and ${IDENTITY_CONFIG.MAX_AMOUNT}`,
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
}
