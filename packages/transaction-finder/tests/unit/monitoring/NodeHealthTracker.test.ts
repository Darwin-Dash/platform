/**
 * Unit tests for NodeHealthTracker
 *
 * Tests node health tracking for multi-node InstantSend hex hunting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeHealthTracker } from '../../../src/monitoring/NodeHealthTracker.js';

describe('NodeHealthTracker', () => {
  let tracker: NodeHealthTracker;

  beforeEach(() => {
    tracker = new NodeHealthTracker();
  });

  // ============================================================================
  // Basic Operations
  // ============================================================================
  describe('Basic Operations', () => {
    it('should initialize with empty state', () => {
      const summary = tracker.getSummary();
      expect(summary.totalTracked).toBe(0);
      expect(summary.healthy).toBe(0);
      expect(summary.blacklisted).toBe(0);
      expect(summary.totalSuccesses).toBe(0);
      expect(summary.totalFailures).toBe(0);
    });

    it('should record successful IS hex delivery', () => {
      tracker.recordSuccess('node1.example.com:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
      expect(stats!.successes).toBe(1);
      expect(stats!.failures).toBe(0);
      expect(stats!.blacklisted).toBe(false);
      expect(stats!.lastSuccessTime).not.toBeNull();
    });

    it('should record failed IS hex delivery', () => {
      tracker.recordFailure('node1.example.com:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
      expect(stats!.successes).toBe(0);
      expect(stats!.failures).toBe(1);
    });

    it('should increment success count on multiple successes', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.successes).toBe(3);
    });

    it('should increment failure count on multiple failures', () => {
      // Use threshold > 1 to test failure counting
      tracker = new NodeHealthTracker({ blacklistThreshold: 5 });

      tracker.recordFailure('node1.example.com:443');
      tracker.recordFailure('node1.example.com:443');
      tracker.recordFailure('node1.example.com:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.failures).toBe(3);
      expect(stats!.blacklisted).toBe(false);
    });
  });

  // ============================================================================
  // Blacklisting
  // ============================================================================
  describe('Blacklisting', () => {
    it('should auto-blacklist after threshold failures (default threshold: 1)', () => {
      tracker.recordFailure('node1.example.com:443');

      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(true);

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.blacklisted).toBe(true);
      expect(stats!.blacklistedAt).not.toBeNull();
    });

    it('should auto-blacklist after custom threshold failures', () => {
      tracker = new NodeHealthTracker({ blacklistThreshold: 3 });

      tracker.recordFailure('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(false);

      tracker.recordFailure('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(false);

      tracker.recordFailure('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(true);
    });

    it('should manually blacklist a node', () => {
      tracker.blacklist('node1.example.com:443');

      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(true);

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.blacklisted).toBe(true);
    });

    it('should unblacklist a node', () => {
      tracker.blacklist('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(true);

      tracker.unblacklist('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(false);

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.blacklisted).toBe(false);
      expect(stats!.failures).toBe(0); // Failures reset on unblacklist
    });

    it('should remove from blacklist on success', () => {
      tracker.blacklist('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(true);

      tracker.recordSuccess('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(false);

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.blacklisted).toBe(false);
      expect(stats!.failures).toBe(0);
    });

    it('should return list of blacklisted nodes', () => {
      tracker.blacklist('node1.example.com:443');
      tracker.blacklist('node2.example.com:443');
      tracker.recordSuccess('node3.example.com:443');

      const blacklisted = tracker.getBlacklistedNodes();
      expect(blacklisted).toHaveLength(2);
      expect(blacklisted).toContain('node1.example.com:443');
      expect(blacklisted).toContain('node2.example.com:443');
    });
  });

  // ============================================================================
  // Healthy Node Selection
  // ============================================================================
  describe('Healthy Node Selection', () => {
    it('should return only healthy (non-blacklisted) nodes', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node2.example.com:443');
      tracker.blacklist('node3.example.com:443');

      const healthy = tracker.getHealthyNodes();
      expect(healthy).toHaveLength(2);
      expect(healthy).toContain('node1.example.com:443');
      expect(healthy).toContain('node2.example.com:443');
      expect(healthy).not.toContain('node3.example.com:443');
    });

    it('should exclude specified nodes', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node2.example.com:443');
      tracker.recordSuccess('node3.example.com:443');

      const healthy = tracker.getHealthyNodes(['node2.example.com:443']);
      expect(healthy).toHaveLength(2);
      expect(healthy).not.toContain('node2.example.com:443');
    });

    it('should sort healthy nodes by success count (most successful first)', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node2.example.com:443');
      tracker.recordSuccess('node2.example.com:443');
      tracker.recordSuccess('node3.example.com:443');
      tracker.recordSuccess('node3.example.com:443');
      tracker.recordSuccess('node3.example.com:443');

      const healthy = tracker.getHealthyNodes();
      expect(healthy[0]).toBe('node3.example.com:443'); // 3 successes
      expect(healthy[1]).toBe('node2.example.com:443'); // 2 successes
      expect(healthy[2]).toBe('node1.example.com:443'); // 1 success
    });

    it('should return empty array when all nodes are blacklisted', () => {
      tracker.blacklist('node1.example.com:443');
      tracker.blacklist('node2.example.com:443');

      const healthy = tracker.getHealthyNodes();
      expect(healthy).toHaveLength(0);
    });
  });

  // ============================================================================
  // Address Normalization
  // ============================================================================
  describe('Address Normalization', () => {
    it('should add default port 443 when not specified', () => {
      tracker.recordSuccess('node1.example.com');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
      expect(stats!.successes).toBe(1);
    });

    it('should normalize case (lowercase)', () => {
      tracker.recordSuccess('Node1.Example.COM:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
    });

    it('should trim whitespace', () => {
      tracker.recordSuccess('  node1.example.com:443  ');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
    });

    it('should treat normalized addresses as the same node', () => {
      tracker.recordSuccess('Node1.Example.COM');
      tracker.recordSuccess('  node1.example.com:443  ');
      tracker.recordSuccess('NODE1.EXAMPLE.COM:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.successes).toBe(3);
    });
  });

  // ============================================================================
  // Node Registration
  // ============================================================================
  describe('Node Registration', () => {
    it('should register a node without recording success or failure', () => {
      tracker.registerNode('node1.example.com:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
      expect(stats!.successes).toBe(0);
      expect(stats!.failures).toBe(0);
      expect(stats!.blacklisted).toBe(false);
    });

    it('should not overwrite existing stats when registering', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');

      tracker.registerNode('node1.example.com:443');

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.successes).toBe(2); // Not overwritten
    });
  });

  // ============================================================================
  // Clear Operations
  // ============================================================================
  describe('Clear Operations', () => {
    it('should clear all tracked data', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.blacklist('node2.example.com:443');

      tracker.clear();

      expect(tracker.getSummary().totalTracked).toBe(0);
      expect(tracker.getSummary().blacklisted).toBe(0);
      expect(tracker.getNodeStats('node1.example.com:443')).toBeUndefined();
    });

    it('should clear only the blacklist (keep stats)', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.blacklist('node2.example.com:443');

      tracker.clearBlacklist();

      expect(tracker.getSummary().blacklisted).toBe(0);
      expect(tracker.isBlacklisted('node2.example.com:443')).toBe(false);

      // Stats should still exist
      expect(tracker.getNodeStats('node1.example.com:443')).toBeDefined();
      expect(tracker.getNodeStats('node2.example.com:443')).toBeDefined();
    });
  });

  // ============================================================================
  // Capacity Management
  // ============================================================================
  describe('Capacity Management', () => {
    it('should respect maxTrackedNodes limit', () => {
      tracker = new NodeHealthTracker({ maxTrackedNodes: 3 });

      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node2.example.com:443');
      tracker.recordSuccess('node3.example.com:443');
      tracker.recordSuccess('node4.example.com:443'); // Should trigger eviction

      expect(tracker.getSummary().totalTracked).toBe(3);
    });

    it('should evict blacklisted nodes first when at capacity', () => {
      tracker = new NodeHealthTracker({ maxTrackedNodes: 3 });

      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');
      tracker.blacklist('node2.example.com:443');
      tracker.recordSuccess('node3.example.com:443');

      // At capacity with one blacklisted node
      tracker.recordSuccess('node4.example.com:443');

      // Blacklisted node should be evicted
      expect(tracker.getNodeStats('node2.example.com:443')).toBeUndefined();
      expect(tracker.getNodeStats('node1.example.com:443')).toBeDefined();
      expect(tracker.getNodeStats('node3.example.com:443')).toBeDefined();
      expect(tracker.getNodeStats('node4.example.com:443')).toBeDefined();
    });

    it('should evict least successful nodes when no blacklisted nodes', () => {
      tracker = new NodeHealthTracker({ maxTrackedNodes: 3 });

      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');

      tracker.recordSuccess('node2.example.com:443');
      tracker.recordSuccess('node2.example.com:443');

      tracker.recordSuccess('node3.example.com:443');

      // At capacity: node1 (3), node2 (2), node3 (1)
      tracker.recordSuccess('node4.example.com:443');

      // node3 (least successful) should be evicted
      expect(tracker.getNodeStats('node3.example.com:443')).toBeUndefined();
      expect(tracker.getNodeStats('node1.example.com:443')).toBeDefined();
      expect(tracker.getNodeStats('node2.example.com:443')).toBeDefined();
      expect(tracker.getNodeStats('node4.example.com:443')).toBeDefined();
    });
  });

  // ============================================================================
  // Statistics
  // ============================================================================
  describe('Statistics', () => {
    it('should calculate summary statistics correctly', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node2.example.com:443');
      tracker.blacklist('node3.example.com:443');

      const summary = tracker.getSummary();
      expect(summary.totalTracked).toBe(3);
      expect(summary.healthy).toBe(2);
      expect(summary.blacklisted).toBe(1);
      expect(summary.totalSuccesses).toBe(3);
    });

    it('should return all stats as a Map', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordSuccess('node2.example.com:443');

      const allStats = tracker.getAllStats();
      expect(allStats).toBeInstanceOf(Map);
      expect(allStats.size).toBe(2);
      expect(allStats.get('node1.example.com:443')).toBeDefined();
      expect(allStats.get('node2.example.com:443')).toBeDefined();
    });

    it('should return undefined for unknown nodes', () => {
      const stats = tracker.getNodeStats('unknown.example.com:443');
      expect(stats).toBeUndefined();
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle empty exclude list', () => {
      tracker.recordSuccess('node1.example.com:443');

      const healthy = tracker.getHealthyNodes([]);
      expect(healthy).toHaveLength(1);
    });

    it('should handle blacklisting a non-existent node', () => {
      tracker.blacklist('node1.example.com:443');

      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(true);

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats).toBeDefined();
      expect(stats!.blacklisted).toBe(true);
    });

    it('should handle unblacklisting a non-existent node', () => {
      // Should not throw
      tracker.unblacklist('node1.example.com:443');
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(false);
    });

    it('should handle multiple successive clear operations', () => {
      tracker.recordSuccess('node1.example.com:443');
      tracker.clear();
      tracker.clear();
      tracker.clear();

      expect(tracker.getSummary().totalTracked).toBe(0);
    });

    it('should handle success after failure (resets failures)', () => {
      tracker = new NodeHealthTracker({ blacklistThreshold: 3 });

      tracker.recordFailure('node1.example.com:443');
      tracker.recordFailure('node1.example.com:443');
      tracker.recordSuccess('node1.example.com:443');
      tracker.recordFailure('node1.example.com:443');

      // Should not be blacklisted because success reset failures
      expect(tracker.isBlacklisted('node1.example.com:443')).toBe(false);

      const stats = tracker.getNodeStats('node1.example.com:443');
      expect(stats!.failures).toBe(1);
    });
  });
});
