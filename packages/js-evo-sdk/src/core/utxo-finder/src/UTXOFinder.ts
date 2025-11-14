/**
 * UTXOFinder - Main API for finding latest spendable UTXOs
 * Stateless utility that coordinates address derivation, transaction syncing,
 * UTXO extraction, and UTXO selection
 */

import { EventEmitter } from 'events';

import { BloomFilterBuilder } from './BloomFilterBuilder.js';
import { TransactionSyncer } from './TransactionSyncer.js';
import { UTXOExtractor } from './UTXOExtractor.js';
import { LatestUTXOSelector } from './LatestUTXOSelector.js';

import { UTXO, UTXOFinderOptions, SyncProgress, DAPIClientLike } from './types.js';

export class UTXOFinder extends EventEmitter {
  private dapiClient: DAPIClientLike; // ResilientDAPIClient or DAPIClient
  private network: string;
  private syncer: TransactionSyncer;
  private extractor: UTXOExtractor;

  /**
   * Initialize UTXOFinder
   * @param dapiClient - DAPI client instance (ResilientDAPIClient or legacy DAPIClient)
   * @param network - 'mainnet', 'testnet', or 'regtest'
   */
  constructor(
    dapiClient: DAPIClientLike,
    network: string = 'testnet'
  ) {
    super();
    this.dapiClient = dapiClient;
    this.network = network;
    this.syncer = new TransactionSyncer(dapiClient, network);
    this.extractor = new UTXOExtractor(network);
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
