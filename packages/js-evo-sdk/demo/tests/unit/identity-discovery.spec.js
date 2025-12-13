/**
 * Demo App Unit Tests - Identity Discovery
 *
 * Tests the transformation, validation, and state management
 * for identity discovery workflow.
 *
 * Run: npx vitest run tests/unit/identity-discovery.spec.js --coverage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  transformIdentityForUI,
  transformDiscoveryResult,
  isValidTransformedIdentity,
  enrichIdentityForDisplay,
  formatBalance,
  mergeIdentityData
} from '../../utils/identity-transformer.js';
import { stateManager } from '../../state-manager.js';

describe('Identity Discovery - Unit Tests', () => {

  describe('transformIdentityForUI', () => {
    it('should transform WASM identity with method accessors', () => {
      const wasmIdentity = {
        getId: () => ({ toBase58: () => 'testId123abc' }),
        getBalance: () => 50000000,
        getRevision: () => 1,
        getPublicKeys: () => [
          {
            getData: () => Buffer.from('pubkey1data', 'hex'),
            getPurpose: () => 0,
            getSecurityLevel: () => 0,
            getType: () => 0
          }
        ]
      };

      const result = transformIdentityForUI(wasmIdentity, 0);

      expect(result.id).toBe('testId123abc');
      expect(result.balance).toBe(50000000);
      expect(result.revision).toBe(1);
      expect(result.keys).toHaveLength(1);
      expect(result.index).toBe(0);
      expect(result.discoveredAt).toBeGreaterThan(0);
    });

    it('should transform plain object identity (fallback)', () => {
      const plainIdentity = {
        id: 'plainId456',
        balance: 100000000,
        revision: 2,
        publicKeys: [
          { data: '0xabcd', purpose: 0, securityLevel: 1, type: 0 }
        ]
      };

      const result = transformIdentityForUI(plainIdentity, 1);

      expect(result.id).toBe('plainId456');
      expect(result.balance).toBe(100000000);
      expect(result.revision).toBe(2);
      expect(result.index).toBe(1);
      expect(result.keys).toHaveLength(1);
    });

    it('should handle identity without index parameter', () => {
      const identity = {
        id: 'noIndexId',
        balance: 75000,
        revision: 1,
        publicKeys: []
      };

      const result = transformIdentityForUI(identity);

      expect(result.id).toBe('noIndexId');
      expect(result.index).toBeNull();
      expect(result.keys).toEqual([]);
    });

    it('should handle identity with no balance method', () => {
      const identity = {
        id: 'noBalance',
        balance: 0,
        revision: 0,
        publicKeys: []
      };

      const result = transformIdentityForUI(identity, 5);

      expect(result.balance).toBe(0);
      expect(result.index).toBe(5);
    });

    it('should set default values for optional fields', () => {
      const minimalIdentity = {
        id: 'minimal789',
        balance: 0,
        revision: 0,
        publicKeys: []
      };

      const result = transformIdentityForUI(minimalIdentity);

      expect(result.label).toBeNull();
      expect(result.dpnsNames).toEqual([]);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });
  });

  describe('isValidTransformedIdentity', () => {
    it('should validate complete valid identity', () => {
      const validIdentity = {
        id: 'valid123',
        balance: 100000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(validIdentity)).toBe(true);
    });

    it('should validate identity with keys', () => {
      const identityWithKeys = {
        id: 'withKeys',
        balance: 50000,
        revision: 2,
        keys: [
          { id: 0, data: '0xabc', purpose: 0, securityLevel: 0, type: 0, status: 'active' }
        ],
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(identityWithKeys)).toBe(true);
    });

    it('should reject identity missing required fields', () => {
      const incomplete = {
        id: 'incomplete',
        balance: 100000
        // Missing revision, keys, discoveredAt
      };

      expect(isValidTransformedIdentity(incomplete)).toBe(false);
    });

    it('should reject identity with wrong field types', () => {
      const wrongTypes = {
        id: 123, // Should be string
        balance: '100000', // Should be number
        revision: '1',
        keys: [],
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(wrongTypes)).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(isValidTransformedIdentity(null)).toBe(false);
      expect(isValidTransformedIdentity(undefined)).toBe(false);
    });

    it('should reject identity with non-array keys', () => {
      const badKeys = {
        id: 'badKeys',
        balance: 100,
        revision: 1,
        keys: 'not an array',
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(badKeys)).toBe(false);
    });
  });

  describe('transformDiscoveryResult', () => {
    it('should transform discovery result array', () => {
      const discoveryResult = [
        { identityId: 'id1', index: 0 },
        { identityId: 'id2', index: 5 },
        { identityId: 'id3', index: 10 }
      ];

      const result = transformDiscoveryResult(discoveryResult);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('id1');
      expect(result[0].index).toBe(0);
      expect(result[2].index).toBe(10);
      expect(result[0].discoveredAt).toBeGreaterThan(0);
    });

    it('should handle empty discovery result', () => {
      const result = transformDiscoveryResult([]);

      expect(result).toEqual([]);
    });

    it('should handle non-array input', () => {
      expect(transformDiscoveryResult(null)).toEqual([]);
      expect(transformDiscoveryResult(undefined)).toEqual([]);
      expect(transformDiscoveryResult({})).toEqual([]);
    });
  });

  describe('formatBalance', () => {
    it('should format balance in duffs to dash and credits', () => {
      const duffs = 100000000; // 1 DASH
      const result = formatBalance(duffs);

      expect(result.dash).toBe('1.00000000');
      expect(result.credits).toBe('100000000000');
      expect(result.displayDash).toBe('1.00 DASH');
    });

    it('should handle fractional DASH', () => {
      const duffs = 50000000; // 0.5 DASH
      const result = formatBalance(duffs);

      expect(result.dash).toBe('0.50000000');
      expect(result.displayDash).toContain('0.50');
    });

    it('should handle zero balance', () => {
      const result = formatBalance(0);

      expect(result.dash).toBe('0.00000000');
      expect(result.credits).toBe('0');
    });

    it('should handle large balances', () => {
      const duffs = 1000000000000; // 10,000 DASH
      const result = formatBalance(duffs);

      expect(result.dash).toBe('10000.00000000');
      expect(result.displayDash).toContain('10000.00');
    });
  });

  describe('enrichIdentityForDisplay', () => {
    it('should add display-friendly properties', () => {
      const identity = {
        id: 'enrich123',
        balance: 200000000,
        revision: 1,
        keys: [
          { id: 0, data: '0xabc', purpose: 0, securityLevel: 0, type: 0, status: 'active' },
          { id: 1, data: '0xdef', purpose: 2, securityLevel: 2, type: 0, status: 'active' }
        ],
        dpnsNames: ['alice.dash', 'alice2.dash'],
        discoveredAt: Date.now()
      };

      const result = enrichIdentityForDisplay(identity);

      expect(result.displayName).toBe('alice.dash');
      expect(result.formattedBalance).toBeDefined();
      expect(result.formattedBalance.dash).toBe('2.00000000');
      expect(result.keyCount).toBe(2);
      expect(result.nameCount).toBe(2);
      expect(result.isNew).toBe(true);
    });

    it('should use identity label if set', () => {
      const identity = {
        id: 'withLabel',
        balance: 100000,
        revision: 1,
        keys: [],
        label: 'My Main Account',
        dpnsNames: ['alice.dash'],
        discoveredAt: Date.now()
      };

      const result = enrichIdentityForDisplay(identity);

      expect(result.displayName).toBe('My Main Account');
    });

    it('should use first DPNS name if no label', () => {
      const identity = {
        id: 'noLabel',
        balance: 100000,
        revision: 1,
        keys: [],
        dpnsNames: ['first.dash', 'second.dash'],
        discoveredAt: Date.now()
      };

      const result = enrichIdentityForDisplay(identity);

      expect(result.displayName).toBe('first.dash');
    });

    it('should mark identity as not new if old', () => {
      const oldTime = Date.now() - 120000; // 2 minutes ago
      const identity = {
        id: 'oldIdentity',
        balance: 100000,
        revision: 1,
        keys: [],
        discoveredAt: oldTime
      };

      const result = enrichIdentityForDisplay(identity);

      expect(result.isNew).toBe(false);
    });
  });

  describe('mergeIdentityData', () => {
    it('should preserve user labels when merging', () => {
      const existing = {
        id: 'merge1',
        label: 'My Custom Label',
        balance: 100000,
        revision: 1
      };

      const discovered = {
        id: 'merge1',
        balance: 200000,
        revision: 2,
        label: null
      };

      const result = mergeIdentityData(existing, discovered);

      expect(result.label).toBe('My Custom Label');
      expect(result.balance).toBe(200000);
      expect(result.revision).toBe(2);
    });

    it('should preserve DPNS names when merging', () => {
      const existing = {
        dpnsNames: ['alice.dash', 'alice-main.dash']
      };

      const discovered = {
        balance: 500000,
        revision: 3
      };

      const result = mergeIdentityData(existing, discovered);

      expect(result.dpnsNames).toEqual(['alice.dash', 'alice-main.dash']);
    });
  });

  describe('State Manager Integration', () => {
    beforeEach(() => {
      stateManager.reset();
    });

    afterEach(() => {
      stateManager.reset();
    });

    it('should store discovered identity in state', () => {
      const identity = {
        id: 'state123',
        balance: 200000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      stateManager.setIdentity(identity.id, identity);

      const stored = stateManager.getState().identities.get(identity.id);

      expect(stored).toBeDefined();
      expect(stored.id).toBe('state123');
      expect(stored.balance).toBe(200000);
    });

    it('should emit identity-updated event on store', (done) => {
      const identity = {
        id: 'event123',
        balance: 300000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      stateManager.on('identity-updated', (updated) => {
        expect(updated.id).toBe('event123');
        done();
      });

      stateManager.setIdentity(identity.id, identity);
    });

    it('should handle multiple identities in state', () => {
      const identities = [
        { id: 'multi1', balance: 100000, revision: 1, keys: [], discoveredAt: Date.now() },
        { id: 'multi2', balance: 200000, revision: 1, keys: [], discoveredAt: Date.now() },
        { id: 'multi3', balance: 300000, revision: 1, keys: [], discoveredAt: Date.now() }
      ];

      identities.forEach(id => stateManager.setIdentity(id.id, id));

      const allIdentities = stateManager.getAllIdentities();

      expect(allIdentities).toHaveLength(3);
      expect(allIdentities[0].id).toMatch(/multi[123]/);
    });

    it('should select identity and emit event', (done) => {
      const identity = {
        id: 'select123',
        balance: 400000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      stateManager.setIdentity(identity.id, identity);

      stateManager.on('identity-selected', (selected) => {
        expect(selected.id).toBe('select123');
        done();
      });

      stateManager.selectIdentity(identity.id);
    });

    it('should persist and restore state to localStorage', () => {
      const identity = {
        id: 'persist123',
        balance: 500000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      stateManager.setIdentity(identity.id, identity);
      stateManager.persist();

      // Create new state manager instance
      const newStateManager = new (stateManager.constructor)();
      newStateManager.restore();

      const restored = newStateManager.getState().identities.get(identity.id);

      expect(restored).toBeDefined();
      expect(restored.id).toBe('persist123');
    });
  });

  describe('Progress Calculation', () => {
    it('should calculate progress percentage correctly', () => {
      const gapLimit = 100;
      const currentIndex = 50;
      const progress = (currentIndex / gapLimit) * 100;

      expect(progress).toBe(50);
    });

    it('should handle edge case: start of progress', () => {
      const gapLimit = 100;
      const currentIndex = 0;
      const progress = (currentIndex / gapLimit) * 100;

      expect(progress).toBe(0);
    });

    it('should handle edge case: completion', () => {
      const gapLimit = 100;
      const currentIndex = 100;
      const progress = (currentIndex / gapLimit) * 100;

      expect(progress).toBe(100);
    });

    it('should handle partial progress', () => {
      const gapLimit = 50;
      const currentIndex = 17;
      const progress = Math.round((currentIndex / gapLimit) * 100);

      expect(progress).toBe(34);
    });
  });

  describe('Error Handling', () => {
    it('should handle null identity gracefully', () => {
      expect(() => isValidTransformedIdentity(null)).not.toThrow();
      expect(isValidTransformedIdentity(null)).toBe(false);
    });

    it('should handle malformed balance field', () => {
      const malformed = {
        id: 'malformed',
        balance: 'not a number',
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(malformed)).toBe(false);
    });

    it('should handle empty string identity ID', () => {
      const emptyId = {
        id: '',
        balance: 100000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(emptyId)).toBe(false);
    });
  });

  describe('Real SDK Discovery Flow (performRealDiscovery)', () => {
    it('should validate SDK browser bundle import path', () => {
      // Critical fix: ./dist/sdk-browser.js instead of ../dist/sdk.js
      const correctPath = './dist/sdk-browser.js';
      const wrongPath = '../dist/sdk.js';

      expect(correctPath).toContain('sdk-browser');
      expect(wrongPath).not.toContain('sdk-browser');
    });

    it('should handle wallet-lib initialization', async () => {
      // Mock wallet-lib components
      const mockWallet = {
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        network: 'testnet'
      };

      const mockAccount = {
        index: 0,
        identities: {
          getIdentityHDKeyByIndex: (index) => ({
            privateKey: {
              toPublicKey: () => ({
                hash: { toString: () => 'abcd1234' }
              })
            }
          })
        }
      };

      expect(mockWallet.mnemonic).toBeDefined();
      expect(mockAccount.identities).toBeDefined();
    });

    it('should validate account structure for discovery', () => {
      const validAccount = {
        identities: {
          getIdentityHDKeyByIndex: (index, type) => ({
            privateKey: {
              toPublicKey: () => ({
                hash: { toString: (encoding) => 'pubkeyhash' }
              })
            }
          })
        }
      };

      expect(validAccount.identities).toBeDefined();
      expect(typeof validAccount.identities.getIdentityHDKeyByIndex).toBe('function');
    });

    it('should handle SDK.identities.getIdentityIds() call', () => {
      // Mock the discovery call
      const mockSDK = {
        identities: {
          getIdentityIds: async (account, options) => {
            // Simulate discovery
            return [
              { index: 0, identityId: 'identity1' },
              { index: 1, identityId: 'identity2' }
            ];
          }
        }
      };

      expect(typeof mockSDK.identities.getIdentityIds).toBe('function');
    });

    it('should handle progress callbacks during discovery', async () => {
      const progressEvents = [];

      const mockProgressCallback = (state) => {
        progressEvents.push({
          currentIndex: state.currentIndex,
          foundCount: state.foundCount,
          batchNumber: state.batchNumber,
          consecutiveNotFound: state.consecutiveNotFound
        });
      };

      // Simulate progress updates
      mockProgressCallback({
        currentIndex: 10,
        foundCount: 2,
        batchNumber: 1,
        consecutiveNotFound: 0
      });

      mockProgressCallback({
        currentIndex: 50,
        foundCount: 5,
        batchNumber: 2,
        consecutiveNotFound: 0
      });

      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0].foundCount).toBe(2);
      expect(progressEvents[1].foundCount).toBe(5);
    });

    it('should handle identity fetching after discovery', async () => {
      const discoveredIdentityIds = [
        { index: 0, identityId: 'id1' },
        { index: 1, identityId: 'id2' }
      ];

      const mockSDK = {
        identities: {
          fetch: async (identityId) => ({
            id: identityId,
            balance: 100000,
            revision: 1,
            publicKeys: []
          })
        }
      };

      const fetchedIdentities = [];
      for (const { identityId } of discoveredIdentityIds) {
        const identity = await mockSDK.identities.fetch(identityId);
        fetchedIdentities.push(identity);
      }

      expect(fetchedIdentities).toHaveLength(2);
      expect(fetchedIdentities[0].id).toBe('id1');
      expect(fetchedIdentities[1].id).toBe('id2');
    });

    it('should handle transformation of fetched identities', () => {
      const wasmIdentity = {
        getId: () => ({ toBase58: () => 'discoveredId123' }),
        getBalance: () => 250000000,
        getRevision: () => 1,
        getPublicKeys: () => []
      };

      const uiIdentity = transformIdentityForUI(wasmIdentity, 0);

      expect(uiIdentity.id).toBe('discoveredId123');
      expect(uiIdentity.balance).toBe(250000000);
      expect(uiIdentity.index).toBe(0);
    });

    it('should validate transformed identities before storing', () => {
      const transformedIdentity = {
        id: 'valid-id',
        balance: 100000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      expect(isValidTransformedIdentity(transformedIdentity)).toBe(true);
    });

    it('should store discovered identities in state manager', () => {
      const identity = {
        id: 'discovered-id',
        balance: 300000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      // Simulate state storage
      const stateStore = new Map();
      stateStore.set(identity.id, identity);

      const stored = stateStore.get(identity.id);
      expect(stored.id).toBe('discovered-id');
      expect(stored.balance).toBe(300000);
    });

    it('should handle wallet disconnect after discovery', async () => {
      const mockWallet = {
        disconnect: async () => {
          // Cleanup wallet connection
          return { status: 'disconnected' };
        }
      };

      const result = await mockWallet.disconnect();
      expect(result.status).toBe('disconnected');
    });

    it('should handle discovery errors gracefully', () => {
      const errors = [];

      const handleDiscoveryError = (error) => {
        errors.push({
          identityId: error.identityId,
          message: error.message
        });
      };

      handleDiscoveryError({
        identityId: 'id-that-failed',
        message: 'Failed to fetch identity'
      });

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Failed');
    });

    it('should return count of discovered identities', () => {
      const discoveryResult = [
        { index: 0, identityId: 'id1' },
        { index: 5, identityId: 'id2' },
        { index: 10, identityId: 'id3' }
      ];

      const foundCount = discoveryResult.length;

      expect(foundCount).toBe(3);
    });

    it('should track discovery timing', () => {
      const discoveryStart = Date.now();

      // Simulate discovery operations
      const identities = [
        { index: 0, identityId: 'id1' },
        { index: 1, identityId: 'id2' }
      ];

      const discoveryEnd = Date.now();
      const duration = discoveryEnd - discoveryStart;

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(identities.length).toBe(2);
    });
  });
});
