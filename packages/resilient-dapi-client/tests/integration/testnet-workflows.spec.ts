/**
 * Multi-Operation Workflow Tests - Resilience Validation
 *
 * Tests complex multi-step workflows that mirror real-world application patterns.
 * Inspired by transaction-finder's sync flows and identity management patterns.
 *
 * These tests validate that the ResilientDAPIClient can handle:
 * - Multi-step workflows with failures at different stages
 * - State management across multiple operations
 * - Recovery from partial completion scenarios
 * - Realistic application usage patterns
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ResilientDAPIClient } from '../../src/ResilientDAPIClient.js';
import { failureLogger } from './helpers/failure-logger.js';
import { metricsCollector, measureLatency } from './helpers/metrics-collector.js';
import { createMockDAPIClient, MockFailureScenarios, type ControllableMockDAPIClient } from './helpers/controllable-mock-client.js';

describe('Multi-Operation Workflows - Mock Client', () => {
  let client: ResilientDAPIClient;
  let mockClient: ControllableMockDAPIClient;

  beforeAll(() => {
    mockClient = createMockDAPIClient();

    client = new ResilientDAPIClient(mockClient as any, {
      maxRetryAttempts: 10,
      retryBaseDelay: 1000,
      maxRetryDelay: 30000,
      logLevel: 'info',
    });

    failureLogger.startTestRun();
    metricsCollector.start();
  });

  afterAll(() => {
    metricsCollector.stop();
    client.destroy();

    const summary = failureLogger.getSummary();
    const stats = failureLogger.getStatistics();
    const mockStats = mockClient.getStats();

    console.log('\n=== Workflow Test Summary ===');
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.log(`Successful: ${summary.successfulOperations}`);
    console.log(`Success Rate: ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}%`);
    console.log(`Total Retries: ${stats.totalRetries}`);
    console.log(`Total Failovers: ${stats.totalFailovers}`);
    console.log(`\nMock Client Stats:`);
    console.log(`  Total Calls: ${mockStats.totalCalls}`);
    console.log(`  Total Failures Injected: ${mockStats.totalFailures}`);
  });

  beforeEach(() => {
    mockClient.clearFailures();
    mockClient.clearCallCounts();
  });

  describe('Identity Creation Workflow', () => {
    it('should complete full identity workflow: getIdentity → getIdentityNonce → broadcastStateTransition → waitForResult', async () => {
      const identityId = 'test-identity-12345';

      // Execute complete workflow
      const startTime = Date.now();

      // Step 1: Get identity (check if exists)
      const identity = await measureLatency('getIdentity', async () => {
        return await client.platform.getIdentity(identityId);
      });

      expect(identity).toBeDefined();
      expect(identity.balance).toBeGreaterThanOrEqual(0);
      failureLogger.recordOperation(true);

      // Step 2: Get identity nonce (needed for state transition)
      const nonce = await measureLatency('getIdentityNonce', async () => {
        return await client.platform.getIdentityNonce(identityId);
      });

      expect(nonce).toBeGreaterThanOrEqual(0);
      failureLogger.recordOperation(true);

      // Step 3: Broadcast state transition
      const stateTransition = { type: 'identityUpdate', identityId, nonce };
      const hash = await measureLatency('broadcastStateTransition', async () => {
        return await client.platform.broadcastStateTransition(stateTransition);
      });

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      failureLogger.recordOperation(true);

      // Step 4: Wait for state transition result
      const result = await measureLatency('waitForStateTransitionResult', async () => {
        return await client.platform.waitForStateTransitionResult(hash);
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('confirmed');
      expect(result.blockHeight).toBeGreaterThan(0);
      failureLogger.recordOperation(true);

      const totalTime = Date.now() - startTime;
      console.log(`  Complete identity workflow took ${totalTime}ms`);

      // Verify all steps were called
      expect(mockClient.getCallCount('platform', 'getIdentity')).toBe(1);
      expect(mockClient.getCallCount('platform', 'getIdentityNonce')).toBe(1);
      expect(mockClient.getCallCount('platform', 'broadcastStateTransition')).toBe(1);
      expect(mockClient.getCallCount('platform', 'waitForStateTransitionResult')).toBe(1);
    }, 60000);

    it('should degrade gracefully when identity fetch fails initially', async () => {
      const identityId = 'test-identity-fail-retry';

      // Inject failure on first identity fetch
      mockClient.injectFailure(MockFailureScenarios.transientTimeout('getIdentity', 1));

      const retryEvents: any[] = [];
      const degradationEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });
      client.on('degradation', (data) => {
        degradationEvents.push(data);
      });

      // Execute workflow - first call degrades, subsequent calls should work after reset
      const identity = await client.platform.getIdentity(identityId);

      // First call degraded (returns null)
      expect(identity).toBeNull();
      expect(retryEvents.length).toBe(1); // 1 retry event before degradation
      expect(degradationEvents.length).toBe(1); // Platform degraded

      // Verify degradation state
      const status = client.getStatus();
      expect(status.platformAvailable).toBe(false);

      // Reset resilience to simulate recovery
      client.resetResilience();

      // Now operations should work
      const nonce = await client.platform.getIdentityNonce(identityId);
      const hash = await client.platform.broadcastStateTransition({ identityId, nonce });
      const result = await client.platform.waitForStateTransitionResult(hash);

      expect(nonce).toBeGreaterThanOrEqual(0);
      expect(result.status).toBe('confirmed');

      // Verify call counts: 1 failed getIdentity + successful subsequent calls
      expect(mockClient.getCallCount('platform', 'getIdentity')).toBe(1);
      expect(mockClient.getCallCount('platform', 'getIdentityNonce')).toBe(1);
      expect(mockClient.getCallCount('platform', 'broadcastStateTransition')).toBe(1);

      failureLogger.recordOperation(false); // First operation degraded
      failureLogger.recordOperation(true);
      failureLogger.recordOperation(true);
      failureLogger.recordOperation(true);

      client.removeAllListeners('retry');
      client.removeAllListeners('degradation');
    }, 90000);

    it('should handle failures at each workflow step with graceful degradation', async () => {
      const identityId = 'test-identity-multi-step-failures';

      // Inject 1 failure - first platform operation will degrade
      mockClient.injectFailure({ method: 'getIdentity', failureType: 'timeout', count: 1 });

      const retryEvents: string[] = [];
      const degradationEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data.namespace + '.' + data.method);
        metricsCollector.incrementEvent('retries');
      });
      client.on('degradation', (data) => {
        degradationEvents.push(data);
      });

      const startTime = Date.now();

      // First operation degrades
      const identity = await client.platform.getIdentity(identityId);
      expect(identity).toBeNull(); // Degraded
      expect(degradationEvents.length).toBe(1);

      // Reset to continue workflow
      client.resetResilience();

      // Now subsequent operations should work
      const nonce = await client.platform.getIdentityNonce(identityId);
      const hash = await client.platform.broadcastStateTransition({ identityId, nonce });
      const result = await client.platform.waitForStateTransitionResult(hash);

      const totalTime = Date.now() - startTime;

      expect(nonce).toBeGreaterThanOrEqual(0);
      expect(result.status).toBe('confirmed');

      // Verify each step called once (no retries due to degradation)
      expect(mockClient.getCallCount('platform', 'getIdentity')).toBe(1); // 1 fail → degrade
      expect(mockClient.getCallCount('platform', 'getIdentityNonce')).toBe(1);
      expect(mockClient.getCallCount('platform', 'broadcastStateTransition')).toBe(1);
      expect(mockClient.getCallCount('platform', 'waitForStateTransitionResult')).toBe(1);

      console.log(`  Workflow with graceful degradation took ${totalTime}ms`);
      console.log(`  Retry events: ${retryEvents.join(', ')}`);
      console.log(`  Degradation events: ${degradationEvents.length}`);

      failureLogger.recordOperation(false); // First degraded
      failureLogger.recordOperation(true);
      failureLogger.recordOperation(true);
      failureLogger.recordOperation(true);

      client.removeAllListeners('retry');
      client.removeAllListeners('degradation');
    }, 120000);
  });

  describe('Transaction Discovery Workflow', () => {
    it('should complete block-by-block transaction discovery: getBestBlockHeight → getBlockByHeight (N blocks) → getTransaction', async () => {
      const startHeight = 2000000;
      const blockCount = 10;

      // Execute workflow
      const startTime = Date.now();

      // Step 1: Get current best block height
      const bestHeight = await measureLatency('getBestBlockHeight', async () => {
        return await client.core.getBestBlockHeight();
      });

      expect(bestHeight).toBeGreaterThan(0);
      failureLogger.recordOperation(true);

      // Step 2: Fetch blocks sequentially
      const blocks: Buffer[] = [];
      for (let height = startHeight; height < startHeight + blockCount; height++) {
        const block = await measureLatency('getBlockByHeight', async () => {
          return await client.core.getBlockByHeight(height);
        });

        blocks.push(block);
        failureLogger.recordOperation(true);
      }

      expect(blocks.length).toBe(blockCount);

      // Step 3: For each block, fetch a transaction (simplified - just 1 tx per block)
      const transactions: Buffer[] = [];
      for (let i = 0; i < blockCount; i++) {
        const tx = await measureLatency('getTransaction', async () => {
          return await client.core.getTransaction(`txid-${i}`);
        });

        transactions.push(tx);
        failureLogger.recordOperation(true);
      }

      expect(transactions.length).toBe(blockCount);

      const totalTime = Date.now() - startTime;
      console.log(`  Transaction discovery (${blockCount} blocks, ${blockCount} txs) took ${totalTime}ms`);

      // Verify operation counts
      expect(mockClient.getCallCount('core', 'getBestBlockHeight')).toBe(1);
      expect(mockClient.getCallCount('core', 'getBlockByHeight')).toBe(blockCount);
      expect(mockClient.getCallCount('core', 'getTransaction')).toBe(blockCount);
    }, 120000);

    it('should recover from failures during block fetching sequence', async () => {
      const startHeight = 2000000;
      const blockCount = 10;

      // Inject random failures during block fetching (fail on blocks 3 and 7)
      let blockCallCount = 0;
      mockClient.injectFailure({
        method: 'getBlockByHeight',
        failureType: 'timeout',
        probability: 1.0,
        count: 2, // Fail twice total
      });

      const retryEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });

      const startTime = Date.now();

      // Fetch blocks
      const blocks: Buffer[] = [];
      for (let height = startHeight; height < startHeight + blockCount; height++) {
        const block = await client.core.getBlockByHeight(height);
        blocks.push(block);
        failureLogger.recordOperation(true);
      }

      const totalTime = Date.now() - startTime;

      expect(blocks.length).toBe(blockCount);
      expect(retryEvents.length).toBe(2); // Should have retried 2 failed requests

      // Total calls = 10 blocks + 2 retries = 12
      expect(mockClient.getCallCount('core', 'getBlockByHeight')).toBe(blockCount + 2);

      console.log(`  Block fetching with 2 failures/retries took ${totalTime}ms`);

      client.removeAllListeners('retry');
    }, 120000);

    it('should handle cascading operations when early steps fail', async () => {
      const startHeight = 2000000;
      const blockCount = 5;

      // Inject failure on getBestBlockHeight (initial step)
      mockClient.injectFailure(MockFailureScenarios.transientTimeout('getBestBlockHeight', 1));

      const retryEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });

      const startTime = Date.now();

      // Step 1: Get best height (will retry once)
      const bestHeight = await client.core.getBestBlockHeight();
      expect(bestHeight).toBeGreaterThan(0);
      failureLogger.recordOperation(true);

      // Step 2: Fetch blocks (should all succeed now)
      const blocks: Buffer[] = [];
      for (let height = startHeight; height < startHeight + blockCount; height++) {
        const block = await client.core.getBlockByHeight(height);
        blocks.push(block);
        failureLogger.recordOperation(true);
      }

      expect(blocks.length).toBe(blockCount);
      expect(retryEvents.length).toBe(1); // Only the initial getBestBlockHeight retry

      // Verify correct number of calls
      expect(mockClient.getCallCount('core', 'getBestBlockHeight')).toBe(2); // 1 fail + 1 success
      expect(mockClient.getCallCount('core', 'getBlockByHeight')).toBe(blockCount);

      const totalTime = Date.now() - startTime;
      console.log(`  Cascading workflow with early retry took ${totalTime}ms`);

      client.removeAllListeners('retry');
    }, 120000);
  });

  describe('Document CRUD Workflow', () => {
    it('should complete document query workflow: getDataContract → getDocuments → process', async () => {
      const contractId = 'test-contract-12345';
      const documentType = 'testDocument';

      // Execute workflow
      const startTime = Date.now();

      // Step 1: Get data contract definition
      const contract = await measureLatency('getDataContract', async () => {
        return await client.platform.getDataContract(contractId);
      });

      expect(contract).toBeDefined();
      expect(contract.version).toBeGreaterThan(0);
      failureLogger.recordOperation(true);

      // Step 2: Query documents
      const documents = await measureLatency('getDocuments', async () => {
        return await client.platform.getDocuments(contractId, documentType, {});
      });

      expect(Array.isArray(documents)).toBe(true);
      failureLogger.recordOperation(true);

      // Step 3: Process documents (simplified - just count them)
      const documentCount = documents.length;

      const totalTime = Date.now() - startTime;
      console.log(`  Document query workflow returned ${documentCount} documents in ${totalTime}ms`);

      // Verify operations
      expect(mockClient.getCallCount('platform', 'getDataContract')).toBe(1);
      expect(mockClient.getCallCount('platform', 'getDocuments')).toBe(1);
    }, 60000);

    it('should complete document mutation workflow: getDataContract → getDocuments → broadcastStateTransition → verify', async () => {
      const contractId = 'test-contract-12345';
      const documentType = 'testDocument';

      // Mock response: return documents initially empty, then with 1 document after mutation
      mockClient.setResponse('platform', 'getDocuments', []);

      // Execute workflow
      const startTime = Date.now();

      // Step 1: Get contract
      const contract = await client.platform.getDataContract(contractId);
      expect(contract).toBeDefined();
      failureLogger.recordOperation(true);

      // Step 2: Query existing documents
      const existingDocs = await client.platform.getDocuments(contractId, documentType, {});
      expect(existingDocs.length).toBe(0);
      failureLogger.recordOperation(true);

      // Step 3: Create new document via state transition
      const stateTransition = {
        type: 'documentCreate',
        contractId,
        documentType,
        document: { name: 'Test Document', value: 42 },
      };

      const hash = await client.platform.broadcastStateTransition(stateTransition);
      expect(hash).toBeDefined();
      failureLogger.recordOperation(true);

      // Step 4: Wait for confirmation
      const result = await client.platform.waitForStateTransitionResult(hash);
      expect(result.status).toBe('confirmed');
      failureLogger.recordOperation(true);

      // Step 5: Verify by querying documents again
      mockClient.setResponse('platform', 'getDocuments', [
        { id: '1', name: 'Test Document', value: 42 },
      ]);

      const updatedDocs = await client.platform.getDocuments(contractId, documentType, {});
      expect(updatedDocs.length).toBe(1);
      failureLogger.recordOperation(true);

      const totalTime = Date.now() - startTime;
      console.log(`  Document mutation workflow took ${totalTime}ms`);

      // Verify operation sequence
      expect(mockClient.getCallCount('platform', 'getDataContract')).toBe(1);
      expect(mockClient.getCallCount('platform', 'getDocuments')).toBe(2); // Before and after
      expect(mockClient.getCallCount('platform', 'broadcastStateTransition')).toBe(1);
      expect(mockClient.getCallCount('platform', 'waitForStateTransitionResult')).toBe(1);
    }, 90000);

    it('should handle failure during document query with graceful degradation', async () => {
      const contractId = 'test-contract-fail';
      const documentType = 'testDocument';

      // Inject timeout on getDocuments (will cause degradation)
      mockClient.injectFailure(MockFailureScenarios.transientTimeout('getDocuments', 1));

      const retryEvents: any[] = [];
      const degradationEvents: any[] = [];
      client.on('retry', (data) => {
        retryEvents.push(data);
        metricsCollector.incrementEvent('retries');
      });
      client.on('degradation', (data) => {
        degradationEvents.push(data);
      });

      const startTime = Date.now();

      // Get contract (should succeed)
      const contract = await client.platform.getDataContract(contractId);
      expect(contract).toBeDefined();

      // Get documents (will degrade on failure)
      const documents = await client.platform.getDocuments(contractId, documentType, {});
      expect(documents).toBeNull(); // Degraded

      const totalTime = Date.now() - startTime;

      expect(retryEvents.length).toBe(1); // 1 retry event before degradation
      expect(degradationEvents.length).toBe(1); // Platform degraded
      expect(mockClient.getCallCount('platform', 'getDocuments')).toBe(1); // 1 fail → degrade

      console.log(`  Document query with graceful degradation took ${totalTime}ms`);

      failureLogger.recordOperation(true); // contract succeeded
      failureLogger.recordOperation(false); // documents degraded

      client.removeAllListeners('retry');
      client.removeAllListeners('degradation');
    }, 90000);

    it('should handle large document set retrieval', async () => {
      const contractId = 'test-contract-large';
      const documentType = 'testDocument';
      const documentCount = 100;

      // Mock large document response
      const largeDocs = Array.from({ length: documentCount }, (_, i) => ({
        id: `doc-${i}`,
        name: `Document ${i}`,
        value: i * 10,
      }));

      mockClient.setResponse('platform', 'getDocuments', largeDocs);

      const startTime = Date.now();

      // Get contract
      const contract = await client.platform.getDataContract(contractId);
      expect(contract).toBeDefined();

      // Get large document set
      const documents = await measureLatency('getDocuments', async () => {
        return await client.platform.getDocuments(contractId, documentType, {});
      });

      const totalTime = Date.now() - startTime;

      expect(documents.length).toBe(documentCount);
      console.log(`  Fetched ${documentCount} documents in ${totalTime}ms`);

      failureLogger.recordOperation(true);
      failureLogger.recordOperation(true);
    }, 60000);
  });

  describe('Workflow Metrics and Statistics', () => {
    it('should track workflow statistics with graceful degradation', async () => {
      const identityId = 'test-identity-stats';

      // Execute a workflow with some failures (platform operations degrade)
      mockClient.injectFailure({ method: 'getIdentity', failureType: 'timeout', count: 1 });

      const retryCount = { count: 0 };
      const degradationCount = { count: 0 };
      client.on('retry', () => {
        retryCount.count++;
      });
      client.on('degradation', () => {
        degradationCount.count++;
      });

      // Execute workflow - first operation degrades
      const identity = await client.platform.getIdentity(identityId);
      expect(identity).toBeNull(); // Degraded

      // Reset and continue
      client.resetResilience();
      await client.platform.getIdentityNonce(identityId);
      await client.platform.broadcastStateTransition({ identityId });
      await client.platform.waitForStateTransitionResult('hash');

      // Verify metrics: 4 operations, 1 failure → degradation (no retries)
      const mockStats = mockClient.getStats();
      expect(mockStats.totalCalls).toBe(4); // 4 operations (1 failed, 3 succeeded)
      expect(mockStats.totalFailures).toBe(1);
      expect(retryCount.count).toBe(1); // 1 retry event before degradation
      expect(degradationCount.count).toBe(1); // 1 degradation

      console.log(`  Workflow stats: ${mockStats.totalCalls} calls, ${mockStats.totalFailures} failures, ${degradationCount.count} degradations`);

      client.removeAllListeners('retry');
      client.removeAllListeners('degradation');
    }, 60000);
  });
});
