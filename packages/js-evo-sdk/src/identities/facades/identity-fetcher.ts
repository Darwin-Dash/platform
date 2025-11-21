/**
 * IdentityFetcher Facade - Fetch and retrieve identity information
 *
 * Provides read-only operations for:
 * - Fetching identities from Platform
 * - Getting identity keys
 * - Retrieving identity information with proofs
 *
 * All WASM operations run in isolated child processes via worker runner
 * to prevent "already locked to a reader" concurrency errors.
 *
 * No dependencies on wallet-lib or stateful components.
 */

import * as wasm from '../../wasm.js';
import { asJsonString } from '../../util.js';
import type { EvoSDK } from '../../sdk.js';
import { createLogger } from '../utils/identity-logger.js';
import { WORKER_CONFIG } from '../config/operation-config.js';

const logger = createLogger('IdentityFetcher');

export class IdentityFetcher {
  constructor(private sdk: EvoSDK) {}

  /**
   * Fetch identity by ID from Platform
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

      const wasmSdk = await this.sdk.getWasmSdkConnected();
      const identity = await wasmSdk.getIdentity(identityId);

      if (!identity) {
        throw new Error(`Identity not found: ${identityId}`);
      }

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
   * @returns Identity with proof information
   * @throws Error if identity not found or network error
   */
  async fetchWithProof(identityId: string): Promise<any> {
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    try {
      logger.debug(`Fetching identity with proof: ${identityId}`);

      const wasmSdk = await this.sdk.getWasmSdkConnected();
      const identity = await wasmSdk.getIdentityWithProofInfo(identityId);

      if (!identity) {
        throw new Error(`Identity not found: ${identityId}`);
      }

      logger.debug(`Successfully fetched identity with proof: ${identityId}`);
      return identity;
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
    if (!identityId) {
      throw new Error('Identity ID is required');
    }

    try {
      logger.debug(`Fetching identity (unproved): ${identityId}`);

      const wasmSdk = await this.sdk.getWasmSdkConnected();
      const identity = await wasmSdk.getIdentityUnproved(identityId);

      if (!identity) {
        throw new Error(`Identity not found: ${identityId}`);
      }

      logger.debug(`Successfully fetched identity (unproved): ${identityId}`);
      return identity;
    } catch (error) {
      logger.error(`Failed to fetch identity (unproved) ${identityId}:`, error);
      throw new Error(`Failed to fetch identity: ${(error as Error).message}`);
    }
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
