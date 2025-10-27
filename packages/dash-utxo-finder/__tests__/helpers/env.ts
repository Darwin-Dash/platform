/**
 * Test Environment Configuration
 *
 * Centralized environment configuration for UTXO Finder tests.
 * Supports different environments: local development, CI/CD, testnet, regtest.
 */

/**
 * Test environment configuration utility
 *
 * Provides type-safe access to environment variables with sensible defaults.
 * Supports configuration via:
 * - Environment variables (process.env)
 * - .env files (loaded via dotenv)
 * - Hardcoded defaults
 */
export class TestEnv {
  // ========================================================================
  // RPC Configuration
  // ========================================================================

  /**
   * Get testnet RPC endpoint
   * @returns RPC endpoint URL for local testnet node
   */
  static getTestnetRPCEndpoint(): string {
    return process.env.TESTNET_RPC_ENDPOINT || 'http://localhost:18332';
  }

  /**
   * Get regtest RPC endpoint (through SSH tunnel)
   * @returns RPC endpoint URL for regtest node through tunnel
   */
  static getRegtestRPCEndpoint(): string {
    return process.env.REGTEST_RPC_ENDPOINT || 'http://localhost:20002';
  }

  /**
   * Get RPC credentials for a specific network
   * @param network Network to get credentials for
   * @returns Object with username and password
   */
  static getRPCCredentials(network: 'testnet' | 'regtest'): {
    username: string;
    password: string;
  } {
    const prefix = network === 'testnet' ? 'TESTNET' : 'REGTEST';

    return {
      username: process.env[`${prefix}_RPC_USERNAME`] || 'dash',
      password: process.env[`${prefix}_RPC_PASSWORD`] || 'dashpass',
    };
  }

  // ========================================================================
  // SSH Configuration (for regtest)
  // ========================================================================

  /**
   * Get SSH host for regtest access
   * @returns SSH connection string (user@host)
   */
  static getSSHHost(): string {
    return process.env.DASHMATE_SSH_HOST || 'ruald@10.0.0.119';
  }

  /**
   * Get Docker container name for regtest seed node
   * @returns Container name
   */
  static getSeedContainer(): string {
    return process.env.SEED_CONTAINER || 'dashmate_36324776_local_seed-core-1';
  }

  /**
   * Get SSH tunnel port for regtest RPC
   * @returns Port number
   */
  static getRPCTunnelPort(): number {
    return parseInt(process.env.RPC_PORT || '20002', 10);
  }

  /**
   * Get SSH tunnel port for regtest DAPI
   * @returns Port number
   */
  static getDAPITunnelPort(): number {
    return parseInt(process.env.DAPI_PORT || '2443', 10);
  }

  // ========================================================================
  // Test Control Flags
  // ========================================================================

  /**
   * Check if RPC tests should be skipped
   * @returns true if RPC tests should be skipped
   */
  static shouldSkipRPCTests(): boolean {
    return process.env.SKIP_RPC_TESTS === 'true';
  }

  /**
   * Check if testnet tests should be skipped
   * @returns true if testnet tests should be skipped
   */
  static shouldSkipTestnetTests(): boolean {
    return process.env.SKIP_TESTNET_TESTS === 'true';
  }

  /**
   * Check if regtest tests should be skipped
   * @returns true if regtest tests should be skipped
   */
  static shouldSkipRegtestTests(): boolean {
    return process.env.SKIP_REGTEST_TESTS === 'true';
  }

  /**
   * Check if all integration tests should be skipped
   * @returns true if integration tests should be skipped
   */
  static shouldSkipIntegrationTests(): boolean {
    return process.env.SKIP_INTEGRATION_TESTS === 'true';
  }

  /**
   * Check if running in CI/CD environment
   * @returns true if in CI/CD
   */
  static isCI(): boolean {
    return !!(process.env.CI || process.env.GITHUB_ACTIONS);
  }

  // ========================================================================
  // Network Configuration
  // ========================================================================

