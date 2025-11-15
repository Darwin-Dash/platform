/**
 * UTXOExtractor - Extract UTXOs from synced transactions
 * Tracks created and spent outputs to determine spendable UTXOs
 */
import { UTXO, TransactionWithMetadata } from '../types/index.js';
export declare class UTXOExtractor {
    private network;
    private readonly logger;
    constructor(network?: string);
    /**
     * Extract UTXOs from synced transactions
     * @param transactions - Array of transactions with metadata
     * @param addresses - Addresses to extract UTXOs for
     * @returns Array of UTXO objects
     */
    extractUTXOs(transactions: TransactionWithMetadata[], addresses: string[]): UTXO[];
    /**
     * Extract address from a transaction output
     * @param output - Transaction output object
     * @returns Address string or null if unable to extract
     */
    private extractAddressFromOutput;
    /**
     * Filter UTXOs to only include spendable ones
     * @param utxos - Array of UTXOs
     * @returns Filtered UTXOs that are spendable
     */
    getSpendableUTXOs(utxos: UTXO[]): UTXO[];
}
//# sourceMappingURL=utxo-extractor.d.ts.map