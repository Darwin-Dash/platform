/**
 * NodePoolManager
 *
 * Manages DAPI node pool with rotation and blacklisting from payment-monitor
 */

import { Logger } from '../utils/logger.js';

export class NodePoolManager {
  private nodes: string[];
  private currentIndex: number = 0;
  private failedNodes: Map<string, number> = new Map();
  private retryDelay: number;
  private logger: Logger;

  constructor(addresses: string[] | undefined, retryDelay: number, logger: Logger) {
    this.nodes = addresses ? [...addresses] : [];
    this.retryDelay = retryDelay;
    this.logger = logger;

    if (this.nodes.length > 0) {
      this.shuffle();
      this.logger.debug(`Node pool initialized with ${this.nodes.length} nodes`);
    }
  }

  /**
   * Shuffle nodes for load distribution (Fisher-Yates algorithm)
   */
  private shuffle(): void {
    for (let i = this.nodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.nodes[i], this.nodes[j]] = [this.nodes[j], this.nodes[i]];
    }
  }

  /**
   * Rotate to next available node (skips recently failed nodes)
   * @returns true if found usable node, false if all recently failed
   */
  rotateToNext(): boolean {
    if (this.nodes.length <= 1) {
      return false; // Can't rotate with 0 or 1 nodes
    }

    const now = Date.now();

    // Try each node in order
    for (let i = 0; i < this.nodes.length; i++) {
      const nextIndex = (this.currentIndex + 1 + i) % this.nodes.length;
      const node = this.nodes[nextIndex];

      // Check if recently failed
      const failTime = this.failedNodes.get(node);
      if (failTime && now - failTime < this.retryDelay) {
        const ageSeconds = Math.floor((now - failTime) / 1000);
        this.logger.debug(`Skipping ${node} (failed ${ageSeconds}s ago)`);
        continue;
      }

      // Found usable node
      this.currentIndex = nextIndex;
      this.logger.debug(`Rotated to node ${nextIndex}: ${node}`);
      return true;
    }

    this.logger.warn('All nodes recently failed, cannot rotate');
    return false; // All nodes recently failed
  }

  /**
   * Mark current node as failed
   */
  markCurrentFailed(): void {
    if (this.nodes.length > 0) {
      const current = this.nodes[this.currentIndex];
      this.failedNodes.set(current, Date.now());
      this.logger.debug(`Marked ${current} as failed`);
    }
  }

  /**
   * Get current node address
   */
  getCurrentNode(): string | null {
    return this.nodes.length > 0 ? this.nodes[this.currentIndex] : null;
  }

  /**
   * Get total number of nodes in pool
   */
  getPoolSize(): number {
    return this.nodes.length;
  }

  /**
   * Check if pool has multiple nodes (failover possible)
   */
  hasMultipleNodes(): boolean {
    return this.nodes.length > 1;
  }

  /**
   * Get count of currently failed nodes
   */
  getFailedNodeCount(): number {
    const now = Date.now();
    let count = 0;

    this.failedNodes.forEach((failTime) => {
      if (now - failTime < this.retryDelay) {
        count++;
      }
    });

    return count;
  }

  /**
   * Clear failed node blacklist (for testing or manual recovery)
   */
  clearFailedNodes(): void {
    this.failedNodes.clear();
    this.logger.debug('Failed nodes blacklist cleared');
  }
}
