/**
 * UTXOFinder - Independent UTXO Discovery Coordinator
 *
 * Provides a focused API for finding spendable UTXOs without coupling to identity operations.
 * Uses TransactionFinder in HISTORIC mode to scan the blockchain.
 *
 * Key features:
 * - Derives HD addresses from mnemonic (same as WalletCoordinator)
 * - Finds latest spendable UTXO via TransactionFinder
 * - Returns derived addresses for reuse in subsequent operations
 * - Completely stateless and composable
 */

import type { EvoSDK } from '../../sdk.js';
// IMPORTANT: DAPIClient is imported DYNAMICALLY to avoid loading wasm-dpp at module init time.
// Loading wasm-dpp statically conflicts with wasm-sdk's RwLock in single-threaded WASM runtime.
import type DAPIClientType from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode, type UTXO } from '@dashevo/transaction-finder';
import dashcoreLib from '@dashevo/dashcore-lib';
import * as wasm from '../../wasm.js';
import { wallet as walletFunctions } from '../../wallet/functions.js';
import { DAPI_CONFIG, IDENTITY_CONFIG } from '../config/operation-config.js';
import { createLogger } from '../utils/identity-logger.js';
import { resourceTracker } from '../utils/resource-tracker.js';
import type { DerivedAddressInfo } from './wallet-coordinator.js';

// Lazy-loaded DAPIClient to avoid wasm-dpp conflict
let DAPIClient: typeof DAPIClientType | null = null;
async function getDAPIClient(): Promise<typeof DAPIClientType> {
  if (!DAPIClient) {
    DAPIClient = (await import('@dashevo/dapi-client')).default;
  }
  return DAPIClient;
}

const logger = createLogger('UTXOFinder');

declare const process: { env: { [key: string]: string | undefined } };

/**
 * Progress event for UTXO search
 */
export interface UTXOSearchProgress {
  phase: 'initializing' | 'deriving-addresses' | 'scanning' | 'complete';
  progress: number;               // 0-100 percentage
  blocksScanned: number;
  totalBlocks: number;
  currentHeight: number;
  message?: string;
}

/**
 * Result from findSpendableUTXO
 */
export interface SpendableUTXOResult {
  /** The found UTXO */
  utxo: UTXO;

  /** Address that owns the UTXO */
  address: string;

  /** UTXO value in satoshis */
  balance: number;

  /** Block containing UTXO */
  blockHeight: number;

  /** Whether block is ChainLocked */
  isChainLocked: boolean;

  /** Derived addresses for reuse in create/topup operations */
  derivedAddresses: {
    external: DerivedAddressInfo[];
    internal: DerivedAddressInfo[];
  };

  /** Scan statistics */
  scanStats: {
    blocksScanned: number;
    timeMs: number;
    fromHeight: number;
    toHeight: number;
  };
}

/**
 * UTXOFinder - Coordinator for independent UTXO discovery
 *
 * This coordinator allows finding UTXOs separately from identity operations,
 * enabling a two-step workflow:
 * 1. Find UTXO (this class)
 * 2. Create/topup identity with the found UTXO
 *
 * Benefits:
 * - Shows user the available balance before committing
 * - Avoids redundant blockchain scanning
 * - Enables UI to handle insufficient funds gracefully
 */
export class UTXOFinder {
  constructor(private sdk: EvoSDK) {}

