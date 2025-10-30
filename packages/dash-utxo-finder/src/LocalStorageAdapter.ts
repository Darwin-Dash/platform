/**
 * LocalStorageAdapter - Browser localStorage implementation
 * Suitable for small UTXO sets (typical limit: 5-10MB)
 * Synchronous and simple, but limited storage capacity
 */

import { UTXO } from './types';
import { StorageAdapter, SyncCheckpoint } from './StorageAdapter';

/**
 * Browser localStorage-based storage adapter
 * Persists across browser sessions but has size limits
 *
 * @example
 * ```typescript
 * const finder = new UTXOFinder(dapiClient, 'testnet', {
 *   storageAdapter: new LocalStorageAdapter('my-wallet-cache')
 * });
 * ```
 */
export class LocalStorageAdapter implements StorageAdapter {
  private storageKey: string;

  /**
   * Create LocalStorage adapter
   * @param storageKey - Key prefix for localStorage (default: 'dash-utxo-cache')
   * @throws Error if localStorage not available
   */
  constructor(storageKey: string = 'dash-utxo-cache') {
    this.storageKey = storageKey;

    // Check if localStorage is available
    if (typeof localStorage === 'undefined') {
      throw new Error(
        'localStorage not available in this environment. Use InMemoryStorage or IndexedDBAdapter instead.'
      );
    }
  }

  /**
   * Make storage key for network and optional address
   * @private
   */
  private makeKey(network: string, address?: string): string {
    return address
      ? `${this.storageKey}:${network}:${address}`
      : `${this.storageKey}:${network}`;
  }

  /**
   * Save UTXOs to localStorage
   * @throws Error if quota exceeded
   */
  async saveUTXOs(
    network: string,
    address: string,
    utxos: UTXO[]
  ): Promise<void> {
    const key = this.makeKey(network, address);

    try {
      const serialized = JSON.stringify(utxos);
      localStorage.setItem(key, serialized);
    } catch (error: any) {
      // Handle QuotaExceededError
      if (error.name === 'QuotaExceededError') {
        throw new Error(
          'localStorage quota exceeded. Consider using IndexedDBAdapter for larger datasets.'
        );
      }
      throw new Error(
        `Failed to save UTXOs to localStorage: ${error.message || String(error)}`
      );
    }
  }

  /**
   * Retrieve UTXOs from localStorage
   * Returns empty array if not found or parse error
   */
  async getUTXOs(network: string, address: string): Promise<UTXO[]> {
    const key = this.makeKey(network, address);
    const data = localStorage.getItem(key);

    if (!data) {
      return [];
    }

    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Failed to parse cached UTXOs from localStorage:', error);
      return [];
    }
  }

  /**
   * Save sync checkpoint to localStorage
   */
  async saveSyncCheckpoint(
    network: string,
    checkpoint: SyncCheckpoint
  ): Promise<void> {
    const key = `${this.makeKey(network)}:checkpoint`;

    try {
      const serialized = JSON.stringify(checkpoint);
      localStorage.setItem(key, serialized);
    } catch (error: any) {
      if (error.name === 'QuotaExceededError') {
        throw new Error(
          'localStorage quota exceeded while saving checkpoint.'
        );
      }
      throw new Error(
        `Failed to save checkpoint: ${error.message || String(error)}`
      );
    }
  }

  /**
   * Retrieve sync checkpoint from localStorage
   */
  async getSyncCheckpoint(network: string): Promise<SyncCheckpoint | null> {
    const key = `${this.makeKey(network)}:checkpoint`;
    const data = localStorage.getItem(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to parse checkpoint from localStorage:', error);
      return null;
    }
  }

  /**
   * Clear cached data from localStorage
   */
  async clear(network: string, address?: string): Promise<void> {
    if (address) {
      // Clear specific address
      const key = this.makeKey(network, address);
      localStorage.removeItem(key);
    } else {
      // Clear all for network (UTXO cache + checkpoint)
      const prefix = this.makeKey(network);
      const keysToRemove: string[] = [];

      // Collect all keys that match the network prefix
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }

      // Remove collected keys
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  }

  /**
   * Get storage statistics (utility method)
   */
  getStorageInfo(): {
    totalKeys: number;
    estimatedSize: number;
    keys: string[];
  } {
    const matchingKeys: string[] = [];
    let estimatedSize = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.getItem(String(i));
      if (key && key.startsWith(this.storageKey)) {
        matchingKeys.push(key);
        const value = localStorage.getItem(key);
        if (value) {
          estimatedSize += value.length * 2; // Rough estimate (UTF-16)
        }
      }
    }

    return {
      totalKeys: matchingKeys.length,
      estimatedSize,
      keys: matchingKeys,
    };
  }
}
