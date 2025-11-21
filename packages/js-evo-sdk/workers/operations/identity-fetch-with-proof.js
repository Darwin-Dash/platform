/**
 * Identity Fetch With Proof Operation Handler
 *
 * Fetches an identity by ID from Platform along with cryptographic proof.
 * Runs in isolated worker process to avoid WASM concurrency issues.
 */

/**
 * Execute identity fetch with proof operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @returns {Promise<Object>} Identity data with proof
 */
export async function identityFetchWithProofOperation(params, sdk, wasmModule) {
  const { identityId } = params;

  if (!identityId) {
    throw new Error('identityId is required for identity-fetch-with-proof operation');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Fetch With Proof: fetching identity ${identityId}`);
  }

  try {
    // Get WasmSdk instance from EvoSDK
    const wasmSdk = await sdk.getWasmSdkConnected();

    // Call wasm-sdk's getIdentityWithProofInfo method (correct method name)
    const result = await wasmSdk.getIdentityWithProofInfo(identityId);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Identity with proof fetched successfully: ${identityId}`);
    }

    // Return the result object containing identity and proof data
    return result;

  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('does not exist'))) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Identity not found: ${identityId}`);
      }
      throw new Error(`Failed to fetch identity: Identity not found`);
    }

    console.error(`[Worker] Error fetching identity with proof ${identityId}: ${error.message}`);
    throw new Error(`Failed to fetch identity: ${error.message}`);
  }
}
