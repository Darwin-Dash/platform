/**
 * IdentityFetcher Facade - Fetch and retrieve identity information
 *
 * Provides read-only operations for:
 * - Fetching identities from Platform
 * - Getting identity keys
 * - Retrieving identity information with proofs
 *
 * Uses DAPI client directly (no shared WASM SDK) to avoid RwLock contention
 * in browser environments. This matches the working pattern in getIdentityIds().
 *
 * No dependencies on wallet-lib or stateful components.
 */

import * as wasm from '../../wasm.js';
import { asJsonString } from '../../util.js';
import type { EvoSDK } from '../../sdk.js';
import { createLogger } from '../utils/identity-logger.js';
import { WORKER_CONFIG, DAPI_CONFIG } from '../config/operation-config.js';

const logger = createLogger('IdentityFetcher');

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } } | undefined;

export class IdentityFetcher {
  constructor(private sdk: EvoSDK) {}

  /**
   * Parse identity from a cached buffer (no network call)
   *
   * Use this when you already have the identity buffer from discovery
   * (getIdentityIds() returns identityBuffer) to avoid re-fetching.
   *
   * @param buffer Raw identity buffer from Platform
   * @returns Parsed Identity object
   */
  async fromBuffer(buffer: Uint8Array): Promise<wasm.IdentityWasm> {
    const wasmSdk = await import('@dashevo/wasm-sdk');
    const { IdentityWasm } = wasmSdk;
    return IdentityWasm.fromBuffer(buffer);
  }

  /**
   * Create a fresh DAPI client for the current network.
   *
   * NOTE: We intentionally do NOT cache the DAPIClient here because:
   * - In browsers, DAPIClient needs fresh DNS resolution per connection
   * - DAPI TLS certs are registered to IP addresses, not hostnames
   * - Cached clients may hold stale hostname references causing TLS errors
   *
   * This matches the working pattern in getIdentityIds() which creates
   * a fresh DAPIClient for each discovery operation.
   */
  private async getDAPIClient(): Promise<any> {
    const network = this.sdk.networkConfig.network;
    const DAPIClient = (await import('@dashevo/dapi-client')).default;

    // Get explicit addresses from env (browser won't have this, but Node.js will)
    let dapiAddresses: string[] | undefined;
    if (typeof process !== 'undefined' && process?.env?.DAPI_ADDRESSES) {
      dapiAddresses = process.env.DAPI_ADDRESSES.split(',').map(a => a.trim());
      logger.debug(`Using explicit DAPI addresses: ${dapiAddresses.join(', ')}`);
    }

    // Create fresh client each time (no caching - matches getIdentityIds pattern)
    return new DAPIClient({
      network,
      timeout: DAPI_CONFIG.TIMEOUT_MS,
      retries: DAPI_CONFIG.MAX_RETRIES,
      baseBanTime: DAPI_CONFIG.BAN_TIME_MS,
      ...(dapiAddresses && { dapiAddresses }),
    });
  }

