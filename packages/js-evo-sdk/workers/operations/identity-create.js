/**
 * Identity Create Operation Handler
 *
 * Runs identity creation with asset lock proof in isolated WASM context.
 */

import { createAssetLockProof } from './proof-helper.js';

/**
 * Execute identity create operation
 *
 * @param {Object} params - Operation parameters
 * @param {Object} params.transactionData - Transaction and proof data
 * @param {string} params.assetLockPrivateKeyWif - Asset lock private key (WIF format)
 * @param {Array} params.publicKeys - Array of public keys for identity
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @returns {Promise<Object>} Create result with identityId and balance
 */
export async function identityCreateOperation(params, sdk, wasmModule) {
  const { transactionData, assetLockPrivateKeyWif, publicKeys } = params;

  console.log(`[Worker] Identity Create with ${publicKeys.length} public keys`);
  console.log(`[Worker] Proof type: ${transactionData.proofType}`);

  // Debug: Log key structure
  console.log('[Worker] Public keys structure:');
  publicKeys.forEach((key, i) => {
    console.log(`[Worker]   Key ${i}: id=${key.id}, type=${key.keyType}, purpose=${key.purpose}, hasPrivateKey=${!!key.privateKeyWif}`);
  });

  // Create asset lock proof in isolated WASM context
  const assetLockProof = createAssetLockProof(transactionData, wasmModule);
  console.log('[Worker] Asset lock proof created');
  console.log(`[Worker] Proof type: ${typeof assetLockProof}`);

  // Debug: Log what we're sending to identityCreate
  console.log('[Worker] Calling sdk.identities.create with:');
  console.log(`[Worker]   - assetLockProof: ${typeof assetLockProof}`);
  console.log(`[Worker]   - assetLockPrivateKeyWif: ${assetLockPrivateKeyWif.substring(0, 10)}...`);
  console.log(`[Worker]   - publicKeys count: ${publicKeys.length}`);

  // Call SDK identityCreate method
  try {
    const result = await sdk.identities.create({
      assetLockProof,
      assetLockPrivateKeyWif,
      publicKeys
    });

    console.log(`[Worker] Identity created: ${result.identityId || 'N/A'}`);
    console.log(`[Worker] Balance: ${result.balance || 'N/A'}`);

    return result;
  } catch (error) {
    console.error('[Worker] identityCreate failed with error:', error.message);
    console.error('[Worker] Error details:', error);
    throw error;
  }
}
