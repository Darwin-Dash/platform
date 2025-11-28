/**
 * Identity Top-Up Operation Handler
 *
 * Uses a THREE-STEP approach to avoid RwLock conflicts in WASM:
 * 1. identityTopUpPrepare - Create signed state transition (WASM only, no SDK networking)
 * 2. JavaScript DAPI client broadcast - Bypasses WASM entirely
 * 3. Poll for identity balance update - Via JavaScript DAPI client
 *
 * This approach completely avoids the "already locked to a reader" error
 * that occurs when SDK networking operations are mixed with WASM operations.
 */

import { createAssetLockProof } from './proof-helper.js';

// Import DAPIClient for broadcasting
import DAPIClient from '@dashevo/dapi-client';

/**
 * Execute identity top-up operation using three-step approach
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to top up
 * @param {Object} params.transactionData - Transaction and proof data
 * @param {string} params.assetLockPrivateKeyWif - Asset lock private key (WIF format)
 * @param {Object} sdk - EvoSDK instance
 * @param {Object} wasmModule - WASM module
 * @param {string} network - Network name ('testnet' or 'mainnet')
 * @returns {Promise<Object>} Top-up result with new balance
 */
export async function identityTopUpOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId, transactionData, assetLockPrivateKeyWif } = params;

  const operationStart = Date.now();
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Top-Up: ${identityId}`);
    console.log(`[Worker] Proof type: ${transactionData.proofType}`);
    console.log(`[Worker] Using THREE-STEP approach to avoid RwLock conflicts`);
  }

  // STEP 1: Create asset lock proof using static WASM function (no SDK networking)
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] STEP 1: Creating asset lock proof (static WASM)...');
  }
  const proofStart = Date.now();
  const assetLockProof = createAssetLockProof(transactionData, wasmModule);
  const proofTime = ((Date.now() - proofStart) / 1000).toFixed(1);
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Asset lock proof created (${proofTime}s)`);
  }

  // Convert proof to JSON for WASM method
  const proofJson = JSON.stringify(assetLockProof);

  // STEP 2: Prepare state transition using identityTopUpPrepare (WASM only, no SDK networking)
  // This is a SYNCHRONOUS method that doesn't use any SDK networking operations
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] STEP 2: Preparing state transition (WASM only, no networking)...');
  }
  const prepareStart = Date.now();

  // Get a WASM SDK instance just for the prepare step
  const w = await sdk.getWasmSdkConnected();
  const prepareResult = w.identityTopUpPrepare(identityId, proofJson, assetLockPrivateKeyWif);

  const prepareTime = ((Date.now() - prepareStart) / 1000).toFixed(1);
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] State transition prepared (${prepareTime}s)`);
    console.log(`[Worker] State transition hex length: ${prepareResult.stateTransition.length}`);
  }

  // STEP 3: Broadcast via JavaScript DAPI client (bypasses WASM entirely)
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] STEP 3: Broadcasting via JavaScript DAPI client...');
  }
  const broadcastStart = Date.now();

  // Create a fresh DAPI client for broadcasting
  const dapiClient = new DAPIClient({ network });

  // Convert hex state transition to buffer for DAPI
  const stateTransitionBuffer = Buffer.from(prepareResult.stateTransition, 'hex');

  // Broadcast the state transition
  await dapiClient.platform.broadcastStateTransition(stateTransitionBuffer);

  const broadcastTime = ((Date.now() - broadcastStart) / 1000).toFixed(1);
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] State transition broadcasted (${broadcastTime}s)`);
  }

  // STEP 4: Poll for balance update via JavaScript DAPI client
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[Worker] STEP 4: Waiting for balance update...');
  }
  const waitStart = Date.now();

  // Import bs58 for identity ID conversion
  const bs58 = (await import('bs58')).default;
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  // Poll for balance change (max 120 seconds)
  const MAX_WAIT_MS = 120000;
  const POLL_INTERVAL_MS = 3000;
  let newBalance = null;
  let toppedUpAmount = null;

  // Get initial balance
  const initialResponse = await dapiClient.platform.getIdentityBalance(identityIdBuffer, { prove: false });
  const initialBalance = Number(initialResponse.balance);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Initial balance: ${initialBalance}`);
  }

  const pollStart = Date.now();
  while (Date.now() - pollStart < MAX_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      const response = await dapiClient.platform.getIdentityBalance(identityIdBuffer, { prove: false });
      const currentBalance = Number(response.balance);

      if (currentBalance > initialBalance) {
        newBalance = currentBalance;
        toppedUpAmount = currentBalance - initialBalance;
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[Worker] Balance updated: ${initialBalance} → ${currentBalance} (+${toppedUpAmount})`);
        }
        break;
      }

      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Polling... current balance: ${currentBalance} (waiting for > ${initialBalance})`);
      }
    } catch (pollError) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[Worker] Poll error (will retry): ${pollError.message}`);
      }
    }
  }

  const waitTime = ((Date.now() - waitStart) / 1000).toFixed(1);
  const totalTime = ((Date.now() - operationStart) / 1000).toFixed(1);

  if (newBalance === null) {
    throw new Error(`Timeout waiting for balance update after ${MAX_WAIT_MS / 1000}s. Initial balance: ${initialBalance}. The state transition was broadcast - balance may update later.`);
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] ✅ Complete (${totalTime}s)`);
    console.log(`[Worker] New balance: ${newBalance}`);
    console.log(`[Worker] Topped up amount: ${toppedUpAmount}`);
    console.log(`[Worker] Timing breakdown:`);
    console.log(`[Worker]   - Proof creation: ${proofTime}s`);
    console.log(`[Worker]   - State transition prep: ${prepareTime}s`);
    console.log(`[Worker]   - Broadcast: ${broadcastTime}s`);
    console.log(`[Worker]   - Balance wait: ${waitTime}s`);
  }

  return {
    status: 'success',
    identityId,
    newBalance,
    toppedUpAmount,
    message: 'Identity topped up successfully'
  };
}
