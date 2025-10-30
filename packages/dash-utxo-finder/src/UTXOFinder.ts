/**
 * UTXOFinder - Main API for finding latest spendable UTXOs
 * Stateless utility that coordinates address derivation, transaction syncing,
 * UTXO extraction, and UTXO selection
 */

import { EventEmitter } from 'events';

import { AddressDerivation } from './AddressDerivation';
import { BloomFilterBuilder } from './BloomFilterBuilder';
import { TransactionSyncer } from './TransactionSyncer';
import { UTXOExtractor } from './UTXOExtractor';
import { LatestUTXOSelector } from './LatestUTXOSelector';
import { StorageAdapter } from './StorageAdapter';

import { UTXO, UTXOFinderOptions, SyncProgress } from './types';

export class UTXOFinder extends EventEmitter {
  private dapiClient: any; // DapiClient from @dashevo/dapi-client
  private network: string;
  private syncer: TransactionSyncer;
  private extractor: UTXOExtractor;
  private storageAdapter?: StorageAdapter;

  /**
   * Initialize UTXOFinder
   * @param dapiClient - DAPI client instance
   * @param network - 'mainnet' or 'testnet'
   * @param options - Optional configuration
   */
  constructor(
    dapiClient: any,
    network: string = 'testnet',
    options?: {
      storageAdapter?: StorageAdapter;
    }
  ) {
    super();
    this.dapiClient = dapiClient;
    this.network = network;
    this.syncer = new TransactionSyncer(dapiClient, network);
    this.extractor = new UTXOExtractor(network);
    this.storageAdapter = options?.storageAdapter;
  }

