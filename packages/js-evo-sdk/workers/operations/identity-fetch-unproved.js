/**
 * Identity Fetch Unproved Operation Handler
 *
 * Fetches an identity by ID from Platform without cryptographic proof (faster).
 * Runs in isolated worker process to avoid WASM concurrency issues.
 */

/**
 * Execute identity fetch unproved operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @returns {Promise<Object>} Identity data without proof
 */
export async function identityFetchUnprovedOperation(params, sdk, wasmModule) {
  const { identityId } = params;

  if (!identityId) {
    throw new Error('identityId is required for identity-fetch-unproved operation');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Fetch Unproved: fetching identity ${identityId}`);
  }

  try {
    // Get WasmSdk instance from EvoSDK
    const wasmSdk = await sdk.getWasmSdkConnected();

    // Call wasm-sdk's getIdentityUnproved method
    // This is faster than getIdentity as it doesn't fetch/verify proof
    const identity = await wasmSdk.getIdentityUnproved(identityId);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Identity (unproved) fetched successfully: ${identityId}`);
    }

    // Return the identity object
    return identity;

  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('does not exist'))) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Identity not found: ${identityId}`);
      }
      throw new Error(`Failed to fetch identity: Identity not found`);
    }

    console.error(`[Worker] Error fetching identity (unproved) ${identityId}: ${error.message}`);
    throw new Error(`Failed to fetch identity: ${error.message}`);
  }
}