  /**
   * Find a spendable UTXO from wallet addresses
   *
   * Uses TransactionFinder in HISTORIC mode to scan blockchain for UTXOs.
   * Returns the latest UTXO meeting minimum amount requirements.
   *
   * @param options UTXO search options
   * @returns Spendable UTXO with derived addresses for reuse
   * @throws Error if no spendable UTXO found
   *
   * @example
   * ```typescript
   * const result = await finder.findSpendableUTXO({
   *   mnemonic: 'abandon abandon ... about',
   *   startHeight: 1000000,
   *   minAmount: 200000,
   *   onProgress: (event) => console.log(event.message)
   * });
   *
   * console.log(`Found ${result.balance} duffs at ${result.address}`);
   *
   * // Use the UTXO for identity creation
   * await sdk.identities.createWithUTXO({
   *   mnemonic,
   *   utxo: result.utxo,
   *   amount: 200000,
   *   derivedAddresses: result.derivedAddresses
   * });
   * ```
   */
  async findSpendableUTXO(options: {
    mnemonic: string;
    startHeight?: number;
    toHeight?: number;
    minAmount?: number;
    addressCount?: number;
    onProgress?: (event: UTXOSearchProgress) => void;
  }): Promise<SpendableUTXOResult> {
    const {
      mnemonic,
      startHeight = 1,
      toHeight,
      minAmount = IDENTITY_CONFIG.CREATE_MIN_AMOUNT,
      addressCount = 20,
      onProgress,
    } = options;

    const network = this.sdk.networkConfig.network;
    const startTime = Date.now();

    // Emit initializing phase
    if (onProgress) {
      onProgress({
        phase: 'initializing',
        progress: 0,
        blocksScanned: 0,
        totalBlocks: 0,
        currentHeight: 0,
        message: 'Initializing UTXO search...',
      });
    }

    // Step 1: Create DAPI client
    logger.debug('🌐 Creating DAPIClient for UTXO search...');

    let dapiAddresses: string[] | undefined;
    if (typeof process !== 'undefined' && process?.env?.DAPI_ADDRESSES) {
      dapiAddresses = process.env.DAPI_ADDRESSES.split(',').map(a => a.trim());
      logger.debug(`   Using explicit DAPI addresses: ${dapiAddresses.join(', ')}`);
    }

    const DAPIClientClass = await getDAPIClient();
    const dapiClient = new DAPIClientClass({
      network: network as 'mainnet' | 'testnet' | 'regtest',
      timeout: DAPI_CONFIG.TIMEOUT_MS,
      retries: DAPI_CONFIG.MAX_RETRIES,
      baseBanTime: DAPI_CONFIG.BAN_TIME_MS,
      ...(dapiAddresses && { dapiAddresses }),
    });

    // Track DAPIClient for cleanup
    resourceTracker.track(dapiClient);

    // Step 2: Get current blockchain height
    let currentBlockHeight: number;
    try {
      const blockchainStatus = await dapiClient.core.getBlockchainStatus();
      currentBlockHeight = blockchainStatus.blocks ||
                           blockchainStatus.chain?.blocksCount ||
                           blockchainStatus.chain?.headersCount ||
                           blockchainStatus.coreChainLockedHeight;

      if (!currentBlockHeight || currentBlockHeight <= 0) {
        throw new Error(`Invalid blockchain height: ${currentBlockHeight}`);
      }

      logger.info(`   Current blockchain height: ${currentBlockHeight}`);
    } catch (error) {
      throw new Error(`Failed to get blockchain height: ${(error as Error).message}`);
    }

    const actualToHeight = toHeight ?? currentBlockHeight;
    const totalBlocks = actualToHeight - startHeight;

    // Step 3: Derive HD addresses
    if (onProgress) {
      onProgress({
        phase: 'deriving-addresses',
        progress: 10,
        blocksScanned: 0,
        totalBlocks,
        currentHeight: currentBlockHeight,
        message: 'Deriving wallet addresses...',
      });
    }

    logger.debug('🔑 Deriving HD addresses...');
    const derivedAddresses = await this.deriveAddresses(mnemonic, network, addressCount);
    logger.info(`   Derived ${derivedAddresses.external.length} external + ${derivedAddresses.internal.length} internal addresses`);

    // Step 4: Find UTXOs using TransactionFinder (HISTORIC mode)
    if (onProgress) {
      onProgress({
        phase: 'scanning',
        progress: 20,
        blocksScanned: 0,
        totalBlocks,
        currentHeight: currentBlockHeight,
        message: `Scanning ${totalBlocks.toLocaleString()} blocks for UTXOs...`,
      });
    }

    logger.debug('💰 Scanning blockchain for UTXOs...');
    const allAddresses = [
      ...derivedAddresses.external.map(a => a.address),
      ...derivedAddresses.internal.map(a => a.address),
    ];

    const finder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: network as 'mainnet' | 'testnet' | 'regtest',
      addresses: allAddresses,
      dapiClient: dapiClient as any,
      fromHeight: startHeight,
      toHeight: actualToHeight,
      requiredAmount: minAmount + IDENTITY_CONFIG.FEE_BUFFER,
      onProgress: (progress) => {
        if (onProgress) {
          const progressPercent = 20 + (progress.progress * 0.7); // Scale 0-100 to 20-90
          onProgress({
            phase: 'scanning',
            progress: progressPercent,
            blocksScanned: progress.syncedBlocks,
            totalBlocks: progress.totalBlocks,
            currentHeight: currentBlockHeight,
            message: `Scanned ${progress.syncedBlocks.toLocaleString()} / ${progress.totalBlocks.toLocaleString()} blocks (${progress.progress.toFixed(1)}%)`,
          });
        }
      },
    });

    let latestUTXO: UTXO;
    try {
      latestUTXO = await finder.findLatestSpendableUTXO();
    } catch (error) {
      throw new Error(`No spendable UTXO found with minimum ${minAmount} duffs: ${(error as Error).message}`);
    } finally {
      // Always stop the finder to release resources, even on error
      try {
        finder.stop();
      } catch (stopError) {
        logger.warn('Failed to stop TransactionFinder during cleanup:', stopError);
      }
    }

    const elapsed = Date.now() - startTime;

    // Emit complete phase
    if (onProgress) {
      onProgress({
        phase: 'complete',
        progress: 100,
        blocksScanned: totalBlocks,
        totalBlocks,
        currentHeight: currentBlockHeight,
        message: `Found UTXO: ${latestUTXO.satoshis.toLocaleString()} duffs at ${latestUTXO.address}`,
      });
    }

    logger.info(`   ✅ Found UTXO: ${latestUTXO.satoshis} duffs at ${latestUTXO.address}`);
    logger.info(`   Scan completed in ${(elapsed / 1000).toFixed(1)}s`);

    return {
      utxo: latestUTXO,
      address: latestUTXO.address,
      balance: latestUTXO.satoshis,
      blockHeight: latestUTXO.blockHeight,
      isChainLocked: latestUTXO.isChainLocked,
      derivedAddresses: {
        external: derivedAddresses.external,
        internal: derivedAddresses.internal,
      },
      scanStats: {
        blocksScanned: totalBlocks,
        timeMs: elapsed,
        fromHeight: startHeight,
        toHeight: actualToHeight,
      },
    };
  }

  /**
   * Find all UTXOs from wallet addresses
   *
   * Unlike findSpendableUTXO which returns only the latest, this returns all UTXOs.
   *
   * @param options UTXO search options
   * @returns Array of UTXOs with derived addresses
   */
  async findAllUTXOs(options: {
    mnemonic: string;
    startHeight?: number;
    toHeight?: number;
    addressCount?: number;
    onProgress?: (event: UTXOSearchProgress) => void;
  }): Promise<{
    utxos: UTXO[];
    derivedAddresses: {
      external: DerivedAddressInfo[];
      internal: DerivedAddressInfo[];
    };
    scanStats: {
      blocksScanned: number;
      timeMs: number;
      fromHeight: number;
      toHeight: number;
    };
  }> {
    const {
      mnemonic,
      startHeight = 1,
      toHeight,
      addressCount = 20,
      onProgress,
    } = options;

    const network = this.sdk.networkConfig.network;
    const startTime = Date.now();

    // Create DAPI client
    let dapiAddresses: string[] | undefined;
    if (typeof process !== 'undefined' && process?.env?.DAPI_ADDRESSES) {
      dapiAddresses = process.env.DAPI_ADDRESSES.split(',').map(a => a.trim());
    }

    const DAPIClientClass = await getDAPIClient();
    const dapiClient = new DAPIClientClass({
      network: network as 'mainnet' | 'testnet' | 'regtest',
      timeout: DAPI_CONFIG.TIMEOUT_MS,
      retries: DAPI_CONFIG.MAX_RETRIES,
      baseBanTime: DAPI_CONFIG.BAN_TIME_MS,
      ...(dapiAddresses && { dapiAddresses }),
    });

    // Track DAPIClient for cleanup
    resourceTracker.track(dapiClient);

    // Get current height
    const blockchainStatus = await dapiClient.core.getBlockchainStatus();
    const currentBlockHeight = blockchainStatus.blocks ||
                               blockchainStatus.chain?.blocksCount ||
                               blockchainStatus.chain?.headersCount ||
                               blockchainStatus.coreChainLockedHeight;

    const actualToHeight = toHeight ?? currentBlockHeight;
    const totalBlocks = actualToHeight - startHeight;

    // Derive addresses
    const derivedAddresses = await this.deriveAddresses(mnemonic, network, addressCount);

    const allAddresses = [
      ...derivedAddresses.external.map(a => a.address),
      ...derivedAddresses.internal.map(a => a.address),
    ];

    // Find all UTXOs
    const finder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: network as 'mainnet' | 'testnet' | 'regtest',
      addresses: allAddresses,
      dapiClient: dapiClient as any,
      fromHeight: startHeight,
      toHeight: actualToHeight,
      onProgress: (progress) => {
        if (onProgress) {
          onProgress({
            phase: 'scanning',
            progress: progress.progress,
            blocksScanned: progress.syncedBlocks,
            totalBlocks: progress.totalBlocks,
            currentHeight: currentBlockHeight,
            message: `Scanned ${progress.syncedBlocks.toLocaleString()} / ${progress.totalBlocks.toLocaleString()} blocks`,
          });
        }
      },
    });

    let utxos: UTXO[];
    try {
      utxos = await finder.findUTXOs();
    } finally {
      // Always stop the finder to release resources, even on error
      try {
        finder.stop();
      } catch (stopError) {
        logger.warn('Failed to stop TransactionFinder during cleanup:', stopError);
      }
    }

    const elapsed = Date.now() - startTime;

    return {
      utxos,
      derivedAddresses: {
        external: derivedAddresses.external,
        internal: derivedAddresses.internal,
      },
      scanStats: {
        blocksScanned: totalBlocks,
        timeMs: elapsed,
        fromHeight: startHeight,
        toHeight: actualToHeight,
      },
    };
  }

  /**
   * Derive HD addresses from mnemonic
   *
   * Uses BIP44 path: m/44'/1'/0'/chain/index (testnet) or m/44'/5'/0'/chain/index (mainnet)
   *
   * @param mnemonic BIP39 mnemonic phrase
   * @param network 'testnet' or 'mainnet'
   * @param count Number of addresses per chain
   * @returns Derived addresses with private keys
   */
  private async deriveAddresses(
    mnemonic: string,
    network: string,
    count: number = 20
  ): Promise<{
    external: DerivedAddressInfo[];
    internal: DerivedAddressInfo[];
  }> {
    await wasm.ensureInitialized();

    const external: DerivedAddressInfo[] = [];
    const internal: DerivedAddressInfo[] = [];

    // Derive external addresses (m/44'/1'/0'/0/index for testnet)
    for (let i = 0; i < count; i++) {
      const pathInfo = await walletFunctions.derivationPathBip44Testnet(
        0, // account
        0, // external chain
        i  // index
      );

      const path = `m/${pathInfo.purpose}'/${pathInfo.coinType}'/${pathInfo.account}'/${pathInfo.change}/${pathInfo.index}`;

      const childKey = await walletFunctions.deriveKeyFromSeedWithPath({
        mnemonic,
        passphrase: null,
        path,
        network
      });

      const privateKey = new dashcoreLib.PrivateKey(childKey.privateKeyWif, network);
      const publicKey = privateKey.toPublicKey();
      const address = publicKey.toAddress(network).toString();

      external.push({
        address,
        privateKey,
        publicKey: publicKey.toString(),
        path,
        index: i,
      });
    }

    // Derive internal addresses (m/44'/1'/0'/1/index for testnet)
    for (let i = 0; i < count; i++) {
      const pathInfo = await walletFunctions.derivationPathBip44Testnet(
        0, // account
        1, // internal chain (change)
        i  // index
      );

      const path = `m/${pathInfo.purpose}'/${pathInfo.coinType}'/${pathInfo.account}'/${pathInfo.change}/${pathInfo.index}`;

      const childKey = await walletFunctions.deriveKeyFromSeedWithPath({
        mnemonic,
        passphrase: null,
        path,
        network
      });

      const privateKey = new dashcoreLib.PrivateKey(childKey.privateKeyWif, network);
      const publicKey = privateKey.toPublicKey();
      const address = publicKey.toAddress(network).toString();

      internal.push({
        address,
        privateKey,
        publicKey: publicKey.toString(),
        path,
        index: i,
      });
    }

    return { external, internal };
  }
}
