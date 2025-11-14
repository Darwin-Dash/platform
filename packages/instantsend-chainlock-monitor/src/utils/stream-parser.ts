/**
 * DAPI Stream Parsing Utilities
 *
 * Parses messages from DAPI Core's subscribeToTransactionsWithProofs stream.
 * Stream delivers three types of messages:
 * 1. Raw Transactions - New transactions matching bloom filter
 * 2. MerkleBlock - Proof of block inclusion
 * 3. InstantSend Lock Messages - LLMQ quorum signatures
 */

import dashcore from '@dashevo/dashcore-lib';

const { Transaction, InstantLock, MerkleBlock } = dashcore;

/**
 * Parsed transaction from DAPI stream
 */
export interface ParsedTransaction {
  txid: string;
  transaction: any; // dashcore Transaction object
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
 * @param response DAPI stream response
 * @param network Network name for address parsing
 * @returns Array of parsed transactions
 */
export function parseTransactions(response: any, network: string): ParsedTransaction[] {
  const result: ParsedTransaction[] = [];
  const rawTransactions = response.getRawTransactions();

  if (!rawTransactions) {
    return result;
  }

  const txList = rawTransactions.getTransactionsList();

  for (const txBuffer of txList) {
    try {
      const tx = new Transaction(Buffer.from(txBuffer));

      // Skip coinbase transactions
      if (tx.isCoinbase && tx.isCoinbase()) {
        continue;
      }

      // Parse outputs
      const outputs: Array<{ address: string | null; satoshis: number }> = [];
      if (tx.outputs && Array.isArray(tx.outputs)) {
        for (const output of tx.outputs) {
          try {
            const address =
              output && output.script && typeof output.script.toAddress === 'function'
                ? output.script.toAddress(network).toString()
                : null;

            outputs.push({
              address,
              satoshis: output.satoshis || 0,
            });
          } catch (e) {
            // Not a standard address
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
    } catch (e) {
      // Failed to parse transaction - skip it
      continue;
    }
  }

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
 * @param response DAPI stream response
 * @param blockHeight Block height to associate with this MerkleBlock (from stream context)
 * @returns Parsed merkle block or null
 */
export function parseMerkleBlock(response: any, blockHeight: number): ParsedMerkleBlock | null {
  const rawMerkleBlock = response.getRawMerkleBlock();

  if (!rawMerkleBlock) {
    return null;
  }

  try {
    const merkleBlock = new MerkleBlock(Buffer.from(rawMerkleBlock));
    const blockHash = (merkleBlock.header as any).hash;

    // Extract transaction IDs from merkle block
    const txids: string[] = [];
    if (merkleBlock.hashes) {
      for (const hash of merkleBlock.hashes) {
        const txid = Buffer.from(hash).reverse().toString('hex');
        txids.push(txid);
      }
    }

    return {
      blockHeight,
      blockHash,
      txids,
      timestamp: Date.now(),
    };
  } catch (e) {
    // Failed to parse MerkleBlock
    return null;
  }
}

/**
 * Parse InstantSend lock messages from DAPI stream response
 * @param response DAPI stream response
 * @returns Array of parsed InstantLocks
 */
export function parseInstantLocks(response: any): ParsedInstantLock[] {
  const result: ParsedInstantLock[] = [];
  const instantLockMessages = response.getInstantSendLockMessages();

  if (!instantLockMessages || !instantLockMessages.getMessagesList) {
    return result;
  }

  const lockList = instantLockMessages.getMessagesList();

  for (const lockBuffer of lockList) {
    try {
      const instantLock = (InstantLock as any).fromBuffer(Buffer.from(lockBuffer));
      const txid = instantLock.txid.toString('hex');

      result.push({
        txid,
        timestamp: Date.now(),
      });
    } catch (e) {
      // Failed to parse InstantLock - skip it
      continue;
    }
  }

  return result;
}

/**
 * Check if transaction involves a specific address
 * @param parsedTx Parsed transaction
 * @param address Address to check
 * @returns true if transaction sends to or receives from address
 */
export function transactionInvolvesAddress(parsedTx: ParsedTransaction, address: string): boolean {
  return parsedTx.outputs.some((output) => output.address === address);
}
