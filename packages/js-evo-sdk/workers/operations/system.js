/**
 * System Operations Handler
 *
 * Uses JavaScript DAPI client directly (bypasses WASM for read operations).
 */

import DAPIClient from '@dashevo/dapi-client';

/**
 * Get platform status
 * @param {Object} params - Operation parameters
 * @param {Object} sdk - EvoSDK instance (not used - we bypass WASM)
 * @param {Object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<Object>} Platform status
 */
export async function systemStatusOperation(params, sdk, wasmModule, network = 'testnet') {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Getting system status on ${network}`);
  }

  // Create JavaScript DAPI client (no WASM involved)
  const dapiClient = new DAPIClient({
    network,
    timeout: 30000,
    retries: 3,
    baseBanTime: 60000,
  });

  try {
    // Use DAPI client's getStatus method
    const status = await dapiClient.platform.getStatus();

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] System status retrieved successfully`);
    }

    return {
      version: status.version || {},
      chain: {
        network: network,
        synced: status.chain?.catching_up === false,
        bestBlockHeight: status.chain?.latest_block_height,
        coreChainLockedHeight: status.chain?.core_chain_locked_height,
      },
      time: {
        local: Math.floor(Date.now() / 1000),
        block: status.chain?.latest_block_time ? Math.floor(new Date(status.chain.latest_block_time).getTime() / 1000) : null,
      },
      node: {
        proTxHash: status.node?.pro_tx_hash || null,
        isEvonodeVerified: status.node?.is_evonode_verified || false,
      },
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] System status error: ${error.message}`);
    }

    // Provide a minimal fallback response on error
    throw new Error(`Failed to get system status: ${error.message}`);
  }
}

/**
 * Get current epoch information
 * @param {Object} params - Operation parameters
 * @param {Object} sdk - EvoSDK instance (not used)
 * @param {Object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<Object>} Epoch information
 */
export async function systemEpochOperation(params, sdk, wasmModule, network = 'testnet') {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Worker] Getting epoch info on ${network}`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({
    network,
    timeout: 30000,
    retries: 3,
    baseBanTime: 60000,
  });

  try {
    // Get status which includes epoch info
    const status = await dapiClient.platform.getStatus();

    // Extract epoch info from status
    const epochInfo = {
      index: status.stateSync?.currentEpoch || status.chain?.epoch || 0,
      startTime: null, // Not directly available from getStatus
      feeMultiplier: 1, // Default
    };

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Epoch info: ${JSON.stringify(epochInfo)}`);
    }

    return epochInfo;
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Worker] Epoch info error: ${error.message}`);
    }
    throw new Error(`Failed to get epoch info: ${error.message}`);
  }
}
