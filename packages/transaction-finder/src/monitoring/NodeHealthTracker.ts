/**
 * NodeHealthTracker - Tracks DAPI node health for InstantSend hex delivery
 *
 * Purpose:
 * Most DAPI testnet nodes don't have ZMQ `rawtxlocksig` enabled in their Dash Core
 * configuration. When connected to a node WITH this enabled, IS hex delivery works.
 * This tracker enables multi-node resilience by:
 *
 * 1. Tracking which nodes successfully deliver IS hex
 * 2. Blacklisting nodes that fail to deliver IS hex (session-only)
 * 3. Providing a list of healthy nodes for parallel stream connections
 *
 * Design decisions:
 * - In-memory only: Resets on restart, no persistence
 * - Immediate blacklist: Nodes without rawtxlocksig are deterministically broken
 * - Session-scoped: Blacklist cleared on restart (node config may change)
 * - First-wins: IS hex is LLMQ-signed, can't be faked
 */

export interface NodeStats {
  /** Node address (host:port) */
  address: string;
  /** Number of successful IS hex deliveries */
  successes: number;
  /** Number of failed IS hex deliveries */
  failures: number;
  /** Whether this node is blacklisted for the session */
  blacklisted: boolean;
  /** Timestamp of last successful IS hex delivery */
  lastSuccessTime: number | null;
  /** Timestamp when node was blacklisted */
  blacklistedAt: number | null;
}

export interface NodeHealthTrackerConfig {
  /** Maximum number of nodes to track (default: 100) */
  maxTrackedNodes?: number;
  /** Auto-blacklist after this many consecutive failures (default: 1) */
  blacklistThreshold?: number;
}

export class NodeHealthTracker {
  private nodes: Map<string, NodeStats> = new Map();
  private blacklistedNodes: Set<string> = new Set();
  private maxTrackedNodes: number;
  private blacklistThreshold: number;

  constructor(config: NodeHealthTrackerConfig = {}) {
    this.maxTrackedNodes = config.maxTrackedNodes ?? 100;
    this.blacklistThreshold = config.blacklistThreshold ?? 1;
  }

  /**
   * Record a successful IS hex delivery from a node.
   * Resets the node's failure count and removes it from blacklist if present.
   */
  recordSuccess(nodeAddress: string): void {
    const normalized = this.normalizeAddress(nodeAddress);
    const existing = this.nodes.get(normalized);

    if (existing) {
      existing.successes++;
      existing.failures = 0; // Reset failures on success
      existing.lastSuccessTime = Date.now();
      existing.blacklisted = false;
      existing.blacklistedAt = null;
    } else {
      this.ensureCapacity();
      this.nodes.set(normalized, {
        address: normalized,
        successes: 1,
        failures: 0,
        blacklisted: false,
        lastSuccessTime: Date.now(),
        blacklistedAt: null,
      });
    }

    // Remove from blacklist if present
    this.blacklistedNodes.delete(normalized);
  }

  /**
   * Record a failed IS hex delivery (timeout or no hex).
   * Automatically blacklists the node if threshold is reached.
   */
  recordFailure(nodeAddress: string): void {
    const normalized = this.normalizeAddress(nodeAddress);
    const existing = this.nodes.get(normalized);

    if (existing) {
      existing.failures++;
      if (existing.failures >= this.blacklistThreshold) {
        this.blacklist(normalized);
      }
    } else {
      this.ensureCapacity();
      const newNode: NodeStats = {
        address: normalized,
        successes: 0,
        failures: 1,
        blacklisted: false,
        lastSuccessTime: null,
        blacklistedAt: null,
      };
      this.nodes.set(normalized, newNode);
      if (newNode.failures >= this.blacklistThreshold) {
        this.blacklist(normalized);
      }
    }
  }

  /**
   * Blacklist a node for the current session.
   * Blacklisted nodes won't be selected for IS hex hunting.
   */
  blacklist(nodeAddress: string): void {
    const normalized = this.normalizeAddress(nodeAddress);
    this.blacklistedNodes.add(normalized);

    const existing = this.nodes.get(normalized);
    if (existing) {
      existing.blacklisted = true;
      existing.blacklistedAt = Date.now();
    } else {
      this.ensureCapacity();
      this.nodes.set(normalized, {
        address: normalized,
        successes: 0,
        failures: 0,
        blacklisted: true,
        lastSuccessTime: null,
        blacklistedAt: Date.now(),
      });
    }
  }