  /**
   * Find latest spendable UTXO for given addresses
   * This is the main public API
   *
   * @param addresses - Array of Dash addresses to monitor
   * @param options - Options including fromHeight, toHeight, requiredAmount
   * @returns Latest spendable UTXO
   * @throws Error if no spendable UTXOs found or insufficient funds
   */
  async findLatestSpendableUTXO(
    addresses: string[],
    options: UTXOFinderOptions
  ): Promise<UTXO> {
    const { fromHeight, toHeight, requiredAmount } = options;

    if (!addresses || addresses.length === 0) {
      throw new Error('At least one address is required');
    }

    // Emit start event
    this.emit('start', { addressCount: addresses.length, fromHeight });

    try {
      // Build bloom filter for address set
      this.emit('step', { step: 'building-bloom-filter' });
      const bloomFilter = BloomFilterBuilder.build(addresses, this.network);

      // Sync transactions from DAPI
      this.emit('step', { step: 'syncing-transactions' });
      const transactions = await this.syncer.syncTransactions(
        bloomFilter,
        fromHeight,
        toHeight,
        (progress: SyncProgress) => this.emit('progress', progress)
      );

      // Extract all UTXOs for our addresses
      this.emit('step', { step: 'extracting-utxos' });
      const utxos = this.extractor.extractUTXOs(transactions, addresses);

      // Save to storage if adapter provided
      if (this.storageAdapter) {
        this.emit('step', { step: 'saving-to-storage' });

        // Save UTXOs for each address
        for (const address of addresses) {
          const addressUTXOs = utxos.filter((u) => u.address === address);
          if (addressUTXOs.length > 0) {
            await this.storageAdapter.saveUTXOs(
              this.network,
              address,
              addressUTXOs
            );
          }
        }

        // Save sync checkpoint for resumption
        if (transactions.length > 0) {
          const lastTx = transactions[transactions.length - 1];
          if (lastTx && lastTx.metadata) {
            await this.storageAdapter.saveSyncCheckpoint(this.network, {
              lastBlockHeight: lastTx.metadata.height,
              lastBlockHash: lastTx.metadata.blockHash || '',
              transactionIds: transactions.map((t) => t.tx.hash),
              timestamp: Date.now(),
              network: this.network,
            });
          }
        }
      }

      // Select latest spendable UTXO
      this.emit('step', { step: 'selecting-latest-utxo' });
      const latestUTXO = LatestUTXOSelector.select(utxos, requiredAmount);

      // Emit success
      this.emit('found', {
        utxo: latestUTXO,
        totalUTXOs: utxos.length,
      });

      return latestUTXO;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Sync and return ALL UTXOs (not just the latest one)
   * Useful for getting a comprehensive view of wallet state
   *
   * @param addresses - Array of Dash addresses to monitor
   * @param options - Options including fromHeight, toHeight
   * @returns Array of all spendable UTXOs (sorted by recency)
   */
  async findAllUTXOs(
    addresses: string[],
    options: UTXOFinderOptions
  ): Promise<UTXO[]> {
    const { fromHeight, toHeight } = options;

    if (!addresses || addresses.length === 0) {
      throw new Error('At least one address is required');
    }

    this.emit('start', { addressCount: addresses.length, fromHeight });

    try {
      // Build bloom filter
      this.emit('step', { step: 'building-bloom-filter' });
      const bloomFilter = BloomFilterBuilder.build(addresses, this.network);

      // Sync transactions
      this.emit('step', { step: 'syncing-transactions' });
      const transactions = await this.syncer.syncTransactions(
        bloomFilter,
        fromHeight,
        toHeight,
        (progress: SyncProgress) => this.emit('progress', progress)
      );

      // Extract UTXOs
      this.emit('step', { step: 'extracting-utxos' });
      const utxos = this.extractor.extractUTXOs(transactions, addresses);

      // Get all spendable and sort by recency
      this.emit('step', { step: 'filtering-spendable' });
      const spendableUTXOs = LatestUTXOSelector.getAllSpendable(utxos);

      this.emit('found', {
        utxos: spendableUTXOs,
        count: spendableUTXOs.length,
      });

      return spendableUTXOs;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Select UTXOs for a specific amount (coin selection)
   * Returns minimum set of UTXOs needed to cover the amount
   *
   * @param addresses - Array of Dash addresses
   * @param options - Options including fromHeight, requiredAmount
   * @returns Array of UTXOs sufficient to cover requiredAmount
   */
  async findUTXOsForAmount(
    addresses: string[],
    options: UTXOFinderOptions & { requiredAmount: number }
  ): Promise<UTXO[]> {
    if (!options.requiredAmount || options.requiredAmount <= 0) {
      throw new Error('requiredAmount must be greater than 0');
    }

    // Get all spendable UTXOs
    const allUTXOs = await this.findAllUTXOs(addresses, options);

    // Use selector to get minimum set for amount
    try {
      const selected = LatestUTXOSelector.selectForAmount(
        allUTXOs,
        options.requiredAmount
      );
      this.emit('selected', { count: selected.length, totalValue: selected.reduce((sum, u) => sum + u.satoshis, 0) });
      return selected;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Derive addresses from mnemonic and find UTXOs
   * Convenience method combining address derivation and UTXO finding
   *
   * @param mnemonic - BIP39 mnemonic
   * @param options - Options including accountIndex, externalCount, internalCount, fromHeight, etc.
   * @returns Object with latest UTXO and derived address details
   */
  async findLatestUTXOFromMnemonic(
    mnemonic: string,
    options: any = {}
  ): Promise<{
    latestUTXO: UTXO;
    addressData: any;
    externalAddresses: any[];
    internalAddresses: any[];
  }> {
    const {
      accountIndex = 0,
      externalCount = 20,
      internalCount = 20,
      fromHeight,
      requiredAmount,
    } = options;

    // Derive addresses
    this.emit('step', { step: 'deriving-addresses' });
    const { external, internal, hdPrivateKey } =
      AddressDerivation.fromMnemonic(mnemonic, this.network, {
        accountIndex,
        externalCount,
        internalCount,
      });

    // Collect all addresses
    const allAddresses = [
      ...external.map((a) => a.address),
      ...internal.map((a) => a.address),
    ];

    // Find latest UTXO
    const latestUTXO = await this.findLatestSpendableUTXO(allAddresses, {
      fromHeight,
      requiredAmount,
    });

    // Find which address was used
    const addressData = [...external, ...internal].find(
      (a) => a.address === latestUTXO.address
    );

    return {
      latestUTXO,
      addressData,
      externalAddresses: external,
      internalAddresses: internal,
    };
  }

  /**
   * Get cached UTXOs for an address (offline operation)
   * Requires storageAdapter to be configured
   *
   * @param address - Dash address to query
   * @returns Cached UTXOs or null if storage not configured
   *
   * @example
   * ```typescript
   * // Works offline if previously synced
   * const cached = await finder.getCachedUTXOs('yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj');
   * if (cached) {
   *   console.log(`Found ${cached.length} cached UTXOs`);
   * } else {
   *   console.log('No cache available, need to sync');
   * }
   * ```
   */
  async getCachedUTXOs(address: string): Promise<UTXO[] | null> {
    if (!this.storageAdapter) {
      return null;
    }
    return await this.storageAdapter.getUTXOs(this.network, address);
  }

  /**
   * Clear cached data for current network
   * Requires storageAdapter to be configured
   *
   * @param address - Optional: clear only specific address
   *
   * @example
   * ```typescript
   * // Clear all cache for testnet
   * await finder.clearCache();
   *
   * // Clear specific address
   * await finder.clearCache('yjPtiKh2uwk3bDtzJ1U1eqhJPPB1tEzQxj');
   * ```
   */
  async clearCache(address?: string): Promise<void> {
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not configured');
    }
    await this.storageAdapter.clear(this.network, address);
  }

  /**
   * Get the network
   */
  getNetwork(): string {
    return this.network;
  }

  /**
   * Set the network (for flexibility)
   */
  setNetwork(network: string): void {
    this.network = network;
    this.syncer = new TransactionSyncer(this.dapiClient, network);
    this.extractor = new UTXOExtractor(network);
  }
}
