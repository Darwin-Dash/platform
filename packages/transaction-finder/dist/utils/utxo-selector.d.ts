/**
 * LatestUTXOSelector - Select latest spendable UTXO from a list
 * Uses chronological blockchain ordering as primary criteria
 */
import { UTXO } from '../types/index.js';
export declare class LatestUTXOSelector {
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
    static select(utxos: UTXO[], requiredAmount?: number): UTXO;
}
//# sourceMappingURL=utxo-selector.d.ts.map