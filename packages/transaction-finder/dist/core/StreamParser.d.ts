/**
 * DAPI Stream Parsing Utilities
 *
 * Consolidated from dash-utxo-finder and instantsend-chainlock-monitor.
 *
 * Parses messages from DAPI Core's subscribeToTransactionsWithProofs stream.
 * Stream delivers three types of messages:
 * 1. Raw Transactions - New transactions matching bloom filter
 * 2. MerkleBlock - Proof of block inclusion
 * 3. InstantSend Lock Messages - LLMQ quorum signatures
 */
/**
 * Parsed transaction from DAPI stream
 */
export interface ParsedTransaction {
    txid: string;
    transaction: any;
    outputs: Array<{
        address: string | null;
        satoshis: number;
    }>;
    isCoinbase: boolean;
}
/**
 * Parsed MerkleBlock from DAPI stream
 */
export interface ParsedMerkleBlock {
    blockHeight: number;
    blockHash: string;
    txids: string[];
    timestamp: number;
}
/**
 * Parsed InstantLock from DAPI stream
 */
export interface ParsedInstantLock {
    txid: string;
    timestamp: number;
}
/**
 * Parse raw transactions from DAPI stream response
 * @param response - DAPI stream response
 * @param network - Network name for address parsing ('mainnet', 'testnet', 'regtest')
 * @returns Array of parsed transactions
 */
export declare function parseTransactions(response: any, network: string): ParsedTransaction[];
/**
 * Parse MerkleBlock from DAPI stream response
 *
 * IMPORTANT: Bitcoin/Dash MerkleBlock protocol doesn't include block height in the header.
 * Height must be provided from context (tracked from stream subscription start point).
 *
 * This matches the pattern used in test-chainlock-rpc-transactions.js which tracks
 * currentBlockHeight from stream initialization and uses it for all block inclusions.
 *
 * @param response - DAPI stream response
 * @param blockHeight - Block height to associate with this MerkleBlock (from stream context)
 * @returns Parsed merkle block or null if parsing failed
 */
export declare function parseMerkleBlock(response: any, blockHeight: number): ParsedMerkleBlock | null;
/**
 * Parse InstantSend lock messages from DAPI stream response
 * @param response - DAPI stream response
 * @returns Array of parsed InstantLocks
 */
export declare function parseInstantLocks(response: any): ParsedInstantLock[];
/**
 * Check if transaction involves a specific address
 * Useful for filtering transactions in realtime monitoring
 * @param parsedTx - Parsed transaction
 * @param address - Address to check
 * @returns true if transaction sends to or receives from address
 */
export declare function transactionInvolvesAddress(parsedTx: ParsedTransaction, address: string): boolean;
/**
 * Check if transaction involves any of the specified addresses
 * @param parsedTx - Parsed transaction
 * @param addresses - Array of addresses to check
 * @returns true if transaction involves any of the addresses
 */
export declare function transactionInvolvesAnyAddress(parsedTx: ParsedTransaction, addresses: string[]): boolean;
//# sourceMappingURL=StreamParser.d.ts.map