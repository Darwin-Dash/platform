/**
 * Identity Get Keys Operation Handler
 *
 * Fetches keys for an identity from Platform.
 * Runs in isolated worker process to avoid WASM concurrency issues.
 */

/**
 * Execute identity get keys operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID
 * @param {string} params.keyRequestType - Type: 'all', 'specific'
 * @param {Array<number>} params.specificKeyIds - Key IDs if type is 'specific'
 * @param {number} params.limit - Maximum number of keys to return
 * @param {number} params.offset - Offset for pagination
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @returns {Promise<Object>} Keys data with array and pagination info
 */
export async function identityGetKeysOperation(params, sdk, wasmModule) {
  const { identityId, keyRequestType, specificKeyIds, limit, offset } = params;

  if (!identityId) {
    throw new Error('identityId is required for identity-get-keys operation');
  }

  if (!keyRequestType || (keyRequestType !== 'all' && keyRequestType !== 'specific')) {
    throw new Error('keyRequestType must be "all" or "specific"');
  }

  if (keyRequestType === 'specific' && (!specificKeyIds || specificKeyIds.length === 0)) {
    throw new Error('specificKeyIds is required when keyRequestType is "specific"');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Get Keys: fetching keys for ${identityId} (type: ${keyRequestType})`);
  }

  try {
    // Get WasmSdk instance from EvoSDK
    const wasmSdk = await sdk.getWasmSdkConnected();

    // Transform parameters to match WASM SDK expectations
    const keyIds = specificKeyIds && keyRequestType === 'specific'
      ? new Uint32Array(specificKeyIds)
      : null;

    // Call WASM SDK method with positional arguments
    // getIdentityKeys(identityId, keyRequestType, keyIds, purposeMap, limit, offset)
    const result = await wasmSdk.getIdentityKeys(
      identityId,
      keyRequestType,
      keyIds,
      null, // purposeMap (only used for 'search' type)
      limit || 100,
      offset || 0
    );

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Keys fetched for ${identityId}: ${result?.length || 0} keys`);
    }

    // Return the result array of keys
    return result;

  } catch (error) {
    if (error.message && (error.message.includes('not found') || error.message.includes('does not exist'))) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Identity not found: ${identityId}`);
      }
      throw new Error(`Failed to get keys: Identity not found`);
    }

    console.error(`[Worker] Error getting keys for ${identityId}: ${error.message}`);
    throw new Error(`Failed to get keys: ${error.message}`);
  }
}
