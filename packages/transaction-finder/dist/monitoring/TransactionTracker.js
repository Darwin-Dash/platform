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
import { createLogger } from '../utils/logger.js';
export class TransactionTracker {
    constructor(autoPrune = false, maxTransactions = 1000) {
        this.transactions = new Map();
        this.blockHeightMap = new Map();
        this.monitoredTxIds = new Set();
        this.autoPrune = autoPrune;
        this.maxTransactions = maxTransactions;
        this.logger = createLogger('TransactionTracker');
    }
    /**
     * Register a transaction for monitoring
     * @param txid Transaction ID
     * @param transaction Optional transaction object
     */
    addBroadcast(txid, transaction) {
        // Mark this transaction as one we're actively monitoring
        this.monitoredTxIds.add(txid);
        if (!this.transactions.has(txid)) {
            this.transactions.set(txid, {
                txid,
                broadcastTime: Date.now(),
                instantLockTime: null,
                blockHeight: null,
                blockHash: null,
                chainLockTime: null,
                chainLockBlockHeight: null,
                status: 'pending',
            });
        }
    }
    /**
     * Record InstantLock confirmation
     * @param txid Transaction ID
     * @param timestamp Time of InstantLock
     * @returns true if newly recorded, false if already existed
     */
    recordInstantLock(txid, timestamp) {
        const tx = this.transactions.get(txid);
        if (tx && !tx.instantLockTime) {
            tx.instantLockTime = timestamp;
            if (tx.status === 'pending') {
                tx.status = 'instantlocked';
            }
            return true;
        }
        return false;
    }
    /**
     * Record block inclusion
     * Handles case where MerkleBlock arrives before raw transaction
     * @param txid Transaction ID
     * @param blockHeight Block height
     * @param blockHash Block hash
     * @returns true if newly recorded, false if already existed
     */
    recordBlockInclusion(txid, blockHeight, blockHash) {
        // Create transaction entry if it doesn't exist yet
        if (!this.transactions.has(txid)) {
            this.transactions.set(txid, {
                txid,
                broadcastTime: null,
                instantLockTime: null,
                blockHeight: null,
                blockHash: null,
                chainLockTime: null,
                chainLockBlockHeight: null,
                status: 'pending',
            });
        }
        const tx = this.transactions.get(txid);
        if (tx && !tx.blockHeight) {
            tx.blockHeight = blockHeight;
            tx.blockHash = blockHash;
            if (!this.blockHeightMap.has(blockHeight)) {
                this.blockHeightMap.set(blockHeight, []);
            }
            this.blockHeightMap.get(blockHeight).push(txid);
            return true;
        }
        return false;
    }
    /**
     * Record ChainLock confirmation
     * All transactions in blocks <= chainLockedHeight are now ChainLocked
     * @param chainLockedHeight Highest ChainLocked block height
     * @param timestamp Time of ChainLock
     * @returns Array of transaction IDs newly confirmed
     */
    recordChainLock(chainLockedHeight, timestamp) {
        const confirmedTxids = [];
        this.logger.debug(`🔍 recordChainLock(${chainLockedHeight}), blockHeightMap.size=${this.blockHeightMap.size}`);
        // Check safety limit BEFORE processing
        if (this.transactions.size > this.maxTransactions) {
            const errorMsg = `Transaction limit exceeded (${this.transactions.size}/${this.maxTransactions}). ` +
                `Enable autoPruneOnConfirmation or call clearAllConfirmed() manually.`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        for (const [blockHeight, txids] of this.blockHeightMap.entries()) {
            this.logger.debug(`   Checking block ${blockHeight}: ${txids.length} txids`);
            if (blockHeight <= chainLockedHeight) {
                for (const txid of txids) {
                    const tx = this.transactions.get(txid);
                    if (tx && !tx.chainLockTime) {
                        tx.chainLockTime = timestamp;
                        tx.chainLockBlockHeight = chainLockedHeight;
                        if (tx.status === 'instantlocked' || tx.status === 'pending') {
                            tx.status = 'chainlocked';
                        }
                        confirmedTxids.push(txid);
                    }
                }
            }
        }
        this.logger.debug(`   Result: ${confirmedTxids.length} confirmed`);
        // Auto-prune if enabled (opt-in for long-running services)
        if (this.autoPrune && confirmedTxids.length > 0) {
            this.logger.debug(`   Auto-pruning ${confirmedTxids.length} confirmed transactions`);
            confirmedTxids.forEach((txid) => this.clearTransaction(txid));
        }
        return confirmedTxids;
    }
    /**
     * Get transaction state
     * @param txid Transaction ID
     * @returns Transaction state or undefined
     */
    getTransaction(txid) {
        return this.transactions.get(txid);
    }
    /**
     * Check if transaction is being monitored
     * @param txid Transaction ID
     * @returns true if monitored
     */
    isMonitored(txid) {
        return this.monitoredTxIds.has(txid);
    }
    /**
     * Get all monitored transactions
     * @returns Array of tracked transactions
     */
    getAllTransactions() {
        return Array.from(this.transactions.values());
    }
    /**
     * Get all monitored transaction IDs
     * @returns Set of monitored txids
     */
    getMonitoredTxIds() {
        return new Set(this.monitoredTxIds);
    }
    /**
     * Get size of blockHeightMap
     * @returns Number of blocks tracked
     */
    getBlockHeightMapSize() {
        return this.blockHeightMap.size;
    }
    /**
     * Clear a specific transaction from tracking
     * Removes from all internal data structures
     * @param txid Transaction ID to clear
     */
    clearTransaction(txid) {
        const tx = this.transactions.get(txid);
        if (tx) {
            // Remove from blockHeightMap if it has a block height
            if (tx.blockHeight !== null) {
                const txidsAtHeight = this.blockHeightMap.get(tx.blockHeight);
                if (txidsAtHeight) {
                    const index = txidsAtHeight.indexOf(txid);
                    if (index > -1) {
                        txidsAtHeight.splice(index, 1);
                    }
                    // Remove empty height entries
                    if (txidsAtHeight.length === 0) {
                        this.blockHeightMap.delete(tx.blockHeight);
                    }
                }
            }
            // Remove from transactions map
            this.transactions.delete(txid);
            // Remove from monitored set
            this.monitoredTxIds.delete(txid);
        }
    }
    /**
     * Clear all confirmed (chainlocked) transactions
     * Useful for manual memory management in long-running processes
     */
    clearAllConfirmed() {
        const confirmedTxids = [];
        // Find all chainlocked transactions
        for (const [txid, tx] of this.transactions.entries()) {
            if (tx.status === 'chainlocked') {
                confirmedTxids.push(txid);
            }
        }
        // Clear each confirmed transaction
        confirmedTxids.forEach((txid) => this.clearTransaction(txid));
    }
    /**
     * Clear all tracked data
     */
    clear() {
        this.transactions.clear();
        this.blockHeightMap.clear();
        this.monitoredTxIds.clear();
    }
}
//# sourceMappingURL=TransactionTracker.js.map