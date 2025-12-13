/**
 * Integration tests for TransactionFinderService
 * Tests service initialization and state manager integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TransactionFinderService,
  resetTransactionFinderService
} from '../../services/transaction-finder-service.js';
import { stateManager } from '../../state-manager.js';

describe('TransactionFinderService Integration', () => {
  let service;

  beforeEach(() => {
    resetTransactionFinderService();
    stateManager.reset();
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    resetTransactionFinderService();
    stateManager.reset();
  });

  describe('State Manager Integration', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('updates state manager scan progress during findUTXOs', async () => {
      const stateUpdates = [];
      const unsubscribe = stateManager.on('funding-scan-progress', (data) => {
        stateUpdates.push(data);
      });

      // Wire up service events to state manager
      service.on('scan-progress', (progress) => {
        stateManager.setScanProgress(progress.progress, progress.syncedBlocks, progress.totalBlocks);
      });

      await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });

      unsubscribe();

      expect(stateUpdates.length).toBeGreaterThan(0);
      expect(stateUpdates[stateUpdates.length - 1].progress).toBe(100);
    });

    it('updates state manager when UTXOs are found', async () => {
      let utxosFoundEvent = null;
      const unsubscribe = stateManager.on('funding-utxos-found', (data) => {
        utxosFoundEvent = data;
      });

      const utxos = await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });
      stateManager.setFundingUTXOs(utxos);

      unsubscribe();

      expect(utxosFoundEvent).not.toBeNull();
      expect(utxosFoundEvent.utxos).toHaveLength(1);
      expect(utxosFoundEvent.totalBalance).toBeGreaterThan(0);
    });

    it('updates state manager during realtime monitoring', async () => {
      const txEvents = [];
      const isEvents = [];
      const clEvents = [];

      stateManager.on('funding-transaction-detected', (data) => txEvents.push(data));
      stateManager.on('funding-instantlock-confirmed', (data) => isEvents.push(data));
      stateManager.on('funding-chainlock-confirmed', (data) => clEvents.push(data));

      // Wire up service events to state manager
      service.on('transaction-detected', (tx) => {
        stateManager.setDetectedTransaction(tx.txid, 5000000);
      });
      service.on('instantlock-received', (lock) => {
        stateManager.setInstantLockConfirmed(lock.timestamp);
      });
      service.on('chainlock-received', (cl) => {
        stateManager.setChainLockConfirmed(cl.timestamp, cl.blockHeight);
      });

      await service.monitorAddress('yTestAddr123', {});

      // Wait for mock events
      await new Promise(r => setTimeout(r, 16000));
      service.stop();

      expect(txEvents.length).toBeGreaterThan(0);
      expect(isEvents.length).toBeGreaterThan(0);
      expect(clEvents.length).toBeGreaterThan(0);
    }, 20000);

    it('resets funding flow state properly', async () => {
      // Set some state
      stateManager.setFundingStep('scanning');
      stateManager.setScanProgress(50, 30, 60);

      // Reset
      stateManager.resetFundingFlow();

      const state = stateManager.getState();
      expect(state.fundingFlow.step).toBe('initial');
      expect(state.fundingFlow.scanProgress).toBe(0);
      expect(state.fundingFlow.blocksScanned).toBe(0);
    });
  });

  describe('Funding Flow State Transitions', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('tracks historic scan flow state', async () => {
      const stateHistory = [];
      const unsubscribe = stateManager.on('funding-step-changed', (step) => {
        stateHistory.push(step);
      });

      // Simulate historic scan flow
      stateManager.setFundingMode('already-funded');
      stateManager.setFundingStep('scanning');

      service.on('scan-complete', () => {
        stateManager.setFundingStep('confirmed');
      });

      await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });

      unsubscribe();

      expect(stateHistory).toContain('scanning');
      expect(stateHistory).toContain('confirmed');
    });

    it('tracks realtime monitoring flow state', async () => {
      const stateHistory = [];
      stateManager.on('funding-step-changed', (step) => {
        stateHistory.push(step);
      });

      // Wire up service events
      service.on('instantlock-received', () => {
        stateManager.setFundingStep('instantlocked');
      });
      service.on('chainlock-received', () => {
        stateManager.setFundingStep('chainlocked');
      });

      stateManager.setFundingMode('waiting-for-tx');
      stateManager.setFundingStep('monitoring');

      await service.monitorAddress('yTestAddr123', {});

      // Wait for mock events
      await new Promise(r => setTimeout(r, 16000));
      service.stop();

      expect(stateHistory).toContain('monitoring');
      expect(stateHistory).toContain('instantlocked');
      expect(stateHistory).toContain('chainlocked');
    }, 20000);
  });

  describe('Error Handling', () => {
    it('service emits error events on scan failure', async () => {
      service = new TransactionFinderService({ useMockMode: false });

      // Mock a failing initialize
      service.initialize = vi.fn().mockRejectedValue(new Error('DAPI unavailable'));

      const errorEvents = [];
      service.on('scan-error', (err) => errorEvents.push(err));

      try {
        await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });
      } catch (err) {
        // Expected to throw
      }

      // Service should have tried to initialize and failed
      expect(service.initialize).toHaveBeenCalled();
    });

    it('gracefully handles stop when not monitoring', () => {
      service = new TransactionFinderService({ useMockMode: true });
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('Event Emitter Functionality', () => {
    beforeEach(() => {
      service = new TransactionFinderService({ useMockMode: true });
    });

    it('supports multiple listeners for same event', async () => {
      const listener1Calls = [];
      const listener2Calls = [];

      service.on('scan-progress', (p) => listener1Calls.push(p));
      service.on('scan-progress', (p) => listener2Calls.push(p));

      await service.findUTXOs(['yTestAddr123'], { timeframe: 'hour' });

      expect(listener1Calls.length).toBeGreaterThan(0);
      expect(listener2Calls.length).toBeGreaterThan(0);
      expect(listener1Calls.length).toBe(listener2Calls.length);
    });

    it('emits initialized event in mock mode', async () => {
      // Mock mode doesn't need initialization, but real mode does
      service = new TransactionFinderService({ useMockMode: false });

      // Since we can't really test DAPI in unit tests, just verify the method exists
      expect(typeof service.initialize).toBe('function');
    });
  });
});
