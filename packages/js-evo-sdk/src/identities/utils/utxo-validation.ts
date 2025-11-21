/**
 * UTXO Validation Utility
 *
 * Provides UTXO freshness validation to prevent stale UTXO errors during transaction creation.
 * Extracted from facade.ts as part of Phase 2 refactoring.
 */

import { createLogger } from './identity-logger.js';
import type { WalletAccount, UTXO } from '../types/wallet-types.js';

const logger = createLogger('UtxoValidator');

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } };

/**
 * Result of UTXO validation operation
 */
export interface UtxoValidationResult {
  /** UTXOs that are currently valid and spendable */
  validUtxos: any[];
  /** UTXOs that were detected as stale (already spent) */
  staleUtxos: any[];
  /** Total number of UTXOs validated */
  totalValidated: number;
}

/**
 * UTXO Validator - Ensures UTXOs are fresh and spendable
 *
 * Validates that UTXOs exist in the current wallet state and haven't been spent.
 * This prevents "bad-txns-inputs-missingorspent" errors during transaction broadcast.
 */
export class UtxoValidator {
  /**
   * Validate UTXO freshness by comparing against current wallet state
   *
   * @param account Wallet account with current UTXO state
   * @param utxos UTXOs to validate
   * @returns Validation result with separated valid and stale UTXOs
   */
  async validateUtxoFreshness(account: WalletAccount, utxos: UTXO[]): Promise<UtxoValidationResult> {
    try {
      logger.debug(`🔍 Validating freshness of ${utxos.length} UTXOs...`);

      // Get fresh UTXOs from wallet
      const freshUtxos = account.getUTXOS();
      const freshUtxoMap = new Map();

      // Build map of fresh UTXOs for quick lookup
      freshUtxos.forEach((utxo: any) => {
        const txId = utxo.txid || utxo.txId;
        const outputIndex = utxo.vout !== undefined ? utxo.vout : utxo.outputIndex;
        const key = `${txId}:${outputIndex}`;
        freshUtxoMap.set(key, utxo);
      });

      // Separate valid and stale UTXOs
      const validUtxos: any[] = [];
      const staleUtxos: any[] = [];

      utxos.forEach((utxo: any) => {
        const txId = utxo.txid || utxo.txId;
        const outputIndex = utxo.vout !== undefined ? utxo.vout : utxo.outputIndex;
        const key = `${txId}:${outputIndex}`;
        const isFresh = freshUtxoMap.has(key);

        if (isFresh) {
          validUtxos.push(utxo);
        } else {
          staleUtxos.push(utxo);
          logger.warn(`⚠️  Stale UTXO detected: ${txId}:${outputIndex} - excluding from transaction`);
        }
      });

      logger.debug(`✅ Validated UTXOs: ${validUtxos.length}/${utxos.length} are fresh`);

      if (validUtxos.length === 0) {
        throw new Error('All UTXOs are stale - wallet sync required');
      }

      if (staleUtxos.length > 0) {
        logger.debug(`⚠️  Warning: ${staleUtxos.length} stale UTXOs removed from selection`);
      }

      return {
        validUtxos,
        staleUtxos,
        totalValidated: utxos.length
      };

    } catch (error) {
      logger.error('❌ UTXO freshness validation failed:', error);
      // On validation failure, return original UTXOs and let transaction fail with clearer error
      return {
        validUtxos: utxos,
        staleUtxos: [],
        totalValidated: utxos.length
      };
    }
  }
}
