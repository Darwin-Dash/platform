/**
 * Transaction broadcaster with UTXO management
 *
 * Provides higher-level transaction creation and broadcasting
 * capabilities on top of DashRpcClient.
 */
export class TransactionBroadcaster {
    client;
    constructor(client) {
        this.client = client;
    }
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
    async sendToAddress(address) {
        // Get all UTXOs for this address
        const utxos = await this.client.listUnspent(0, 9999999, [address]);
        if (!utxos || utxos.length === 0) {
            throw new Error(`No UTXOs available for address ${address}`);
        }
        // Build inputs from all UTXOs
        const inputs = utxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
        }));
        // Calculate total input value
        const totalInput = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
        // Fixed fee: 1,000 duffs (0.00001 DASH) - matches test pattern exactly
        const fee = 0.00001;
        // Calculate output (total - fee, consolidation pattern)
        const outputAmount = totalInput - fee;
        if (outputAmount <= 0) {
            throw new Error(`Insufficient balance: ${totalInput} DASH (need > ${fee} DASH for fee)`);
        }
        // Round to exact 8 decimals - CRITICAL for RPC compatibility
        const roundedAmount = Math.floor(outputAmount * 100000000) / 100000000;
        // Single output to same address (consolidation)
        const outputs = {
            [address]: roundedAmount,
        };
        // Create, sign, broadcast using exact RPC sequence from test
        const rawTx = await this.createRawTransaction(inputs, outputs);
        const signedTx = await this.signTransaction(rawTx);
        const txid = await this.broadcast(signedTx);
        return {
            txid,
            address,
            amount: roundedAmount,
            hex: signedTx,
        };
    }
    /**
     * List unspent outputs (UTXOs)
     *
     * @param minconf - Minimum confirmations (default: 0)
     * @param maxconf - Maximum confirmations (default: 9999999)
     * @param addresses - Filter by addresses (optional)
     * @returns Array of UTXOs
     */
    async listUnspent(minconf = 0, maxconf = 9999999, addresses) {
        return this.client.listUnspent(minconf, maxconf, addresses);
    }
    /**
     * Create raw transaction from inputs and outputs
     *
     * @param inputs - Transaction inputs
     * @param outputs - Transaction outputs (address -> amount in DASH)
     * @returns Raw transaction hex
     */
    async createRawTransaction(inputs, outputs) {
        // Convert inputs to RPC format
        const rpcInputs = inputs.map((input) => ({
            txid: input.txid,
            vout: input.vout,
        }));
        return this.client.createRawTransaction(rpcInputs, outputs);
    }
    /**
     * Sign raw transaction with wallet
     *
     * @param rawTx - Raw transaction hex
     * @returns Signed transaction hex
     */
    async signTransaction(rawTx) {
        const result = await this.client.signRawTransactionWithWallet(rawTx);
        if (!result.complete) {
            throw new Error('Transaction signing failed - incomplete signature');
        }
        return result.hex;
    }
    /**
     * Broadcast signed transaction
     *
     * @param signedTx - Signed transaction hex
     * @returns Transaction ID
     */
    async broadcast(signedTx) {
        return this.client.sendRawTransaction(signedTx);
    }
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
    async consolidateUTXOs(utxos, toAddress, feePerKb = 0.00001) {
        if (utxos.length === 0) {
            throw new Error('No UTXOs provided');
        }
        // Calculate total input
        const totalInput = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
        // Prepare inputs
        const inputs = utxos.map((utxo) => ({
            txid: utxo.txid,
            vout: utxo.vout,
        }));
        // Estimate transaction size (rough estimate)
        // Base: 10 bytes
        // Each input: 148 bytes (compressed pubkey)
        // Each output: 34 bytes
        const estimatedSize = 10 + inputs.length * 148 + 34;
        const estimatedSizeKb = estimatedSize / 1000;
        const fee = estimatedSizeKb * feePerKb;
        // Calculate output amount
        const outputAmount = totalInput - fee;
        if (outputAmount <= 0) {
            throw new Error(`Insufficient funds: total input ${totalInput} DASH, fee ${fee} DASH`);
        }
        // Round to 8 decimal places (satoshi precision)
        const roundedAmount = Math.floor(outputAmount * 100000000) / 100000000;
        // Create outputs
        const outputs = {
            [toAddress]: roundedAmount,
        };
        // Create, sign, and broadcast
        const rawTx = await this.createRawTransaction(inputs, outputs);
        const signedTx = await this.signTransaction(rawTx);
        const txid = await this.broadcast(signedTx);
        return {
            txid,
            address: toAddress,
            amount: roundedAmount,
            hex: signedTx,
        };
    }
    /**
     * Get wallet balance
     */
    async getBalance() {
        return this.client.getBalance();
    }
    /**
     * Get new receiving address from wallet
     */
    async getNewAddress(label = '') {
        return this.client.getNewAddress(label);
    }
}
//# sourceMappingURL=transaction-broadcaster.js.map