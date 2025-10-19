const networks = require('@dashevo/dashcore-lib/lib/networks');

const DAPIAddress = require('./DAPIAddress');

const ListDAPIAddressProvider = require('./ListDAPIAddressProvider');

const SimplifiedMasternodeListProvider = require('../SimplifiedMasternodeListProvider/SimplifiedMasternodeListProvider');
const SimplifiedMasternodeListDAPIAddressProvider = require('./SimplifiedMasternodeListDAPIAddressProvider');
const createMasternodeListStreamFactory = require('../SimplifiedMasternodeListProvider/createMasternodeListStreamFactory');

const DAPIClientError = require('../errors/DAPIClientError');

const networkConfigs = require('../networkConfigs');
const resolveDAPIAddress = require('./resolveDAPIAddress');

/**
 * @typedef {createDAPIAddressProviderFromOptions}
 * @param {DAPIClientOptions} options
 * @returns {
 *    DAPIAddressProvider|
 *    ListDAPIAddressProvider|
 *    SimplifiedMasternodeListDAPIAddressProvider|
 *    null
 * }
 */
function createDAPIAddressProviderFromOptions(options) {
  if (options.network && !networks.get(options.network)) {
    throw new DAPIClientError(`Invalid network '${options.network}'`);
  }

  if (options.dapiAddressProvider) {
    if (options.dapiAddresses) {
      throw new DAPIClientError("Can't use 'dapiAddresses' with 'dapiAddressProvider' option");
    }

    if (options.seeds) {
      throw new DAPIClientError("Can't use 'seeds' with 'dapiAddressProvider' option");
    }

    if (options.dapiAddressesWhiteList) {
      throw new DAPIClientError("Can't use 'dapiAddressesWhiteList' with 'dapiAddressProvider' option");
    }

    return options.dapiAddressProvider;
  }

  if (options.dapiAddresses) {
    if (options.seeds) {
      throw new DAPIClientError("Can't use 'seeds' with 'dapiAddresses' option");
    }

    if (options.dapiAddressesWhiteList) {
      throw new DAPIClientError("Can't use 'dapiAddressesWhiteList' with 'dapiAddresses' option");
    }

    return new ListDAPIAddressProvider(
      options.dapiAddresses.map((rawAddress) => new DAPIAddress(rawAddress)),
      options,
    );
  }

  if (options.seeds) {
    let dapiAddressesWhiteList = options.dapiAddressesWhiteList || [];

    // Since we don't have PoSe atm, 3rd party masternodes sometimes provide wrong data
    // that breaks test suite and application logic. Temporary solution is to hardcode
    // reliable DCG testnet masternodes to connect. Should be removed when PoSe is introduced.
    const network = networks.get(options.network);
    let isRegtest = false;
    if (network) {
      isRegtest = network.regtestEnabled;
    }

    if (options.network === 'testnet' && dapiAddressesWhiteList.length === 0 && !isRegtest) {
      dapiAddressesWhiteList = networkConfigs.testnet.dapiAddressesWhiteList;
    }

    /**
     * ASYNC DNS RESOLUTION PATTERN
     *
     * WHY CRITICAL: DAPI server TLS certificates are REGISTERED TO IP ADDRESSES,
     * not to DNS hostnames. We MUST resolve hostnames to IP addresses BEFORE
     * connecting, or TLS certificate validation will fail.
     *
     * We wrap seed resolution in Promise.all() to:
     * 1. Resolve all seed hostnames to IP addresses in parallel (not sequentially)
     * 2. Convert DNS hostnames to IP addresses BEFORE creating the provider
     * 3. Return a Promise that resolves to the fully initialized provider
     *
     * Why Promises?
     * DNS lookups are I/O operations that can block if done synchronously.
     * This allows the constructor to return immediately while DNS resolution
     * happens in the background. The first actual gRPC request will wait for
     * DNS to complete if needed, but application startup is not blocked.
     *
     * Why Promise.all()?
     * Multiple seeds can be resolved in parallel. If we have 3 seeds, Promise.all()
     * resolves them all simultaneously (faster) rather than sequentially.
     * Total time = slowest DNS lookup, not sum of all lookups.
     *
     * Why return a Promise?
     * createDAPIAddressProviderFromOptions() can return either:
     * - A synchronous provider (for IP addresses, pre-resolved configs)
     * - A Promise that resolves to a provider (for hostname seeds)
     *
     * The caller (DAPIClient) detects this with instanceof Promise check
     * and handles async initialization appropriately.
     *
     * See: packages/js-dapi-client/docs/DNS_RESOLUTION.md
     */
    const resolvedSeeds = Promise.all(
      options.seeds.map(async (rawAddress) => {
        const dapiAddr = new DAPIAddress(rawAddress);
        return resolveDAPIAddress(dapiAddr, {
          loggerIdentifier: options.loggerOptions?.identifier,
        });
      })
    ).then((resolvedAddresses) => {
      const listDAPIAddressProvider = new ListDAPIAddressProvider(
        resolvedAddresses,
        options,
      );

      const createStream = createMasternodeListStreamFactory(
        createDAPIAddressProviderFromOptions,
        listDAPIAddressProvider,
        options,
      );

      const smlProvider = new SimplifiedMasternodeListProvider(
        createStream,
        options,
      );

      return new SimplifiedMasternodeListDAPIAddressProvider(
        smlProvider,
        listDAPIAddressProvider,
        dapiAddressesWhiteList.map((rawAddress) => new DAPIAddress(rawAddress)),
      );
    });

    return resolvedSeeds;
  }

  if (options.network) {
    if (!networkConfigs[options.network]) {
      throw new DAPIClientError(`There is no connection config for network '${options.network}'`);
    }

    const networkConfig = { ...options, ...networkConfigs[options.network] };

    return createDAPIAddressProviderFromOptions(networkConfig);
  }

  return null;
}

module.exports = createDAPIAddressProviderFromOptions;
