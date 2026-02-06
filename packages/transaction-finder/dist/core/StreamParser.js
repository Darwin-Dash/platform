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
import dashcore from '@dashevo/dashcore-lib';
import { createLogger } from '../utils/logger.js';
const { Transaction, InstantLock, MerkleBlock } = dashcore;
const logger = createLogger('StreamParser');
/**
 * Parse raw transactions from DAPI stream response
 * @param response - DAPI stream response
 * @param network - Network name for address parsing ('mainnet', 'testnet', 'regtest')
 * @returns Array of parsed transactions
 */
export function parseTransactions(response, network) {
    const result = [];
    const rawTransactions = response.getRawTransactions?.();
    if (!rawTransactions) {
        return result;
    }
    const txList = rawTransactions.getTransactionsList?.();
    if (!txList) {
        return result;
    }
    for (const txBuffer of txList) {
        try {
            const tx = new Transaction(Buffer.from(txBuffer));
            // Skip coinbase transactions (they don't affect user UTXOs in the same way)
            if (tx.isCoinbase && tx.isCoinbase()) {
                logger.trace('Skipping coinbase transaction:', tx.id);
                continue;
            }
            // Parse outputs
            const outputs = [];
            if (tx.outputs && Array.isArray(tx.outputs)) {
                for (const output of tx.outputs) {
                    try {
                        const address = output && output.script && typeof output.script.toAddress === 'function'
                            ? output.script.toAddress(network).toString()
                            : null;
                        outputs.push({
                            address,
                            satoshis: output.satoshis || 0,
                        });
                    }
                    catch (e) {
                        // Not a standard address (e.g., OP_RETURN)
                        outputs.push({
                            address: null,
                            satoshis: output.satoshis || 0,
                        });
                    }
                }
            }
            result.push({
                txid: tx.id,
                transaction: tx,
                outputs,
                isCoinbase: tx.isCoinbase ? tx.isCoinbase() : false,
            });
        }
        catch (e) {
            // Failed to parse transaction - skip it
            logger.warn('Failed to parse transaction from stream:', e);
            continue;
        }
    }
    logger.trace(`Parsed ${result.length} transactions from stream`);
    return result;
}
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
export function parseMerkleBlock(response, blockHeight) {
    const rawMerkleBlock = response.getRawMerkleBlock?.();
    if (!rawMerkleBlock) {
        return null;
    }
    try {
        const merkleBlock = new MerkleBlock(Buffer.from(rawMerkleBlock));
        const blockHash = merkleBlock.header.hash;
        // Extract transaction IDs from merkle block
        const txids = [];
        if (merkleBlock.hashes) {
            for (const hash of merkleBlock.hashes) {
                const txid = Buffer.from(hash).reverse().toString('hex');
                txids.push(txid);
            }
        }
        logger.debug(`Parsed MerkleBlock at height ${blockHeight} with ${txids.length} transactions`);
        return {
            blockHeight,
            blockHash,
            txids,
            timestamp: Date.now(),
        };
    }
    catch (e) {
        // Failed to parse MerkleBlock
        logger.warn('Failed to parse MerkleBlock:', e);
        return null;
    }
}
/**
 * Parse InstantSend lock messages from DAPI stream response
 * @param response - DAPI stream response
 * @returns Array of parsed InstantLocks
 */
export function parseInstantLocks(response) {
    const result = [];
    const instantLockMessages = response.getInstantSendLockMessages?.();
    if (!instantLockMessages || !instantLockMessages.getMessagesList) {
        return result;
    }
    const lockList = instantLockMessages.getMessagesList();
    for (const lockBuffer of lockList) {
        try {
            const instantLock = InstantLock.fromBuffer(Buffer.from(lockBuffer));
            const txid = instantLock.txid.toString('hex');
            result.push({
                txid,
                timestamp: Date.now(),
            });
            logger.debug(`Parsed InstantLock for transaction: ${txid}`);
        }
        catch (e) {
            // Failed to parse InstantLock - skip it
            logger.warn('Failed to parse InstantLock:', e);
            continue;
        }
    }
    logger.trace(`Parsed ${result.length} InstantLocks from stream`);
    return result;
}
/**
 * Check if transaction involves a specific address
 * Useful for filtering transactions in realtime monitoring
 * @param parsedTx - Parsed transaction
 * @param address - Address to check
 * @returns true if transaction sends to or receives from address
 */
export function transactionInvolvesAddress(parsedTx, address) {
    return parsedTx.outputs.some((output) => output.address === address);
}
/**
 * Check if transaction involves any of the specified addresses
 * @param parsedTx - Parsed transaction
 * @param addresses - Array of addresses to check
 * @returns true if transaction involves any of the addresses
 */
export function transactionInvolvesAnyAddress(parsedTx, addresses) {
    const addressSet = new Set(addresses);
    return parsedTx.outputs.some((output) => output.address && addressSet.has(output.address));
}
//# sourceMappingURL=StreamParser.js.map