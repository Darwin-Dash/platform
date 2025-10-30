/**
 * StorageAdapter - Optional persistent storage for UTXOs and sync state
 * Enables offline queries and sync resumption
 */

import { UTXO } from './types';

/**
 * Sync checkpoint for resuming interrupted syncs
 * Stores the last synced state to allow resumption from interruption
 */
export interface SyncCheckpoint {
  /** Last synced block height */
  lastBlockHeight: number;

  /** Last synced block hash */
  lastBlockHash: string;

  /** Transaction IDs already processed (for deduplication) */
  transactionIds: string[];

  /** Checkpoint timestamp */
  timestamp: number;

  /** Network this checkpoint belongs to */
  network: string;
}

/**
 * Storage adapter interface for caching UTXOs and sync state
 * Implement this interface to provide custom storage backends
 *
 * @example
 * ```typescript
 * class MyDatabaseStorage implements StorageAdapter {
 *   async saveUTXOs(network, address, utxos) {
 *     // Save to your database
 *   }
 *   // ... implement other methods
 * }
 * ```
 */
export interface StorageAdapter {
  /**
   * Store discovered UTXOs for an address
   * Called after successful sync to cache results
   *
   * @param network - Network name ('mainnet', 'testnet', or 'regtest')
   * @param address - Dash address
   * @param utxos - UTXO objects to store
   */
  saveUTXOs(network: string, address: string, utxos: UTXO[]): Promise<void>;

  /**
   * Retrieve cached UTXOs for an address
   * Allows querying previously synced UTXOs without network access
   *
   * @param network - Network name
   * @param address - Dash address
   * @returns Cached UTXOs or empty array if none cached
   */
  getUTXOs(network: string, address: string): Promise<UTXO[]>;

  /**
   * Store sync checkpoint for recovery
   * Saves progress state to resume interrupted syncs
   *
   * @param network - Network name
   * @param checkpoint - Sync state to save
   */
  saveSyncCheckpoint(
    network: string,
    checkpoint: SyncCheckpoint
  ): Promise<void>;

  /**
   * Retrieve sync checkpoint for resumption
   * Returns null if no checkpoint saved
   *
   * @param network - Network name
   * @returns Saved checkpoint or null
   */
  getSyncCheckpoint(network: string): Promise<SyncCheckpoint | null>;

  /**
   * Clear cached data
   *
   * @param network - Network name
   * @param address - Optional: clear only specific address
   */
  clear(network: string, address?: string): Promise<void>;
}

/**
 * Default in-memory storage implementation
 * Stores everything in RAM - fast but not persistent
 * Data is lost on process exit
 *
 * @example
 * ```typescript
 * const finder = new UTXOFinder(dapiClient, 'testnet', {
 *   storageAdapter: new InMemoryStorage()
 * });
 * ```
 */
export class InMemoryStorage implements StorageAdapter {
  private utxoCache: Map<string, UTXO[]> = new Map();
  private checkpoints: Map<string, SyncCheckpoint> = new Map();

  /**
   * Save UTXOs to in-memory cache
   */
  async saveUTXOs(network: string, address: string, utxos: UTXO[]): Promise<void> {
    const key = this.makeKey(network, address);
    this.utxoCache.set(key, [...utxos]); // Clone array to prevent mutations
  }

  /**
   * Retrieve cached UTXOs from memory
   */
  async getUTXOs(network: string, address: string): Promise<UTXO[]> {
    const key = this.makeKey(network, address);
    const cached = this.utxoCache.get(key);
    return cached ? [...cached] : []; // Clone array to prevent mutations
  }

  /**
   * Save sync checkpoint to memory
   */
  async saveSyncCheckpoint(
    network: string,
    checkpoint: SyncCheckpoint
  ): Promise<void> {
    this.checkpoints.set(network, { ...checkpoint }); // Clone to prevent mutations
  }

  /**
   * Retrieve sync checkpoint from memory
   */
  async getSyncCheckpoint(network: string): Promise<SyncCheckpoint | null> {
    const checkpoint = this.checkpoints.get(network);
    return checkpoint ? { ...checkpoint } : null; // Clone to prevent mutations
  }

  /**
   * Clear cached data from memory
   */
  async clear(network: string, address?: string): Promise<void> {
    if (address) {
      // Clear specific address
      const key = this.makeKey(network, address);
      this.utxoCache.delete(key);
    } else {
      // Clear all for network
      const prefix = `${network}:`;
      const keysToDelete: string[] = [];

      for (const key of this.utxoCache.keys()) {
        if (key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach((key) => this.utxoCache.delete(key));
      this.checkpoints.delete(network);
    }
  }

  /**
   * Get cache statistics (utility method)
   */
  getStats(): {
    totalAddresses: number;
    totalUTXOs: number;
    networks: string[];
  } {
    let totalUTXOs = 0;
    const networks = new Set<string>();

    for (const [key, utxos] of this.utxoCache.entries()) {
      totalUTXOs += utxos.length;
      const network = key.split(':')[0];
      networks.add(network);
    }

    return {
      totalAddresses: this.utxoCache.size,
      totalUTXOs,
      networks: Array.from(networks),
    };
  }

  /**
   * Create storage key from network and address
   * @private
   */
  private makeKey(network: string, address: string): string {
    return `${network}:${address}`;
  }
}
