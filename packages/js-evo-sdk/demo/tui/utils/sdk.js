/**
 * SDK Connection Helper for TUI
 *
 * Manages SDK connection state and provides utility functions.
 */

import { EvoSDK } from '../../../dist/sdk.js';

/**
 * SDK connection state singleton
 */
class SDKConnection {
  constructor() {
    this.sdk = null;
    this.network = 'testnet';
    this.connecting = false;
    this.error = null;
  }

  /**
   * Configure network
   * @param {string} network - Network name
   */
  setNetwork(network) {
    this.network = network;
  }

  /**
   * Get current SDK instance (creates if needed)
   * @returns {Promise<EvoSDK>}
   */
  async getSDK() {
    if (!this.sdk && !this.connecting) {
      await this.connect();
    }
    return this.sdk;
  }

  /**
   * Connect to network
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.sdk) return;
    if (this.connecting) return;

    this.connecting = true;
    this.error = null;

    try {
      this.sdk = new EvoSDK({
        network: this.network,
        logs: 'error',
      });
      await this.sdk.connect();
    } catch (err) {
      this.error = err;
      this.sdk = null;
      throw err;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Disconnect and reset
   */
  disconnect() {
    if (this.sdk) {
      this.sdk.resetWasmSdk();
      this.sdk = null;
    }
    this.error = null;
    this.connecting = false;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.sdk?.isConnected || false;
  }

  /**
   * Get connection status
   * @returns {object}
   */
  getStatus() {
    return {
      connected: this.isConnected(),
      connecting: this.connecting,
      network: this.network,
      error: this.error?.message || null,
    };
  }
}

// Singleton instance
export const sdkConnection = new SDKConnection();

/**
 * Format duffs as DASH
 * @param {number|bigint} duffs
 * @returns {string}
 */
export function formatDash(duffs) {
  const amount = typeof duffs === 'bigint' ? duffs : BigInt(duffs);
  const dash = Number(amount) / 100_000_000;
  return `${dash.toFixed(8)} DASH`;
}

/**
 * Format credits amount
 * @param {number|bigint} credits
 * @returns {string}
 */
export function formatCredits(credits) {
  const amount = typeof credits === 'bigint' ? credits : BigInt(credits);
  return `${amount.toLocaleString()} credits`;
}

/**
 * Truncate an ID for display
 * @param {string} id
 * @param {number} length
 * @returns {string}
 */
export function truncateId(id, length = 16) {
  if (!id || id.length <= length) return id;
  const half = Math.floor(length / 2) - 1;
  return `${id.slice(0, half)}...${id.slice(-half)}`;
}

/**
 * Format date from timestamp
 * @param {number|Date} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleString();
}

export default sdkConnection;
