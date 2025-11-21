/**
 * Transaction Options Builder
 *
 * Extracts duplicate transaction setup logic from createWithWallet() and topUpWithWallet().
 * Handles UTXO validation, coin selection, and change address routing.
 *
 * Created as part of Phase 3.3 refactoring to eliminate ~120 lines of duplication.
 */

import { UtxoValidator } from './utxo-validation.js';
import { CoinSelector } from './coin-selection.js';
import { createLogger } from './identity-logger.js';
import type { WalletAccount, UTXO, CoinSelectionStrategy } from '../types/wallet-types.js';

const logger = createLogger('TransactionOptionsBuilder');

/**
 * Configuration for transaction options building
 */
export interface TransactionOptionsConfig {
  /** Wallet account with UTXO access */
  account: WalletAccount;
  /** Transaction amount in duffs */
  amount: number;
  /** Route change to source address (true) or new address (false) */
  useSourceAsChangeAddress: boolean;
  /** Enable UTXO freshness validation (recommended for topUp) */
  validateUtxoFreshness?: boolean;
  /** Optional pre-fetched UTXOs (if not provided, will call account.getUTXOS()) */
  utxos?: UTXO[];
  /** Optional: Filter UTXOs to specific address only (fresh funds pattern) */
  targetAddress?: string;
  /** Optional: Use specific UTXO only (by txid:vout) */
  targetUtxo?: { txid: string; vout: number };
}

/**
 * Result of transaction options building
 */
export interface TransactionOptionsResult {
  /** Transaction options ready for TransactionBuilder */
  transactionOptions: {
    satoshis: number;
    recipient: string;
    change?: string;
    utxos?: UTXO[];
    strategy?: CoinSelectionStrategy;
  };
  /** Source address used for change routing */
  sourceAddress: string | null;
  /** Recipient address for the transaction */
  recipientAddress: string;
  /** UTXOs to use for transaction (validated if requested) */
  utxos: UTXO[];
}

/**
 * Transaction Options Builder
 *
 * Encapsulates the common pattern of:
 * 1. UTXO validation (optional)
 * 2. Coin selection with latestSpendableUTXO strategy
 * 3. Change address routing based on privacy preference
 * 4. Transaction options object creation
 */
