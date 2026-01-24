/**
 * Identity Operation Configuration
 *
 * Centralized configuration for all identity operation parameters.
 * Extracted from facade.ts, wallet-coordinator.ts, and asset-lock-proof-manager.ts
 * to eliminate magic numbers and improve maintainability.
 *
 * Phase 3.1: Configuration Constants Extraction
 */

/**
 * DAPI Client Configuration
 *
 * Settings for DAPI server communication, retry logic, and timeouts.
 */
export const DAPI_CONFIG = {
  /** Request timeout in milliseconds (reduced for faster failover) */
  TIMEOUT_MS: 15000, // 15 seconds

  /** Maximum number of retries with different servers (reduced for faster failover) */
  MAX_RETRIES: 3,

  /** Time to ban failed servers in milliseconds (reduced for faster recovery) */
  BAN_TIME_MS: 30000, // 30 seconds

  /** Default log level for DAPI operations */
  LOG_LEVEL: 'debug' as const
} as const;

/**
 * Wallet Configuration
 *
 * Settings for wallet synchronization and cleanup operations.
 */
export const WALLET_CONFIG = {
  /** Default wallet synchronization timeout in milliseconds */
  SYNC_WAIT_MS: 30000, // 30 seconds

  /** Minimum sync wait period in milliseconds */
  MIN_SYNC_WAIT_MS: 5000, // 5 seconds

  /** Cleanup delay after wallet operations in milliseconds */
  CLEANUP_DELAY_MS: 3000, // 3 seconds

  /** Post-operation delay in milliseconds */
  POST_OP_DELAY_MS: 2000 // 2 seconds
} as const;

/**
 * Worker Configuration
 *
 * Settings for WASM worker processes and timeouts.
 */
export const WORKER_CONFIG = {
  /** Default worker timeout for identity operations in milliseconds */
  DEFAULT_TIMEOUT_MS: 180000, // 3 minutes

  /** Discovery operation timeout in milliseconds */
  DISCOVERY_TIMEOUT_MS: 3000, // 3 seconds

  /** Batch discovery timeout per item in milliseconds */
  BATCH_DISCOVERY_TIMEOUT_MS: 180000 // 3 minutes (increased for wallets with many identities)
} as const;

/**
 * Asset Lock Proof Configuration
 *
 * Settings for asset lock proof generation and Platform synchronization.
 */
export const PROOF_CONFIG = {
  /** Maximum wait time for InstantLock in milliseconds (60 seconds) before falling back to ChainLock */
  MAX_WAIT_MS: 60000, // 60 seconds - if no InstantLock, fall back to ChainLock

  /** Platform sync polling interval in milliseconds */
  POLL_INTERVAL_MS: 5000 // 5 seconds
} as const;

/**
 * Identity Amount Configuration
 *
 * Validation bounds for identity creation and top-up amounts.
 */
export const IDENTITY_CONFIG = {
  /** Minimum amount for identity creation in duffs (0.002 DASH) */
  CREATE_MIN_AMOUNT: 200000,

  /** Minimum amount for identity top-up in duffs (0.0005 DASH) */
  TOPUP_MIN_AMOUNT: 50000,

  /** Maximum amount for identity operations in duffs (1000 DASH) */
  MAX_AMOUNT: 100000000000
} as const;

/**
 * Blockchain Configuration
 *
 * Settings for blockchain height validation and synchronization.
 */
export const BLOCKCHAIN_CONFIG = {
  /** Minimum valid start height */
  MIN_START_HEIGHT: 1,

  /** Maximum valid start height */
  MAX_START_HEIGHT: 10000000
} as const;

/**
 * Complete Identity Operation Configuration
 *
 * Combined configuration object for easy import and access.
 */
export const IDENTITY_OPERATION_CONFIG = {
  dapi: DAPI_CONFIG,
  wallet: WALLET_CONFIG,
  worker: WORKER_CONFIG,
  proof: PROOF_CONFIG,
  identity: IDENTITY_CONFIG,
  blockchain: BLOCKCHAIN_CONFIG
} as const;

/**
 * Type-safe access to configuration values
 */
export type IdentityOperationConfig = typeof IDENTITY_OPERATION_CONFIG;
