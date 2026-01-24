/**
 * HistoricFinder - Historic blockchain scanning for UTXO discovery
 * Stateless finder that coordinates bloom filter building, transaction syncing,
 * UTXO extraction, and UTXO selection for historical blockchain data
 */

import { EventEmitter } from 'events';

import { BloomFilterBuilder } from '../core/BloomFilterBuilder.js';
import { TransactionSyncer } from '../core/TransactionSyncer.js';
import { UTXOExtractor } from '../utils/utxo-extractor.js';
import { LatestUTXOSelector } from '../utils/utxo-selector.js';

import {
  UTXO,
  HistoricFinderConfig,
  SyncProgress,
} from '../types/index.js';

export class HistoricFinder extends EventEmitter {
  private syncer: TransactionSyncer;
  private extractor: UTXOExtractor;
  private config: HistoricFinderConfig;

  /**
   * Initialize HistoricFinder
   * @param config - Historic finder configuration
   */
  constructor(config: HistoricFinderConfig) {
    super();
    this.config = config;
    this.syncer = new TransactionSyncer(config.dapiClient, config.network);
    this.extractor = new UTXOExtractor(config.network);
  }

  /**
   * Find all UTXOs for configured addresses
   * Performs full blockchain scan from fromHeight to toHeight
   *
   * @returns Array of all UTXOs found
   * @throws Error if no addresses configured or sync fails
   */
  async findUTXOs(): Promise<UTXO[]> {
    const { addresses, fromHeight, toHeight, timeout } = this.config;

    if (!addresses || addresses.length === 0) {
      throw new Error('At least one address is required');
    }

    // Emit start event
    this.emit('start', { addressCount: addresses.length, fromHeight });

    try {
      // Build bloom filter for address set
      this.emit('step', { step: 'building-bloom-filter' });
      const bloomFilter = BloomFilterBuilder.build(addresses, this.config.network);

      // Sync transactions from DAPI
      this.emit('step', { step: 'syncing-transactions' });
      const transactions = await this.syncer.syncTransactions(
        bloomFilter,
        fromHeight,
        toHeight,
        (progress: SyncProgress) => this.emit('progress', progress),
        timeout
      );

      // Extract all UTXOs for our addresses
      this.emit('step', { step: 'extracting-utxos' });
      const utxos = this.extractor.extractUTXOs(transactions, addresses);

      // Emit success
      this.emit('found', {
        utxos,
        totalUTXOs: utxos.length,
      });

      return utxos;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Find latest spendable UTXO for configured addresses
   * This is a convenience method that finds all UTXOs and selects the latest
   *
   * @returns Latest spendable UTXO
   * @throws Error if no spendable UTXOs found or insufficient funds
   */
  async findLatestSpendableUTXO(): Promise<UTXO> {
    const { addresses, fromHeight, toHeight, requiredAmount, timeout } = this.config;

    if (!addresses || addresses.length === 0) {
      throw new Error('At least one address is required');
    }

    // Emit start event
    this.emit('start', { addressCount: addresses.length, fromHeight });

    try {
      // Build bloom filter for address set
      this.emit('step', { step: 'building-bloom-filter' });
      const bloomFilter = BloomFilterBuilder.build(addresses, this.config.network);

      // Sync transactions from DAPI
      this.emit('step', { step: 'syncing-transactions' });
      const transactions = await this.syncer.syncTransactions(
        bloomFilter,
        fromHeight,
        toHeight,
        (progress: SyncProgress) => this.emit('progress', progress),
        timeout
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
   * Get the configured network
   */
  getNetwork(): string {
    return this.config.network;
  }
}
