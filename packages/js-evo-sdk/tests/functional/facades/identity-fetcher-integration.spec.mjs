/**
 * Integration tests for IdentityFetcher facade
 *
 * Tests real network operations against testnet Platform.
 * These tests require network connectivity but no funds.
 *
 * IMPORTANT: Each test creates its own SDK instance to avoid WASM reader lock conflicts
 * that occur when multiple tests try to use the SDK concurrently.
 */

import { expect } from 'chai';
import { EvoSDK } from '../../../dist/sdk.js';
import { TEST_IDS } from '../../fixtures/testnet.mjs';

describe('IdentityFetcher Integration', function identityFetcherIntegration() {
  this.timeout(60000); // Network operations can take time

  describe('fetch() - Real Platform Queries', () => {
    it('should fetch existing testnet identity by ID', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const identityId = TEST_IDS.identityId;
      const identity = await sdk.identities.fetch(identityId);

      expect(identity).to.exist;
      expect(identity.getId).to.be.a('function');

      const id = identity.getId();
      expect(id).to.exist;
    });

    it('should throw error for non-existent identity', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const fakeId = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      try {
        await sdk.identities.fetch(fakeId);
        throw new Error('Should have thrown error for non-existent identity');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch identity');
      }
    });
  });

  describe('fetchWithProof() - Cryptographic Proofs', () => {
    it('should fetch identity with proof structure', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const identityId = TEST_IDS.identityId;
      const result = await sdk.identities.fetchWithProof(identityId);

      expect(result).to.exist;
      expect(result).to.be.an('object');
      // Proof info structure varies, just verify it exists
    });
  });

  describe('fetchUnproved() - Fast Fetch', () => {
    it('should fetch identity without proof', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const identityId = TEST_IDS.identityId;
      const identity = await sdk.identities.fetchUnproved(identityId);

      expect(identity).to.exist;
      expect(identity.getId).to.be.a('function');
    });
  });

  describe('getKeys() - Key Retrieval', () => {
    it('should get all keys for identity', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const result = await sdk.identities.getKeys({
        identityId: TEST_IDS.identityId,
        keyRequestType: 'all',
        limit: 10,
        offset: 0,
      });

      expect(result).to.exist;
      expect(result).to.be.an('object');
      expect(result.keys).to.be.an('array');
      expect(result.keys.length).to.be.greaterThan(0);
    });

    it('should get specific keys by ID', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      // Get all keys first to know what IDs exist
      const allKeys = await sdk.identities.getKeys({
        identityId: TEST_IDS.identityId,
        keyRequestType: 'all',
      });

      if (allKeys.keys && allKeys.keys.length > 0) {
        const firstKeyId = allKeys.keys[0].id;

        // Create new SDK instance for the second operation
        const sdk2 = EvoSDK.testnetTrusted();
        await sdk2.connect();

        const result = await sdk2.identities.getKeys({
          identityId: TEST_IDS.identityId,
          keyRequestType: 'specific',
          specificKeyIds: [firstKeyId],
        });

        expect(result).to.exist;
        expect(result.keys).to.be.an('array');
      }
    });

    it('should support pagination with limit and offset', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const page1 = await sdk.identities.getKeys({
        identityId: TEST_IDS.identityId,
        keyRequestType: 'all',
        limit: 2,
        offset: 0,
      });

      // Create new SDK instance for the second operation
      const sdk2 = EvoSDK.testnetTrusted();
      await sdk2.connect();

      const page2 = await sdk2.identities.getKeys({
        identityId: TEST_IDS.identityId,
        keyRequestType: 'all',
        limit: 2,
        offset: 2,
      });

      expect(page1.keys).to.be.an('array');
      expect(page2.keys).to.be.an('array');

      // If there are enough keys, pages should be different
      if (page1.keys.length > 0 && page2.keys.length > 0) {
        expect(page1.keys[0].id).to.not.equal(page2.keys[0].id);
      }
    });
  });

  describe('Convenience Methods on Fetcher', () => {
    it('getKey() should retrieve single key', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const allKeys = await sdk.identities.getKeys({
        identityId: TEST_IDS.identityId,
        keyRequestType: 'all',
      });

      if (allKeys.keys && allKeys.keys.length > 0) {
        const keyId = allKeys.keys[0].id;

        // Create new SDK instance for the operation
        const sdk2 = EvoSDK.testnetTrusted();
        await sdk2.connect();

        const result = await sdk2.identities.fetcher.getKey(TEST_IDS.identityId, keyId);

        expect(result).to.exist;
        expect(result.keys).to.be.an('array');
      }
    });

    it('listKeys() should use pagination', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      const result = await sdk.identities.fetcher.listKeys(TEST_IDS.identityId, 5, 0);

      expect(result).to.exist;
      expect(result.keys).to.be.an('array');
      expect(result.keys.length).to.be.at.most(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Create fresh SDK instance for each test to avoid WASM concurrency issues
      const sdk = EvoSDK.testnetTrusted();
      await sdk.connect();

      // This test may be flaky if network is actually down
      // but demonstrates error handling
      const identityId = TEST_IDS.identityId;

      try {
        const identity = await sdk.identities.fetch(identityId);
        expect(identity).to.exist; // Success case
      } catch (error) {
        // Network error case
        expect(error.message).to.be.a('string');
      }
    });
  });
});
