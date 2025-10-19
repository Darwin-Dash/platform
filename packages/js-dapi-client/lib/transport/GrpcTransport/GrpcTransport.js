const GrpcErrorCodes = require('@dashevo/grpc-common/lib/server/error/GrpcErrorCodes');
const logger = require('../../logger');

const MaxRetriesReachedError = require('../errors/response/MaxRetriesReachedError');
const NoAvailableAddressesForRetryError = require('../errors/response/NoAvailableAddressesForRetryError');
const NoAvailableAddressesError = require('../errors/NoAvailableAddressesError');
const TimeoutError = require('./errors/TimeoutError');
const RetriableResponseError = require('../errors/response/RetriableResponseError');

class GrpcTransport {
  /**
   * @param {createDAPIAddressProviderFromOptions} createDAPIAddressProviderFromOptions
   * @param {
   *    ListDAPIAddressProvider|
   *    SimplifiedMasternodeListDAPIAddressProvider|
   *    DAPIAddressProvider
   * } dapiAddressProvider
   * @param {createGrpcTransportError} createGrpcTransportError
   * @param {DAPIClientOptions} globalOptions
   */
  constructor(
    createDAPIAddressProviderFromOptions,
    dapiAddressProvider,
    createGrpcTransportError,
    globalOptions,
  ) {
    this.createDAPIAddressProviderFromOptions = createDAPIAddressProviderFromOptions;
    this.dapiAddressProvider = dapiAddressProvider;
    this.createGrpcTransportError = createGrpcTransportError;
    this.globalOptions = globalOptions;

    this.lastUsedAddress = null;
    this.logger = logger.getForId(globalOptions.loggerOptions.identifier);
  }

  /**
   * Make request to DAPI node via gRPC
   *
   * Handles both synchronous and asynchronous address provider patterns:
   * - Direct address providers (synchronous): used immediately
   * - DAPIClient wrapper (asynchronous): awaits getAddressProvider() for DNS resolution
   *
   * @param {Function} ClientClass gRPC service client class
   * @param {string} method gRPC method name to call
   * @param {object} requestMessage gRPC request message
   * @param {DAPIClientOptions} [options] Request-specific options
   * @returns {Promise<object>} gRPC response
   */
  async request(ClientClass, method, requestMessage, options = { }) {
    let dapiAddressProvider = this.createDAPIAddressProviderFromOptions(options)
      || this.dapiAddressProvider;

    /**
     * DUCK TYPING FOR ASYNC ADDRESS PROVIDER SUPPORT
     *
     * The dapiAddressProvider parameter can be one of two types:
     *
     * 1. DIRECT ADDRESS PROVIDER (synchronous):
     *    - ListDAPIAddressProvider
     *    - SimplifiedMasternodeListDAPIAddressProvider
     *    - Can call getLiveAddress() directly
     *    - No async initialization needed
     *
     * 2. DAPI CLIENT WRAPPER (asynchronous):
     *    - DAPIClient instance with getAddressProvider() method
     *    - May be resolving DNS lookups for hostname-based seeds
     *    - First call waits for DNS resolution (10-100ms)
     *    - Subsequent calls use cached provider (instant)
     *
     * IMPLEMENTATION:
     * We check for the presence of getAddressProvider() method using duck typing:
     * - If the method exists, it's a DAPIClient wrapper → call it
     * - If the method doesn't exist, it's a direct provider → use as-is
     *
     * WHY NOT isinstance CHECK?
     * Duck typing is simpler and more flexible. It doesn't require importing
     * DAPIClient class, avoids circular dependencies, and works with any
     * object that implements the getAddressProvider() interface.
     *
     * PERFORMANCE IMPACT:
     * - IP-based seeds: No delay (DNS skipped)
     * - Hostname seeds (first request): ~10-100ms DNS latency
     * - Hostname seeds (subsequent requests): <1ms (cached provider)
     *
     * See: packages/js-dapi-client/docs/DNS_RESOLUTION.md
     */
    if (dapiAddressProvider && typeof dapiAddressProvider.getAddressProvider === 'function') {
      dapiAddressProvider = await dapiAddressProvider.getAddressProvider();
    }

    const address = await dapiAddressProvider.getLiveAddress();

    if (!address) {
      throw new NoAvailableAddressesError();
    }

    // eslint-disable-next-line no-param-reassign
    options = {
      retries: this.globalOptions.retries,
      timeout: this.globalOptions.timeout,
      ...options,
    };

    const url = this.makeGrpcUrlFromAddress(address);
    const client = new ClientClass(url);

    const requestOptions = {};
    if (options.timeout !== undefined) {
      requestOptions.deadline = new Date();
      requestOptions.deadline.setMilliseconds(
        requestOptions.deadline.getMilliseconds() + options.timeout,
      );
    }

    this.logger.debug(`GRPC Request ${method} to ${address.toString()}`, { options });

    try {
      const result = await client[method](requestMessage, {}, requestOptions);

      this.lastUsedAddress = address;

      address.markAsLive();

      return result;
    } catch (error) {
      this.lastUsedAddress = address;

      // Show NOT_FOUND errors only in debug mode
      if (error.code !== GrpcErrorCodes.NOT_FOUND) {
        this.logger.error(`GRPC Request ${method} to ${address.toString()} failed with error: ${error.message}`);
      } else {
        this.logger.debug(`GRPC Request ${method} to ${address.toString()} failed with error: ${error.message}`);
      }

      // for unknown errors
      if (error.code === undefined) {
        throw error;
      }

      const responseError = await this.createGrpcTransportError(error, address);

      if (!(responseError instanceof RetriableResponseError)) {
        throw responseError;
      }

      if (options.throwDeadlineExceeded && responseError instanceof TimeoutError) {
        throw responseError;
      }

      // TODO: Shouldn't we call address.markAsBanned() here?

      if (options.retries === 0) {
        throw new MaxRetriesReachedError(responseError);
      }

      const hasAddresses = await dapiAddressProvider.hasLiveAddresses();
      if (!hasAddresses) {
        throw new NoAvailableAddressesForRetryError(responseError);
      }

      return this.request(
        ClientClass,
        method,
        requestMessage,
        {
          ...options,
          retries: options.retries - 1,
        },
      );
    }
  }

  /**
   * Get last used address
   * @returns {DAPIAddress|null}
   */
  getLastUsedAddress() {
    return this.lastUsedAddress;
  }

  /**
   *
   *Get gRPC url string
   * @private
   * @param {DAPIAddress} address
   * @returns {string}
   */
  makeGrpcUrlFromAddress(address) {
    let protocol = address.getProtocol();
    // For NodeJS Client
    if (typeof process !== 'undefined'
      && process.versions != null
      && process.versions.node != null
      && address.isSelfSignedCertificateAllowed()) {
      protocol = 'http';
    }

    return `${protocol}://${address.getHost()}:${address.getPort()}`;
  }
}

module.exports = GrpcTransport;
