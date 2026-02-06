/**
 * Asset Lock Proof Helper
 *
 * Shared utility for creating asset lock proofs in worker processes.
 * Supports both InstantAssetLockProof and ChainAssetLockProof.
 */

/**
 * Create asset lock proof from transaction data
 *
 * @param {Object} transactionData - Transaction data with proof information
 * @param {string} transactionData.transactionId - Transaction ID (hex)
 * @param {string} transactionData.transactionHex - Full transaction hex
 * @param {string|null} transactionData.instantLockHex - InstantLock hex (if available)
 * @param {number|null} transactionData.coreChainLockedHeight - Core height (for chain proof)
 * @param {string} transactionData.proofType - 'instant' or 'chain'
 * @param {Object} wasmModule - WASM module with AssetLockProof class
 * @returns {Object} Asset lock proof object
 */
export function createAssetLockProof(transactionData, wasmModule) {
  const { AssetLockProof } = wasmModule;

  if (transactionData.proofType === 'instant' && transactionData.instantLockHex) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('[Worker] Creating InstantAssetLockProof');
    }

    // Convert hex strings to buffers
    const instantLockBuffer = Buffer.from(transactionData.instantLockHex, 'hex');
    const transactionBuffer = Buffer.from(transactionData.transactionHex, 'hex');

    // Create instant asset lock proof
    return AssetLockProof.createInstantAssetLockProof(
      instantLockBuffer,
      transactionBuffer,
      0 // outputIndex - always 0 for asset lock credit output
    );

  } else if (transactionData.proofType === 'chain') {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('[Worker] Creating ChainAssetLockProof');
    }

    // Create OutPoint with little-endian byte ordering
    // OutPoint = 32-byte txid (reversed) + 4-byte output index (little-endian)
    const txidBuffer = Buffer.from(transactionData.transactionId, 'hex').reverse();
    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(0, 0); // outputIndex = 0

    const outPoint = Buffer.concat([txidBuffer, indexBuffer]);

    // Create chain asset lock proof
    return AssetLockProof.createChainAssetLockProof(
      transactionData.coreChainLockedHeight,
      outPoint
    );

  } else {
    throw new Error(`Invalid proof type: ${transactionData.proofType}. Expected 'instant' or 'chain'.`);
  }
}
