/**
 * Identity Top-Up Operation Handler
 *
 * Runs identity top-up with asset lock proof in isolated WASM context.
 */

import { createAssetLockProof } from './proof-helper.js';

/**
 * Execute identity top-up operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to top up
 * @param {Object} params.transactionData - Transaction and proof data
 * @param {string} params.assetLockPrivateKeyWif - Asset lock private key (WIF format)
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @returns {Promise<Object>} Top-up result with new balance
 */
export async function identityTopUpOperation(params, sdk, wasmModule) {
  const { identityId, transactionData, assetLockPrivateKeyWif } = params;

  const operationStart = Date.now();
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Top-Up: ${identityId}`);
    console.log(`[Worker] Proof type: ${transactionData.proofType}`);
  }

  // Create asset lock proof in isolated WASM context
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] Creating asset lock proof...');
  }
  const proofStart = Date.now();
  const assetLockProof = createAssetLockProof(transactionData, wasmModule);
  const proofTime = ((Date.now() - proofStart) / 1000).toFixed(1);
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Asset lock proof created (${proofTime}s)`);
  }

  // Call SDK identityTopUp method with user-friendly status messages
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] 📡 Submitting to Platform (this may take 60-90 seconds)...');
    console.log('[Worker] 💡 Tip: Use LOG_LEVEL=debug for detailed operations');
  }

  const platformStart = Date.now();
  const result = await sdk.identities.topUp({
    identityId,
    assetLockProof,
    assetLockPrivateKeyWif
  });

  const platformTime = ((Date.now() - platformStart) / 1000).toFixed(1);
  const totalTime = ((Date.now() - operationStart) / 1000).toFixed(1);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] ✅ Complete (${totalTime}s) - Balance: ${result.newBalance || 'N/A'}`);
    console.log(`[Worker] Platform submission: ${platformTime}s`);
    console.log(`[Worker] Proof creation: ${proofTime}s`);
  }

  return result;
}
