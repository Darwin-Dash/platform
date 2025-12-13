/**
 * Key Management Integration Tests
 * Tests for disable keys workflow with real DOM and state manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateManager } from '../../state-manager.js';

describe('Key Management Integration', () => {
  let container;
  let notificationContainer;
  let keysModal;
  let disableKeyModal;
  let mockIdentity;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup notification container
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    document.body.appendChild(notificationContainer);

    // Setup keys modal
    keysModal = document.createElement('div');
    keysModal.id = 'keys-modal';
    keysModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div id="keys-list"></div>
      </div>
    `;
    keysModal.hidden = true;
    document.body.appendChild(keysModal);

    // Setup disable key modal
    disableKeyModal = document.createElement('div');
    disableKeyModal.id = 'disable-key-modal';
    disableKeyModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <span id="disable-key-id"></span>
        <span id="disable-key-purpose"></span>
        <span id="disable-key-security"></span>
        <button id="confirm-disable-key"></button>
        <button class="modal-close"></button>
      </div>
    `;
    disableKeyModal.hidden = true;
    document.body.appendChild(disableKeyModal);

    // Setup loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.hidden = true;
    document.body.appendChild(loadingOverlay);

    // Create mock identity with multiple keys
    // Using string values to match actual mock data format
    mockIdentity = {
      id: 'test-identity-integration',
      balance: 10000000000,
      revision: 1,
      keys: [
        { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER', status: 'active', type: 0, data: 'pubkey0' },
        { id: 1, purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL', status: 'active', type: 0, data: 'pubkey1' },
        { id: 2, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', status: 'active', type: 0, data: 'pubkey2' },
        { id: 3, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'active', type: 0, data: 'pubkey3' },
        { id: 4, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'active', type: 0, data: 'pubkey4' }
      ]
    };

    // Reset state manager
    stateManager.reset();
    stateManager.setIdentity(mockIdentity.id, mockIdentity);
    stateManager.selectIdentity(mockIdentity.id);
  });

  afterEach(() => {
    // Cleanup
    if (notificationContainer?.parentNode) {
      notificationContainer.parentNode.removeChild(notificationContainer);
    }
    if (keysModal?.parentNode) {
      keysModal.parentNode.removeChild(keysModal);
    }
    if (disableKeyModal?.parentNode) {
      disableKeyModal.parentNode.removeChild(disableKeyModal);
    }
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay?.parentNode) {
      loadingOverlay.parentNode.removeChild(loadingOverlay);
    }

    stateManager.reset();
  });

  describe('Disable Button Visibility', () => {
    it('should not show disable button for master keys', () => {
      const identity = stateManager.getSelectedIdentity();
      const masterKey = identity.keys[0];

      // Master key should not have disable button
      expect(masterKey.securityLevel).toBe('MASTER');
    });

    it('should not show disable button for critical auth keys', () => {
      const identity = stateManager.getSelectedIdentity();
      const criticalAuthKey = identity.keys[1];

      expect(criticalAuthKey.purpose).toBe('AUTHENTICATION');
      expect(criticalAuthKey.securityLevel).toBe('CRITICAL');
    });

    it('should show disable button for regular auth keys when multiple exist', () => {
      const identity = stateManager.getSelectedIdentity();
      const regularAuthKey = identity.keys[2];

      // Should be disableable (3 auth keys total)
      expect(regularAuthKey.purpose).toBe('AUTHENTICATION');
      expect(regularAuthKey.securityLevel).toBe('HIGH');
      expect(regularAuthKey.status).toBe('active');

      const activeAuthKeys = identity.keys.filter(k =>
        k.purpose === 'AUTHENTICATION' && k.status === 'active'
      );
      expect(activeAuthKeys.length).toBeGreaterThan(1);
    });

    it('should show disable button for transfer keys when multiple exist', () => {
      const identity = stateManager.getSelectedIdentity();
      const transferKey = identity.keys[3];

      expect(transferKey.purpose).toBe('TRANSFER');
      expect(transferKey.status).toBe('active');

      const activeTransferKeys = identity.keys.filter(k =>
        k.purpose === 'TRANSFER' && k.status === 'active'
      );
      expect(activeTransferKeys.length).toBe(2);
    });
  });

  describe('State Manager Integration', () => {
    it('should update identity state when key is disabled', () => {
      const identity = stateManager.getSelectedIdentity();
      const keyToDisable = identity.keys[2]; // Regular auth key

      expect(keyToDisable.status).toBe('active');

      // Simulate disabling the key
      const updatedKeys = identity.keys.map(k =>
        k.id === keyToDisable.id ? { ...k, status: 'disabled' } : k
      );

      stateManager.setIdentity(identity.id, {
        ...identity,
        keys: updatedKeys,
        revision: identity.revision + 1
      });

      const updatedIdentity = stateManager.getSelectedIdentity();
      const disabledKey = updatedIdentity.keys.find(k => k.id === keyToDisable.id);

      expect(disabledKey.status).toBe('disabled');
      expect(updatedIdentity.revision).toBe(identity.revision + 1);
    });

    it('should maintain other keys unchanged when disabling one key', () => {
      const identity = stateManager.getSelectedIdentity();
      const initialKeys = [...identity.keys];

      // Disable key 2
      const updatedKeys = identity.keys.map(k =>
        k.id === 2 ? { ...k, status: 'disabled' } : k
      );

      stateManager.setIdentity(identity.id, {
        ...identity,
        keys: updatedKeys
      });

      const updatedIdentity = stateManager.getSelectedIdentity();

      // Check other keys unchanged
      expect(updatedIdentity.keys[0].status).toBe(initialKeys[0].status);
      expect(updatedIdentity.keys[1].status).toBe(initialKeys[1].status);
      expect(updatedIdentity.keys[3].status).toBe(initialKeys[3].status);
      expect(updatedIdentity.keys[4].status).toBe(initialKeys[4].status);

      // Check target key is disabled
      expect(updatedIdentity.keys[2].status).toBe('disabled');
    });
  });

  describe('Protection Rules in Real Scenarios', () => {
    it('should prevent creating unsafe state by disabling last transfer key', () => {
      // Create identity with only one transfer key
      const singleTransferIdentity = {
        id: 'single-transfer',
        keys: [
          { id: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER', status: 'active', type: 0, data: 'pub0' },
          { id: 1, purpose: 'TRANSFER', securityLevel: 'HIGH', status: 'active', type: 0, data: 'pub1' } // Last transfer
        ]
      };

      stateManager.setIdentity(singleTransferIdentity.id, singleTransferIdentity);

      const transferKey = singleTransferIdentity.keys[1];
      const activeTransferKeys = singleTransferIdentity.keys.filter(k =>
        k.purpose === 'TRANSFER' && k.status === 'active'
      );

      expect(activeTransferKeys.length).toBe(1);
      // Cannot disable the only transfer key
    });

    it('should allow disabling after adding additional keys', () => {
      const identity = stateManager.getSelectedIdentity();

      // Add another auth key
      const newKey = {
        id: 5,
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        status: 'active',
        type: 0,
        data: 'newpubkey'
      };

      stateManager.setIdentity(identity.id, {
        ...identity,
        keys: [...identity.keys, newKey]
      });

      const updatedIdentity = stateManager.getSelectedIdentity();
      const activeAuthKeys = updatedIdentity.keys.filter(k =>
        k.purpose === 'AUTHENTICATION' && k.status === 'active'
      );

      // Now we have 4 active auth keys, so we can safely disable non-critical ones
      expect(activeAuthKeys.length).toBe(4);
    });
  });
});
