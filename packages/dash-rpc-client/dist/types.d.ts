/**
 * Network type - testnet or mainnet only
 */
export type Network = 'testnet' | 'mainnet';
/**
 * RPC client configuration
 */
export interface RpcClientConfig {
    /** Network name */
    network: Network;
    /** RPC endpoint URL (e.g., http://localhost:19998) */
    url: string;
    /** RPC username */
    user: string;
    /** RPC password */
    pass: string;
    /** Optional wallet name for wallet-specific RPC calls */
    wallet?: string;
    /** Connection timeout in milliseconds (default: 10000) */
    timeout?: number;
}
/**
 * UTXO (Unspent Transaction Output)
 */
export interface UTXO {
    /** Transaction ID */
    txid: string;
    /** Output index */
    vout: number;
    /** Address receiving the output */
    address: string;
    /** Script public key */
    scriptPubKey: string;
    /** Amount in DASH */
    amount: number;
    /** Number of confirmations */
    confirmations: number;
    /** Whether output is spendable */
    spendable: boolean;
    /** Whether output can be used with sendrawtransaction */
    solvable: boolean;
    /** Whether output is safe to spend (not in mempool conflict) */
    safe?: boolean;
}
/**
 * Transaction input
 */
export interface TransactionInput {
    /** Transaction ID */
    txid: string;
    /** Output index */
    vout: number;
    /** Sequence number (optional) */
    sequence?: number;
}
/**
 * Transaction output map (address -> amount in DASH)
 */
export type TransactionOutputs = Record<string, number>;
/**
 * Signed transaction result
 */
export interface SignedTransaction {
    /** Signed transaction hex */
    hex: string;
    /** Whether transaction is complete */
    complete: boolean;
    /** Errors if any */
    errors?: Array<{
        txid: string;
        vout: number;
        scriptSig: string;
        sequence: number;
        error: string;
    }>;
}
/**
 * Transaction broadcast result
 */
export interface BroadcastResult {
    /** Transaction ID */
    txid: string;
    /** Receiving address */
    address: string;
    /** Amount sent in DASH */
    amount: number;
    /** Raw transaction hex (optional) */
    hex?: string;
}
/**
 * RPC error response
 */
export interface RpcError {
    code: number;
    message: string;
}
/**
 * Generic RPC response
 */
export interface RpcResponse<T = any> {
    result: T;
    error: RpcError | null;
    id: string | number;
}
/**
 * Block info
 */
export interface BlockInfo {
    hash: string;
    confirmations: number;
    height: number;
    time: number;
    mediantime: number;
    tx: string[];
    chainlock: boolean;
}
/**
 * Network info
 */
export interface NetworkInfo {
    version: number;
    subversion: string;
    protocolversion: number;
    connections: number;
    networks: Array<{
        name: string;
        limited: boolean;
        reachable: boolean;
    }>;
}
/**
 * Wallet info
 */
export interface WalletInfo {
    walletname: string;
    walletversion: number;
    balance: number;
    unconfirmed_balance: number;
    immature_balance: number;
    txcount: number;
    keypoolsize: number;
}
//# sourceMappingURL=types.d.ts.map