  /**
   * Get custom testnet seeds (optional override)
   * @returns Array of seed addresses or undefined
   */
  static getTestnetSeeds(): string[] | undefined {
    const seeds = process.env.TESTNET_SEEDS;
    if (!seeds) {
      return undefined;
    }
    return seeds.split(',').map((s) => s.trim());
  }

  /**
   * Get DNS timeout for resolution
   * @returns Timeout in milliseconds
   */
  static getDNSTimeout(): number {
    return parseInt(process.env.DNS_TIMEOUT || '5000', 10);
  }

  /**
   * Get DNS retry count
   * @returns Number of retries
   */
  static getDNSRetryCount(): number {
    return parseInt(process.env.DNS_RETRY_COUNT || '3', 10);
  }

  // ========================================================================
  // Test Data Configuration
  // ========================================================================

  /**
   * Get testnet start height for UTXO scanning
   * @returns Block height to start scanning from
   */
  static getTestnetStartHeight(): number {
    return parseInt(process.env.START_HEIGHT || '1346251', 10);
  }

  /**
   * Get funded testnet address for testing
   * @returns Dash testnet address
   */
  static getTestnetAddress(): string {
    return process.env.TESTNET_ADDRESS || 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';
  }

  /**
   * Get test mnemonic (for address derivation)
   * @returns BIP39 mnemonic phrase
   */
  static getTestMnemonic(): string {
    return (
      process.env.MNEMONIC ||
      'lamp truck drip furnace now swing income victory leisure popular jeans vehicle'
    );
  }

  // ========================================================================
  // Timeout Configuration
  // ========================================================================

  /**
   * Get RPC operation timeout
   * @returns Timeout in milliseconds
   */
  static getRPCTimeout(): number {
    return parseInt(process.env.RPC_TIMEOUT || '30000', 10);
  }

  /**
   * Get DAPI query timeout
   * @returns Timeout in milliseconds
   */
  static getDAPITimeout(): number {
    return parseInt(process.env.DAPI_TIMEOUT || '180000', 10);
  }

  /**
   * Get test hook timeout (beforeAll, afterAll, etc.)
   * @returns Timeout in milliseconds
   */
  static getHookTimeout(): number {
    return parseInt(process.env.HOOK_TIMEOUT || '60000', 10);
  }

  /**
   * Get general test timeout
   * @returns Timeout in milliseconds
   */
  static getTestTimeout(): number {
    return parseInt(process.env.TEST_TIMEOUT || '120000', 10);
  }

  // ========================================================================
  // Retry Configuration
  // ========================================================================

  /**
   * Get maximum retry attempts for network operations
   * @returns Number of retries
   */
  static getMaxRetries(): number {
    return parseInt(process.env.MAX_RETRIES || '5', 10);
  }

  /**
   * Get base delay for exponential backoff
   * @returns Delay in milliseconds
   */
  static getRetryBaseDelay(): number {
    return parseInt(process.env.RETRY_BASE_DELAY || '1000', 10);
  }

  /**
   * Get maximum delay for exponential backoff
   * @returns Delay in milliseconds
   */
  static getRetryMaxDelay(): number {
    return parseInt(process.env.RETRY_MAX_DELAY || '30000', 10);
  }

  // ========================================================================
  // Circuit Breaker Configuration
  // ========================================================================

