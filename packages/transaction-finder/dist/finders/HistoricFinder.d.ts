/**
 * HistoricFinder - Historic blockchain scanning for UTXO discovery
 * Stateless finder that coordinates bloom filter building, transaction syncing,
 * UTXO extraction, and UTXO selection for historical blockchain data
 */
import { EventEmitter } from 'events';
import { UTXO, HistoricFinderConfig } from '../types/index.js';
export declare class HistoricFinder extends EventEmitter {
    private syncer;
    private extractor;
    private config;
    /**
     * Initialize HistoricFinder
     * @param config - Historic finder configuration
     */
    constructor(config: HistoricFinderConfig);
    /**
     * Find all UTXOs for configured addresses
     * Performs full blockchain scan from fromHeight to toHeight
     *
     * @returns Array of all UTXOs found
     * @throws Error if no addresses configured or sync fails
     */
    findUTXOs(): Promise<UTXO[]>;
    /**
     * Find latest spendable UTXO for configured addresses
     * This is a convenience method that finds all UTXOs and selects the latest
     *
     * @returns Latest spendable UTXO
     * @throws Error if no spendable UTXOs found or insufficient funds
     */
    findLatestSpendableUTXO(): Promise<UTXO>;
    /**
     * Get the configured network
     */
    getNetwork(): string;
}
//# sourceMappingURL=HistoricFinder.d.ts.map