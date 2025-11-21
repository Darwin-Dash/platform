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
import { asJsonString } from '../../util.js';
import { createLogger } from '../utils/identity-logger.js';
import { WORKER_CONFIG } from '../config/operation-config.js';
const logger = createLogger('IdentityFetcher');
export class IdentityFetcher {
    sdk;
    constructor(sdk) {
        this.sdk = sdk;
    }
    /**
     * Fetch identity by ID from Platform
     * @param identityId Identity ID in Base58 format
     * @returns Identity object from Platform
     * @throws Error if identity not found or network error
     */
    async fetch(identityId) {
        if (!identityId) {
            throw new Error('Identity ID is required');
        }
        try {
            logger.debug(`Fetching identity: ${identityId}`);
            const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');
            const identity = await runWasmOperation('identity-fetch', { identityId }, {
                network: this.sdk.networkConfig.network,
                timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
            });
            if (!identity) {
                throw new Error(`Identity not found: ${identityId}`);
            }
            logger.debug(`Successfully fetched identity: ${identityId}`);
            return identity;
        }
        catch (error) {
            logger.error(`Failed to fetch identity ${identityId}:`, error);
            throw new Error(`Failed to fetch identity: ${error.message}`);
        }
    }
    /**
     * Fetch identity with proof from Platform
     * Proof includes cryptographic evidence of identity existence
     * @param identityId Identity ID in Base58 format
     * @returns Identity with proof information
     * @throws Error if identity not found or network error
     */
    async fetchWithProof(identityId) {
        if (!identityId) {
            throw new Error('Identity ID is required');
        }
        try {
            logger.debug(`Fetching identity with proof: ${identityId}`);
            const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');
            const identity = await runWasmOperation('identity-fetch-with-proof', { identityId }, {
                network: this.sdk.networkConfig.network,
                timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
            });
            if (!identity) {
                throw new Error(`Identity not found: ${identityId}`);
            }
            logger.debug(`Successfully fetched identity with proof: ${identityId}`);
            return identity;
        }
        catch (error) {
            logger.error(`Failed to fetch identity with proof ${identityId}:`, error);
            throw new Error(`Failed to fetch identity: ${error.message}`);
        }
    }
    /**
     * Fetch identity without proof from Platform (faster than fetchWithProof)
     * @param identityId Identity ID in Base58 format
     * @returns Identity object without proof
     * @throws Error if identity not found or network error
     */
    async fetchUnproved(identityId) {
        if (!identityId) {
            throw new Error('Identity ID is required');
        }
        try {
            logger.debug(`Fetching identity (unproved): ${identityId}`);
            const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');
            const identity = await runWasmOperation('identity-fetch-unproved', { identityId }, {
                network: this.sdk.networkConfig.network,
                timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
            });
            if (!identity) {
                throw new Error(`Identity not found: ${identityId}`);
            }
            logger.debug(`Successfully fetched identity (unproved): ${identityId}`);
            return identity;
        }
        catch (error) {
            logger.error(`Failed to fetch identity (unproved) ${identityId}:`, error);
            throw new Error(`Failed to fetch identity: ${error.message}`);
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
    async getKeys(args) {
        const { identityId, keyRequestType, specificKeyIds, searchPurposeMap, limit, offset } = args;
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
            logger.debug(`Getting identity keys: ${identityId} (type: ${keyRequestType}, limit: ${limit}, offset: ${offset})`);
            const { runWasmOperation } = await import('../utils/wasm-worker-runner.js');
            const keys = await runWasmOperation('identity-get-keys', {
                identityId,
                keyRequestType,
                specificKeyIds,
                searchPurposeMap: searchPurposeMap ? asJsonString(searchPurposeMap) : null,
                limit: limit ?? null,
                offset: offset ?? null,
            }, {
                network: this.sdk.networkConfig.network,
                timeout: WORKER_CONFIG.DEFAULT_TIMEOUT_MS,
            });
            logger.debug(`Successfully retrieved keys for identity: ${identityId}`);
            return keys;
        }
        catch (error) {
            logger.error(`Failed to get identity keys for ${identityId}:`, error);
            throw new Error(`Failed to get identity keys: ${error.message}`);
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
    async getKey(identityId, keyId) {
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
    async listKeys(identityId, limit = 100, offset = 0) {
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
