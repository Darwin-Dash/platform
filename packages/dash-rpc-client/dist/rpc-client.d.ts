import type { RpcClientConfig, UTXO, BlockInfo, NetworkInfo, WalletInfo } from './types.js';
/**
 * Dash Core RPC client for testnet and mainnet
 *
 * Provides low-level access to Dash Core RPC methods via HTTP.
 * Supports both standard RPC calls and wallet-specific calls.
 */
export declare class DashRpcClient {
    private config;
    private axiosInstance;
    /** RPC methods that require wallet endpoint */
    private static readonly WALLET_METHODS;
    constructor(config: RpcClientConfig);
    /**
     * Execute a generic RPC call
     *
     * @param method - RPC method name
     * @param params - Method parameters (default: [])
     * @returns RPC result
     */
    call<T = any>(method: string, params?: any[]): Promise<T>;
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
    callWallet<T = any>(method: string, params?: any[]): Promise<T>;
    /**
     * Get current block count (blockchain height)
     */
    getBlockCount(): Promise<number>;
    /**
     * Get block hash by height
     */
    getBlockHash(height: number): Promise<string>;
    /**
     * Get block info by hash
     */
    getBlock(hash: string, verbose?: boolean): Promise<BlockInfo>;
    /**
     * Get raw transaction
     */
    getRawTransaction(txid: string, verbose?: boolean): Promise<any>;
    /**
     * Get network info
     */
    getNetworkInfo(): Promise<NetworkInfo>;
    /**
     * Get new address from wallet
     *
     * @param label - Address label (optional)
     * @param addressType - Address type: 'legacy' or 'p2sh-segwit' (default: 'legacy')
     */
    getNewAddress(label?: string, addressType?: string): Promise<string>;
    /**
     * Get wallet balance
     */
    getBalance(): Promise<number>;
    /**
     * List unspent outputs
     *
     * @param minconf - Minimum confirmations (default: 0)
     * @param maxconf - Maximum confirmations (default: 9999999)
     * @param addresses - Filter by addresses (optional)
     */
    listUnspent(minconf?: number, maxconf?: number, addresses?: string[]): Promise<UTXO[]>;
    /**
     * Get wallet info
     */
    getWalletInfo(): Promise<WalletInfo>;
    /**
     * List loaded wallets
     */
    listWallets(): Promise<string[]>;
    /**
     * Create raw transaction
     *
     * @param inputs - Array of transaction inputs
     * @param outputs - Map of address to amount (in DASH)
     */
    createRawTransaction(inputs: Array<{
        txid: string;
        vout: number;
    }>, outputs: Record<string, number>): Promise<string>;
    /**
     * Sign raw transaction with wallet
     *
     * @param hexstring - Raw transaction hex
     */
    signRawTransactionWithWallet(hexstring: string): Promise<{
        hex: string;
        complete: boolean;
    }>;
    /**
     * Send raw transaction
     *
     * @param hexstring - Signed transaction hex
     * @returns Transaction ID
     */
    sendRawTransaction(hexstring: string): Promise<string>;
    /**
     * Send to address (simple send)
     *
     * @param address - Destination address
     * @param amount - Amount in DASH
     * @param comment - Transaction comment (optional)
     * @returns Transaction ID
     */
    sendToAddress(address: string, amount: number, comment?: string): Promise<string>;
    /**
     * Get RPC configuration (without credentials)
     */
    getConfig(): Omit<RpcClientConfig, 'pass'>;
    /**
     * Test RPC connection
     *
     * @returns true if connection successful
     */
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=rpc-client.d.ts.map