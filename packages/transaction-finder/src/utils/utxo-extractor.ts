/**
 * UTXOExtractor - Extract UTXOs from synced transactions
 * Tracks created and spent outputs to determine spendable UTXOs
 */

import { UTXO, TransactionWithMetadata } from '../types/index.js';
import { Logger, createLogger } from './logger.js';

export class UTXOExtractor {
  private network: string;
  private readonly logger: Logger;

  constructor(network: string = 'testnet') {
    this.network = network;
    this.logger = createLogger('UTXOExtractor');
  }

  /**
   * Extract UTXOs from synced transactions
   * @param transactions - Array of transactions with metadata
   * @param addresses - Addresses to extract UTXOs for
   * @returns Array of UTXO objects
   */
  extractUTXOs(
    transactions: TransactionWithMetadata[],
    addresses: string[]
  ): UTXO[] {
    const addressSet = new Set(addresses);
    const utxoMap = new Map<string, UTXO>(); // txid:vout → UTXO
    const spentKeys = new Set<string>(); // Track spent outputs

    // First pass: identify all spent outputs
    transactions.forEach(({ tx }) => {
      if (tx.inputs && Array.isArray(tx.inputs)) {
        tx.inputs.forEach((input: any) => {
          try {
            const prevTxId = input.prevTxId
              ? input.prevTxId.toString('hex')
              : input.previousOutput?.transactionHash || '';
            const outputIndex = input.outputIndex || input.previousOutput?.index || 0;
            const spentKey = `${prevTxId}:${outputIndex}`;
            spentKeys.add(spentKey);

            if (this.logger.isDebugEnabled()) {
              this.logger.debug(`Marked as spent: ${spentKey} (from tx ${tx.hash})`);
            }
          } catch (error) {
            if (this.logger.isDebugEnabled()) {
              this.logger.warn(`Failed to parse input in tx ${tx.hash}:`, error);
            }
          }
        });
      }
    });

    // Second pass: extract new UTXOs from outputs
    transactions.forEach(({ tx, metadata }) => {
      if (tx.outputs && Array.isArray(tx.outputs)) {
        tx.outputs.forEach((output: any, vout: number) => {
          try {
            // Try to extract address from output script
            const address = this.extractAddressFromOutput(output);

            // Only include if address is in our watch set
            if (address && addressSet.has(address)) {
              const utxoKey = `${tx.hash}:${vout}`;

              // Only add if not already spent in this transaction set
              if (!spentKeys.has(utxoKey)) {
                if (this.logger.isDebugEnabled()) {
                  this.logger.debug(`Adding UTXO: ${utxoKey} for address ${address}`);
                }
                const satoshis = output.satoshis || output.amount || 0;

                utxoMap.set(utxoKey, {
                  txId: tx.hash,
                  vout,
                  satoshis,
                  script: output.script?.toHex?.() || output.script || '',
                  address,
                  blockHeight: metadata?.height || 0,
                  blockTime: metadata?.time?.getTime?.() || 0,
                  blockHash: metadata?.blockHash || null,
                  isChainLocked: metadata?.isChainLocked || false,
                  isInstantLocked: metadata?.isInstantLocked || false,
                });
              } else {
                if (this.logger.isDebugEnabled()) {
                  this.logger.debug(`Filtered out spent UTXO: ${utxoKey} for address ${address}`);
                }
              }
            }
          } catch (error) {
            // Skip non-standard outputs (e.g., OP_RETURN)
          }
        });
      }
    });

    // Return array of UTXOs (excluding spent ones)
    if (this.logger.isDebugEnabled()) {
      this.logger.debug(`Final UTXO count: ${utxoMap.size} (from ${transactions.length} transactions)`);
      this.logger.debug(`Spent outputs tracked: ${spentKeys.size}`);
    }
    return Array.from(utxoMap.values());
  }

  /**
   * Extract address from a transaction output
   * @param output - Transaction output object
   * @returns Address string or null if unable to extract
   */
  private extractAddressFromOutput(output: any): string | null {
    try {
      // Try standard script method first
      if (output.script && output.script.toAddress) {
        const addr = output.script.toAddress(this.network);
        return addr ? addr.toString() : null;
      }

      // Try alternative address extraction methods
      if (output.address) {
        return output.address;
      }

      // Try script buffer
      if (output.script && typeof output.script === 'string') {
        // Hex script - would need to parse script type
        // This is a fallback for unusual cases
        return null;
      }

      return null;
    } catch (error) {
      // Non-standard outputs (e.g., OP_RETURN, custom scripts)
      return null;
    }
  }

  /**
   * Filter UTXOs to only include spendable ones
   * @param utxos - Array of UTXOs
   * @returns Filtered UTXOs that are spendable
   */
  getSpendableUTXOs(utxos: UTXO[]): UTXO[] {
    return utxos.filter((utxo) => {
      const hasConfirmations = utxo.blockHeight && utxo.blockHeight > 0;
      const isChainLocked = utxo.isChainLocked === true;
      const isInstantLocked = utxo.isInstantLocked === true;

      // Spendable if: confirmed OR chain locked OR instant locked
      return hasConfirmations || isChainLocked || isInstantLocked;
    });
  }
}
