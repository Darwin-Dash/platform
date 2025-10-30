/**
 * IndexedDBAdapter - Browser IndexedDB implementation
 * Suitable for larger UTXO sets (100s of MB possible)
 * Asynchronous and robust, best for production use
 */

import { UTXO } from './types';
import { StorageAdapter, SyncCheckpoint } from './StorageAdapter';

/**
 * Browser IndexedDB-based storage adapter
 * Provides large storage capacity and persistence across browser sessions
 *
 * @example
 * ```typescript
 * const storage = new IndexedDBAdapter('my-wallet-db');
 * const finder = new UTXOFinder(dapiClient, 'testnet', {
 *   storageAdapter: storage
 * });
 *
 * // Remember to close when done
 * await storage.close();
 * ```
 */
export class IndexedDBAdapter implements StorageAdapter {
  private dbName: string;
  private dbVersion: number = 1;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * Create IndexedDB adapter
   * @param dbName - Database name (default: 'dash-utxo-cache')
   * @throws Error if IndexedDB not available
   */
  constructor(dbName: string = 'dash-utxo-cache') {
    this.dbName = dbName;

    if (typeof indexedDB === 'undefined') {
      throw new Error(
        'IndexedDB not available in this environment. Use InMemoryStorage or LocalStorageAdapter instead.'
      );
    }
  }

  /**
   * Initialize database connection
   * Creates object stores on first open
   * @private
   */
  private async initDB(): Promise<IDBDatabase> {
    // Return existing connection if available
    if (this.db) {
      return this.db;
    }

    // Return existing init promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create new init promise
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        this.initPromise = null;
        reject(
          new Error(
            `Failed to open IndexedDB: ${request.error?.message || 'Unknown error'}`
          )
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initPromise = null;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains('utxos')) {
          const utxoStore = db.createObjectStore('utxos', { keyPath: 'id' });
          // Indexes for efficient queries
          utxoStore.createIndex('network', 'network', { unique: false });
          utxoStore.createIndex('address', 'address', { unique: false });
          utxoStore.createIndex('network_address', ['network', 'address'], {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains('checkpoints')) {
          db.createObjectStore('checkpoints', { keyPath: 'network' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save UTXOs to IndexedDB
   */
  async saveUTXOs(
    network: string,
    address: string,
    utxos: UTXO[]
  ): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['utxos'], 'readwrite');
    const store = transaction.objectStore('utxos');

    const record = {
      id: `${network}:${address}`,
      network,
      address,
      utxos,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new Error(
            `Failed to save UTXOs to IndexedDB: ${request.error?.message || 'Unknown error'}`
          )
        );

      // Also handle transaction errors
      transaction.onerror = () =>
        reject(
          new Error(
            `Transaction failed: ${transaction.error?.message || 'Unknown error'}`
          )
        );
    });
  }

  /**
   * Retrieve UTXOs from IndexedDB
   * Returns empty array if not found
   */
  async getUTXOs(network: string, address: string): Promise<UTXO[]> {
    const db = await this.initDB();
    const transaction = db.transaction(['utxos'], 'readonly');
    const store = transaction.objectStore('utxos');

    return new Promise((resolve, reject) => {
      const request = store.get(`${network}:${address}`);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record?.utxos || []);
      };

      request.onerror = () =>
        reject(
          new Error(
            `Failed to retrieve UTXOs from IndexedDB: ${request.error?.message || 'Unknown error'}`
          )
        );
    });
  }