  /**
   * Fetch identity by ID from Platform
   *
   * Uses the WASM SDK's native getIdentity() method which properly handles
   * gRPC communication and response deserialization.
   *
   * @param identityId Identity ID in Base58 format
   * @returns Identity object from Platform
   * @throws Error if identity not found or network error
   */
  async fetch(identityId: string): Promise<wasm.IdentityWasm> {
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    try {
      logger.debug(`Fetching identity: ${identityId}`);

      // Use the connected WASM SDK which has proper gRPC handling
      const wasmSdk = await this.sdk.getWasmSdkConnected();

      // Use the SDK's native getIdentity method
      // This properly handles gRPC response parsing and deserialization
      const identity = await wasmSdk.getIdentity(identityId);

      logger.debug(`Successfully fetched identity: ${identityId}`);
      return identity;
    } catch (error) {
      logger.error(`Failed to fetch identity ${identityId}:`, error);
      throw new Error(`Failed to fetch identity: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch identity with proof from Platform
   * Proof includes cryptographic evidence of identity existence
   * @param identityId Identity ID in Base58 format
   * @returns Identity with proof information (data, metadata, proof)
   * @throws Error if identity not found or network error
   */
  async fetchWithProof(identityId: string): Promise<any> {
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    try {
      logger.debug(`Fetching identity with proof: ${identityId}`);

      // Use the connected WASM SDK which has proper gRPC handling
      const wasmSdk = await this.sdk.getWasmSdkConnected();

      // Use the SDK's native getIdentityWithProofInfo method
      const result = await wasmSdk.getIdentityWithProofInfo(identityId);

      logger.debug(`Successfully fetched identity with proof: ${identityId}`);
      return result;
    } catch (error) {
      logger.error(`Failed to fetch identity with proof ${identityId}:`, error);
      throw new Error(`Failed to fetch identity: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch identity without proof from Platform (faster than fetchWithProof)
   * @param identityId Identity ID in Base58 format
   * @returns Identity object without proof
   * @throws Error if identity not found or network error
   */
  async fetchUnproved(identityId: string): Promise<wasm.IdentityWasm> {
    // fetchUnproved is the same as fetch() with prove: false
    return this.fetch(identityId);
  }

  /**
   * Retrieve identity keys
   * Can retrieve all keys, specific keys, or search by criteria
   *
   * @param identityId Identity ID in Base58 format
   * @param keyRequestType 'all' (all keys), 'specific' (specific IDs), or 'search' (by criteria)
   * @param specificKeyIds (optional) Array of key IDs to retrieve when type is 'specific'
   * @param searchPurposeMap (optional) Map of key purposes to search by when type is 'search'
   * @param limit (optional) Maximum number of keys to return
   * @param offset (optional) Offset for pagination
   * @returns Keys for the identity
   * @throws Error if identity not found or parameters invalid
   */
  async getKeys(args: {
    identityId: string;
    keyRequestType: 'all' | 'specific' | 'search';
    specificKeyIds?: number[];
    searchPurposeMap?: unknown;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const { identityId, keyRequestType, specificKeyIds, searchPurposeMap, limit = null, offset = null } = args;

    // Validation
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    if (!keyRequestType || !['all', 'specific', 'search'].includes(keyRequestType)) {
      throw new Error(`Invalid keyRequestType: ${keyRequestType}. Must be 'all', 'specific', or 'search'`);
    }

    if (keyRequestType === 'specific' && (!specificKeyIds || specificKeyIds.length === 0)) {
      throw new Error('specificKeyIds is required when keyRequestType is "specific"');
    }

    if (keyRequestType === 'search' && !searchPurposeMap) {
      throw new Error('searchPurposeMap is required when keyRequestType is "search"');
    }

    try {
      logger.debug(
        `Getting identity keys: ${identityId} (type: ${keyRequestType}, limit: ${limit}, offset: ${offset})`
      );

      // Get connected WASM SDK and call directly
      const wasmSdk = await this.sdk.getWasmSdkConnected();

      // Transform parameters to match WASM SDK expectations
      const keyIds = specificKeyIds
        ? new Uint32Array(specificKeyIds)
        : null;

      const purposeMap = searchPurposeMap
        ? JSON.stringify(searchPurposeMap)
        : null;

      // Call WASM SDK method with positional arguments
      const keys = await wasmSdk.getIdentityKeys(
        identityId,
        keyRequestType,
        keyIds,
        purposeMap,
        limit,
        offset
      );

      logger.debug(`Successfully retrieved keys for identity: ${identityId}`);
      return keys;
    } catch (error) {
      logger.error(`Failed to get identity keys for ${identityId}:`, error);
      throw new Error(`Failed to get identity keys: ${(error as Error).message}`);
    }
  }

  /**
   * Get a specific key from an identity
   * Convenience method for retrieving a single key by ID
   *
   * @param identityId Identity ID in Base58 format
   * @param keyId Key ID to retrieve
   * @returns The specific key if found
   */
  async getKey(identityId: string, keyId: number): Promise<any> {
    if (typeof keyId !== 'number' || keyId < 0) {
      throw new Error(`Invalid keyId: ${keyId}. Must be a non-negative number`);
    }

    return this.getKeys({
      identityId,
      keyRequestType: 'specific',
      specificKeyIds: [keyId],
    });
  }

  /**
   * List all keys for an identity with pagination support
   * Convenience method for iterating through all identity keys
   *
   * @param identityId Identity ID in Base58 format
   * @param limit Number of keys per page (default: 100)
   * @param offset Starting offset (default: 0)
   * @returns Paginated keys for the identity
   */
  async listKeys(
    identityId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any> {
    if (limit <= 0) {
      throw new Error(`Invalid limit: ${limit}. Must be greater than 0`);
    }

    if (offset < 0) {
      throw new Error(`Invalid offset: ${offset}. Must be non-negative`);
    }

    return this.getKeys({
      identityId,
      keyRequestType: 'all',
      limit,
      offset,
    });
  }
}
