/**
 * Unit tests for IdentityDiscovery facade
 *
 * Tests identity discovery validation logic and error handling.
 * Note: Full worker-based discovery testing requires integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityDiscovery } from '../../../src/identities/facades/identity-discovery.js';
import type { EvoSDK } from '../../../src/sdk.js';

// Mock the wasm-worker-runner module
vi.mock('../../../src/identities/utils/wasm-worker-runner.js', () => ({
  runWasmOperation: vi.fn(),
  runBatchWasmOperation: vi.fn(),
}));

// Mock the logger
vi.mock('../../../src/identities/utils/identity-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('IdentityDiscovery', () => {
  let discovery: IdentityDiscovery;
  let mockSdk: EvoSDK;
  let mockRunWasmOperation: ReturnType<typeof vi.fn>;
  let mockRunBatchWasmOperation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock SDK with minimal network config
    mockSdk = {
      networkConfig: { network: 'testnet' },
    } as unknown as EvoSDK;

    discovery = new IdentityDiscovery(mockSdk);

    // Get mocked functions
    const workerModule = await import('../../../src/identities/utils/wasm-worker-runner.js');
    mockRunWasmOperation = workerModule.runWasmOperation as ReturnType<typeof vi.fn>;
    mockRunBatchWasmOperation = workerModule.runBatchWasmOperation as ReturnType<typeof vi.fn>;

    // Setup default mock responses
    mockRunWasmOperation.mockResolvedValue({ found: false });
    mockRunBatchWasmOperation.mockResolvedValue([]);
  });

  describe('discoverByHash()', () => {
    it('should validate public key hash format', async () => {
      // Missing hash
      await expect(discovery.discoverByHash(undefined as unknown as string)).rejects.toThrow(
        'Invalid public key hash: expected 40 hex characters, got 0'
      );

      // Empty string
      await expect(discovery.discoverByHash('')).rejects.toThrow(
        'Invalid public key hash: expected 40 hex characters, got 0'
      );

      // Too short
      await expect(discovery.discoverByHash('abc123')).rejects.toThrow(
        'Invalid public key hash: expected 40 hex characters, got 6'
      );

      // Too long
      await expect(discovery.discoverByHash('a'.repeat(41))).rejects.toThrow(
        'Invalid public key hash: expected 40 hex characters, got 41'
      );
    });

    it('should accept valid 40-character hex hash', async () => {
      const validHash = 'a'.repeat(40);
      mockRunWasmOperation.mockResolvedValueOnce({ found: true, identityId: 'test-id' });

      const result = await discovery.discoverByHash(validHash);

      expect(result.found).toBe(true);
      expect(result.identityId).toBe('test-id');
      expect(mockRunWasmOperation).toHaveBeenCalledWith(
        'identity-discover',
        { publicKeyHashHex: validHash },
        expect.objectContaining({ network: 'testnet' })
      );
    });
  });

  describe('discoverByHashBatch()', () => {
    it('should return empty array for empty input', async () => {
      const result = await discovery.discoverByHashBatch([]);
      expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined input', async () => {
      const result1 = await discovery.discoverByHashBatch(null as unknown as string[]);
      expect(result1).toEqual([]);

      const result2 = await discovery.discoverByHashBatch(undefined as unknown as string[]);
      expect(result2).toEqual([]);
    });

    it('should validate all hashes in batch', async () => {
      const invalidHashes = [
        'a'.repeat(40), // valid
        'abc', // too short
        'b'.repeat(40), // valid
      ];

      await expect(discovery.discoverByHashBatch(invalidHashes)).rejects.toThrow(
        'Invalid public key hash at index 1: expected 40 hex characters, got 3'
      );
    });

    it('should validate each hash in batch independently', async () => {
      const invalidHashes = [
        'a'.repeat(40), // valid
        'b'.repeat(40), // valid
        'c'.repeat(45), // too long
      ];

      await expect(discovery.discoverByHashBatch(invalidHashes)).rejects.toThrow(
        'Invalid public key hash at index 2: expected 40 hex characters, got 45'
      );
    });
  });

  describe('scanByIndex()', () => {
    it('should require generator function', async () => {
      await expect(discovery.scanByIndex(null as unknown as (index: number) => Promise<string>)).rejects.toThrow(
        'publicKeyHashGenerator must be a function'
      );

      await expect(discovery.scanByIndex(undefined as unknown as (index: number) => Promise<string>)).rejects.toThrow(
        'publicKeyHashGenerator must be a function'
      );

      await expect(discovery.scanByIndex('not-a-function' as unknown as (index: number) => Promise<string>)).rejects.toThrow(
        'publicKeyHashGenerator must be a function'
      );
    });

    it('should validate gapLimit parameter', async () => {
      const generator = async (_index: number) => 'a'.repeat(40);

      await expect(discovery.scanByIndex(generator, { gapLimit: 0 })).rejects.toThrow(
        'Invalid gapLimit: 0. Must be positive integer'
      );

      await expect(discovery.scanByIndex(generator, { gapLimit: -5 })).rejects.toThrow(
        'Invalid gapLimit: -5. Must be positive integer'
      );

      await expect(discovery.scanByIndex(generator, { gapLimit: 3.5 })).rejects.toThrow(
        'Invalid gapLimit: 3.5. Must be positive integer'
      );
    });

    it('should validate batchSize parameter', async () => {
      const generator = async (_index: number) => 'a'.repeat(40);

      await expect(discovery.scanByIndex(generator, { batchSize: 0 })).rejects.toThrow(
        'Invalid batchSize: 0. Must be positive integer'
      );

      await expect(discovery.scanByIndex(generator, { batchSize: -10 })).rejects.toThrow(
        'Invalid batchSize: -10. Must be positive integer'
      );

      await expect(discovery.scanByIndex(generator, { batchSize: 2.7 })).rejects.toThrow(
        'Invalid batchSize: 2.7. Must be positive integer'
      );
    });

    it('should use default values for gapLimit and batchSize', async () => {
      const generator = async (_index: number) => 'a'.repeat(40);

      // Mock batch operation to return not found results (triggers gap limit)
      mockRunBatchWasmOperation.mockResolvedValue(
        Array(20).fill({ found: false })
      );

      // Should not throw - defaults are gapLimit=20, batchSize=50
      const result = await discovery.scanByIndex(generator, {});

      // Verify it completed without error
      expect(result).toEqual([]);
    });

    it('should validate generator output format', async () => {
      // Generator returns invalid hash
      const invalidGenerator = async (_index: number) => 'short';

      await expect(
        discovery.scanByIndex(invalidGenerator, { gapLimit: 5, batchSize: 1 })
      ).rejects.toThrow('Invalid hash from generator at index 0');
    });

    it('should call onProgress callback when provided', async () => {
      const generator = async (_index: number) => 'a'.repeat(40);
      const onProgress = vi.fn();

      // Mock batch operation to return not found results
      mockRunBatchWasmOperation.mockResolvedValue(
        Array(5).fill({ found: false })
      );

      await discovery.scanByIndex(generator, {
        gapLimit: 5,
        batchSize: 5,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          currentIndex: expect.any(Number),
          foundCount: expect.any(Number),
          batchNumber: expect.any(Number),
          consecutiveNotFound: expect.any(Number),
        })
      );
    });
  });

  describe('Parameter validation edge cases', () => {
    it('should handle null generator gracefully', async () => {
      await expect(
        discovery.scanByIndex(null as unknown as (index: number) => Promise<string>, { gapLimit: 5 })
      ).rejects.toThrow('publicKeyHashGenerator must be a function');
    });

    it('should handle empty hash in batch', async () => {
      const hashes = ['a'.repeat(40), '', 'b'.repeat(40)];

      await expect(discovery.discoverByHashBatch(hashes)).rejects.toThrow(
        'Invalid public key hash at index 1: expected 40 hex characters, got 0'
      );
    });

    it('should handle null hash in batch', async () => {
      const hashes = ['a'.repeat(40), null as unknown as string, 'b'.repeat(40)];

      await expect(discovery.discoverByHashBatch(hashes)).rejects.toThrow(
        'Invalid public key hash at index 1: expected 40 hex characters, got 0'
      );
    });
  });

  describe('Generator function validation', () => {
    it('should catch errors thrown by generator', async () => {
      const errorGenerator = async (_index: number): Promise<string> => {
        throw new Error('Generator failure');
      };

      await expect(
        discovery.scanByIndex(errorGenerator, { gapLimit: 5, batchSize: 1 })
      ).rejects.toThrow('Hash generation failed at index 0: Generator failure');
    });

    it('should validate generator returns string', async () => {
      const numberGenerator = async (_index: number): Promise<string> => 12345 as unknown as string;

      await expect(
        discovery.scanByIndex(numberGenerator, { gapLimit: 5, batchSize: 1 })
      ).rejects.toThrow('Invalid hash from generator at index 0');
    });
  });
});
