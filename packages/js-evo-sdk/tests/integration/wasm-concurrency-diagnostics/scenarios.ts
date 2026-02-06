/**
 * Test Scenarios for WASM Concurrency Diagnostics
 *
 * Defines test cases to systematically identify which patterns work
 * and which trigger "already locked to a reader" errors in the WASM SDK.
 */

export interface TestScenario {
  name: string;
  description: string;
  operationSequence: OperationType[];
  parallelism: 'sequential' | 'concurrent';
  useWorker: boolean;
  workerStrategy?: 'fresh-per-op' | 'reusable' | 'queue' | 'pool';
  poolSize?: number;
  resetWasmBetweenOps?: boolean;
  createNewSdkBetweenOps?: boolean;
  timeout: number;
}

export type OperationType = 'fetch' | 'fetch-with-proof' | 'fetch-unproved' | 'getKeys';

const TIMEOUT_DEFAULT = 60000;

/**
 * Core Test Cases - Each tests a specific aspect of WASM locking behavior
 */
export const CORE_TEST_CASES: Record<string, () => TestScenario> = {
  /**
   * Case 1: Single SDK Sequential Operations
   * Goal: Test if operations on same SDK instance work when sequential
   */
  case1_sequential_single_sdk: () => ({
    name: 'Case 1: Sequential Operations - Single SDK Instance',
    description: 'Two fetch operations on same SDK instance, executed sequentially',
    operationSequence: ['fetch', 'fetch'],
    parallelism: 'sequential',
    useWorker: false,
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 2: Fresh Worker per Operation
   * Goal: Test if each operation in fresh worker process works
   */
  case2_fresh_worker_per_op: () => ({
    name: 'Case 2: Fresh Worker Per Operation',
    description: 'Two fetch operations, each in fresh worker process',
    operationSequence: ['fetch', 'fetch'],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'fresh-per-op',
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 3: Persistent Worker Sequential Operations
   * Goal: Test if multiple sequential operations in single reusable worker succeeds
   */
  case3_persistent_worker_sequential: () => ({
    name: 'Case 3: Persistent Worker - Sequential Operations',
    description: 'Five sequential operations in single persistent worker with same SDK instance',
    operationSequence: ['fetch', 'fetch', 'getKeys', 'fetch-unproved', 'fetch'],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'reusable',
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 4: SDK Cleanup and Reinitialize
   * Goal: Test if resetWasmSdk() fully releases locks
   */
  case4_sdk_cleanup_reinit: () => ({
    name: 'Case 4: SDK Cleanup and Reinitialization',
    description: 'Fetch, reset WASM, fetch again - test if cleanup releases locks',
    operationSequence: ['fetch', 'fetch'],
    parallelism: 'sequential',
    useWorker: false,
    resetWasmBetweenOps: true,
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 5: Multiple SDK Instances in Same Process
   * Goal: Test if separate SDK instances have independent or shared locks
   */
  case5_multiple_sdk_instances: () => ({
    name: 'Case 5: Multiple SDK Instances - Same Process',
    description: 'Two fetch operations on different SDK instances, concurrent',
    operationSequence: ['fetch', 'fetch'],
    parallelism: 'concurrent',
    useWorker: false,
    createNewSdkBetweenOps: true,
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 6: Operation Sequence Variations
   * Goal: Test if lock behavior depends on operation type or sequence
   */
  case6_operation_sequences: () => ({
    name: 'Case 6: Operation Sequence Variations',
    description: 'Different operation types in sequence: fetch, getKeys, fetch-with-proof',
    operationSequence: ['fetch', 'getKeys', 'fetch-with-proof'],
    parallelism: 'sequential',
    useWorker: false,
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 7: WASM Module Initialization Patterns
   * Goal: Test which step creates or releases locks
   */
  case7_wasm_init_patterns: () => ({
    name: 'Case 7: WASM Module Initialization Patterns',
    description: 'Test different WASM initialization approaches',
    operationSequence: ['fetch', 'fetch'],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'reusable',
    timeout: TIMEOUT_DEFAULT,
  }),

  /**
   * Case 8: Concurrent Operations via Promise.all()
   * Goal: Test lock behavior when operations are truly concurrent
   */
  case8_concurrent_promises: () => ({
    name: 'Case 8: Concurrent Operations - Promise.all()',
    description: 'Three fetch operations run concurrently with Promise.all()',
    operationSequence: ['fetch', 'fetch', 'fetch'],
    parallelism: 'concurrent',
    useWorker: false,
    timeout: TIMEOUT_DEFAULT,
  }),
};

/**
 * Worker Pattern Variants - Different worker strategies to test
 */
export const WORKER_VARIANTS: Record<string, () => TestScenario> = {
  /**
   * Variant A: Queue Pattern
   * Single worker receives array of operations, executes sequentially
   */
  variantA_queue: () => ({
    name: 'Variant A: Queue Pattern',
    description: 'Worker with operation queue - execute 10 operations sequentially',
    operationSequence: Array(10).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'queue',
    timeout: TIMEOUT_DEFAULT * 2,
  }),

  /**
   * Variant B: Pool Pattern
   * Pool of multiple SDK instances, round-robin between them
   */
  variantB_pool_2: () => ({
    name: 'Variant B: SDK Instance Pool (Size 2)',
    description: 'Worker with pool of 2 SDK instances, alternate between them',
    operationSequence: Array(10).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'pool',
    poolSize: 2,
    timeout: TIMEOUT_DEFAULT * 2,
  }),

  variantB_pool_5: () => ({
    name: 'Variant B: SDK Instance Pool (Size 5)',
    description: 'Worker with pool of 5 SDK instances, round-robin',
    operationSequence: Array(10).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'pool',
    poolSize: 5,
    timeout: TIMEOUT_DEFAULT * 2,
  }),

  /**
   * Variant C: Fresh Instance Per Operation
   * Create new SDK for each operation, full cleanup between
   */
  variantC_fresh_instance: () => ({
    name: 'Variant C: Fresh SDK Instance Per Operation',
    description: 'Create new SDK instance and cleanup for each of 10 operations',
    operationSequence: Array(10).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'fresh-per-op',
    timeout: TIMEOUT_DEFAULT * 2,
  }),

  /**
   * Variant D: Lazy SDK Creation
   * SDK created only on first operation, reused for all subsequent
   */
  variantD_lazy_sdk: () => ({
    name: 'Variant D: Lazy SDK Creation',
    description: 'SDK created on first operation, reused for all 10 operations',
    operationSequence: Array(10).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'reusable',
    timeout: TIMEOUT_DEFAULT * 2,
  }),
};

/**
 * Solution Testing Patterns
 * These test actual solution implementations
 */
export const SOLUTION_PATTERNS: Record<string, () => TestScenario> = {
  /**
   * Solution A: Single Worker + Operation Queue
   */
  solutionA_single_worker_queue: () => ({
    name: 'Solution A: Single Worker + Operation Queue',
    description: 'Queue 50 operations, execute sequentially in persistent worker',
    operationSequence: Array(50).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'queue',
    timeout: TIMEOUT_DEFAULT * 5,
  }),

  /**
   * Solution B: SDK Instance Pool
   */
  solutionB_instance_pool: () => ({
    name: 'Solution B: SDK Instance Pool',
    description: 'Pool of 3 SDK instances, round-robin 30 operations',
    operationSequence: Array(30).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'pool',
    poolSize: 3,
    timeout: TIMEOUT_DEFAULT * 3,
  }),

  /**
   * Solution C: Reusable Worker Pattern
   */
  solutionC_reusable_worker: () => ({
    name: 'Solution C: Reusable Worker Pattern',
    description: 'Persistent worker stays alive, handles 100 sequential operations',
    operationSequence: Array(100).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'reusable',
    timeout: TIMEOUT_DEFAULT * 10,
  }),

  /**
   * Solution D: Batch Operations
   */
  solutionD_batch_operations: () => ({
    name: 'Solution D: Batch Operations',
    description: 'Client sends batch of 25 fetches, worker executes sequentially',
    operationSequence: Array(25).fill('fetch') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'queue',
    timeout: TIMEOUT_DEFAULT * 2,
  }),
};

/**
 * Integration Test Scenarios - Real-world usage patterns
 */
export const INTEGRATION_SCENARIOS: Record<string, () => TestScenario> = {
  /**
   * Real Scenario 1: Parallel Test Suite
   */
  realScenario1_parallel_tests: () => ({
    name: 'Real Scenario 1: Parallel Test Suite',
    description: 'Simulate 10 parallel tests each calling fetch()',
    operationSequence: Array(10).fill('fetch') as OperationType[],
    parallelism: 'concurrent',
    useWorker: true,
    workerStrategy: 'queue',
    timeout: TIMEOUT_DEFAULT * 2,
  }),

  /**
   * Real Scenario 2: Batch Identity Discovery
   */
  realScenario2_batch_discovery: () => ({
    name: 'Real Scenario 2: Batch Identity Discovery',
    description: 'Batch of 50 discovers (getKeys operations)',
    operationSequence: Array(50).fill('getKeys') as OperationType[],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'queue',
    timeout: TIMEOUT_DEFAULT * 5,
  }),

  /**
   * Real Scenario 3: Mixed Operations
   */
  realScenario3_mixed_operations: () => ({
    name: 'Real Scenario 3: Mixed Operations',
    description: 'Create, fetch, getKeys, fetch-with-proof sequence',
    operationSequence: ['fetch', 'getKeys', 'fetch-with-proof', 'fetch-unproved', 'fetch'],
    parallelism: 'sequential',
    useWorker: true,
    workerStrategy: 'queue',
    timeout: TIMEOUT_DEFAULT,
  }),
};

/**
 * Get all test scenarios
 */
export function getAllTestScenarios(): TestScenario[] {
  return [
    ...Object.values(CORE_TEST_CASES).map((fn) => fn()),
    ...Object.values(WORKER_VARIANTS).map((fn) => fn()),
    ...Object.values(SOLUTION_PATTERNS).map((fn) => fn()),
    ...Object.values(INTEGRATION_SCENARIOS).map((fn) => fn()),
  ];
}

/**
 * Get test scenarios by category
 */
export function getTestScenariosByCategory(
  category: 'core' | 'variants' | 'solutions' | 'integration'
): TestScenario[] {
  switch (category) {
    case 'core':
      return Object.values(CORE_TEST_CASES).map((fn) => fn());
    case 'variants':
      return Object.values(WORKER_VARIANTS).map((fn) => fn());
    case 'solutions':
      return Object.values(SOLUTION_PATTERNS).map((fn) => fn());
    case 'integration':
      return Object.values(INTEGRATION_SCENARIOS).map((fn) => fn());
    default:
      return [];
  }
}
