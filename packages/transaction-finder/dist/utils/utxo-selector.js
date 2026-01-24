/**
 * LatestUTXOSelector - Select latest spendable UTXO from a list
 * Uses chronological blockchain ordering as primary criteria
 */
export class LatestUTXOSelector {
    /**
     * Select the latest spendable UTXO from a list
     * Ordering priority:
     *   1. Block height (highest = latest)
     *   2. Block time (most recent = latest)
     *   3. Value (larger = preferred)
     *
     * @param utxos - Array of UTXO objects
     * @param requiredAmount - Optional minimum satoshis needed
     * @returns Latest spendable UTXO
     * @throws Error if no spendable UTXOs available or insufficient funds
     */
    static select(utxos, requiredAmount = 0) {
        // Filter for spendable UTXOs (confirmed OR ChainLocked OR InstantSend)
        const spendableUTXOs = utxos.filter((utxo) => {
            const hasConfirmations = utxo.blockHeight && utxo.blockHeight > 0;
            const isChainLocked = utxo.isChainLocked === true;
            const isInstantLocked = utxo.isInstantLocked === true;
            // Spendable if: confirmed OR chain locked OR instant locked
            return hasConfirmations || isChainLocked || isInstantLocked;
        });
        if (spendableUTXOs.length === 0) {
            throw new Error('No spendable UTXOs available (need confirmations, ChainLock, or InstantSend)');
        }
        // Sort by blockchain chronological order
        // PRIMARY: Block height descending (highest block = latest)
        // SECONDARY: Block time descending (tiebreaker for same block)
        // TERTIARY: Value descending (prefer larger UTXOs)
        const sorted = spendableUTXOs.sort((a, b) => {
            // Primary: compare block heights
            if (a.blockHeight !== b.blockHeight) {
                return b.blockHeight - a.blockHeight;
            }
            // Secondary: compare block times
            if (a.blockTime !== b.blockTime) {
                return b.blockTime - a.blockTime;
            }
            // Tertiary: compare values
            return b.satoshis - a.satoshis;
        });
        // Select the latest (first in sorted array)
        const latestUTXO = sorted[0];
        // Check if it meets required amount
        if (requiredAmount > 0 && latestUTXO.satoshis < requiredAmount) {
            throw new Error(`Insufficient funds: latest UTXO has ${latestUTXO.satoshis} sats, ` +
                `but ${requiredAmount} sats required`);
        }
        return latestUTXO;
    }
}
//# sourceMappingURL=utxo-selector.js.map