  /**
   * Save sync checkpoint to IndexedDB
   */
  async saveSyncCheckpoint(
    network: string,
    checkpoint: SyncCheckpoint
  ): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['checkpoints'], 'readwrite');
    const store = transaction.objectStore('checkpoints');

    return new Promise((resolve, reject) => {
      const request = store.put({ ...checkpoint, network });

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(
          new Error(
            `Failed to save checkpoint to IndexedDB: ${request.error?.message || 'Unknown error'}`
          )
        );
    });
  }

  /**
   * Retrieve sync checkpoint from IndexedDB
   * Returns null if not found
   */
  async getSyncCheckpoint(network: string): Promise<SyncCheckpoint | null> {
    const db = await this.initDB();
    const transaction = db.transaction(['checkpoints'], 'readonly');
    const store = transaction.objectStore('checkpoints');

    return new Promise((resolve, reject) => {
      const request = store.get(network);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () =>
        reject(
          new Error(
            `Failed to retrieve checkpoint from IndexedDB: ${request.error?.message || 'Unknown error'}`
          )
        );
    });
  }

  /**
   * Clear cached data from IndexedDB
   */
  async clear(network: string, address?: string): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(['utxos', 'checkpoints'], 'readwrite');
    const utxoStore = transaction.objectStore('utxos');
    const checkpointStore = transaction.objectStore('checkpoints');

    return new Promise((resolve, reject) => {
      if (address) {
        // Clear specific address
        const request = utxoStore.delete(`${network}:${address}`);

        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(
            new Error(
              `Failed to clear address data: ${request.error?.message || 'Unknown error'}`
            )
          );
      } else {
        // Clear all for network using index
        const index = utxoStore.index('network');
        const range = IDBKeyRange.only(network);
        const cursorRequest = index.openCursor(range);

        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;

          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            // After clearing UTXOs, clear checkpoint
            const checkpointRequest = checkpointStore.delete(network);

            checkpointRequest.onsuccess = () => resolve();
            checkpointRequest.onerror = () =>
              reject(
                new Error(
                  `Failed to clear checkpoint: ${checkpointRequest.error?.message || 'Unknown error'}`
                )
              );
          }
        };

        cursorRequest.onerror = () =>
          reject(
            new Error(
              `Failed to iterate UTXOs for deletion: ${cursorRequest.error?.message || 'Unknown error'}`
            )
          );
      }

      transaction.onerror = () =>
        reject(
          new Error(
            `Transaction failed during clear: ${transaction.error?.message || 'Unknown error'}`
          )
        );
    });
  }

  /**
   * Get all cached addresses for a network
   * Utility method for debugging and management
   */
  async getCachedAddresses(network: string): Promise<string[]> {
    const db = await this.initDB();
    const transaction = db.transaction(['utxos'], 'readonly');
    const store = transaction.objectStore('utxos');
    const index = store.index('network');

    return new Promise((resolve, reject) => {
      const addresses: string[] = [];
      const range = IDBKeyRange.only(network);
      const cursorRequest = index.openCursor(range);

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          addresses.push(cursor.value.address);
          cursor.continue();
        } else {
          resolve(addresses);
        }
      };

      cursorRequest.onerror = () =>
        reject(
          new Error(
            `Failed to retrieve addresses: ${cursorRequest.error?.message || 'Unknown error'}`
          )
        );
    });
  }

  /**
   * Get storage statistics
   * Utility method for monitoring storage usage
   */
  async getStats(): Promise<{
    totalRecords: number;
    totalCheckpoints: number;
    networks: string[];
  }> {
    const db = await this.initDB();
    const transaction = db.transaction(['utxos', 'checkpoints'], 'readonly');
    const utxoStore = transaction.objectStore('utxos');
    const checkpointStore = transaction.objectStore('checkpoints');

    return new Promise((resolve, reject) => {
      const countUtxos = utxoStore.count();
      const countCheckpoints = checkpointStore.count();
      const getAllUtxos = utxoStore.getAll();

      Promise.all([
        new Promise<number>((res, rej) => {
          countUtxos.onsuccess = () => res(countUtxos.result);
          countUtxos.onerror = () => rej(countUtxos.error);
        }),
        new Promise<number>((res, rej) => {
          countCheckpoints.onsuccess = () => res(countCheckpoints.result);
          countCheckpoints.onerror = () => rej(countCheckpoints.error);
        }),
        new Promise<any[]>((res, rej) => {
          getAllUtxos.onsuccess = () => res(getAllUtxos.result);
          getAllUtxos.onerror = () => rej(getAllUtxos.error);
        }),
      ])
        .then(([totalRecords, totalCheckpoints, allRecords]) => {
          const networks = new Set(
            allRecords.map((record) => record.network)
          );

          resolve({
            totalRecords,
            totalCheckpoints,
            networks: Array.from(networks),
          });
        })
        .catch(reject);
    });
  }

  /**
   * Close database connection
   * Call this when done with the adapter to free resources
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}
