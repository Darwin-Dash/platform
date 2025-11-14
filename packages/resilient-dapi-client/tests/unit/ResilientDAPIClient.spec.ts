import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { LogLevel } from '../../src/types.js';

describe('ResilientDAPIClient', () => {
  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      const status = client.getStatus();
      expect(status).toHaveProperty('coreAvailable');
      expect(status).toHaveProperty('platformAvailable');
      expect(status).toHaveProperty('currentNode');
      expect(status).toHaveProperty('nodePoolSize');
      expect(status.coreAvailable).toBe(true);
      expect(status.platformAvailable).toBe(true);
    });

    it('should accept custom configuration', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
        logLevel: LogLevel.DEBUG,
        maxRetryAttempts: 5,
        retryBaseDelay: 2000,
        enableGracefulDegradation: false,
      });

      expect(client).toBeDefined();
      const status = client.getStatus();
      expect(status).toBeDefined();
    });

    it('should initialize node pool with multiple addresses', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: [
          'https://seed-1.evonet.networks.dash.org:1443',
          'https://seed-2.evonet.networks.dash.org:1443',
          'https://seed-3.evonet.networks.dash.org:1443',
        ],
      });

      const status = client.getStatus();
      expect(status.nodePoolSize).toBe(3);
      expect(status.currentNode).toBeTruthy();
    });
  });

  describe('Method Proxying', () => {
    it('should expose core methods', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      expect(client.core).toBeDefined();
      expect(typeof client.core.getBestBlockHeight).toBe('function');
      expect(typeof client.core.getBlockchainStatus).toBe('function');
    });

    it('should expose platform methods', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      expect(client.platform).toBeDefined();
      expect(typeof client.platform.getIdentity).toBe('function');
      expect(typeof client.platform.getDataContract).toBe('function');
    });
  });

  describe('EventEmitter', () => {
    it('should be an EventEmitter', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      expect(typeof client.on).toBe('function');
      expect(typeof client.emit).toBe('function');
      expect(typeof client.removeListener).toBe('function');
    });
  });

  describe('Status API', () => {
    it('should return status with all required fields', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: [
          'https://seed-1.evonet.networks.dash.org:1443',
          'https://seed-2.evonet.networks.dash.org:1443',
        ],
      });

      const status = client.getStatus();
      expect(status).toHaveProperty('coreAvailable');
      expect(status).toHaveProperty('platformAvailable');
      expect(status).toHaveProperty('currentNode');
      expect(status).toHaveProperty('nodePoolSize');
      expect(status).toHaveProperty('failureCount');

      expect(status.nodePoolSize).toBe(2);
      expect(status.failureCount).toBe(0);
    });
  });

  describe('Underlying Client Access', () => {
    it('should provide access to underlying DAPIClient', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      const underlying = client.getUnderlyingClient();
      expect(underlying).toBeDefined();
      expect(underlying.core).toBeDefined();
      expect(underlying.platform).toBeDefined();
    });
  });

  describe('Resilience Reset', () => {
    it('should expose resetResilience method', () => {
      const client = new ResilientDAPIClient({
        network: 'testnet',
        dapiAddresses: ['https://seed-1.evonet.networks.dash.org:1443'],
      });

      expect(typeof client.resetResilience).toBe('function');
      expect(() => client.resetResilience()).not.toThrow();
    });
  });
});
