/**
 * Identity Fetch Operation Handler
 *
 * Fetches an identity by ID from Platform.
 * Runs in isolated worker process to avoid WASM concurrency issues.
 */

/**
 * Execute identity fetch operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @returns {Promise<Object>} Identity data
 */
export async function identityFetchOperation(params, sdk, wasmModule) {
  const { identityId } = params;

  if (!identityId) {
    throw new Error('identityId is required for identity-fetch operation');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Fetch: fetching identity ${identityId}`);
  }

  try {
    // Get WasmSdk instance from EvoSDK
    const wasmSdk = await sdk.getWasmSdkConnected();

    // Call wasm-sdk's getIdentity method
    const identity = await wasmSdk.getIdentity(identityId);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Identity fetched successfully: ${identityId}`);
    }

    // Return the identity object - caller will convert to JSON as needed
    // Identity objects have methods like getId(), getBalance(), etc.
    return identity;

  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('does not exist'))) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Identity not found: ${identityId}`);
      }
      throw new Error(`Failed to fetch identity: Identity not found`);
    }

    console.error(`[Worker] Error fetching identity ${identityId}: ${error.message}`);
    throw new Error(`Failed to fetch identity: ${error.message}`);
  }
}
