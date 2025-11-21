/**
 * Identity Discovery Operation Handler
 *
 * Discovers identities by public key hash for wallet-lib integration.
 * Replaces wasm-dpp usage with wasm-sdk in isolated worker context.
 */

/**
 * Execute identity discovery operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.publicKeyHashHex - Public key hash in hex format (40 chars)
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module (not used but part of standard interface)
 * @returns {Promise<Object>} Discovery result with found flag and optional identity data
 */
export async function identityDiscoverOperation(params, sdk, wasmModule) {
  const { publicKeyHashHex } = params;

  if (!publicKeyHashHex || publicKeyHashHex.length !== 40) {
    throw new Error(`Invalid public key hash: expected 40 hex characters, got ${publicKeyHashHex?.length || 0}`);
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Discovery: checking public key hash ${publicKeyHashHex}`);
  }

  try {
    // Get WasmSdk instance from EvoSDK
    const wasmSdk = await sdk.getWasmSdkConnected();

    // Call wasm-sdk's getIdentityByPublicKeyHash method
    // This returns an IdentityWasm object if found
    const identity = await wasmSdk.getIdentityByPublicKeyHash(publicKeyHashHex);

    // Convert to JSON to extract identity data
    const identityJson = await identity.toJSON();

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Identity found: ${identityJson.id}`);
    }

    return {
      found: true,
      identityId: identityJson.id,
      balance: identityJson.balance,
      revision: identityJson.revision
    };

  } catch (error) {
    // Check if this is a "not found" error
    // wasm-sdk returns WasmSdkError::not_found with message "Identity not found for public key hash"
    if (error.message && error.message.includes('not found')) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] No identity found for public key hash ${publicKeyHashHex}`);
      }
      return {
        found: false
      };
    }

    // Re-throw unexpected errors
    console.error(`[Worker] Unexpected error during identity discovery: ${error.message}`);
    throw error;
  }
}