/**
 * Identity Create Operation Handler
 *
 * Runs identity creation with asset lock proof in isolated WASM context.
 * Uses identityCreatePrepare (sync) + JavaScript DAPI broadcast to avoid RwLock conflicts.
 *
 * The WASM SDK RwLock issues occur during any async network operations:
 * - sdk.identities.create() fetches + broadcasts + waits = RwLock conflicts
 * - identityCreatePrepare() is SYNC and creates state transition locally = NO RwLock
 *
 * Solution: Use identityCreatePrepare() to create the state transition, then
 * broadcast via JavaScript DAPI client which doesn't use WASM at all.
 */

import { createAssetLockProof } from './proof-helper.js';
import DAPIClient from '@dashevo/dapi-client';

/**
 * Execute identity create operation
 *
 * @param {Object} params - Operation parameters
 * @param {Object} params.transactionData - Transaction and proof data
 * @param {string} params.assetLockPrivateKeyWif - Asset lock private key (WIF format)
 * @param {Array} params.publicKeys - Array of public keys for identity
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @param {string} network - Network name (testnet/mainnet)
 * @returns {Promise<Object>} Create result with identityId and balance
 */
export async function identityCreateOperation(params, sdk, wasmModule, network = 'testnet') {
  // Debug: Log incoming params
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] identityCreateOperation received params:`, Object.keys(params || {}));
  }

  const { transactionData, assetLockPrivateKeyWif, publicKeys } = params;

  // Validate required params
  if (!publicKeys || !Array.isArray(publicKeys)) {
    throw new Error(`publicKeys is required and must be an array, got: ${typeof publicKeys}`);
  }

  const operationStart = Date.now();
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Create with ${publicKeys.length} public keys`);
    console.log(`[Worker] Proof type: ${transactionData?.proofType || 'unknown'}`);
    console.log(`[Worker] Network: ${network}`);
  }

  // Debug: Log key structure
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] Public keys structure:');
    publicKeys.forEach((key, i) => {
      console.log(`[Worker]   Key ${i}: id=${key.id}, type=${key.keyType}, purpose=${key.purpose}, hasPrivateKey=${!!key.privateKeyWif}`);
    });
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
    console.log(`[Worker] Proof type: ${typeof assetLockProof}`);
  }

  // Get the WASM SDK instance directly
  // We use identityCreatePrepare (SYNC) to create and sign the state transition
  // This avoids ALL RwLock conflicts because it doesn't do any network operations
  const wasmSdk = sdk.wasm;
  const proofJson = JSON.stringify(assetLockProof);
  const publicKeysJson = JSON.stringify(publicKeys);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] 📝 Preparing state transition (using identityCreatePrepare - SYNC, no RwLock)...');
    console.log(`[Worker]   - assetLockProof JSON length: ${proofJson.length}`);
    console.log(`[Worker]   - assetLockPrivateKeyWif: ${assetLockPrivateKeyWif.substring(0, 10)}...`);
    console.log(`[Worker]   - publicKeys count: ${publicKeys.length}`);

    // Log asset lock proof structure for debugging
    console.log('[Worker] 📋 Asset Lock Proof structure:');
    console.log(`[Worker]   - type: ${assetLockProof.type}`);
    if (assetLockProof.instantLock) {
      console.log(`[Worker]   - instantLock length: ${assetLockProof.instantLock.length}`);
      console.log(`[Worker]   - instantLock (first 64 chars): ${assetLockProof.instantLock.substring(0, 64)}...`);
    }
    if (assetLockProof.transaction) {
      console.log(`[Worker]   - transaction length: ${assetLockProof.transaction.length}`);
      console.log(`[Worker]   - transaction (first 64 chars): ${assetLockProof.transaction.substring(0, 64)}...`);
    }
    if (assetLockProof.outputIndex !== undefined) {
      console.log(`[Worker]   - outputIndex: ${assetLockProof.outputIndex}`);
    }

    // Log public keys structure for debugging
    console.log('[Worker] 📋 Public Keys structure:');
    publicKeys.forEach((key, i) => {
      console.log(`[Worker]   Key ${i}:`);
      console.log(`[Worker]     - id: ${key.id}`);
      console.log(`[Worker]     - type: ${key.keyType}`);
      console.log(`[Worker]     - purpose: ${key.purpose}`);
      console.log(`[Worker]     - securityLevel: ${key.securityLevel}`);
      console.log(`[Worker]     - data length: ${key.data?.length || 'N/A'}`);
      if (key.data) {
        console.log(`[Worker]     - data (first 64 chars): ${key.data.substring(0, 64)}...`);
      }
    });
  }

  // SYNC call - no RwLock issues
  const prepareResult = wasmSdk.identityCreatePrepare(
    proofJson,
    assetLockPrivateKeyWif,
    publicKeysJson
  );

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] State transition prepared, status: ${prepareResult.status}`);
    console.log(`[Worker] Identity ID: ${prepareResult.identityId}`);
    console.log(`[Worker] State transition hex length: ${prepareResult.stateTransition?.length || 0}`);

    // Log state transition bytes for comparison with official SDK
    if (prepareResult.stateTransition) {
      const stHex = prepareResult.stateTransition;
      console.log('[Worker] 📋 State Transition (for debugging):');
      console.log(`[Worker]   - Total bytes: ${stHex.length / 2}`);
      console.log(`[Worker]   - First 100 chars: ${stHex.substring(0, 100)}`);
      console.log(`[Worker]   - Last 100 chars: ${stHex.substring(stHex.length - 100)}`);
      // Log a hash for quick comparison
      const buffer = Buffer.from(stHex, 'hex');
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      console.log(`[Worker]   - SHA256: ${hash}`);
    }
  }

  // Now broadcast via JavaScript DAPI client (no WASM involved)
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] 📡 Broadcasting via JavaScript DAPI client (no WASM)...');
  }

  const platformStart = Date.now();
  const dapiClient = new DAPIClient({ network });

  // Convert hex to buffer for DAPI broadcast
  const stateTransitionBuffer = Buffer.from(prepareResult.stateTransition, 'hex');

  // Broadcast the state transition via DAPI
  await dapiClient.platform.broadcastStateTransition(stateTransitionBuffer);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] ✅ Broadcast successful via DAPI');
    console.log('[Worker] ⏳ Waiting for identity creation confirmation...');
  }

  // Wait for the identity to be created via JavaScript DAPI polling
  // This avoids any WASM RwLock issues by not using WASM at all for waiting
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] ⏳ Polling for identity creation via DAPI...');
  }

  // Import bs58 for identity ID conversion
  const bs58 = (await import('bs58')).default;
  const identityIdBuffer = Buffer.from(bs58.decode(prepareResult.identityId));

  // Poll for identity creation
  const MAX_WAIT_MS = 120000; // 2 minutes
  const POLL_INTERVAL_MS = 3000; // 3 seconds
  const waitStart = Date.now();
  let newBalance = null;

  while (Date.now() - waitStart < MAX_WAIT_MS) {
    try {
      // Use DAPI directly to get identity balance (no WASM)
      const balanceResponse = await dapiClient.platform.getIdentityBalance(identityIdBuffer, { prove: false });
      newBalance = Number(balanceResponse?.balance || 0);

      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Current balance: ${newBalance}`);
      }

      // Identity is created when we get a valid balance > 0
      if (newBalance > 0) {
        break;
      }
    } catch (pollError) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Poll error (retrying): ${pollError.message}`);
      }
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  const platformTime = ((Date.now() - platformStart) / 1000).toFixed(1);
  const totalTime = ((Date.now() - operationStart) / 1000).toFixed(1);

  // CRITICAL: Check if identity was actually confirmed on platform
  // If newBalance is null or 0 after polling, the state transition was likely rejected
  if (newBalance === null || newBalance <= 0) {
    console.error(`[Worker] ❌ Identity creation FAILED - not confirmed after ${MAX_WAIT_MS/1000}s polling`);
    console.error(`[Worker] Identity ID: ${prepareResult.identityId}`);
    console.error(`[Worker] Final balance: ${newBalance}`);
    console.error(`[Worker] The state transition was broadcast but NOT accepted by the platform.`);
    console.error(`[Worker] Common causes:`);
    console.error(`[Worker]   1. Invalid asset lock proof format`);
    console.error(`[Worker]   2. Proof type mismatch (InstantLock vs ChainLock)`);
    console.error(`[Worker]   3. Invalid state transition signature`);
    console.error(`[Worker]   4. Asset lock transaction not yet confirmed on platform`);

    // Try to get more details via waitForStateTransitionResult
    try {
      console.log(`[Worker] 🔍 Attempting to get rejection details via waitForStateTransitionResult...`);
      const waitResult = await dapiClient.platform.waitForStateTransitionResult(
        stateTransitionBuffer,
        { prove: false, retry: { times: 3 } }
      );

      if (waitResult.error) {
        console.error(`[Worker] Platform rejection error: ${JSON.stringify(waitResult.error)}`);
        throw new Error(`Identity creation rejected by platform: ${JSON.stringify(waitResult.error)}`);
      } else if (waitResult.proof) {
        console.log(`[Worker] Unexpected: Got proof after timeout. Maybe just delayed.`);
      } else {
        console.log(`[Worker] waitForStateTransitionResult returned no error or proof: ${JSON.stringify(waitResult)}`);
      }
    } catch (waitError) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] waitForStateTransitionResult error: ${waitError.message}`);
      }
    }

    throw new Error(`Identity creation failed - identity ${prepareResult.identityId} not confirmed on platform after ${MAX_WAIT_MS/1000}s. State transition broadcast succeeded but was rejected by validators.`);
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] ✅ Complete (${totalTime}s) - Identity: ${prepareResult.identityId}, Balance: ${newBalance}`);
    console.log(`[Worker] Platform submission: ${platformTime}s`);
    console.log(`[Worker] Proof creation: ${proofTime}s`);
  }

  return {
    status: 'success',
    identityId: prepareResult.identityId,
    balance: newBalance,
    message: 'Identity created successfully'
  };
}