  /**
   * Check if a node is blacklisted.
   */
  isBlacklisted(nodeAddress: string): boolean {
    const normalized = this.normalizeAddress(nodeAddress);
    return this.blacklistedNodes.has(normalized);
  }

  /**
   * Get list of healthy (non-blacklisted) nodes.
   * Optionally exclude specific nodes.
   */
  getHealthyNodes(exclude: string[] = []): string[] {
    const excludeSet = new Set(exclude.map((addr) => this.normalizeAddress(addr)));
    const healthy: string[] = [];

    for (const [address, stats] of this.nodes) {
      if (!stats.blacklisted && !excludeSet.has(address)) {
        healthy.push(address);
      }
    }

    // Sort by success count (most successful first)
    healthy.sort((a, b) => {
      const statsA = this.nodes.get(a);
      const statsB = this.nodes.get(b);
      return (statsB?.successes ?? 0) - (statsA?.successes ?? 0);
    });

    return healthy;
  }

  /**
   * Get list of blacklisted nodes.
   */
  getBlacklistedNodes(): string[] {
    return Array.from(this.blacklistedNodes);
  }

  /**
   * Get stats for a specific node.
   */
  getNodeStats(nodeAddress: string): NodeStats | undefined {
    const normalized = this.normalizeAddress(nodeAddress);
    return this.nodes.get(normalized);
  }

  /**
   * Get stats for all tracked nodes.
   */
  getAllStats(): Map<string, NodeStats> {
    return new Map(this.nodes);
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    totalTracked: number;
    healthy: number;
    blacklisted: number;
    totalSuccesses: number;
    totalFailures: number;
  } {
    let totalSuccesses = 0;
    let totalFailures = 0;
    let healthy = 0;

    for (const stats of this.nodes.values()) {
      totalSuccesses += stats.successes;
      totalFailures += stats.failures;
      if (!stats.blacklisted) {
        healthy++;
      }
    }

    return {
      totalTracked: this.nodes.size,
      healthy,
      blacklisted: this.blacklistedNodes.size,
      totalSuccesses,
      totalFailures,
    };
  }

  /**
   * Clear a specific node from the blacklist (restore health).
   */
  unblacklist(nodeAddress: string): void {
    const normalized = this.normalizeAddress(nodeAddress);
    this.blacklistedNodes.delete(normalized);

    const existing = this.nodes.get(normalized);
    if (existing) {
      existing.blacklisted = false;
      existing.blacklistedAt = null;
      existing.failures = 0; // Reset failures when unblacklisting
    }
  }

  /**
   * Clear all tracked data (full reset).
   */
  clear(): void {
    this.nodes.clear();
    this.blacklistedNodes.clear();
  }

  /**
   * Clear only the blacklist (keep stats).
   */
  clearBlacklist(): void {
    for (const address of this.blacklistedNodes) {
      const stats = this.nodes.get(address);
      if (stats) {
        stats.blacklisted = false;
        stats.blacklistedAt = null;
      }
    }
    this.blacklistedNodes.clear();
  }

  /**
   * Seed the tracker with known-good IS nodes.
   * These nodes start with a success count, making them preferred for IS hunting.
   * @param addresses Array of node addresses known to deliver IS hex
   * @param initialSuccesses Number of successes to credit (default: 5)
   */
  seedKnownGood(addresses: string[], initialSuccesses = 5): void {
    for (const address of addresses) {
      const normalized = this.normalizeAddress(address);
      const existing = this.nodes.get(normalized);

      if (existing) {
        // Boost existing node's success count
        existing.successes = Math.max(existing.successes, initialSuccesses);
        existing.blacklisted = false;
        existing.blacklistedAt = null;
        this.blacklistedNodes.delete(normalized);
      } else {
        this.ensureCapacity();
        this.nodes.set(normalized, {
          address: normalized,
          successes: initialSuccesses,
          failures: 0,
          blacklisted: false,
          lastSuccessTime: null,
          blacklistedAt: null,
        });
      }
    }
  }