export class TransactionOptionsBuilder {
  /**
   * Build transaction options with coin selection and change routing
   *
   * @param config Transaction configuration
   * @returns Transaction options ready for TransactionBuilder
   */
  async buildTransactionOptions(
    config: TransactionOptionsConfig
  ): Promise<TransactionOptionsResult> {
    const {
      account,
      amount,
      useSourceAsChangeAddress,
      validateUtxoFreshness = false,
      utxos: providedUtxos,
      targetAddress,
      targetUtxo
    } = config;

    // Step 1: Get UTXOs (use provided or fetch from account)
    let utxos = providedUtxos || account.getUTXOS();

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs available. Account needs to be funded with at least ${amount} duffs.`);
    }

    // Step 1a: Optional filtering by target address (fresh funds pattern)
    if (targetAddress) {
      logger.info(`Filtering UTXOs for address: ${targetAddress}`);
      utxos = this._filterUtxosByAddress(utxos, targetAddress);

      if (utxos.length === 0) {
        throw new Error(`No UTXOs found for target address: ${targetAddress}`);
      }

      logger.debug(`Found ${utxos.length} UTXO(s) for target address`);
    }

    // Step 1b: Optional filtering to specific UTXO
    if (targetUtxo) {
      logger.info(`Filtering to specific UTXO: ${targetUtxo.txid}:${targetUtxo.vout}`);
      utxos = this._filterToSpecificUtxo(utxos, targetUtxo);

      if (utxos.length === 0) {
        throw new Error(`UTXO not found: ${targetUtxo.txid}:${targetUtxo.vout}`);
      }

      logger.debug('Filtered to target UTXO');
    }

    // Step 2: Optional UTXO freshness validation (recommended for topUp)
    if (validateUtxoFreshness) {
      logger.info('Validating UTXO freshness...');
      const validationStart = Date.now();
      const utxoValidator = new UtxoValidator();
      const validationResult = await utxoValidator.validateUtxoFreshness(account, utxos);
      utxos = validationResult.validUtxos;
      const validationTime = ((Date.now() - validationStart) / 1000).toFixed(1);
      logger.info(`UTXO validation complete (${validationTime}s)`);
    }

    // Step 3: Get recipient address
    const recipientAddressObj = account.getUnusedAddress('external');
    const recipientAddress = typeof recipientAddressObj === 'string'
      ? recipientAddressObj
      : (recipientAddressObj.address || recipientAddressObj.toString());

    // Step 4: Initialize transaction options
    const transactionOptions: any = {
      satoshis: amount,
      recipient: recipientAddress,
    };

    let sourceAddress: string | null = null;

    // Step 5: Handle change address routing
    if (useSourceAsChangeAddress !== false) {
      // DEFAULT: Route change back to source address for efficiency
      const outputs = [{ address: recipientAddress, satoshis: amount }];

      try {
        // Use enhanced coin selection utility with latestSpendableUTXO strategy
        const coinSelector = new CoinSelector();
        const selectionResult = await coinSelector.selectCoinsForTransaction(
          utxos,
          outputs,
          amount,
          account
        );

        // Apply coin selection results
        transactionOptions.change = selectionResult.sourceAddress;
        transactionOptions.utxos = utxos;  // Pass ALL UTXOs (TransactionBuilder selects LAST)
        transactionOptions.strategy = selectionResult.strategy;
        sourceAddress = selectionResult.sourceAddress;

        logger.debug(`Change address set to SOURCE: ${sourceAddress} (efficiency mode)`);

      } catch (coinSelectionError) {
        logger.warn('Coin selection failed, using wallet default for change:', coinSelectionError.message);
        // Don't set change address, let wallet-lib use default behavior
      }
    } else {
      // PRIVACY MODE: Route change to a new internal address
      const newChangeAddressObj = account.getUnusedAddress('internal');
      const newChangeAddress = typeof newChangeAddressObj === 'string'
        ? newChangeAddressObj
        : (newChangeAddressObj.address || newChangeAddressObj.toString());
      transactionOptions.change = newChangeAddress;
      sourceAddress = newChangeAddress;
      logger.debug(`Change address set to NEW: ${newChangeAddress} (privacy mode)`);
    }

    return {
      transactionOptions,
      sourceAddress,
      recipientAddress,
      utxos
    };
  }

  /**
   * Filter UTXOs by address
   * @private
   */
  private _filterUtxosByAddress(utxos: any[], targetAddress: string): any[] {
    return utxos.filter((utxo) => {
      const utxoAddress = this._extractUtxoAddress(utxo);
      return utxoAddress === targetAddress;
    });
  }

  /**
   * Filter to specific UTXO by txid and vout
   * @private
   */
  private _filterToSpecificUtxo(utxos: any[], targetUtxo: { txid: string; vout: number }): any[] {
    return utxos.filter((utxo) => {
      const utxoTxid = utxo.txid || utxo.txId;
      const utxoVout = utxo.vout ?? utxo.outputIndex;
      return utxoTxid === targetUtxo.txid && utxoVout === targetUtxo.vout;
    });
  }

  /**
   * Extract address from UTXO handling various formats
   * @private
   */
  private _extractUtxoAddress(utxo: any): string | null {
    // Direct string address
    if (typeof utxo.address === 'string') {
      return utxo.address;
    }

    // Address object with toString method (wallet-lib pattern)
    if (utxo.address && typeof utxo.address.toString === 'function') {
      return utxo.address.toString();
    }

    // Nested address property
    if (utxo.address && utxo.address.address) {
      return utxo.address.address;
    }

    return null;
  }
}
