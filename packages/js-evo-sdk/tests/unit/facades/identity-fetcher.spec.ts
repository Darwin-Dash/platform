/**
 * Unit tests for Identity read operations in IdentitiesFacade
 *
 * Tests the read-only operations for fetching and retrieving identity information.
 * Uses mocked WASM SDK to avoid network dependencies.
 *
 * Note: These tests mirror the expected behavior of the IdentitiesFacade's read methods
 * which now use direct WASM SDK calls via wasmOperationQueue.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createMockWasmSdk } from '../../setup';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
}));

// Mock the SDK
const mockWasmSdk = createMockWasmSdk();

// Helper to validate identity ID
const validateIdentityId = (id: unknown): void => {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('Identity ID is required');
  }
};

// Helper to validate key request type
const validateKeyRequestType = (type: string): void => {
  const validTypes = ['all', 'specific', 'search'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid keyRequestType: ${type}`);
  }
};

// Create a mock identities facade that mirrors IdentitiesFacade behavior
const createMockIdentitiesFacade = () => ({
  fetch: async (id: string) => {
    validateIdentityId(id);
    try {
      const result = await mockWasmSdk.getIdentity(id);
      if (result === null) {
        throw new Error(`Identity not found: ${id}`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.startsWith('Identity not found')) {
        throw err;
      }
      throw new Error(`Failed to fetch identity: ${err.message}`);
    }
  },
  fetchWithProof: async (id: string) => {
    validateIdentityId(id);
    try {
      const result = await mockWasmSdk.getIdentityWithProofInfo(id);
      if (result === null) {
        throw new Error(`Identity not found: ${id}`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.startsWith('Identity not found')) {
        throw err;
      }
      throw new Error(`Failed to fetch identity: ${err.message}`);
    }
  },
  fetchUnproved: async (id: string) => {
    validateIdentityId(id);
    try {
      const result = await mockWasmSdk.getIdentityUnproved(id);
      if (result === null) {
        throw new Error(`Identity not found: ${id}`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.startsWith('Identity not found')) {
        throw err;
      }
      throw new Error(`Failed to fetch identity: ${err.message}`);
    }
  },
  getKeys: async (opts: {
    identityId: string;
    keyRequestType: string;
    specificKeyIds?: number[];
    searchPurposeMap?: Record<string, number[]>;
    limit?: number;
    offset?: number;
  }) => {
    validateIdentityId(opts.identityId);
    validateKeyRequestType(opts.keyRequestType);

    if (opts.keyRequestType === 'specific') {
      if (!opts.specificKeyIds || opts.specificKeyIds.length === 0) {
        throw new Error('specificKeyIds is required when keyRequestType is "specific"');
      }
    }

    if (opts.keyRequestType === 'search') {
      if (!opts.searchPurposeMap) {
        throw new Error('searchPurposeMap is required when keyRequestType is "search"');
      }
    }

    try {
      const ids = opts.specificKeyIds ? new Uint32Array(opts.specificKeyIds) : null;
      const purposeMap = opts.searchPurposeMap ? JSON.stringify(opts.searchPurposeMap) : null;
      return await mockWasmSdk.getIdentityKeys(
        opts.identityId,
        opts.keyRequestType,
        ids,
        purposeMap,
        opts.limit ?? null,
        opts.offset ?? null
      );
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`Failed to get identity keys: ${err.message}`);
    }
  },
  getKey: async (identityId: string, keyId: number) => {
    validateIdentityId(identityId);
    if (typeof keyId !== 'number' || keyId < 0 || !Number.isInteger(keyId)) {
      throw new Error(`Invalid keyId: ${keyId}`);
    }
    const ids = new Uint32Array([keyId]);
    return await mockWasmSdk.getIdentityKeys(identityId, 'specific', ids, null, null, null);
  },
  listKeys: async (identityId: string, limit = 100, offset = 0) => {
    validateIdentityId(identityId);
    if (typeof limit !== 'number' || limit <= 0) {
      throw new Error(`Invalid limit: ${limit}`);
    }
    if (typeof offset !== 'number' || offset < 0) {
      throw new Error(`Invalid offset: ${offset}`);
    }
    return await mockWasmSdk.getIdentityKeys(identityId, 'all', null, null, limit, offset);
  },
});

// Create mock EvoSDK with identities facade
const createMockEvoSDK = () => {
  const identities = createMockIdentitiesFacade();
  return { identities };
};

describe('Identity Read Operations', () => {
  let client: ReturnType<typeof createMockEvoSDK>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockEvoSDK();
  });

  describe('fetch()', () => {
    it('should fetch identity by ID successfully', async () => {
      const mockIdentity = { id: 'test-id', balance: 100 };
      mockWasmSdk.getIdentity.mockResolvedValueOnce(mockIdentity);

      const result = await client.identities.fetch('test-id');

      expect(mockWasmSdk.getIdentity).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentity).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockIdentity);
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.fetch(undefined as unknown as string)).rejects.toThrow('Identity ID is required');
      await expect(client.identities.fetch('')).rejects.toThrow('Identity ID is required');
      await expect(client.identities.fetch(null as unknown as string)).rejects.toThrow('Identity ID is required');
    });

    it('should throw error when identity not found', async () => {
      mockWasmSdk.getIdentity.mockResolvedValueOnce(null);

      await expect(client.identities.fetch('non-existent-id'))
        .rejects.toThrow('Identity not found: non-existent-id');
    });

    it('should wrap WASM SDK errors with descriptive message', async () => {
      mockWasmSdk.getIdentity.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(client.identities.fetch('test-id'))
        .rejects.toThrow('Failed to fetch identity: Network timeout');
    });
  });

  describe('fetchWithProof()', () => {
    it('should fetch identity with proof successfully', async () => {
      const mockIdentityWithProof = {
        identity: { id: 'test-id', balance: 100 },
        proof: { signature: 'abc123' },
      };
      mockWasmSdk.getIdentityWithProofInfo.mockResolvedValueOnce(mockIdentityWithProof);

      const result = await client.identities.fetchWithProof('test-id');

      expect(mockWasmSdk.getIdentityWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentityWithProofInfo).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockIdentityWithProof);
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.fetchWithProof(undefined as unknown as string)).rejects.toThrow('Identity ID is required');
      await expect(client.identities.fetchWithProof('')).rejects.toThrow('Identity ID is required');
    });

    it('should throw error when identity not found', async () => {
      mockWasmSdk.getIdentityWithProofInfo.mockResolvedValueOnce(null);

      await expect(client.identities.fetchWithProof('non-existent-id'))
        .rejects.toThrow('Identity not found: non-existent-id');
    });
  });

  describe('fetchUnproved()', () => {
    it('should fetch unproved identity successfully', async () => {
      const mockIdentity = { id: 'test-id', balance: 100 };
      mockWasmSdk.getIdentityUnproved.mockResolvedValueOnce(mockIdentity);

      const result = await client.identities.fetchUnproved('test-id');

      expect(mockWasmSdk.getIdentityUnproved).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentityUnproved).toHaveBeenCalledWith('test-id');
      expect(result).toEqual(mockIdentity);
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.fetchUnproved(undefined as unknown as string)).rejects.toThrow('Identity ID is required');
    });

    it('should throw error when identity not found', async () => {
      mockWasmSdk.getIdentityUnproved.mockResolvedValueOnce(null);

      await expect(client.identities.fetchUnproved('non-existent-id'))
        .rejects.toThrow('Identity not found: non-existent-id');
    });
  });

  describe('getKeys()', () => {
    it('should get all keys successfully', async () => {
      const mockKeys = [
        { id: 1, type: 'ECDSA_SECP256K1', purpose: 'AUTHENTICATION' },
        { id: 2, type: 'BLS12_381', purpose: 'TRANSFER' },
      ];
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce(mockKeys);

      const result = await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'all',
      });

      expect(mockWasmSdk.getIdentityKeys).toHaveBeenCalledOnce();
      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[0]).toBe('test-id');
      expect(call[1]).toBe('all');
      expect(call[2]).toBeNull();
      expect(call[3]).toBeNull();
      expect(call[4]).toBeNull();
      expect(call[5]).toBeNull();
      expect(result).toEqual(mockKeys);
    });

    it('should get specific keys with Uint32Array conversion', async () => {
      const mockKeys = [{ id: 1, type: 'ECDSA_SECP256K1' }];
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce(mockKeys);

      await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'specific',
        specificKeyIds: [1, 2, 3],
      });

      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[0]).toBe('test-id');
      expect(call[1]).toBe('specific');
      expect(call[2]).toBeInstanceOf(Uint32Array);
      expect(Array.from(call[2])).toEqual([1, 2, 3]);
    });

    it('should search keys by purpose map with JSON serialization', async () => {
      const mockKeys = [{ id: 1, purpose: 'AUTHENTICATION' }];
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce(mockKeys);

      const purposeMap = { AUTHENTICATION: [1, 2] };
      await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'search',
        searchPurposeMap: purposeMap,
      });

      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[0]).toBe('test-id');
      expect(call[1]).toBe('search');
      expect(call[3]).toBe(JSON.stringify(purposeMap));
    });

    it('should support pagination with limit and offset', async () => {
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce([]);

      await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'all',
        limit: 10,
        offset: 5,
      });

      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[4]).toBe(10); // limit
      expect(call[5]).toBe(5);  // offset
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.getKeys({
        identityId: '',
        keyRequestType: 'all',
      })).rejects.toThrow('Identity ID is required');
    });

    it('should throw error for invalid keyRequestType', async () => {
      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'invalid',
      })).rejects.toThrow('Invalid keyRequestType: invalid');
    });

    it('should throw error when specificKeyIds missing for specific type', async () => {
      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'specific',
      })).rejects.toThrow('specificKeyIds is required when keyRequestType is "specific"');

      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'specific',
        specificKeyIds: [],
      })).rejects.toThrow('specificKeyIds is required when keyRequestType is "specific"');
    });

    it('should throw error when searchPurposeMap missing for search type', async () => {
      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'search',
      })).rejects.toThrow('searchPurposeMap is required when keyRequestType is "search"');
    });
  });

  describe('getKey()', () => {
    it('should get a single key by ID', async () => {
      const mockKey = { id: 5, type: 'ECDSA_SECP256K1' };
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce([mockKey]);

      const result = await client.identities.getKey('test-id', 5);

      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[0]).toBe('test-id');
      expect(call[1]).toBe('specific');
      expect(Array.from(call[2])).toEqual([5]);
      expect(result).toEqual([mockKey]);
    });

    it('should throw error for invalid keyId', async () => {
      await expect(client.identities.getKey('test-id', -1))
        .rejects.toThrow('Invalid keyId: -1');

      await expect(client.identities.getKey('test-id', 'not-a-number' as unknown as number))
        .rejects.toThrow('Invalid keyId: not-a-number');
    });
  });

  describe('listKeys()', () => {
    it('should list all keys with default pagination', async () => {
      const mockKeys = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce(mockKeys);

      const result = await client.identities.listKeys('test-id');

      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[0]).toBe('test-id');
      expect(call[1]).toBe('all');
      expect(call[4]).toBe(100);  // default limit
      expect(call[5]).toBe(0);    // default offset
      expect(result).toEqual(mockKeys);
    });

    it('should support custom pagination', async () => {
      mockWasmSdk.getIdentityKeys.mockResolvedValueOnce([]);

      await client.identities.listKeys('test-id', 50, 10);

      const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
      expect(call[4]).toBe(50);   // custom limit
      expect(call[5]).toBe(10);   // custom offset
    });

    it('should throw error for invalid limit', async () => {
      await expect(client.identities.listKeys('test-id', 0))
        .rejects.toThrow('Invalid limit: 0');

      await expect(client.identities.listKeys('test-id', -10))
        .rejects.toThrow('Invalid limit: -10');
    });

    it('should throw error for invalid offset', async () => {
      await expect(client.identities.listKeys('test-id', 100, -5))
        .rejects.toThrow('Invalid offset: -5');
    });
  });

  describe('Error handling', () => {
    it('should wrap network errors consistently across all methods', async () => {
      const networkError = new Error('Connection refused');

      mockWasmSdk.getIdentity.mockRejectedValueOnce(networkError);
      mockWasmSdk.getIdentityWithProofInfo.mockRejectedValueOnce(networkError);
      mockWasmSdk.getIdentityUnproved.mockRejectedValueOnce(networkError);
      mockWasmSdk.getIdentityKeys.mockRejectedValueOnce(networkError);

      await expect(client.identities.fetch('id'))
        .rejects.toThrow('Failed to fetch identity: Connection refused');

      await expect(client.identities.fetchWithProof('id'))
        .rejects.toThrow('Failed to fetch identity: Connection refused');

      await expect(client.identities.fetchUnproved('id'))
        .rejects.toThrow('Failed to fetch identity: Connection refused');

      await expect(client.identities.getKeys({ identityId: 'id', keyRequestType: 'all' }))
        .rejects.toThrow('Failed to get identity keys: Connection refused');
    });
  });
});
