import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../../state-manager.js';

describe('StateManager', () => {
  let stateManager;

  beforeEach(() => {
    // Create a fresh instance for each test
    stateManager = new StateManager();
  });

  describe('initialization', () => {
    it('initializes with default state', () => {
      const state = stateManager.getState();

      expect(state.ui.selectedIdentityId).toBe(null);
      expect(state.ui.activePanel).toBe(null);
      expect(state.ui.isLoading).toBe(false);
      expect(state.identities).toBeInstanceOf(Map);
      expect(state.transactions).toBeInstanceOf(Map);
      expect(state.network).toBe('testnet');
      expect(state.isConnected).toBe(false);
    });

    it('has empty identity and transaction maps', () => {
      const state = stateManager.getState();

      expect(state.identities.size).toBe(0);
      expect(state.transactions.size).toBe(0);
    });
  });

  describe('identity management', () => {
    const mockIdentity = {
      id: 'test-identity-1',
      balance: 100000000,
      revision: 0,
      keys: []
    };

    it('adds identity to state', () => {
      stateManager.setIdentity(mockIdentity.id, mockIdentity);

      const state = stateManager.getState();
      expect(state.identities.has(mockIdentity.id)).toBe(true);
      expect(state.identities.get(mockIdentity.id)).toMatchObject(mockIdentity);
    });

    it('updates existing identity', () => {
      stateManager.setIdentity(mockIdentity.id, mockIdentity);

      const updated = { ...mockIdentity, balance: 200000000 };
      stateManager.setIdentity(mockIdentity.id, updated);

      const state = stateManager.getState();
      expect(state.identities.get(mockIdentity.id).balance).toBe(200000000);
    });

    it('adds lastUpdated timestamp', () => {
      stateManager.setIdentity(mockIdentity.id, mockIdentity);

      const identity = stateManager.getState().identities.get(mockIdentity.id);
      expect(identity.lastUpdated).toBeDefined();
      expect(typeof identity.lastUpdated).toBe('number');
    });

    it('removes identity from state', () => {
      stateManager.setIdentity(mockIdentity.id, mockIdentity);
      stateManager.removeIdentity(mockIdentity.id);

      const state = stateManager.getState();
      expect(state.identities.has(mockIdentity.id)).toBe(false);
    });

    it('gets all identities as array', () => {
      stateManager.setIdentity('id1', { id: 'id1' });
      stateManager.setIdentity('id2', { id: 'id2' });

      const identities = stateManager.getAllIdentities();
      expect(Array.isArray(identities)).toBe(true);
      expect(identities).toHaveLength(2);
    });
  });

  describe('identity selection', () => {
    const mockIdentity = {
      id: 'test-identity-1',
      balance: 100000000
    };

    beforeEach(() => {
      stateManager.setIdentity(mockIdentity.id, mockIdentity);
    });

    it('selects identity by ID', () => {
      stateManager.selectIdentity(mockIdentity.id);

      const state = stateManager.getState();
      expect(state.ui.selectedIdentityId).toBe(mockIdentity.id);
    });

    it('gets selected identity', () => {
      stateManager.selectIdentity(mockIdentity.id);

      const selected = stateManager.getSelectedIdentity();
      expect(selected.id).toBe(mockIdentity.id);
    });

    it('returns null when no identity selected', () => {
      const selected = stateManager.getSelectedIdentity();
      expect(selected).toBe(null);
    });

    it('clears selection when selecting null', () => {
      stateManager.selectIdentity(mockIdentity.id);
      stateManager.selectIdentity(null);

      const state = stateManager.getState();
      expect(state.ui.selectedIdentityId).toBe(null);
    });

    it('clears active panel when selecting null', () => {
      stateManager.selectIdentity(mockIdentity.id);
      stateManager.setActivePanel('topup');
      stateManager.selectIdentity(null);

      const state = stateManager.getState();
      expect(state.ui.activePanel).toBe(null);
    });

    it('deselects when selected identity is removed', () => {
      stateManager.selectIdentity(mockIdentity.id);
      stateManager.removeIdentity(mockIdentity.id);

      const state = stateManager.getState();
      expect(state.ui.selectedIdentityId).toBe(null);
    });
  });

  describe('transaction management', () => {
    const mockTransaction = {
      id: 'tx-1',
      type: 'topup',
      amount: 100000000,
      identityId: 'identity-1',
      status: 'pending'
    };

    it('adds transaction', () => {
      stateManager.addTransaction(mockTransaction);

      const state = stateManager.getState();
      expect(state.transactions.has(mockTransaction.id)).toBe(true);
    });

    it('adds timestamp if not present', () => {
      const tx = { ...mockTransaction };
      delete tx.timestamp;

      stateManager.addTransaction(tx);

      const stored = stateManager.getState().transactions.get(tx.id);
      expect(stored.timestamp).toBeDefined();
    });

    it('updates transaction', () => {
      stateManager.addTransaction(mockTransaction);
      stateManager.updateTransaction(mockTransaction.id, { status: 'confirmed' });

      const tx = stateManager.getState().transactions.get(mockTransaction.id);
      expect(tx.status).toBe('confirmed');
    });

    it('gets transactions for identity', () => {
      stateManager.addTransaction({ id: 'tx-1', identityId: 'id1', timestamp: 100 });
      stateManager.addTransaction({ id: 'tx-2', identityId: 'id1', timestamp: 200 });
      stateManager.addTransaction({ id: 'tx-3', identityId: 'id2', timestamp: 300 });

      const txs = stateManager.getIdentityTransactions('id1');

      expect(txs).toHaveLength(2);
      expect(txs[0].id).toBe('tx-2'); // Most recent first
      expect(txs[1].id).toBe('tx-1');
    });

    it('limits transaction results', () => {
      for (let i = 0; i < 20; i++) {
        stateManager.addTransaction({
          id: `tx-${i}`,
          identityId: 'id1',
          timestamp: i
        });
      }

      const txs = stateManager.getIdentityTransactions('id1', 5);
      expect(txs).toHaveLength(5);
    });

    it('includes transactions where identity is recipient', () => {
      stateManager.addTransaction({
        id: 'tx-1',
        identityId: 'sender',
        recipientId: 'receiver',
        timestamp: 100
      });

      const txs = stateManager.getIdentityTransactions('receiver');
      expect(txs).toHaveLength(1);
      expect(txs[0].id).toBe('tx-1');
    });
  });

  describe('UI state management', () => {
    it('updates UI state', () => {
      stateManager.updateUI({ isLoading: true, loadingMessage: 'Loading...' });

      const state = stateManager.getState();
      expect(state.ui.isLoading).toBe(true);
      expect(state.ui.loadingMessage).toBe('Loading...');
    });

    it('sets active panel', () => {
      stateManager.setActivePanel('topup');

      const state = stateManager.getState();
      expect(state.ui.activePanel).toBe('topup');
    });

    it('sets loading state', () => {
      stateManager.setLoading(true, 'Processing...');

      const state = stateManager.getState();
      expect(state.ui.isLoading).toBe(true);
      expect(state.ui.loadingMessage).toBe('Processing...');
    });

    it('sets modal state', () => {
      stateManager.setModalOpen(true);

      const state = stateManager.getState();
      expect(state.ui.modalOpen).toBe(true);
    });
  });

  describe('network state', () => {
    it('sets network status', () => {
      stateManager.setNetworkStatus('connected');

      const state = stateManager.getState();
      expect(state.connectionStatus).toBe('connected');
      expect(state.isConnected).toBe(true);
    });

    it('marks as disconnected for non-connected status', () => {
      stateManager.setNetworkStatus('connecting');

      const state = stateManager.getState();
      expect(state.isConnected).toBe(false);
    });

    it('sets sync progress', () => {
      stateManager.setSyncProgress(50);

      const state = stateManager.getState();
      expect(state.syncProgress).toBe(50);
    });

    it('clamps sync progress between 0 and 100', () => {
      stateManager.setSyncProgress(150);
      expect(stateManager.getState().syncProgress).toBe(100);

      stateManager.setSyncProgress(-10);
      expect(stateManager.getState().syncProgress).toBe(0);
    });
  });

  describe('event system', () => {
    it('emits events when state changes', () => {
      const callback = vi.fn();
      stateManager.on('identity-updated', callback);

      stateManager.setIdentity('id1', { id: 'id1' });

      expect(callback).toHaveBeenCalled();
    });

    it('passes data to event listeners', () => {
      const callback = vi.fn();
      stateManager.on('identity-updated', callback);

      const identity = { id: 'id1', balance: 100 };
      stateManager.setIdentity('id1', identity);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'id1', balance: 100 })
      );
    });

    it('allows multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      stateManager.on('identity-updated', callback1);
      stateManager.on('identity-updated', callback2);

      stateManager.setIdentity('id1', { id: 'id1' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('removes event listener', () => {
      const callback = vi.fn();
      stateManager.on('identity-updated', callback);
      stateManager.off('identity-updated', callback);

      stateManager.setIdentity('id1', { id: 'id1' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = stateManager.on('identity-updated', callback);

      unsubscribe();

      stateManager.setIdentity('id1', { id: 'id1' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles errors in event listeners gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const normalCallback = vi.fn();

      stateManager.on('identity-updated', errorCallback);
      stateManager.on('identity-updated', normalCallback);

      // Should not throw
      expect(() => {
        stateManager.setIdentity('id1', { id: 'id1' });
      }).not.toThrow();

      // Other listeners should still be called
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('state persistence', () => {
    it('persists state to localStorage', () => {
      stateManager.setIdentity('id1', { id: 'id1', balance: 100 });
      stateManager.addTransaction({ id: 'tx1', amount: 50 });

      const result = stateManager.persist();

      expect(result).toBe(true);
      expect(localStorage.getItem('dash-identity-state')).toBeTruthy();
    });

    it('restores state from localStorage', () => {
      const originalData = {
        identities: [['id1', { id: 'id1', balance: 100 }]],
        transactions: [['tx1', { id: 'tx1', amount: 50 }]],
        ui: { selectedIdentityId: 'id1' },
        network: 'mainnet'
      };

      localStorage.setItem('dash-identity-state', JSON.stringify(originalData));

      const result = stateManager.restore();

      expect(result).toBe(true);
      expect(stateManager.getState().identities.has('id1')).toBe(true);
      expect(stateManager.getState().transactions.has('tx1')).toBe(true);
      expect(stateManager.getState().network).toBe('mainnet');
    });

    it('resets transient UI state on restore', () => {
      const data = {
        identities: [],
        transactions: [],
        ui: {
          selectedIdentityId: 'id1',
          isLoading: true,
          modalOpen: true,
          activePanel: 'topup'
        }
      };

      localStorage.setItem('dash-identity-state', JSON.stringify(data));
      stateManager.restore();

      const state = stateManager.getState();
      expect(state.ui.isLoading).toBe(false);
      expect(state.ui.modalOpen).toBe(false);
      expect(state.ui.activePanel).toBe(null);
    });

    it('returns false when no stored state', () => {
      localStorage.clear();
      const result = stateManager.restore();
      expect(result).toBe(false);
    });

    it('emits state-restored event', () => {
      const callback = vi.fn();
      stateManager.on('state-restored', callback);

      const data = { identities: [], transactions: [] };
      localStorage.setItem('dash-identity-state', JSON.stringify(data));

      stateManager.restore();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('state reset', () => {
    it('resets all state to defaults', () => {
      stateManager.setIdentity('id1', { id: 'id1' });
      stateManager.addTransaction({ id: 'tx1' });
      stateManager.selectIdentity('id1');
      stateManager.setLoading(true);

      stateManager.reset();

      const state = stateManager.getState();
      expect(state.identities.size).toBe(0);
      expect(state.transactions.size).toBe(0);
      expect(state.ui.selectedIdentityId).toBe(null);
      expect(state.ui.isLoading).toBe(false);
    });

    it('emits state-reset event', () => {
      const callback = vi.fn();
      stateManager.on('state-reset', callback);

      stateManager.reset();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('immutability', () => {
    it('returns immutable copies from getState', () => {
      stateManager.setIdentity('id1', { id: 'id1', balance: 100 });

      const state1 = stateManager.getState();
      const state2 = stateManager.getState();

      expect(state1).not.toBe(state2);
      expect(state1.identities).not.toBe(state2.identities);
    });
  });
});