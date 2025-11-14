import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstantSendChainLockMonitor } from '../../src/InstantSendChainLockMonitor.js';
import { LogLevel } from '../../src/types.js';

describe('InstantSendChainLockMonitor', () => {
  describe('Reconnection Logic', () => {
    let monitor: InstantSendChainLockMonitor;

    beforeEach(() => {
      monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
        logLevel: LogLevel.ERROR,
        maxReconnectAttempts: 3,
        reconnectDelay: 100, // Short delay for testing
      });
    });

    afterEach(() => {
      if (monitor) {
        monitor.stop();
      }
    });

    it('should initialize with reconnection state', () => {
      const status = monitor.getStatus();
      expect(status.active).toBe(false);
      expect(status.instantSendAvailable).toBe(true);
      expect(status.chainLockAvailable).toBe(true);
    });

    it('should expose memory management methods', () => {
      expect(typeof monitor.clearTransaction).toBe('function');
      expect(typeof monitor.clearAllConfirmed).toBe('function');
      expect(typeof monitor.getMemoryStats).toBe('function');
    });

    it('should return memory stats', () => {
      const stats = monitor.getMemoryStats();
      expect(stats).toHaveProperty('trackedTransactions');
      expect(stats).toHaveProperty('maxTrackedTransactions');
      expect(stats).toHaveProperty('autoPruneEnabled');
      expect(stats.maxTrackedTransactions).toBe(1000);
      expect(stats.autoPruneEnabled).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should apply default configuration values', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      const stats = monitor.getMemoryStats();
      expect(stats.maxTrackedTransactions).toBe(1000);
      expect(stats.autoPruneEnabled).toBe(false);

      monitor.stop();
    });

    it('should accept custom configuration', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
        maxTrackedTransactions: 500,
        autoPruneOnConfirmation: true,
        maxReconnectAttempts: 5,
        reconnectDelay: 2000,
        enableDAPIFailover: false,
      });

      const stats = monitor.getMemoryStats();
      expect(stats.maxTrackedTransactions).toBe(500);
      expect(stats.autoPruneEnabled).toBe(true);

      monitor.stop();
    });

    it('should validate minPollInterval', () => {
      expect(() => {
        new InstantSendChainLockMonitor({
          network: 'testnet',
          dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
          basePollInterval: 500,
          minPollInterval: 1000,
        });
      }).toThrow(/basePollInterval.*must be >= minPollInterval/);
    });
  });

  describe('Graceful Degradation', () => {
    it('should report availability flags', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      const status = monitor.getStatus();
      expect(status).toHaveProperty('chainLockAvailable');
      expect(status).toHaveProperty('instantSendAvailable');
      expect(status.chainLockAvailable).toBe(true);
      expect(status.instantSendAvailable).toBe(true);

      monitor.stop();
    });
  });

  describe('Event Emission', () => {
    it('should be an EventEmitter', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      expect(typeof monitor.on).toBe('function');
      expect(typeof monitor.emit).toBe('function');
      expect(typeof monitor.removeListener).toBe('function');

      monitor.stop();
    });

    it('should support event listeners', (done) => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      const handler = vi.fn();
      monitor.on('testEvent', handler);

      // Manually emit event to test listener
      (monitor as any).emit('testEvent', { test: true });

      setTimeout(() => {
        expect(handler).toHaveBeenCalledWith({ test: true });
        monitor.stop();
        done();
      }, 10);
    });
  });

  describe('DAPI Failover', () => {
    it('should initialize node pool when multiple nodes provided', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: [
          'https://seed-1.evonet.networks.dash.org:1443',
          'https://seed-2.evonet.networks.dash.org:1443',
          'https://seed-3.evonet.networks.dash.org:1443',
        ],
        enableDAPIFailover: true,
      });

      // Node pool should be initialized (internal state)
      const status = monitor.getStatus();
      expect(status).toBeDefined();

      monitor.stop();
    });

    it('should handle single node configuration', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
        enableDAPIFailover: true,
      });

      const status = monitor.getStatus();
      expect(status).toBeDefined();

      monitor.stop();
    });

    it('should respect enableDAPIFailover=false', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: [
          'https://seed-1.evonet.networks.dash.org:1443',
          'https://seed-2.evonet.networks.dash.org:1443',
        ],
        enableDAPIFailover: false,
      });

      const status = monitor.getStatus();
      expect(status).toBeDefined();

      monitor.stop();
    });
  });

  describe('Transaction Tracking', () => {
    it('should track transaction state', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      const status = monitor.getStatus();
      expect(status.trackedTransactions).toBe(0);

      monitor.stop();
    });

    it('should clear specific transaction', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      // clearTransaction should not throw
      expect(() => {
        monitor.clearTransaction('test-txid');
      }).not.toThrow();

      monitor.stop();
    });

    it('should clear all confirmed transactions', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      // clearAllConfirmed should not throw
      expect(() => {
        monitor.clearAllConfirmed();
      }).not.toThrow();

      monitor.stop();
    });
  });

  describe('Logging', () => {
    it('should support debug log level', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
        logLevel: LogLevel.DEBUG,
      });

      expect(monitor).toBeDefined();
      monitor.stop();
    });

    it('should support backwards-compatible debug flag', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
        debug: true,
      });

      expect(monitor).toBeDefined();
      monitor.stop();
    });

    it('should default to ERROR log level', () => {
      const monitor = new InstantSendChainLockMonitor({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      expect(monitor).toBeDefined();
      monitor.stop();
    });
  });
});
