/**
 * TransactionTracker
 *
 * Tracks transaction state through confirmation stages:
 * 1. Broadcast (initial detection)
 * 2. InstantLock (masternode quorum consensus)
 * 3. Block inclusion (mined into block)
 * 4. ChainLock (LLMQ signs entire blockchain)
 *
 * Handles race conditions where events arrive in any order.
 */
import { TrackedTransaction } from '../types/index.js';
export declare class TransactionTracker {
    private transactions;
    private blockHeightMap;
    private monitoredTxIds;
    private autoPrune;
    private maxTransactions;
    private logger;
    constructor(autoPrune?: boolean, maxTransactions?: number);
    /**
     * Register a transaction for monitoring
     * @param txid Transaction ID
     * @param transaction Optional transaction object
     */
    addBroadcast(txid: string, transaction?: any): void;
    /**
     * Record InstantLock confirmation
     * @param txid Transaction ID
     * @param timestamp Time of InstantLock
     * @param instantLockHex Optional raw InstantLock data as hex string
     * @returns true if newly recorded, false if already existed
     */
    recordInstantLock(txid: string, timestamp: number, instantLockHex?: string): boolean;
    /**
     * Record block inclusion
     * Handles case where MerkleBlock arrives before raw transaction
     * @param txid Transaction ID
     * @param blockHeight Block height
     * @param blockHash Block hash
     * @returns true if newly recorded, false if already existed
     */
    recordBlockInclusion(txid: string, blockHeight: number, blockHash: string): boolean;
    /**
     * Record ChainLock confirmation
     * All transactions in blocks <= chainLockedHeight are now ChainLocked
     * @param chainLockedHeight Highest ChainLocked block height
     * @param timestamp Time of ChainLock
     * @returns Array of transaction IDs newly confirmed
     */
    recordChainLock(chainLockedHeight: number, timestamp: number): string[];
    /**
     * Get transaction state
     * @param txid Transaction ID
     * @returns Transaction state or undefined
     */
    getTransaction(txid: string): TrackedTransaction | undefined;
    /**
     * Check if transaction is being monitored
     * @param txid Transaction ID
     * @returns true if monitored
     */
    isMonitored(txid: string): boolean;
    /**
     * Get all monitored transactions
     * @returns Array of tracked transactions
     */
    getAllTransactions(): TrackedTransaction[];
    /**
     * Get all monitored transaction IDs
     * @returns Set of monitored txids
     */
    getMonitoredTxIds(): Set<string>;
    /**
     * Get size of blockHeightMap
     * @returns Number of blocks tracked
     */
    getBlockHeightMapSize(): number;
    /**
     * Clear a specific transaction from tracking
     * Removes from all internal data structures
     * @param txid Transaction ID to clear
     */
    clearTransaction(txid: string): void;
    /**
     * Clear all confirmed (chainlocked) transactions
     * Useful for manual memory management in long-running processes
     */
    clearAllConfirmed(): void;
    /**
     * Clear all tracked data
     */
    clear(): void;
}
//# sourceMappingURL=TransactionTracker.d.ts.map