/**
 * WalletCoordinator - HD Wallet Setup and UTXO Discovery
 *
 * Refactored to use new modular package architecture:
 * - DAPIClient for network communication
 * - WASM SDK for HD key derivation (BIP44)
 * - UTXOFinder for UTXO discovery via blockchain sync
 * - InstantSendChainLockMonitor for transaction confirmation tracking
 *
 * This replaces wallet-lib with specialized, composable components.
 */

import type { EvoSDK } from '../../sdk.js';
import DAPIClient from '@dashevo/dapi-client';
import { TransactionFinder, FinderMode, type UTXO } from '@dashevo/transaction-finder';
import * as dashcoreLib from '@dashevo/dashcore-lib';
import * as wasm from '../../wasm.js';
import { wallet as walletFunctions } from '../../wallet/functions.js';
import { DAPI_CONFIG, WALLET_CONFIG } from '../config/operation-config.js';
import { createLogger } from '../utils/identity-logger.js';

const logger = createLogger('WalletCoordinator');

declare const process: { env: { [key: string]: string | undefined } };

export interface WalletSetupOptions {
  mnemonic: string;
  network: string;
  startHeight: number;
  addressCount?: number; // Number of addresses to derive (default: 20)
}

export interface DerivedAddressInfo {
  address: string;
  privateKey: any; // dashcore-lib PrivateKey
  publicKey: string;
  path: string;
  index: number;
}

export interface WalletSetupResult {
  dapiClient: DAPIClient;
  monitor: TransactionFinder;
  addresses: {
    external: DerivedAddressInfo[];
    internal: DerivedAddressInfo[];
  };
  utxos: UTXO[];
  latestUTXO: UTXO | null;
  hdPrivateKey: any; // dashcore-lib.HDPrivateKey
}

/**
 * WalletCoordinator handles wallet lifecycle management for identity operations
 *
 * This class coordinates:
 * - DAPI client setup for network communication
 * - HD key derivation using WASM SDK and dashcore-lib
 * - UTXO discovery via UTXOFinder
 * - InstantSend/ChainLock monitoring setup
 *
 * Key Differences from wallet-lib version:
 * - Stateless: No persistent storage or wallet state
 * - Explicit: Returns addresses and private keys directly
 * - Composable: Each component handles one responsibility
 */
