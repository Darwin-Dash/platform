import axios from 'axios';
/**
 * Dash Core RPC client for testnet and mainnet
 *
 * Provides low-level access to Dash Core RPC methods via HTTP.
 * Supports both standard RPC calls and wallet-specific calls.
 */
export class DashRpcClient {
    config;
    axiosInstance;
    /** RPC methods that require wallet endpoint */
    static WALLET_METHODS = [
        'getnewaddress',
        'sendtoaddress',
        'getbalance',
        'listunspent',
        'signrawtransactionwithwallet',
        'loadwallet',
        'listwallets',
        'getwalletinfo',
        'dumpprivkey',
        'importprivkey',
        'sendmany',
        'sendfrom',
        'listtransactions',
    ];
    constructor(config) {
        // Validate network
        if (config.network !== 'testnet' && config.network !== 'mainnet') {
            throw new Error(`Invalid network: ${config.network}. Must be 'testnet' or 'mainnet'`);
        }
        // Set defaults
        this.config = {
            ...config,
            timeout: config.timeout || 10000,
            wallet: config.wallet || '',
        };
        // Create axios instance
        this.axiosInstance = axios.create({
            baseURL: this.config.url,
            timeout: this.config.timeout,
            auth: {
                username: this.config.user,
                password: this.config.pass,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Execute a generic RPC call
     *
     * @param method - RPC method name
     * @param params - Method parameters (default: [])
     * @returns RPC result
     */
    async call(method, params = []) {
        // Determine if this is a wallet method
        const isWalletMethod = DashRpcClient.WALLET_METHODS.includes(method);
        // Build endpoint path
        let endpoint = '/';
        if (isWalletMethod && this.config.wallet) {
            endpoint = `/wallet/${this.config.wallet}`;
        }
        // Build JSON-RPC request
        const requestId = Math.random().toString(36).substring(7);
        const requestBody = {
            jsonrpc: '2.0',
            id: requestId,
            method,
            params,
        };
        try {
            const response = await this.axiosInstance.post(endpoint, requestBody);
            // Check for RPC error
            if (response.data.error) {
                const error = response.data.error;
                throw new Error(`RPC Error ${error.code}: ${error.message}`);
            }
            return response.data.result;
        }
        catch (error) {
            // Re-throw RPC errors as-is
            if (error.message?.startsWith('RPC Error')) {
                throw error;
            }
            // Wrap axios errors
            if (error.response) {
                throw new Error(`RPC request failed (${error.response.status}): ${error.response.statusText}`);
            }
            else if (error.request) {
                throw new Error(`RPC request failed: No response from server (${this.config.url})`);
            }
            else {
                throw new Error(`RPC request failed: ${error.message}`);
            }
        }
    }
    /**
     * Execute a wallet-specific RPC call
     *
     * Convenience method that ensures the wallet endpoint is used.
     * Throws error if no wallet is configured.
     *
     * @param method - RPC method name
     * @param params - Method parameters (default: [])
     * @returns RPC result
     */
    async callWallet(method, params = []) {
        if (!this.config.wallet) {
            throw new Error('No wallet configured. Set wallet in constructor config.');
        }
        return this.call(method, params);
    }
    // ===== Blockchain Methods =====
    /**
     * Get current block count (blockchain height)
     */
    async getBlockCount() {
        return this.call('getblockcount');
    }
    /**
     * Get block hash by height
     */
    async getBlockHash(height) {
        return this.call('getblockhash', [height]);
    }
    /**
     * Get block info by hash
     */
    async getBlock(hash, verbose = true) {
        return this.call('getblock', [hash, verbose]);
    }
    /**
     * Get raw transaction
     */
    async getRawTransaction(txid, verbose = false) {
        return this.call('getrawtransaction', [txid, verbose]);
    }
    /**
     * Get network info
     */
    async getNetworkInfo() {
        return this.call('getnetworkinfo');
    }
    // ===== Wallet Methods =====
    /**
     * Get new address from wallet
     *
     * @param label - Address label (optional)
     * @param addressType - Address type: 'legacy' or 'p2sh-segwit' (default: 'legacy')
     */
    async getNewAddress(label = '', addressType = 'legacy') {
        return this.callWallet('getnewaddress', [label, addressType]);
    }
    /**
     * Get wallet balance
     */
    async getBalance() {
        return this.callWallet('getbalance');
    }
    /**
     * List unspent outputs
     *
     * @param minconf - Minimum confirmations (default: 0)
     * @param maxconf - Maximum confirmations (default: 9999999)
     * @param addresses - Filter by addresses (optional)
     */
    async listUnspent(minconf = 0, maxconf = 9999999, addresses) {
        return this.callWallet('listunspent', [minconf, maxconf, addresses]);
    }
    /**
     * Get wallet info
     */
    async getWalletInfo() {
        return this.callWallet('getwalletinfo');
    }
    /**
     * List loaded wallets
     */
    async listWallets() {
        return this.call('listwallets');
    }
    // ===== Transaction Methods =====
    /**
     * Create raw transaction
     *
     * @param inputs - Array of transaction inputs
     * @param outputs - Map of address to amount (in DASH)
     */
    async createRawTransaction(inputs, outputs) {
        return this.call('createrawtransaction', [inputs, outputs]);
    }
    /**
     * Sign raw transaction with wallet
     *
     * @param hexstring - Raw transaction hex
     */
    async signRawTransactionWithWallet(hexstring) {
        return this.callWallet('signrawtransactionwithwallet', [hexstring]);
    }
    /**
     * Send raw transaction
     *
     * @param hexstring - Signed transaction hex
     * @returns Transaction ID
     */
    async sendRawTransaction(hexstring) {
        return this.call('sendrawtransaction', [hexstring]);
    }
    /**
     * Send to address (simple send)
     *
     * @param address - Destination address
     * @param amount - Amount in DASH
     * @param comment - Transaction comment (optional)
     * @returns Transaction ID
     */
    async sendToAddress(address, amount, comment = '') {
        const params = comment ? [address, amount, comment] : [address, amount];
        return this.callWallet('sendtoaddress', params);
    }
    // ===== Utility Methods =====
    /**
     * Get RPC configuration (without credentials)
     */
    getConfig() {
        const { pass, ...safeConfig } = this.config;
        return safeConfig;
    }
    /**
     * Test RPC connection
     *
     * @returns true if connection successful
     */
    async testConnection() {
        try {
            await this.getBlockCount();
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=rpc-client.js.map