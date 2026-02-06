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
 * IS Node Health data structure
 */
export interface IsNodeHealthData {
  generated: string;
  version: number;
  knownGood: string[];
  learned: Record<string, { successes: number; failures: number; blacklisted?: boolean }>;
}

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
 * Load IS-capable node health data from JSON file
 *
 * These are nodes known to successfully deliver InstantSend hex via gRPC stream.
 * Used by MultiNodeIsHunter for prioritizing IS hex hunting.
 *
 * @returns IS node health data, or null if not found
 */
export function loadIsNodeHealth(): IsNodeHealthData | null {
  const locations = [
    path.join(__dirname, '../../../js-evo-sdk/demo/is-node-health.json'),
    path.join(__dirname, '../../../js-evo-sdk/is-node-health.json'),
  ];

  for (const location of locations) {
    try {
      if (fs.existsSync(location)) {
        const data = JSON.parse(fs.readFileSync(location, 'utf-8')) as IsNodeHealthData;
        if (data.knownGood && Array.isArray(data.knownGood)) {
          console.log(
            `[DAPI] Loaded IS node health: ${data.knownGood.length} known-good nodes from ${path.basename(location)}`
          );
          return data;
        }
      }
    } catch {
      // Try next location
    }
  }

  console.log('[DAPI] No is-node-health.json found, IS hunting will start fresh');
  return null;
}

/**
 * Get known-good IS-capable nodes
 *
 * Returns nodes that are both:
 * 1. In the knownGood list from is-node-health.json
 * 2. Also present in healthy-nodes.json (reachable)
 *
 * @returns Array of IS-capable node addresses
 */
export function getIsCapableNodes(): string[] {
  const healthyNodes = loadHealthyNodes();
  const isHealth = loadIsNodeHealth();

  if (!isHealth) {
    return [];
  }

  // Normalize for comparison
  const healthySet = new Set(
    healthyNodes.map((addr) => {
      const normalized = addr.includes(':') ? addr : `${addr}:443`;
      return normalized.replace('https://', '').replace('http://', '').toLowerCase();
    })
  );

  // Filter known-good to only include currently healthy nodes
  return isHealth.knownGood.filter((addr) => {
    const normalized = addr.toLowerCase();
    return healthySet.has(normalized);
  });
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

// Pre-load IS node health data once at module load time
const IS_NODE_HEALTH = loadIsNodeHealth();

/**
 * Pre-loaded IS node health data (available for direct access if needed)
 */
export { IS_NODE_HEALTH };

/**
 * Get IS-capable nodes that are also currently healthy
 */
export const IS_CAPABLE_NODES = getIsCapableNodes();