  /**
   * Export current health data for persistence.
   * Returns a JSON-serializable object.
   */
  exportHealth(): {
    version: number;
    generated: string;
    knownGood: string[];
    learned: Record<string, { successes: number; failures: number; blacklisted?: boolean }>;
  } {
    const learned: Record<string, { successes: number; failures: number; blacklisted?: boolean }> = {};

    for (const [address, stats] of this.nodes) {
      // Only export nodes with activity
      if (stats.successes > 0 || stats.failures > 0) {
        learned[address] = {
          successes: stats.successes,
          failures: stats.failures,
        };
        if (stats.blacklisted) {
          learned[address].blacklisted = true;
        }
      }
    }

    // Extract known-good nodes (high success, not blacklisted)
    const knownGood = Array.from(this.nodes.entries())
      .filter(([_, stats]) => stats.successes >= 3 && !stats.blacklisted)
      .sort((a, b) => b[1].successes - a[1].successes)
      .map(([addr]) => addr);

    return {
      version: 1,
      generated: new Date().toISOString(),
      knownGood,
      learned,
    };
  }

  /**
   * Import health data from persistence.
   * @param data Previously exported health data
   */
  importHealth(data: {
    knownGood?: string[];
    learned?: Record<string, { successes: number; failures: number; blacklisted?: boolean }>;
  }): void {
    // First, seed known-good nodes
    if (data.knownGood && Array.isArray(data.knownGood)) {
      this.seedKnownGood(data.knownGood, 5);
    }

    // Then, import learned data (may override known-good)
    if (data.learned) {
      for (const [address, stats] of Object.entries(data.learned)) {
        const normalized = this.normalizeAddress(address);
        const existing = this.nodes.get(normalized);

        if (existing) {
          existing.successes = Math.max(existing.successes, stats.successes);
          existing.failures = stats.failures;
          if (stats.blacklisted) {
            this.blacklist(normalized);
          }
        } else {
          this.ensureCapacity();
          this.nodes.set(normalized, {
            address: normalized,
            successes: stats.successes,
            failures: stats.failures,
            blacklisted: stats.blacklisted || false,
            lastSuccessTime: null,
            blacklistedAt: stats.blacklisted ? Date.now() : null,
          });
          if (stats.blacklisted) {
            this.blacklistedNodes.add(normalized);
          }
        }
      }
    }
  }

  /**
   * Register a node without recording success or failure.
   * Useful for adding known nodes from DNS seeds.
   */
  registerNode(nodeAddress: string): void {
    const normalized = this.normalizeAddress(nodeAddress);
    if (!this.nodes.has(normalized)) {
      this.ensureCapacity();
      this.nodes.set(normalized, {
        address: normalized,
        successes: 0,
        failures: 0,
        blacklisted: false,
        lastSuccessTime: null,
        blacklistedAt: null,
      });
    }
  }

  /**
   * Normalize node address for consistent comparison.
   * Handles variations like:
   * - "host:port" -> "host:port"
   * - "host" -> "host:443" (default DAPI port)
   * - Trim whitespace
   */
  private normalizeAddress(address: string): string {
    const trimmed = address.trim().toLowerCase();
    if (!trimmed.includes(':')) {
      return `${trimmed}:443`;
    }
    return trimmed;
  }

  /**
   * Ensure we don't exceed max tracked nodes.
   * Removes oldest blacklisted nodes first, then oldest unused nodes.
   */
  private ensureCapacity(): void {
    if (this.nodes.size < this.maxTrackedNodes) {
      return;
    }

    // Find and remove the oldest blacklisted node
    let oldestBlacklisted: string | null = null;
    let oldestBlacklistedTime = Infinity;

    for (const [address, stats] of this.nodes) {
      if (
        stats.blacklisted &&
        stats.blacklistedAt &&
        stats.blacklistedAt < oldestBlacklistedTime
      ) {
        oldestBlacklisted = address;
        oldestBlacklistedTime = stats.blacklistedAt;
      }
    }

    if (oldestBlacklisted) {
      this.nodes.delete(oldestBlacklisted);
      this.blacklistedNodes.delete(oldestBlacklisted);
      return;
    }

    // If no blacklisted nodes, remove the node with fewest successes
    let leastSuccessful: string | null = null;
    let leastSuccesses = Infinity;

    for (const [address, stats] of this.nodes) {
      if (stats.successes < leastSuccesses) {
        leastSuccessful = address;
        leastSuccesses = stats.successes;
      }
    }

    if (leastSuccessful) {
      this.nodes.delete(leastSuccessful);
    }
  }
}
