/**
 * DAPI Client Configuration for Tests
 *
 * Follows the same pattern as js-evo-sdk/tests/lib/helpers.ts
 * Loads healthy nodes from JSON file and applies centralized DAPI settings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load healthy DAPI nodes from JSON file
 *
 * Checks multiple locations to find the healthy-nodes.json
 * (built by js-evo-sdk/scripts/build-healthy-nodes.js)
 *
 * @returns Array of healthy node addresses, or empty array if not found
 */
export function loadHealthyNodes(): string[] {
  // Locations relative to tests/helpers/ directory
  const locations = [
    path.join(__dirname, '../../../js-evo-sdk/demo/healthy-nodes.json'),
    path.join(__dirname, '../../../js-evo-sdk/demo/web/healthy-nodes.json'),
    path.join(__dirname, '../../../js-evo-sdk/healthy-nodes.json'),
  ];

  for (const location of locations) {
    try {
      if (fs.existsSync(location)) {
        const data = JSON.parse(fs.readFileSync(location, 'utf-8'));
        if (data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
          console.log(
            `[DAPI] Loaded ${data.nodes.length} healthy nodes from ${path.basename(path.dirname(location))}/${path.basename(location)} (generated: ${data.generated})`
          );
          return data.nodes;
        }
      }
    } catch {
      // Try next location
    }
  }

  console.log('[DAPI] No healthy-nodes.json found, using network defaults');
  return [];
}

/**
 * DAPI Configuration matching SDK settings
 *
 * These values match the centralized config in:
 * js-evo-sdk/src/identities/config/operation-config.ts
 */
export const DAPI_CONFIG = {
  /** Request timeout in milliseconds (matches SDK) */
  TIMEOUT_MS: 20000, // 20 seconds

  /** Maximum number of retries with different servers (matches SDK) */
  MAX_RETRIES: 5,

  /** Time to ban failed servers in milliseconds */
  BAN_TIME_MS: 60000, // 60 seconds
};

// Pre-load healthy nodes once at module load time
const HEALTHY_NODES = loadHealthyNodes();

/**
 * Get DAPIClient options with healthy nodes and proper settings
 *
 * @param network - Network to connect to (defaults to 'testnet')
 * @returns DAPIClient constructor options
 *
 * @example
 * ```typescript
 * import DAPIClient from '@dashevo/dapi-client';
 * import { getDAPIClientOptions } from '../helpers/dapi-config.js';
 *
 * const dapiClient = new DAPIClient(getDAPIClientOptions('testnet'));
 * ```
 */
export function getDAPIClientOptions(network: 'testnet' | 'mainnet' = 'testnet') {
  return {
    network,
    timeout: DAPI_CONFIG.TIMEOUT_MS,
    retries: DAPI_CONFIG.MAX_RETRIES,
    ...(HEALTHY_NODES.length > 0 ? { dapiAddresses: HEALTHY_NODES } : {}),
  };
}

/**
 * Pre-loaded healthy nodes (available for direct access if needed)
 */
export { HEALTHY_NODES };
