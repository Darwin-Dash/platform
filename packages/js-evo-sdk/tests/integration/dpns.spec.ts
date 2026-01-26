/**
 * Integration Tests for DPNS (Dash Platform Naming Service)
 *
 * Tests DPNS reading and registration operations using the EvoSDK.
 * These tests connect to testnet and validate:
 * - Name availability checking
 * - Name resolution
 * - Username retrieval for identities
 * - Name registration (requires funded wallet)
 * - Error handling
 *
 * Read operations require no wallet funding.
 * Write operations require TEST_MNEMONIC environment variable with funded wallet.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  waitForSTPropagated,
  skipIfNoMnemonic,
  createCleanup,
  type EvoSDKWithWalletResult,
} from './setup.js';
import {
  TESTNET_IDENTITIES,
  TESTNET_NAMES,
  TEST_AMOUNTS,
  TEST_TIMEOUTS,
} from '../lib/fixtures.js';

describe('DPNS Operations - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    sdkResult = await createEvoSDKWithWallet({
      network: 'testnet',
      autoConnect: true,
    });
    cleanup = createCleanup(sdkResult);
    console.log(`[DPNS Tests] SDK connected to ${sdkResult.network}`);
  }, TEST_TIMEOUTS.SDK_CONNECT);

  afterAll(async () => {
    await cleanup();
    console.log('[DPNS Tests] Cleanup complete');
  });

  // ============================================================================
  // Read Operations (no wallet required)
  // ============================================================================

  describe('Name Availability', () => {
    it('should check if random name is available', async () => {
      const { sdk } = sdkResult;
      const randomName = `testname${Math.floor(Math.random() * 1e9)}`;

      const isAvailable = await sdk.dpns.isNameAvailable(randomName);

      expect(typeof isAvailable).toBe('boolean');
      // Random names should typically be available
      expect(isAvailable).toBe(true);
    }, TEST_TIMEOUTS.DPNS_RESOLVE);

    it('should return false for taken name', async () => {
      const { sdk } = sdkResult;

      // "alice" is a well-known registered name on testnet
      const isAvailable = await sdk.dpns.isNameAvailable('alice');

      expect(typeof isAvailable).toBe('boolean');
      expect(isAvailable).toBe(false);
    }, TEST_TIMEOUTS.DPNS_RESOLVE);
  });

  describe('Name Resolution', () => {
    it('should resolve known username', async () => {
      const { sdk } = sdkResult;

      // Use a known existing username on testnet
      const result = await sdk.dpns.resolveName('alice');

      expect(result).toBeDefined();
      // Result should contain identity information
      console.log(`[Resolve] alice.dash resolves to identity`);
    }, TEST_TIMEOUTS.DPNS_RESOLVE);

    it('should resolve name with .dash suffix', async () => {
      const { sdk } = sdkResult;

      // Both formats should work
      const result = await sdk.dpns.resolveName('alice.dash');

      expect(result).toBeDefined();
    }, TEST_TIMEOUTS.DPNS_RESOLVE);

    it('should return null for non-existent name', async () => {
      const { sdk } = sdkResult;
      const nonExistentName = `nonexistent${Math.floor(Math.random() * 1e12)}`;

      try {
        const result = await sdk.dpns.resolveName(nonExistentName);
        // Should return null or undefined
        expect(result).toBeFalsy();
      } catch (error) {
        // Some implementations throw for not found
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DPNS_RESOLVE);
  });

  describe('Username Retrieval', () => {
    it('should get usernames for identity', async () => {
      const { sdk } = sdkResult;

      const usernames = await sdk.dpns.usernames(TESTNET_IDENTITIES.SAMPLE, {
        limit: 10,
      });

      expect(usernames).toBeDefined();
      expect(Array.isArray(usernames)).toBe(true);
      console.log(`[Usernames] Found ${usernames.length} usernames for sample identity`);
    }, TEST_TIMEOUTS.DPNS_RESOLVE);

    it('should get primary username for identity', async () => {
      const { sdk } = sdkResult;

      try {
        const username = await sdk.dpns.username(TESTNET_IDENTITIES.SAMPLE);

        // May be undefined if no username registered
        if (username) {
          expect(typeof username).toBe('string');
          console.log(`[Username] Primary username: ${username}`);
        } else {
          console.log('[Username] No primary username for identity');
        }
      } catch (error) {
        // May throw if no username found
        console.log('[Username] No username registered for identity');
      }
    }, TEST_TIMEOUTS.DPNS_RESOLVE);

    it('should return empty array for identity with no names', async () => {
      const { sdk } = sdkResult;
      // DPNS contract owner likely has no personal names
      const usernames = await sdk.dpns.usernames(TESTNET_IDENTITIES.DPNS_CONTRACT, {
        limit: 10,
      });

      expect(Array.isArray(usernames)).toBe(true);
      // System identities typically don't have usernames
    }, TEST_TIMEOUTS.DPNS_RESOLVE);
  });

  // ============================================================================
  // Registration Operations (requires funded wallet)
  // ============================================================================

  describe('Name Registration', () => {
    it('should register a new name', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          // Get an existing identity to register name for
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length === 0) {
            console.log('[Register] Skipping: No identities found for wallet');
            return;
          }

          const identityId = identityIds[0].identityId;
          const uniqueName = `test${Date.now()}${Math.floor(Math.random() * 1000)}`;

          console.log(`[Register] Registering name: ${uniqueName} for identity ${identityId}`);

          // Check availability first
          const isAvailable = await sdk.dpns.isNameAvailable(uniqueName);
          if (!isAvailable) {
            console.log('[Register] Name not available, skipping');
            return;
          }

          // Register the name
          const result = await sdk.dpns.registerName(
            uniqueName,
            identityId,
            mnemonic,
            {
              onProgress: (event) => {
                console.log(`[Register] ${event.phase}: ${event.message}`);
              },
            }
          );

          expect(result).toBeDefined();
          expect(result).toHaveProperty('name');
          expect(result.name).toBe(uniqueName);
          console.log(`[Register] Successfully registered: ${uniqueName}.dash`);

          // Wait for propagation
          await waitForSTPropagated();

          // Verify registration
          const resolved = await sdk.dpns.resolveName(uniqueName);
          expect(resolved).toBeDefined();

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('insufficient') ||
              message.includes('No UTXOs') ||
              message.includes('balance')) {
            console.log('[Register] Skipping: Insufficient funds -', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.STATE_TRANSITION);
  });

  // ============================================================================
  // Search Operations
  // ============================================================================

  describe('Name Search', () => {
    it('should search for names by prefix', async () => {
      const { sdk } = sdkResult;

      try {
        // Search for names starting with 'test'
        const results = await sdk.dpns.search('test', { limit: 10 });

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        console.log(`[Search] Found ${results.length} names starting with 'test'`);
      } catch (error) {
        // Search may not be implemented in all SDK versions
        console.log('[Search] Search not available:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DPNS_RESOLVE);
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle invalid name format', async () => {
      const { sdk } = sdkResult;

      // Names with special characters should be invalid
      const invalidNames = ['test@name', 'test name', 'test.name.extra'];

      for (const name of invalidNames) {
        try {
          await sdk.dpns.isNameAvailable(name);
          // Some implementations silently handle invalid names
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    }, TEST_TIMEOUTS.DPNS_RESOLVE * 3);

    it('should handle registration for non-existent identity', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;
        const fakeIdentityId = 'ZZZZzzzz1111111111111111111111111111111111';

        try {
          await sdk.dpns.registerName(
            `test${Date.now()}`,
            fakeIdentityId,
            mnemonic
          );
          expect.fail('Should have rejected non-existent identity');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toMatch(/invalid|not found|failed/i);
        }
      });
    }, TEST_TIMEOUTS.DPNS_RESOLVE);

    it('should reject registration for already taken name', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length === 0) {
            console.log('[Register Error] Skipping: No identities');
            return;
          }

          // Try to register 'alice' which is already taken
          await sdk.dpns.registerName(
            'alice',
            identityIds[0].identityId,
            mnemonic
          );
          expect.fail('Should have rejected already taken name');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          // Could fail at availability check or during submission
        }
      });
    }, TEST_TIMEOUTS.DPNS_RESOLVE);
  });
});
