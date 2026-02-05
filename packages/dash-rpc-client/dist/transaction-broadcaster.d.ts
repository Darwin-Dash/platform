import { DashRpcClient } from './rpc-client.js';
import type { BroadcastResult, UTXO, TransactionInput, TransactionOutputs } from './types.js';
/**
 * Transaction broadcaster with UTXO management
 *
 * Provides higher-level transaction creation and broadcasting
 * capabilities on top of DashRpcClient.
 */
export declare class TransactionBroadcaster {
    private client;
    constructor(client: DashRpcClient);
    /**
     * Send consolidation transaction using exact pattern from test-instantsend-chainlock-monitor-with-rpc-transactions.js
     *
     * UTXO Consolidation Pattern:
     * - Gets all UTXOs for the address
     * - Creates single output back to same address (all funds - fixed fee)
     * - Fixed fee: 0.00001 DASH (1,000 duffs)
     * - No change outputs
     * - Triggers InstantSend lock
     *
     * This matches the exact RPC pattern that successfully triggers InstantSend in js-evo-sdk tests.
     *
     * @param address - Address to consolidate (sends all funds back to itself)
     * @returns Transaction result with txid and amount sent
     */
    sendToAddress(address: string): Promise<BroadcastResult>;
    /**
     * List unspent outputs (UTXOs)
     *
     * @param minconf - Minimum confirmations (default: 0)
     * @param maxconf - Maximum confirmations (default: 9999999)
     * @param addresses - Filter by addresses (optional)
     * @returns Array of UTXOs
     */
    listUnspent(minconf?: number, maxconf?: number, addresses?: string[]): Promise<UTXO[]>;
    /**
     * Create raw transaction from inputs and outputs
     *
     * @param inputs - Transaction inputs
     * @param outputs - Transaction outputs (address -> amount in DASH)
     * @returns Raw transaction hex
     */
    createRawTransaction(inputs: TransactionInput[], outputs: TransactionOutputs): Promise<string>;
    /**
     * Sign raw transaction with wallet
     *
     * @param rawTx - Raw transaction hex
     * @returns Signed transaction hex
     */
    signTransaction(rawTx: string): Promise<string>;
    /**
     * Broadcast signed transaction
     *
     * @param signedTx - Signed transaction hex
     * @returns Transaction ID
     */
    broadcast(signedTx: string): Promise<string>;
    /**
     * Create and broadcast transaction from UTXOs
     *
     * Consolidates all provided UTXOs into a single output to the specified address.
     * Useful for testing payment monitoring.
     *
     * @param utxos - UTXOs to spend
     * @param toAddress - Destination address
     * @param feePerKb - Fee rate in DASH per kilobyte (default: 0.00001)
     * @returns Broadcast result
     */
    consolidateUTXOs(utxos: UTXO[], toAddress: string, feePerKb?: number): Promise<BroadcastResult>;
    /**
     * Get wallet balance
     */
    getBalance(): Promise<number>;
    /**
     * Get new receiving address from wallet
     */
    getNewAddress(label?: string): Promise<string>;
}
//# sourceMappingURL=transaction-broadcaster.d.ts.map