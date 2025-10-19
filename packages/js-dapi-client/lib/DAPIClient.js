const EventEmitter = require('events');

const GrpcTransport = require('./transport/GrpcTransport/GrpcTransport');
const JsonRpcTransport = require('./transport/JsonRpcTransport/JsonRpcTransport');

const CoreMethodsFacade = require('./methods/core/CoreMethodsFacade');
const PlatformMethodsFacade = require('./methods/platform/PlatformMethodsFacade');

const createDAPIAddressProviderFromOptions = require('./dapiAddressProvider/createDAPIAddressProviderFromOptions');
const requestJsonRpc = require('./transport/JsonRpcTransport/requestJsonRpc');
const createGrpcTransportError = require('./transport/GrpcTransport/createGrpcTransportError');
const createJsonTransportError = require('./transport/JsonRpcTransport/createJsonTransportError');

const BlockHeadersProvider = require('./BlockHeadersProvider/BlockHeadersProvider');
const createBlockHeadersProviderFromOptions = require('./BlockHeadersProvider/createBlockHeadersProviderFromOptions');

const logger = require('./logger');

const EVENTS = {
  ERROR: 'error',
};

class DAPIClient extends EventEmitter {
  /**
   * @param {DAPIClientOptions} [options]
   */
  constructor(options = {}) {
    super();

    this.options = {
      network: 'mainnet',
      timeout: 10000,
      retries: 5,
      blockHeadersProviderOptions: BlockHeadersProvider.defaultOptions,
      loggerOptions: {
        identifier: '',
        level: undefined,
      },
      ...options,
    };

    this.logger = logger.getForId(
      this.options.loggerOptions.identifier,
      this.options.loggerOptions.level,
    );

    /**
     * ASYNC INITIALIZATION FOR DNS RESOLUTION
     *
     * The address provider creation can return either:
     * 1. A synchronous provider (for IP-based seeds or network configs)
     * 2. A Promise that resolves to a provider (for hostname-based seeds)
     *
     * This dual-mode pattern:
     * - Maintains backward compatibility with synchronous configurations
     * - Enables parallel DNS resolution for hostnames in the background
     * - Allows the constructor to return immediately (non-blocking)
     * - Handles both cases transparently in the transport layers
     *
     * DNS Resolution Pattern:
     * - createDAPIAddressProviderFromOptions() detects hostname seeds
     * - Wraps them in Promise.all() for parallel DNS lookups
     * - Returns a Promise that resolves when all DNS lookups complete
     * - If all inputs are IPs or pre-resolved, returns provider immediately
     *
     * See: packages/js-dapi-client/docs/DNS_RESOLUTION.md
     */
    const addressProviderResult = createDAPIAddressProviderFromOptions({
      ...this.options,
      logger: this.logger,
    });

    // Detect async initialization (Promise) vs synchronous provider
    if (addressProviderResult instanceof Promise) {
      // Store Promise for later resolution when getAddressProvider() is called
      this.dapiAddressProviderPromise = addressProviderResult;
      // For synchronous compatibility, set to undefined initially
      // getAddressProvider() will await the promise and cache the result
      this.dapiAddressProvider = undefined;
    } else {
      // Synchronous provider - store directly and wrap in resolved Promise
      this.dapiAddressProvider = addressProviderResult;
      this.dapiAddressProviderPromise = Promise.resolve(addressProviderResult);
    }

    const grpcTransport = new GrpcTransport(
      createDAPIAddressProviderFromOptions,
      this,
      createGrpcTransportError,
      this.options,
    );

    const jsonRpcTransport = new JsonRpcTransport(
      createDAPIAddressProviderFromOptions,
      requestJsonRpc,
      this,
      createJsonTransportError,
      this.options,
    );

    this.core = new CoreMethodsFacade(jsonRpcTransport, grpcTransport);
    this.platform = new PlatformMethodsFacade(grpcTransport);

    this.initBlockHeadersProvider();
  }

  /**
   * Get the current address provider (awaits if async initialization in progress)
   *
   * This method handles both synchronous and asynchronous initialization:
   *
   * SYNCHRONOUS PATH (IP addresses or pre-resolved config):
   * - dapiAddressProvider is already set from constructor
   * - Returns immediately without awaiting
   * - No latency from DNS resolution
   *
   * ASYNCHRONOUS PATH (hostname seeds):
   * - dapiAddressProvider is undefined initially
   * - Awaits dapiAddressProviderPromise which is resolving DNS lookups
   * - First call waits for DNS resolution to complete
   * - Caches result in dapiAddressProvider for subsequent calls
   * - Subsequent calls return cached value immediately
   *
   * CACHING PATTERN:
   * The provider is cached after first resolution to avoid redundant work.
   * This is safe because the address provider doesn't change after initialization.
   *
   * USED BY:
   * - GrpcTransport: Calls before each gRPC request
   * - JsonRpcTransport: Calls before each JSON-RPC request
   * - disconnect(): Calls during cleanup
   *
   * @private
   * @returns {Promise<DAPIAddressProvider>} Resolves to the initialized address provider
   */
  async getAddressProvider() {
    // Fast path: provider already cached
    if (this.dapiAddressProvider) {
      return this.dapiAddressProvider;
    }

    // Slow path: await DNS resolution (only happens first time with hostnames)
    const provider = await this.dapiAddressProviderPromise;

    // Cache for next calls
    this.dapiAddressProvider = provider;

    return provider;
  }

  /**
   * @private
   */
  initBlockHeadersProvider() {
    this.blockHeadersProvider = createBlockHeadersProviderFromOptions(
      this.options,
      this.core,
      this.logger,
    );

    this.blockHeadersProvider.on(BlockHeadersProvider.EVENTS.ERROR, (e) => {
      this.emit(EVENTS.ERROR, e);
    });
  }

  /**
   * Close all open connections
   *
   * Properly handles both synchronous and asynchronous address provider initialization:
   * - If address provider is already initialized: uses cached instance immediately
   * - If DNS resolution is still pending: awaits completion before cleanup
   * - Ensures all resources are properly released
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    // Stop block headers provider
    await this.blockHeadersProvider.stop();

    // Stop masternode list provider
    // Using getAddressProvider() handles both sync and async initialization
    const addressProvider = await this.getAddressProvider();
    if (addressProvider && addressProvider.smlProvider) {
      await addressProvider.smlProvider.unsubscribe();
    }
  }
}

DAPIClient.EVENTS = EVENTS;

/**
 * @typedef {DAPIClientOptions} DAPIClientOptions
 * @property {DAPIAddressProvider} [dapiAddressProvider]
 * @property {Array<RawDAPIAddress|DAPIAddress|string>} [dapiAddresses]
 * @property {Array<RawDAPIAddress|DAPIAddress|string>} [seeds]
 * @property {Array<RawDAPIAddress|DAPIAddress|string>} [dapiAddressesWhiteList]
 * @property {string|Network} [network=mainnet]
 * @property {number} [timeout=2000]
 * @property {number} [retries=3]
 * @property {number} [baseBanTime=60000]
 * @property {boolean} [throwDeadlineExceeded]
 * @property {object} [loggerOptions]
 * @property {string} [loggerOptions.identifier]
 * @property {string} [loggerOptions.level]
 * @property {BlockHeadersProvider} [blockHeadersProvider]
 * @property {BlockHeadersProviderOptions} [blockHeadersProviderOptions]
 */

module.exports = DAPIClient;
