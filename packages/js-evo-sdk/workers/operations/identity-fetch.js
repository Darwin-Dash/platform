/**
 * Identity Fetch Operation Handler
 *
 * Fetches an identity by ID from Platform using JavaScript DAPI client.
 * Runs in isolated worker process to avoid WASM concurrency issues.
 *
 * CRITICAL: Uses JavaScript DAPI client directly to avoid WASM RwLock issues.
 * The WASM SDK's async methods acquire reader locks that conflict with the SDK
 * connection lock. By using DAPI directly, we bypass WASM entirely for network operations.
 */

import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

/**
 * Execute identity fetch operation using DAPI client directly
 *
 * @param {Object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch (Base58)
 * @param {Object} sdk - EvoSDK instance (used for network config only)
 * @param {Object} wasmModule - WASM module (not used - we bypass WASM)
 * @param {string} network - Network name
 * @returns {Promise<Object>} Identity data with found flag
 */
export async function identityFetchOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId } = params;

  if (!identityId) {
    throw new Error('identityId is required for identity-fetch operation');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Identity Fetch: fetching identity ${identityId}`);
    console.log(`[Worker] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client (no WASM involved)
  const dapiClient = new DAPIClient({ network });

  // Convert identity ID from Base58 to Buffer
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  try {
    // Use getIdentityBalance which returns just the balance
    // This avoids needing to deserialize the full identity (which requires WASM/bincode)
    const balanceResponse = await dapiClient.platform.getIdentityBalance(identityIdBuffer);
    const balance = balanceResponse.getBalance();

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Identity balance received: ${balance}`);
    }

    // Balance of 0n or null indicates identity not found (or no balance)
    // But balance response succeeding means identity exists
    return {
      found: true,
      identity: {
        id: identityId,
        balance: Number(balance),
        revision: 0, // Balance endpoint doesn't return revision
        publicKeys: [], // Balance endpoint doesn't return keys
      },
    };

  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Identity fetch error: ${error.message}`);
    }

    // Handle "not found" gracefully
    if (error.message?.includes('not found') ||
        error.message?.includes('does not exist') ||
        error.message?.includes('Identity is not defined') ||
        error.code === 5) {
      return {
        found: false,
        identityId,
      };
    }

    throw new Error(`Failed to fetch identity: ${error.message}`);
  }
}
