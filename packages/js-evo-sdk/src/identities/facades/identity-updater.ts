/**
 * IdentityUpdater Facade - Update existing identities (topUp operations)
 *
 * Provides operations for:
 * - Topping up existing identities with wallet coordination (mnemonic-based)
 *
 * Architecture: Uses modular coordinators (TransactionBuilder, AssetLockProofManager)
 * Completely independent of wallet-lib. Uses WASM SDK for HD derivation.
 */

import type { EvoSDK } from '../../sdk.js';
import { type DerivedAddressInfo } from '../coordination/wallet-coordinator.js';
import { TransactionBuilder } from '../coordination/transaction-builder.js';
import { AssetLockProofManager } from '../coordination/asset-lock-proof-manager.js';
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

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } } | undefined;

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
   * Top up an existing identity with a pre-found UTXO
   *
   * This method
   * uses a UTXO that was already found via findSpendableUTXO(). This provides:
   * - Faster execution (no redundant blockchain scan)
   * - Separation between UTXO finding and top-up operation
   * - Ability to show user the balance before committing
   *
   * @param options Top-up options with pre-found UTXO
   * @returns Top-up result
   * @throws ValidationError if inputs invalid
   * @throws TransactionCreationError if transaction creation fails
   * @throws TransactionBroadcastError if broadcast fails
   * @throws ConfirmationTimeoutError if confirmation times out
   * @throws PlatformSubmissionError if top-up fails
   *
   * @example
   * ```typescript
   * // Step 1: Find UTXO
   * const utxoResult = await sdk.identities.findSpendableUTXO({
   *   mnemonic,
   *   startHeight: 1000000,
   *   minAmount: 50000,
   * });
   *
   * // Step 2: Top up identity with the found UTXO
   * const result = await updater.topupWithUTXO({
   *   mnemonic,
   *   identityId: 'identityId...',
   *   utxo: utxoResult.utxo,
   *   amount: 50000,
   *   derivedAddresses: utxoResult.derivedAddresses,
   *   onProgress: (event) => console.log(event.message)
   * });
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
    onProgress?: (event: OperationEvent) => void;
  }): Promise<IdentityTopUpResult> {
    const {
      mnemonic,
      identityId,
      utxo,
      amount,
      useSourceAsChangeAddress = true,
      derivedAddresses: providedAddresses,
      onProgress,
    } = options;

    // Validate inputs
    this.validateTopupWithUTXOInputs(identityId, amount, mnemonic);

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

    try {
      logger.info(`Starting identity top-up with pre-found UTXO: ${identityId} (${amount} duffs)`);
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
        // Derive fresh addresses
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

      // Step 3: Create asset lock transaction
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

      // Step 4: Setup REALTIME monitoring for transaction confirmation
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

      // Create TransactionFinder in REALTIME mode for monitoring only
      const monitor = new TransactionFinder({
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

      // Step 5: Pre-register txid BEFORE broadcast
      const expectedTxid = txResult.transactionId;
      logger.info(`📝 Pre-registering txid for monitoring: ${expectedTxid}`);
      monitor.preRegisterTransaction(expectedTxid);

      // Step 6: Broadcast transaction
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

      // Step 7: Wait for transaction confirmation
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

      // Step 8: Submit top-up to Platform via worker
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

      // Stop the monitor
      monitor.stop();

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
        message: 'Identity topped up successfully with pre-found UTXO',
      };
    } catch (error) {
      logger.error('Identity top-up with UTXO failed:', error);

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
          `Top-up with UTXO failed: ${error.message}`,
          identityId,
          false,
          { originalError: error.message }
        );
      }

      throw new Error(`Top-up with UTXO failed: ${String(error)}`);
    }
  }

  /**
   * Validate top-up inputs
   */
  private validateTopupWithUTXOInputs(
    identityId: string,
    amount: number,
    mnemonic: string
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
  }
}