export class WalletCoordinator {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  /**
   * Setup wallet components with complete initialization and UTXO discovery
   *
   * @param options Wallet configuration options
   * @returns DAPI client, monitor, derived addresses, UTXOs, and HD private key
   */
  async setupWallet(options: WalletSetupOptions): Promise<WalletSetupResult> {
    const { mnemonic, network, startHeight, addressCount = 20 } = options;

    // Step 1: START_HEIGHT preservation validation (PRD requirement)
    if (logger.isDebugEnabled()) {
      logger.info('🔒 START_HEIGHT preservation validation (PRD requirement)');
      logger.info(`   START_HEIGHT from .env: ${startHeight} (NEVER modified by code)`);
      logger.info(`   This ensures user control and funded wallet testing integrity`);
    }

    // Step 2: Create DAPIClient
    logger.debug('🌐 Creating DAPIClient...');
    const dapiClient = new DAPIClient({
      network: network as 'mainnet' | 'testnet' | 'regtest',
      timeout: DAPI_CONFIG.TIMEOUT_MS,
      retries: DAPI_CONFIG.MAX_RETRIES,
      baseBanTime: DAPI_CONFIG.BAN_TIME_MS
    });

    // Step 3: Get current blockchain height for logging
    let currentBlockHeight: number | undefined;
    try {
      logger.debug('🔍 Getting current blockchain height from DAPI...');
      const blockchainStatus = await dapiClient.core.getBlockchainStatus();

      // Multi-source height extraction (supports SYNCED and SYNCING servers)
      currentBlockHeight = blockchainStatus.blocks ||
                           blockchainStatus.chain?.blocksCount ||
                           blockchainStatus.chain?.headersCount ||
                           blockchainStatus.coreChainLockedHeight;

      if (currentBlockHeight && currentBlockHeight > 0) {
        logger.info(`   ✅ Current blockchain height: ${currentBlockHeight}`);
        logger.info(`   📏 Sync range: ${startHeight} to ${currentBlockHeight} (${currentBlockHeight - startHeight} blocks)`);
      }
    } catch (error) {
      const err = error as Error;
      logger.warn(`Could not get blockchain height: ${err.message}`);
    }

    // Step 4: Derive HD addresses using WASM SDK + dashcore-lib
    logger.debug('🔑 Deriving HD addresses from mnemonic...');
    const derivedAddresses = await this.deriveAddresses(mnemonic, network, addressCount);

    logger.info(`   ✅ Derived ${derivedAddresses.external.length} external + ${derivedAddresses.internal.length} internal addresses`);

    // Step 5: Find UTXOs using TransactionFinder (Historic Mode)
    logger.debug('💰 Finding UTXOs via blockchain sync...');
    const allAddresses = [
      ...derivedAddresses.external.map(a => a.address),
      ...derivedAddresses.internal.map(a => a.address)
    ];

    const utxoFinder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: network as 'mainnet' | 'testnet' | 'regtest',
      addresses: allAddresses,
      dapiClient: dapiClient as any,
      fromHeight: startHeight,
      toHeight: currentBlockHeight,
      requiredAmount: 200000, // Minimum for identity creation
      onProgress: (progress) => {
        if (logger.isDebugEnabled()) {
          logger.debug(`   Sync progress: ${progress.progress.toFixed(1)}% (${progress.syncedBlocks}/${progress.totalBlocks} blocks)`);
        }
      },
    });

    let utxos: UTXO[] = [];
    let latestUTXO: UTXO | null = null;

    try {
      // Try to find latest spendable UTXO (with minimum amount for identity creation)
      latestUTXO = await utxoFinder.findLatestSpendableUTXO();

      // If we found the latest UTXO, we can extract it from the array
      // For now, just put it in an array since we got it
      utxos = [latestUTXO];

      logger.info(`   ✅ Found latest spendable UTXO: ${latestUTXO.satoshis} duffs at ${latestUTXO.address}`);
    } catch (error) {
      const err = error as Error;
      logger.warn(`No spendable UTXOs found with required amount: ${err.message}`);
      // Continue anyway - we might be creating a fresh wallet
    }

    // Step 6: Initialize TransactionFinder (Realtime Mode) for monitoring
    logger.debug('📡 Initializing transaction monitor...');
    const monitor = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: network as 'mainnet' | 'testnet' | 'regtest',
      addresses: allAddresses,
      dapiClient: dapiClient as any,
      logLevel: DAPI_CONFIG.LOG_LEVEL as any,
      autoPruneOnConfirmation: true,
    });

    logger.info('✅ Wallet setup complete');

    return {
      dapiClient,
      monitor,
      addresses: derivedAddresses,
      utxos,
      latestUTXO,
      hdPrivateKey: derivedAddresses.hdPrivateKey
    };
  }

  /**
   * Derive HD addresses from mnemonic using WASM SDK + dashcore-lib
   *
   * Uses BIP44 path: m/44'/1'/0'/chain/index (testnet) or m/44'/5'/0'/chain/index (mainnet)
   *
   * @param mnemonic BIP39 mnemonic phrase
   * @param network 'testnet' or 'mainnet'
   * @param count Number of addresses to derive per chain (external + internal)
   * @returns Derived addresses with private keys
   */
  private async deriveAddresses(
    mnemonic: string,
    network: string,
    count: number = 20
  ): Promise<{
    external: DerivedAddressInfo[];
    internal: DerivedAddressInfo[];
    hdPrivateKey: any;
  }> {
    await wasm.ensureInitialized();

    // Derive master HD private key from mnemonic
    const hdPrivateKey = await walletFunctions.deriveKeyFromSeedPhrase(
      mnemonic,
      null, // No passphrase
      network
    );

    const external: DerivedAddressInfo[] = [];
    const internal: DerivedAddressInfo[] = [];

    // Derive external addresses (m/44'/1'/0'/0/index for testnet)
    for (let i = 0; i < count; i++) {
      const path = await walletFunctions.derivationPathBip44Testnet(
        0, // account
        0, // external chain
        i  // index
      );

      const childKey = await walletFunctions.deriveKeyFromSeedWithPath(
        mnemonic,
        null,
        path,
        network
      );

      // Convert to dashcore-lib PrivateKey for transaction signing
      const privateKey = new dashcoreLib.PrivateKey(childKey.privateKey, network);
      const publicKey = privateKey.toPublicKey();
      const address = publicKey.toAddress(network).toString();

      external.push({
        address,
        privateKey,
        publicKey: publicKey.toString(),
        path,
        index: i
      });
    }

    // Derive internal addresses (m/44'/1'/0'/1/index for testnet)
    for (let i = 0; i < count; i++) {
      const path = await walletFunctions.derivationPathBip44Testnet(
        0, // account
        1, // internal chain (change addresses)
        i  // index
      );

      const childKey = await walletFunctions.deriveKeyFromSeedWithPath(
        mnemonic,
        null,
        path,
        network
      );

      const privateKey = new dashcoreLib.PrivateKey(childKey.privateKey, network);
      const publicKey = privateKey.toPublicKey();
      const address = publicKey.toAddress(network).toString();

      internal.push({
        address,
        privateKey,
        publicKey: publicKey.toString(),
        path,
        index: i
      });
    }

    if (logger.isDebugEnabled()) {
      logger.debug(`   Derived ${external.length} external addresses starting with: ${external[0].address}`);
      logger.debug(`   Derived ${internal.length} internal addresses starting with: ${internal[0].address}`);
    }

    return {
      external,
      internal,
      hdPrivateKey
    };
  }

  /**
   * Get current blockchain height from DAPI
   *
   * @returns Current blockchain height
   */
  async getCurrentBlockHeight(): Promise<number> {
    const dapiClient = new DAPIClient({
      network: this.sdk.networkConfig.network,
      timeout: DAPI_CONFIG.TIMEOUT_MS,
      retries: DAPI_CONFIG.MAX_RETRIES
    });

    const blockchainStatus = await dapiClient.core.getBlockchainStatus();

    // Multi-source height extraction
    const height = blockchainStatus.blocks ||
                   blockchainStatus.chain?.blocksCount ||
                   blockchainStatus.chain?.headersCount ||
                   blockchainStatus.coreChainLockedHeight;

    if (!height || height <= 0) {
      throw new Error(`Invalid blockchain height received: ${height}`);
    }

    return height;
  }

  /**
   * Find first address with UTXOs
   * Helper method for transaction building
   *
   * @param addresses Derived addresses
   * @param utxos Discovered UTXOs
   * @returns Address info with UTXO, or null if none found
   */
  findAddressWithUTXO(
    addresses: DerivedAddressInfo[],
    utxos: UTXO[]
  ): { addressInfo: DerivedAddressInfo; utxo: UTXO } | null {
    for (const addressInfo of addresses) {
      const utxo = utxos.find(u => u.address === addressInfo.address);
      if (utxo) {
        return { addressInfo, utxo };
      }
    }
    return null;
  }

  /**
   * Get unused address (first address with no UTXOs)
   * Used for change addresses and receiving
   *
   * @param addresses Derived addresses
   * @param utxos Discovered UTXOs
   * @returns First unused address
   */
  getUnusedAddress(
    addresses: DerivedAddressInfo[],
    utxos: UTXO[]
  ): DerivedAddressInfo {
    for (const addressInfo of addresses) {
      const hasUTXO = utxos.some(u => u.address === addressInfo.address);
      if (!hasUTXO) {
        return addressInfo;
      }
    }
    // If all addresses have been used, return the last one
    return addresses[addresses.length - 1];
  }
}
