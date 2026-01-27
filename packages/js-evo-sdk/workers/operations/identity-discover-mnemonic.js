/**
 * Identity Discovery from Mnemonic Operation Handler
 *
 * Discovers all identities associated with a mnemonic using DIP13 HD derivation.
 * Creates its own DAPI client and WASM context to avoid lock conflicts.
 *
 * CRITICAL: Uses JavaScript DAPI client directly to avoid WASM RwLock issues.
 */

import DAPIClient from '@dashevo/dapi-client';

/**
 * Execute mnemonic-based identity discovery operation
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.mnemonic - 12-word BIP39 mnemonic
 * @param {number} [params.gapLimit=20] - Gap limit for discovery (consecutive not-found before stopping)
 * @param {number} [params.batchSize=10] - Batch size for discovery
 * @param {Object} sdk - EvoSDK instance (used for network config only)
 * @param {Object} wasmModule - WASM module (not used - we bypass WASM)
 * @param {string} network - Network name
 * @returns {Promise<Object>} Discovery result with found identities
 */
export async function identityDiscoverMnemonicOperation(params, sdk, wasmModule, network = 'testnet') {
  const { mnemonic, gapLimit = 20, batchSize = 10 } = params;

  if (!mnemonic) {
    throw new Error('Missing required parameter: mnemonic');
  }

  // Validate mnemonic word count
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Discovery from Mnemonic`);
    console.log(`[Worker] Network: ${network}, Gap Limit: ${gapLimit}`);
    console.log(`[Worker] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Import required modules
  const wasmSdk = await import('@dashevo/wasm-sdk');
  const initWasm = wasmSdk.default;
  // Note: Identity class (not IdentityWasm) with fromBytes (not fromBuffer)
  const { Identity, WasmSdk } = wasmSdk;
  const dashcoreLib = (await import('@dashevo/dashcore-lib')).default;

  // Initialize WASM for key derivation and Identity.fromBytes() decoding
  await initWasm();

  // Create JavaScript DAPI client (no WASM involved for network calls)
  const dapiClient = new DAPIClient({
    network,
    timeout: 60000,
    retries: 3,
    baseBanTime: 60000,
  });

  // DIP13: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
  // coin_type: 1 for testnet, 5 for mainnet
  const coinType = network === 'mainnet' ? 5 : 1;

  const foundIdentities = [];
  let consecutiveNotFound = 0;
  let currentIndex = 0;

  // Iterative discovery with gap limit
  while (consecutiveNotFound < gapLimit) {
    for (let i = 0; i < batchSize && consecutiveNotFound < gapLimit; i++) {
      const index = currentIndex++;

      try {
        // Build DIP13 identity key derivation path for key 0 (MASTER)
        const path = `m/9'/${coinType}'/5'/0'/0'/${index}'/0'`;

        // Use WASM SDK directly to derive key
        const childKey = await WasmSdk.deriveKeyFromSeedWithPath({
          mnemonic,
          passphrase: null,
          path,
          network
        });

        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Derived key for index ${index}: publicKey=${childKey.publicKey?.slice(0, 32)}...`);
        }

        // Get public key and compute hash
        // Note: WASM binding uses camelCase (publicKey), not snake_case (public_key)
        const publicKeyHex = childKey.publicKey;

        // Use dashcore-lib to compute public key hash (RIPEMD160(SHA256(pubkey)))
        const PublicKey = dashcoreLib.PublicKey;
        const pubKey = new PublicKey(publicKeyHex);
        const publicKeyHashHex = pubKey.toAddress(network).hashBuffer.toString('hex');

        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Checking index ${index}, pubKeyHash: ${publicKeyHashHex.slice(0, 16)}...`);
        }

        // Query Platform directly via DAPI
        try {
          const hashBuffer = Buffer.from(publicKeyHashHex, 'hex');
          const response = await dapiClient.platform.getIdentityByPublicKeyHash(hashBuffer, { prove: false });

          if (response.identity && response.identity.length > 0) {
            // Decode identity buffer using Identity.fromBytes()
            const identity = Identity.fromBytes(response.identity);
            const identityJson = identity.toJSON();
            const identityId = identityJson.id;

            foundIdentities.push({
              index,
              identityId,
              publicKeyHash: publicKeyHashHex,
              balance: identityJson.balance,
              revision: identityJson.revision,
            });
            consecutiveNotFound = 0;

            if (process.env.LOG_LEVEL === 'debug') {
              console.log(`[Worker] Found identity at index ${index}: ${identityId} (balance: ${identityJson.balance})`);
            }
          } else {
            consecutiveNotFound++;
          }
        } catch (error) {
          // Not found is expected for most indices
          if (error.message && error.message.includes('not found')) {
            consecutiveNotFound++;
          } else {
            if (process.env.LOG_LEVEL === 'debug') {
              console.log(`[Worker] Discovery error for index ${index}: ${error.message}`);
            }
            consecutiveNotFound++;
          }
        }
      } catch (error) {
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Key derivation error for index ${index}: ${error.message}`);
        }
        consecutiveNotFound++;
      }

      // Check gap limit
      if (consecutiveNotFound >= gapLimit) {
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Gap limit (${gapLimit}) reached at index ${index}`);
        }
        break;
      }
    }
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Discovery complete: ${foundIdentities.length} identities found`);
  }

  return {
    identities: foundIdentities,
    count: foundIdentities.length,
    indicesChecked: currentIndex,
  };
}
