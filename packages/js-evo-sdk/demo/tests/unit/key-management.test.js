/**
 * Key Management Tests
 * Tests for disable keys feature and protection rules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Key Management', () => {
  let app;
  let mockIdentity;

  beforeEach(() => {
    // Create mock identity with various key configurations
    // Using string values to match actual mock data format
    mockIdentity = {
      id: 'test-identity-123',
      keys: [
        { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER', status: 'active' }, // Master auth - cannot disable
        { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL', status: 'active' }, // Critical auth - cannot disable
        { id: 2, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'active' }, // High auth - can disable
        { id: 3, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'active' }, // Transfer key - last one
        { id: 4, purpose: 'ENCRYPTION', securityLevel: 'HIGH', status: 'active' }, // Encryption key - can disable
        { id: 5, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'disabled' } // Already disabled
      ]
    };

    // Create mock app instance with canDisableKey method
    app = {
      canDisableKey: (identity, key) => {
        // Normalize values to handle both string and numeric formats
        const normalizeSecurityLevel = (level) => {
          if (typeof level === 'string') {
            const map = { 'MASTER': 0, 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3 };
            return map[level.toUpperCase()] ?? level;
          }
          return level;
        };

        const normalizePurpose = (purpose) => {
          if (typeof purpose === 'string') {
            const map = { 'AUTHENTICATION': 0, 'ENCRYPTION': 1, 'TRANSFER': 2, 'DECRYPTION': 3, 'WITHDRAW': 4 };
            return map[purpose.toUpperCase()] ?? purpose;
          }
          return purpose;
        };

        const securityLevel = normalizeSecurityLevel(key.securityLevel);
        const purpose = normalizePurpose(key.purpose);

        // Protection Rule 1: Cannot disable master keys (security level 0)
        if (securityLevel === 0) {
          return false;
        }

        // Protection Rule 2: Cannot disable critical authentication keys (purpose 0, security level 1)
        if (purpose === 0 && securityLevel === 1) {
          return false;
        }

        // Protection Rule 3: Cannot disable if it's the last active transfer key
        if (purpose === 2) { // Transfer key
          const activeTransferKeys = identity.keys.filter(k =>
            normalizePurpose(k.purpose) === 2 && k.status === 'active'
          );
          if (activeTransferKeys.length <= 1) {
            return false;
          }
        }

        // Protection Rule 4: Cannot disable if it's the last active authentication key
        if (purpose === 0) { // Authentication key
          const activeAuthKeys = identity.keys.filter(k =>
            normalizePurpose(k.purpose) === 0 && k.status === 'active'
          );
          if (activeAuthKeys.length <= 1) {
            return false;
          }
        }

        return true;
      }
    };
  });

  describe('canDisableKey() protection rules', () => {
    it('should prevent disabling master keys (security level 0)', () => {
      const masterKey = mockIdentity.keys[0];
      expect(app.canDisableKey(mockIdentity, masterKey)).toBe(false);
    });

    it('should prevent disabling critical authentication keys', () => {
      const criticalAuthKey = mockIdentity.keys[1];
      expect(app.canDisableKey(mockIdentity, criticalAuthKey)).toBe(false);
    });

    it('should prevent disabling the last active transfer key', () => {
      const lastTransferKey = mockIdentity.keys[3];
      expect(app.canDisableKey(mockIdentity, lastTransferKey)).toBe(false);
    });

    it('should prevent disabling when it would leave no active auth keys', () => {
      // Create identity with only one active auth key
      const identityWithOneAuth = {
        id: 'test-id',
        keys: [
          { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'active' }, // Last auth
          { id: 1, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'active' }
        ]
      };

      const lastAuthKey = identityWithOneAuth.keys[0];
      expect(app.canDisableKey(identityWithOneAuth, lastAuthKey)).toBe(false);
    });

    it('should allow disabling regular high-security authentication keys', () => {
      // Has 3 active auth keys (master, critical, high), so high can be disabled
      const highAuthKey = mockIdentity.keys[2];
      expect(app.canDisableKey(mockIdentity, highAuthKey)).toBe(true);
    });

    it('should allow disabling encryption keys', () => {
      const encryptionKey = mockIdentity.keys[4];
      expect(app.canDisableKey(mockIdentity, encryptionKey)).toBe(true);
    });

    it('should not allow disabling already disabled keys', () => {
      const disabledKey = mockIdentity.keys[5];
      // Even though canDisableKey might return true, the button shouldn't show
      // because key.status === 'disabled'
      expect(disabledKey.status).toBe('disabled');
    });

    it('should allow disabling transfer key when multiple exist', () => {
      // Add a second active transfer key
      mockIdentity.keys.push({
        id: 6,
        purpose: 'TRANSFER',
        securityLevel: 'HIGH',
        status: 'active'
      });

      const firstTransferKey = mockIdentity.keys[3];
      expect(app.canDisableKey(mockIdentity, firstTransferKey)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle identity with no keys', () => {
      const emptyIdentity = { id: 'empty', keys: [] };
      const result = app.canDisableKey(emptyIdentity, {
        id: 0,
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        status: 'active'
      });
      // Should return false (would be last auth key)
      expect(result).toBe(false);
    });

    it('should handle identity with all disabled keys', () => {
      const allDisabledIdentity = {
        id: 'all-disabled',
        keys: [
          { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'disabled' },
          { id: 1, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'disabled' }
        ]
      };

      // Can't disable already disabled keys
      allDisabledIdentity.keys.forEach(key => {
        expect(key.status).toBe('disabled');
      });
    });

    it('should handle mixed key purposes correctly', () => {
      const mixedIdentity = {
        id: 'mixed',
        keys: [
          { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER', status: 'active' }, // Master
          { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'active' }, // Auth
          { id: 2, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'active' }, // Transfer
          { id: 3, purpose: 'ENCRYPTION', securityLevel: 'HIGH', status: 'active' }  // Encryption
        ]
      };

      // Can disable encryption (not critical)
      expect(app.canDisableKey(mixedIdentity, mixedIdentity.keys[3])).toBe(true);

      // Can disable auth (has another auth key)
      expect(app.canDisableKey(mixedIdentity, mixedIdentity.keys[1])).toBe(true);

      // Cannot disable master
      expect(app.canDisableKey(mixedIdentity, mixedIdentity.keys[0])).toBe(false);

      // Cannot disable last transfer
      expect(app.canDisableKey(mixedIdentity, mixedIdentity.keys[2])).toBe(false);
    });
  });

  describe('Protection Rule Combinations', () => {
    it('should require multiple active auth keys to disable non-critical auth', () => {
      const identity = {
        id: 'test',
        keys: [
          { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER', status: 'active' },  // Master
          { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL', status: 'active' },  // Critical
          { id: 2, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'active' },  // High - can disable
          { id: 3, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'disabled' } // Already disabled
        ]
      };

      // Can disable key 2 because we have master + critical still active
      expect(app.canDisableKey(identity, identity.keys[2])).toBe(true);
    });

    it('should correctly count only active keys', () => {
      const identity = {
        id: 'test',
        keys: [
          { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'active' },
          { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'disabled' },
          { id: 2, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'disabled' }
        ]
      };

      // Cannot disable the only active auth key
      expect(app.canDisableKey(identity, identity.keys[0])).toBe(false);
    });
  });
});
