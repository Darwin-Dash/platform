/**
 * Unit tests for MultiNodeIsHunter
 *
 * Tests multi-node parallel stream management for InstantSend hex hunting.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MultiNodeIsHunter } from '../../../src/monitoring/MultiNodeIsHunter.js';
import { NodeHealthTracker } from '../../../src/monitoring/NodeHealthTracker.js';
import { EventEmitter } from 'events';

// Mock dashcore
vi.mock('@dashevo/dashcore-lib', () => ({
  default: {
    InstantLock: {
      fromBuffer: (buf: Buffer) => {
        // Parse mock IS lock buffer: first 32 bytes are txid
        const txid = buf.slice(0, 32);
        return { txid };
      },
    },
  },
}));

// Create a mock bloom filter that can be reused
const createMockBloomFilter = () => ({
  toObject: () => ({
    vData: [],
    nHashFuncs: 3,
    nTweak: 0,
    nFlags: 0,
  }),
});

describe('MultiNodeIsHunter', () => {
  let hunter: MultiNodeIsHunter;
  let healthTracker: NodeHealthTracker;

  beforeEach(() => {
    healthTracker = new NodeHealthTracker();
    hunter = new MultiNodeIsHunter(healthTracker, {
      network: 'testnet',
      nodeCount: 3,
      timeoutMs: 1000, // Short timeout for tests
      scanDepth: 50,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Constructor and Configuration
  // ============================================================================
  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultHunter = new MultiNodeIsHunter(healthTracker, {
        network: 'testnet',
      });
      expect(defaultHunter).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customHunter = new MultiNodeIsHunter(healthTracker, {
        network: 'mainnet',
        nodeCount: 5,
        timeoutMs: 5000,
        scanDepth: 100,
      });
      expect(customHunter).toBeDefined();
    });
  });

  // ============================================================================
  // Health Stats
  // ============================================================================
  describe('Health Stats', () => {
    it('should return health stats from tracker', () => {
      // Record some health data
      healthTracker.recordSuccess('node1.example.com:443');
      healthTracker.recordSuccess('node2.example.com:443');
      healthTracker.blacklist('node3.example.com:443');

      const stats = hunter.getHealthStats();

      expect(stats.totalTracked).toBe(3);
      expect(stats.healthy).toBe(2);
      expect(stats.blacklisted).toBe(1);
      expect(stats.nodeStats.size).toBe(3);
    });

    it('should return empty stats when no nodes tracked', () => {
      const stats = hunter.getHealthStats();

      expect(stats.totalTracked).toBe(0);
      expect(stats.healthy).toBe(0);
      expect(stats.blacklisted).toBe(0);
    });
  });

  // ============================================================================
  // Hunt Result Structure
  // ============================================================================
  describe('Hunt Result Structure', () => {
    it('should return proper result structure on timeout with no address provider', async () => {
      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockReturnValue({
            [Symbol.asyncIterator]: () => ({
              next: () => new Promise(() => {}), // Never resolves
            }),
            cancel: vi.fn(),
            on: vi.fn(),
          }),
        },
        dapiAddressProvider: null, // No address provider
      };

      const result = await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        ['yTestAddress123'],
        createMockBloomFilter()
      );

      expect(result.found).toBe(false);
      expect(result.instantLockHex).toBeNull();
      expect(result.winningNode).toBeNull();
      expect(result.failedNodes).toEqual([]);
      expect(typeof result.elapsedMs).toBe('number');
    });

    it('should return proper result structure on timeout with empty addresses', async () => {
      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue([]),
        },
      };

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      const result = await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        ['yTestAddress123'],
        createMockBloomFilter()
      );

      expect(result.found).toBe(false);
      expect(result.instantLockHex).toBeNull();
      expect(result.winningNode).toBeNull();
    });
  });

  // ============================================================================
  // Node Address Discovery
  // ============================================================================
  describe('Node Address Discovery', () => {
    it('should handle address provider with getAllAddresses', async () => {
      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
        { toString: () => 'node2.example.com:443' },
        { toString: () => 'node3.example.com:443' },
        { toString: () => 'node4.example.com:443' },
      ];

      const mockAddressProvider = {
        getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
      };

      const mockStream = new EventEmitter();
      (mockStream as any).cancel = vi.fn();

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockReturnValue(Promise.resolve(mockStream)),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      // Immediately emit end to avoid timeout
      setTimeout(() => mockStream.emit('end'), 10);

      const result = await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );

      // Should have tried to get addresses
      expect(mockAddressProvider.getAllAddresses).toHaveBeenCalled();
    });

    it('should filter out blacklisted nodes', async () => {
      // Blacklist node2
      healthTracker.blacklist('node2.example.com:443');

      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
        { toString: () => 'node2.example.com:443' },
        { toString: () => 'node3.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockStream = new EventEmitter();
      (mockStream as any).cancel = vi.fn();

      let subscribeCallCount = 0;
      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockImplementation(() => {
            subscribeCallCount++;
            const stream = new EventEmitter();
            (stream as any).cancel = vi.fn();
            setTimeout(() => stream.emit('end'), 10);
            return Promise.resolve(stream);
          }),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );

      // Should have opened 2 streams (3 nodes minus 1 blacklisted, but limited to nodeCount=3)
      // Actually, the mock returns 3 addresses, 1 is blacklisted, so 2 healthy nodes
      expect(subscribeCallCount).toBe(2);
    });

    it('should prioritize nodes with successful history', async () => {
      // Record success for node3
      healthTracker.recordSuccess('node3.example.com:443');
      healthTracker.recordSuccess('node3.example.com:443');

      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
        { toString: () => 'node2.example.com:443' },
        { toString: () => 'node3.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      // Track which nodes were used
      const usedNodes: string[] = [];

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockImplementation(() => {
            const stream = new EventEmitter();
            (stream as any).cancel = vi.fn();
            setTimeout(() => stream.emit('end'), 10);
            return Promise.resolve(stream);
          }),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );

      // Verify node3 has the highest success count
      const stats = healthTracker.getAllStats();
      expect(stats.get('node3.example.com:443')?.successes).toBe(2);
    });
  });

  // ============================================================================
  // Stream Timeout Behavior
  // ============================================================================
  describe('Stream Timeout Behavior', () => {
    it('should timeout when no IS hex is delivered', async () => {
      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockStream = new EventEmitter();
      (mockStream as any).cancel = vi.fn();

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockReturnValue(Promise.resolve(mockStream)),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      const startTime = Date.now();
      const result = await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );
      const elapsed = Date.now() - startTime;

      expect(result.found).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(900); // Close to 1000ms timeout
      expect(elapsed).toBeLessThan(2000);
    });

    it('should not blacklist nodes on timeout (could be tx propagation delay)', async () => {
      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
        { toString: () => 'node2.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockImplementation(() => {
            const stream = new EventEmitter();
            (stream as any).cancel = vi.fn();
            // Never emit anything - will timeout
            return Promise.resolve(stream);
          }),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );

      // Nodes should NOT be blacklisted on timeout
      expect(healthTracker.isBlacklisted('node1.example.com:443')).toBe(false);
      expect(healthTracker.isBlacklisted('node2.example.com:443')).toBe(false);
    });
  });

  // ============================================================================
  // IS Hex Detection
  // ============================================================================
  describe('IS Hex Detection', () => {
    it('should detect IS hex from stream message', async () => {
      const targetTxid = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
      const txidBuffer = Buffer.from(targetTxid, 'hex');
      const isLockBuffer = Buffer.concat([txidBuffer, Buffer.alloc(32)]); // txid + signature placeholder

      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockStream = new EventEmitter();
      (mockStream as any).cancel = vi.fn();

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockReturnValue(Promise.resolve(mockStream)),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      // Emit IS lock after a short delay
      setTimeout(() => {
        mockStream.emit('data', {
          getInstantSendLockMessages: () => ({
            getMessagesList: () => [isLockBuffer],
          }),
        });
      }, 50);

      const result = await hunter.huntIsHex(
        mockDapiClient,
        targetTxid,
        ['yTestAddress'],
        createMockBloomFilter()
      );

      expect(result.found).toBe(true);
      expect(result.instantLockHex).toBe(isLockBuffer.toString('hex'));
      expect(result.winningNode).toBe('node1.example.com:443');
    });

    it('should record success for winning node', async () => {
      const targetTxid = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
      const txidBuffer = Buffer.from(targetTxid, 'hex');
      const isLockBuffer = Buffer.concat([txidBuffer, Buffer.alloc(32)]);

      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockStream = new EventEmitter();
      (mockStream as any).cancel = vi.fn();

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockReturnValue(Promise.resolve(mockStream)),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      setTimeout(() => {
        mockStream.emit('data', {
          getInstantSendLockMessages: () => ({
            getMessagesList: () => [isLockBuffer],
          }),
        });
      }, 50);

      await hunter.huntIsHex(
        mockDapiClient,
        targetTxid,
        ['yTestAddress'],
        createMockBloomFilter()
      );

      // Winning node should have success recorded
      const stats = healthTracker.getNodeStats('node1.example.com:443');
      expect(stats?.successes).toBe(1);
    });

    it('should blacklist non-winning nodes when winner is found', async () => {
      const targetTxid = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
      const txidBuffer = Buffer.from(targetTxid, 'hex');
      const isLockBuffer = Buffer.concat([txidBuffer, Buffer.alloc(32)]);

      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
        { toString: () => 'node2.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      // Track which stream delivered IS
      let winningAddress: string | null = null;
      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockImplementation(() => {
            const stream = new EventEmitter();
            (stream as any).cancel = vi.fn();

            // Only first stream delivers IS
            if (!winningAddress) {
              winningAddress = 'first';
              setTimeout(() => {
                stream.emit('data', {
                  getInstantSendLockMessages: () => ({
                    getMessagesList: () => [isLockBuffer],
                  }),
                });
              }, 50);
            }

            return Promise.resolve(stream);
          }),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      const result = await hunter.huntIsHex(
        mockDapiClient,
        targetTxid,
        ['yTestAddress'],
        createMockBloomFilter()
      );

      expect(result.found).toBe(true);
      // There should be a winning node
      expect(result.winningNode).toBeTruthy();
      expect(['node1.example.com:443', 'node2.example.com:443']).toContain(result.winningNode);

      // Non-winning node should be recorded as failed
      expect(result.failedNodes.length).toBe(1);
      expect(result.failedNodes[0]).not.toBe(result.winningNode);
    });
  });

  // ============================================================================
  // Connection Error Handling
  // ============================================================================
  describe('Connection Error Handling', () => {
    it('should handle stream connection errors gracefully', async () => {
      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockRejectedValue(new Error('Connection failed')),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      const result = await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );

      expect(result.found).toBe(false);
      expect(result.failedNodes).toContain('node1.example.com:443');
    });

    it('should handle stream errors during processing', async () => {
      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      const mockStream = new EventEmitter();
      (mockStream as any).cancel = vi.fn();

      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockReturnValue(Promise.resolve(mockStream)),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      // Emit error after stream opens
      setTimeout(() => {
        mockStream.emit('error', new Error('Stream error'));
      }, 50);

      const result = await hunter.huntIsHex(
        mockDapiClient,
        'abcd1234',
        ['yTestAddress'],
        createMockBloomFilter()
      );

      // Should timeout, error is handled gracefully
      expect(result.found).toBe(false);
    });
  });

  // ============================================================================
  // Race Condition Handling
  // ============================================================================
  describe('Race Condition Handling', () => {
    it('should resolve as soon as first IS hex arrives', async () => {
      const targetTxid = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
      const txidBuffer = Buffer.from(targetTxid, 'hex');
      const isLockBuffer = Buffer.concat([txidBuffer, Buffer.alloc(32)]);

      const mockAddresses = [
        { toString: () => 'node1.example.com:443' },
        { toString: () => 'node2.example.com:443' },
      ];

      const mockAddressProvider = {
        listDAPIAddressProvider: {
          getAllAddresses: vi.fn().mockReturnValue(mockAddresses),
        },
      };

      let firstStreamResolved = false;
      const mockDapiClient = {
        core: {
          getBestBlockHeight: vi.fn().mockResolvedValue(1000),
          subscribeToTransactionsWithProofs: vi.fn().mockImplementation(() => {
            const stream = new EventEmitter();
            (stream as any).cancel = vi.fn();

            // Both streams will try to deliver, but first one wins
            setTimeout(() => {
              if (!firstStreamResolved) {
                firstStreamResolved = true;
                stream.emit('data', {
                  getInstantSendLockMessages: () => ({
                    getMessagesList: () => [isLockBuffer],
                  }),
                });
              }
            }, 50);

            return Promise.resolve(stream);
          }),
        },
        dapiAddressProvider: mockAddressProvider,
      };

      const startTime = Date.now();
      const result = await hunter.huntIsHex(
        mockDapiClient,
        targetTxid,
        ['yTestAddress'],
        createMockBloomFilter()
      );
      const elapsed = Date.now() - startTime;

      expect(result.found).toBe(true);
      // Should resolve quickly (well before timeout)
      expect(elapsed).toBeLessThan(500);
      // Should have a winning node
      expect(result.winningNode).toBeTruthy();
      expect(['node1.example.com:443', 'node2.example.com:443']).toContain(result.winningNode);
    });
  });
});