  /**
   * Get circuit breaker failure threshold
   * @returns Number of failures before opening circuit
   */
  static getCircuitBreakerThreshold(): number {
    return parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10);
  }

  /**
   * Get circuit breaker timeout
   * @returns Timeout in milliseconds before attempting recovery
   */
  static getCircuitBreakerTimeout(): number {
    return parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '30000', 10);
  }

  // ========================================================================
  // Logging Configuration
  // ========================================================================

  /**
   * Get log level
   * @returns Log level (debug, info, warn, error)
   */
  static getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
    const level = process.env.LOG_LEVEL?.toLowerCase() || 'info';
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      return level as 'debug' | 'info' | 'warn' | 'error';
    }
    return 'info';
  }

  /**
   * Check if verbose logging is enabled
   * @returns true if verbose
   */
  static isVerbose(): boolean {
    return process.env.VERBOSE === 'true' || this.getLogLevel() === 'debug';
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  /**
   * Get all configuration as an object (for debugging)
   * @returns Configuration object
   */
  static getAllConfig(): Record<string, unknown> {
    return {
      // RPC
      testnetRPCEndpoint: this.getTestnetRPCEndpoint(),
      regtestRPCEndpoint: this.getRegtestRPCEndpoint(),
      testnetRPCCredentials: this.getRPCCredentials('testnet'),
      regtestRPCCredentials: this.getRPCCredentials('regtest'),

      // SSH
      sshHost: this.getSSHHost(),
      seedContainer: this.getSeedContainer(),
      rpcTunnelPort: this.getRPCTunnelPort(),
      dapiTunnelPort: this.getDAPITunnelPort(),

      // Test Control
      skipRPCTests: this.shouldSkipRPCTests(),
      skipTestnetTests: this.shouldSkipTestnetTests(),
      skipRegtestTests: this.shouldSkipRegtestTests(),
      skipIntegrationTests: this.shouldSkipIntegrationTests(),
      isCI: this.isCI(),

      // Network
      testnetSeeds: this.getTestnetSeeds(),
      dnsTimeout: this.getDNSTimeout(),
      dnsRetryCount: this.getDNSRetryCount(),

      // Test Data
      testnetStartHeight: this.getTestnetStartHeight(),
      testnetAddress: this.getTestnetAddress(),

      // Timeouts
      rpcTimeout: this.getRPCTimeout(),
      dapiTimeout: this.getDAPITimeout(),
      hookTimeout: this.getHookTimeout(),
      testTimeout: this.getTestTimeout(),

      // Retry
      maxRetries: this.getMaxRetries(),
      retryBaseDelay: this.getRetryBaseDelay(),
      retryMaxDelay: this.getRetryMaxDelay(),

      // Circuit Breaker
      circuitBreakerThreshold: this.getCircuitBreakerThreshold(),
      circuitBreakerTimeout: this.getCircuitBreakerTimeout(),

      // Logging
      logLevel: this.getLogLevel(),
      verbose: this.isVerbose(),
    };
  }

  /**
   * Print configuration (for debugging)
   */
  static printConfig(): void {
    const config = this.getAllConfig();
    console.log('='.repeat(60));
    console.log('UTXO Finder Test Configuration');
    console.log('='.repeat(60));

    Object.entries(config).forEach(([key, value]) => {
      // Mask passwords
      if (key.toLowerCase().includes('password')) {
        console.log(`${key}: ${'*'.repeat(8)}`);
      } else if (key.toLowerCase().includes('credentials')) {
        console.log(`${key}: { username: ..., password: *** }`);
      } else {
        console.log(`${key}: ${JSON.stringify(value)}`);
      }
    });

    console.log('='.repeat(60));
  }

  /**
   * Validate configuration (check for common issues)
   * @returns Array of validation warnings
   */
  static validateConfig(): string[] {
    const warnings: string[] = [];

    // Check if in CI but RPC tests not skipped
    if (this.isCI() && !this.shouldSkipRPCTests()) {
      warnings.push('Running in CI but RPC tests not skipped (may fail without local node)');
    }

    // Check if in CI but regtest tests not skipped
    if (this.isCI() && !this.shouldSkipRegtestTests()) {
      warnings.push('Running in CI but regtest tests not skipped (may fail without SSH access)');
    }

    // Check for very short timeouts
    if (this.getDAPITimeout() < 30000) {
      warnings.push('DAPI timeout is very short (<30s), may cause failures on slow networks');
    }

    // Check for very few retries
    if (this.getMaxRetries() < 2) {
      warnings.push('Max retries is very low (<2), tests may be flaky on unstable networks');
    }

    return warnings;
  }
}
