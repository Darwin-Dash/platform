/**
 * Unit tests for TransactionTracker
 *
 * Tests transaction state tracking through confirmation stages:
 * - Broadcast (initial detection)
 * - InstantLock (masternode quorum consensus)
 * - Block inclusion (mined into block)
 * - ChainLock (LLMQ signs entire blockchain)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionTracker } from '../../../src/monitoring/TransactionTracker.js';
import type { TrackedTransaction } from '../../../src/types/index.js';

describe('TransactionTracker', () => {
  let tracker: TransactionTracker;

  beforeEach(() => {
    tracker = new TransactionTracker();
  });

  // ===================================================================
  // Scenario 1: Initialization and Configuration
  // ===================================================================

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultTracker = new TransactionTracker();
      expect(defaultTracker.getAllTransactions()).toEqual([]);
      expect(defaultTracker.getMonitoredTxIds().size).toBe(0);
      expect(defaultTracker.getBlockHeightMapSize()).toBe(0);
    });

    it('should initialize with custom configuration', () => {
      const customTracker = new TransactionTracker(true, 500);
      expect(customTracker.getAllTransactions()).toEqual([]);
      expect(customTracker.getMonitoredTxIds().size).toBe(0);
    });

    it('should support clear() to reset all state', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');

      expect(tracker.getAllTransactions().length).toBe(2);

      tracker.clear();

      expect(tracker.getAllTransactions()).toEqual([]);
      expect(tracker.getMonitoredTxIds().size).toBe(0);
      expect(tracker.getBlockHeightMapSize()).toBe(0);
    });
  });

  // ===================================================================
  // Scenario 2: Transaction State Transitions
  // ===================================================================

  describe('state transitions', () => {
    it('should track complete lifecycle: pending → instantlocked → chainlocked', () => {
      const txid = 'tx123';
      const now = Date.now();

      // Step 1: Broadcast (pending)
      tracker.addBroadcast(txid);

      let tx = tracker.getTransaction(txid);
      expect(tx).toBeDefined();
      expect(tx!.status).toBe('pending');
      expect(tx!.txid).toBe(txid);
      expect(tx!.broadcastTime).toBeGreaterThan(0);
      expect(tx!.instantLockTime).toBeNull();
      expect(tx!.blockHeight).toBeNull();
      expect(tx!.chainLockTime).toBeNull();

      // Step 2: InstantLock (instantlocked)
      const wasNewInstantLock = tracker.recordInstantLock(txid, now + 1000);
      expect(wasNewInstantLock).toBe(true);

      tx = tracker.getTransaction(txid);
      expect(tx!.status).toBe('instantlocked');
      expect(tx!.instantLockTime).toBe(now + 1000);
      expect(tx!.blockHeight).toBeNull();

      // Step 3: Block inclusion (still instantlocked)
      const wasNewBlock = tracker.recordBlockInclusion(txid, 100, 'block100hash');
      expect(wasNewBlock).toBe(true);

      tx = tracker.getTransaction(txid);
      expect(tx!.status).toBe('instantlocked'); // Status doesn't change yet
      expect(tx!.blockHeight).toBe(100);
      expect(tx!.blockHash).toBe('block100hash');

      // Step 4: ChainLock (chainlocked)
      const confirmedTxids = tracker.recordChainLock(100, now + 3000);
      expect(confirmedTxids).toEqual([txid]);

      tx = tracker.getTransaction(txid);
      expect(tx!.status).toBe('chainlocked');
      expect(tx!.chainLockTime).toBe(now + 3000);
      expect(tx!.chainLockBlockHeight).toBe(100);
    });

    it('should handle pending → chainlocked (without InstantLock)', () => {
      const txid = 'tx456';
      const now = Date.now();

      // Step 1: Broadcast
      tracker.addBroadcast(txid);
      expect(tracker.getTransaction(txid)!.status).toBe('pending');

      // Step 2: Block inclusion (skip InstantLock)
      tracker.recordBlockInclusion(txid, 200, 'block200hash');
      expect(tracker.getTransaction(txid)!.status).toBe('pending');

      // Step 3: ChainLock
      const confirmedTxids = tracker.recordChainLock(200, now);
      expect(confirmedTxids).toEqual([txid]);

      const tx = tracker.getTransaction(txid);
      expect(tx!.status).toBe('chainlocked');
      expect(tx!.instantLockTime).toBeNull(); // Never got InstantLock
      expect(tx!.chainLockTime).toBe(now);
    });

    it('should not re-record InstantLock if already recorded', () => {
      const txid = 'tx789';
      const firstTime = 1000;
      const secondTime = 2000;

      tracker.addBroadcast(txid);

      const wasNew1 = tracker.recordInstantLock(txid, firstTime);
      expect(wasNew1).toBe(true);
      expect(tracker.getTransaction(txid)!.instantLockTime).toBe(firstTime);

      const wasNew2 = tracker.recordInstantLock(txid, secondTime);
      expect(wasNew2).toBe(false);
      expect(tracker.getTransaction(txid)!.instantLockTime).toBe(firstTime); // Unchanged
    });

    it('should accept hex after poller-only IS recording (no hex)', () => {
      const txid = 'tx-hex-race';

      tracker.addBroadcast(txid);

      // Poller detects IS first (boolean only, no hex)
      const wasNew1 = tracker.recordInstantLock(txid, 1000);
      expect(wasNew1).toBe(true);
      expect(tracker.getTransaction(txid)!.instantLockTime).toBe(1000);
      expect(tracker.getTransaction(txid)!.instantLockHex).toBeNull();

      // Stream delivers IS later WITH hex bytes
      const wasNew2 = tracker.recordInstantLock(txid, 2000, 'deadbeef1234');
      expect(wasNew2).toBe(false); // Not "new" IS detection
      expect(tracker.getTransaction(txid)!.instantLockTime).toBe(1000); // Unchanged
      expect(tracker.getTransaction(txid)!.instantLockHex).toBe('deadbeef1234'); // Hex stored!
    });

    it('should not overwrite existing hex with a second hex', () => {
      const txid = 'tx-hex-no-overwrite';

      tracker.addBroadcast(txid);

      // Stream delivers IS with hex
      tracker.recordInstantLock(txid, 1000, 'firsthex');
      expect(tracker.getTransaction(txid)!.instantLockHex).toBe('firsthex');

      // Second call with different hex should NOT overwrite
      tracker.recordInstantLock(txid, 2000, 'secondhex');
      expect(tracker.getTransaction(txid)!.instantLockHex).toBe('firsthex');
    });

    it('should not re-record block inclusion if already recorded', () => {
      const txid = 'tx999';

      tracker.addBroadcast(txid);

      const wasNew1 = tracker.recordBlockInclusion(txid, 100, 'hash1');
      expect(wasNew1).toBe(true);
      expect(tracker.getTransaction(txid)!.blockHeight).toBe(100);
      expect(tracker.getTransaction(txid)!.blockHash).toBe('hash1');

      const wasNew2 = tracker.recordBlockInclusion(txid, 200, 'hash2');
      expect(wasNew2).toBe(false);
      expect(tracker.getTransaction(txid)!.blockHeight).toBe(100); // Unchanged
      expect(tracker.getTransaction(txid)!.blockHash).toBe('hash1'); // Unchanged
    });

    it('should not re-record ChainLock for already chainlocked transaction', () => {
      const txid = 'tx111';
      const firstTime = 1000;
      const secondTime = 2000;

      tracker.addBroadcast(txid);
      tracker.recordBlockInclusion(txid, 50, 'hash50');

      const confirmed1 = tracker.recordChainLock(50, firstTime);
      expect(confirmed1).toEqual([txid]);
      expect(tracker.getTransaction(txid)!.chainLockTime).toBe(firstTime);

      const confirmed2 = tracker.recordChainLock(100, secondTime);
      expect(confirmed2).toEqual([]); // Already chainlocked, not returned
      expect(tracker.getTransaction(txid)!.chainLockTime).toBe(firstTime); // Unchanged
    });
  });

  // ===================================================================
  // Scenario 3: Block Height Mapping Operations
  // ===================================================================

  describe('block height mapping', () => {
    it('should maintain blockHeightMap for transactions at same height', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');
      tracker.addBroadcast('tx3');

      tracker.recordBlockInclusion('tx1', 100, 'hash100');
      tracker.recordBlockInclusion('tx2', 100, 'hash100');
      tracker.recordBlockInclusion('tx3', 200, 'hash200');

      expect(tracker.getBlockHeightMapSize()).toBe(2); // Heights 100 and 200

      const confirmedAt100 = tracker.recordChainLock(100, Date.now());
      expect(confirmedAt100).toHaveLength(2);
      expect(confirmedAt100).toContain('tx1');
      expect(confirmedAt100).toContain('tx2');

      const confirmedAt200 = tracker.recordChainLock(200, Date.now());
      expect(confirmedAt200).toHaveLength(1);
      expect(confirmedAt200).toContain('tx3');
    });

    it('should handle ChainLock spanning multiple block heights', () => {
      // Add transactions at different heights
      for (let i = 1; i <= 5; i++) {
        tracker.addBroadcast(`tx${i}`);
        tracker.recordBlockInclusion(`tx${i}`, i * 10, `hash${i * 10}`);
      }

      expect(tracker.getBlockHeightMapSize()).toBe(5); // Heights 10, 20, 30, 40, 50

      // ChainLock height 30 should confirm blocks 10, 20, 30
      const confirmed = tracker.recordChainLock(30, Date.now());
      expect(confirmed).toHaveLength(3);
      expect(confirmed).toContain('tx1'); // height 10
      expect(confirmed).toContain('tx2'); // height 20
      expect(confirmed).toContain('tx3'); // height 30
      expect(confirmed).not.toContain('tx4'); // height 40
      expect(confirmed).not.toContain('tx5'); // height 50
    });

    it('should remove empty height entries when clearing transactions', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');

      tracker.recordBlockInclusion('tx1', 100, 'hash100');
      tracker.recordBlockInclusion('tx2', 100, 'hash100');

      expect(tracker.getBlockHeightMapSize()).toBe(1);

      tracker.clearTransaction('tx1');
      expect(tracker.getBlockHeightMapSize()).toBe(1); // tx2 still at height 100

      tracker.clearTransaction('tx2');
      expect(tracker.getBlockHeightMapSize()).toBe(0); // Empty height entry removed
    });

    it('should handle ChainLock with no matching transactions', () => {
      tracker.addBroadcast('tx1');
      tracker.recordBlockInclusion('tx1', 100, 'hash100');

      // ChainLock for heights with no transactions
      const confirmed = tracker.recordChainLock(50, Date.now());
      expect(confirmed).toEqual([]); // No transactions at height <= 50

      const tx = tracker.getTransaction('tx1');
      expect(tx!.status).toBe('pending'); // Still pending (not chainlocked)
    });
  });

  // ===================================================================
  // Scenario 4: ChainLock Confirmation for Multiple Transactions
  // ===================================================================

  describe('ChainLock confirmation', () => {
    it('should confirm multiple transactions at same height', () => {
      const now = Date.now();

      // Add 10 transactions at same block height
      for (let i = 1; i <= 10; i++) {
        tracker.addBroadcast(`tx${i}`);
        tracker.recordInstantLock(`tx${i}`, now + i);
        tracker.recordBlockInclusion(`tx${i}`, 500, `hash500`);
      }

      const confirmed = tracker.recordChainLock(500, now + 1000);

      expect(confirmed).toHaveLength(10);
      for (let i = 1; i <= 10; i++) {
        expect(confirmed).toContain(`tx${i}`);

        const tx = tracker.getTransaction(`tx${i}`);
        expect(tx!.status).toBe('chainlocked');
        expect(tx!.chainLockTime).toBe(now + 1000);
        expect(tx!.chainLockBlockHeight).toBe(500);
      }
    });

    it('should confirm transactions across multiple block heights', () => {
      const now = Date.now();

      // Create transactions at heights 100, 200, 300, 400, 500
      for (let height = 100; height <= 500; height += 100) {
        for (let i = 1; i <= 3; i++) {
          const txid = `tx${height}_${i}`;
          tracker.addBroadcast(txid);
          tracker.recordBlockInclusion(txid, height, `hash${height}`);
        }
      }

      // ChainLock at height 300 should confirm 100, 200, 300 (9 transactions)
      const confirmed = tracker.recordChainLock(300, now);

      expect(confirmed).toHaveLength(9);

      // Verify heights 100, 200, 300 are chainlocked
      for (let height = 100; height <= 300; height += 100) {
        for (let i = 1; i <= 3; i++) {
          const txid = `tx${height}_${i}`;
          expect(tracker.getTransaction(txid)!.status).toBe('chainlocked');
        }
      }

      // Verify heights 400, 500 are still pending
      for (let height = 400; height <= 500; height += 100) {
        for (let i = 1; i <= 3; i++) {
          const txid = `tx${height}_${i}`;
          expect(tracker.getTransaction(txid)!.status).toBe('pending');
        }
      }
    });

    it('should handle incremental ChainLock updates', () => {
      const now = Date.now();

      // Add transactions at heights 10, 20, 30
      for (let height = 10; height <= 30; height += 10) {
        tracker.addBroadcast(`tx${height}`);
        tracker.recordBlockInclusion(`tx${height}`, height, `hash${height}`);
      }

      // First ChainLock at height 10
      const confirmed1 = tracker.recordChainLock(10, now);
      expect(confirmed1).toEqual(['tx10']);
      expect(tracker.getTransaction('tx10')!.status).toBe('chainlocked');
      expect(tracker.getTransaction('tx20')!.status).toBe('pending');
      expect(tracker.getTransaction('tx30')!.status).toBe('pending');

      // Second ChainLock at height 20
      const confirmed2 = tracker.recordChainLock(20, now + 1000);
      expect(confirmed2).toEqual(['tx20']); // tx10 already chainlocked
      expect(tracker.getTransaction('tx20')!.status).toBe('chainlocked');
      expect(tracker.getTransaction('tx30')!.status).toBe('pending');

      // Third ChainLock at height 30
      const confirmed3 = tracker.recordChainLock(30, now + 2000);
      expect(confirmed3).toEqual(['tx30']);
      expect(tracker.getTransaction('tx30')!.status).toBe('chainlocked');
    });
  });

  // ===================================================================
  // Scenario 5: Auto-Pruning Functionality
  // ===================================================================

  describe('auto-pruning', () => {
    it('should auto-prune chainlocked transactions when enabled', () => {
      const autoPruneTracker = new TransactionTracker(true, 1000);

      autoPruneTracker.addBroadcast('tx1');
      autoPruneTracker.addBroadcast('tx2');
      autoPruneTracker.recordBlockInclusion('tx1', 100, 'hash100');
      autoPruneTracker.recordBlockInclusion('tx2', 100, 'hash100');

      expect(autoPruneTracker.getAllTransactions()).toHaveLength(2);

      // ChainLock should auto-prune
      const confirmed = autoPruneTracker.recordChainLock(100, Date.now());
      expect(confirmed).toEqual(['tx1', 'tx2']);

      // Transactions should be removed
      expect(autoPruneTracker.getAllTransactions()).toHaveLength(0);
      expect(autoPruneTracker.getTransaction('tx1')).toBeUndefined();
      expect(autoPruneTracker.getTransaction('tx2')).toBeUndefined();
      expect(autoPruneTracker.isMonitored('tx1')).toBe(false);
      expect(autoPruneTracker.isMonitored('tx2')).toBe(false);
      expect(autoPruneTracker.getBlockHeightMapSize()).toBe(0);
    });

    it('should NOT auto-prune when disabled', () => {
      const noAutoPruneTracker = new TransactionTracker(false, 1000);

      noAutoPruneTracker.addBroadcast('tx1');
      noAutoPruneTracker.addBroadcast('tx2');
      noAutoPruneTracker.recordBlockInclusion('tx1', 100, 'hash100');
      noAutoPruneTracker.recordBlockInclusion('tx2', 100, 'hash100');

      expect(noAutoPruneTracker.getAllTransactions()).toHaveLength(2);

      // ChainLock should NOT auto-prune
      const confirmed = noAutoPruneTracker.recordChainLock(100, Date.now());
      expect(confirmed).toEqual(['tx1', 'tx2']);

      // Transactions should still exist
      expect(noAutoPruneTracker.getAllTransactions()).toHaveLength(2);
      expect(noAutoPruneTracker.getTransaction('tx1')!.status).toBe('chainlocked');
      expect(noAutoPruneTracker.getTransaction('tx2')!.status).toBe('chainlocked');
    });

    it('should support manual pruning with clearAllConfirmed()', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');
      tracker.addBroadcast('tx3');

      tracker.recordBlockInclusion('tx1', 100, 'hash100');
      tracker.recordBlockInclusion('tx2', 200, 'hash200');
      // tx3 stays in mempool (no block inclusion)

      tracker.recordChainLock(100, Date.now());

      expect(tracker.getTransaction('tx1')!.status).toBe('chainlocked');
      expect(tracker.getTransaction('tx2')!.status).toBe('pending');
      expect(tracker.getTransaction('tx3')!.status).toBe('pending');

      // Clear all confirmed
      tracker.clearAllConfirmed();

      expect(tracker.getTransaction('tx1')).toBeUndefined();
      expect(tracker.getTransaction('tx2')!.status).toBe('pending');
      expect(tracker.getTransaction('tx3')!.status).toBe('pending');
      expect(tracker.getAllTransactions()).toHaveLength(2);
    });

    it('should support manual single transaction clearing', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');
      tracker.recordBlockInclusion('tx1', 100, 'hash100');
      tracker.recordBlockInclusion('tx2', 100, 'hash100');

      expect(tracker.getAllTransactions()).toHaveLength(2);
      expect(tracker.isMonitored('tx1')).toBe(true);

      // Clear tx1
      tracker.clearTransaction('tx1');

      expect(tracker.getTransaction('tx1')).toBeUndefined();
      expect(tracker.getTransaction('tx2')).toBeDefined();
      expect(tracker.isMonitored('tx1')).toBe(false);
      expect(tracker.isMonitored('tx2')).toBe(true);
      expect(tracker.getAllTransactions()).toHaveLength(1);
    });
  });

  // ===================================================================
  // Scenario 6: Memory Limit Enforcement
  // ===================================================================

  describe('memory limits', () => {
    it('should throw error when exceeding maxTransactions limit', () => {
      const limitedTracker = new TransactionTracker(false, 5); // Max 5 transactions

      // Add 5 transactions
      for (let i = 1; i <= 5; i++) {
        limitedTracker.addBroadcast(`tx${i}`);
        limitedTracker.recordBlockInclusion(`tx${i}`, 100, 'hash100');
      }

      expect(limitedTracker.getAllTransactions()).toHaveLength(5);

      // Add one more to exceed limit
      limitedTracker.addBroadcast('tx6');
      limitedTracker.recordBlockInclusion('tx6', 100, 'hash100');

      expect(limitedTracker.getAllTransactions()).toHaveLength(6);

      // ChainLock should throw error because limit exceeded
      expect(() => {
        limitedTracker.recordChainLock(100, Date.now());
      }).toThrow(/Transaction limit exceeded/);
      expect(() => {
        limitedTracker.recordChainLock(100, Date.now());
      }).toThrow(/6\/5/); // Shows current/max
    });

    it('should NOT throw error when within maxTransactions limit', () => {
      const limitedTracker = new TransactionTracker(false, 10);

      for (let i = 1; i <= 8; i++) {
        limitedTracker.addBroadcast(`tx${i}`);
        limitedTracker.recordBlockInclusion(`tx${i}`, 100, 'hash100');
      }

      expect(limitedTracker.getAllTransactions()).toHaveLength(8);

      // Should succeed (8 < 10)
      expect(() => {
        limitedTracker.recordChainLock(100, Date.now());
      }).not.toThrow();
    });

    it('should prevent exceeding limit when auto-prune is enabled', () => {
      const autoPruneTracker = new TransactionTracker(true, 5);

      // Add 5 transactions and ChainLock them
      for (let i = 1; i <= 5; i++) {
        autoPruneTracker.addBroadcast(`tx${i}`);
        autoPruneTracker.recordBlockInclusion(`tx${i}`, 100, 'hash100');
      }

      // ChainLock auto-prunes
      autoPruneTracker.recordChainLock(100, Date.now());
      expect(autoPruneTracker.getAllTransactions()).toHaveLength(0);

      // Add 5 more transactions
      for (let i = 6; i <= 10; i++) {
        autoPruneTracker.addBroadcast(`tx${i}`);
        autoPruneTracker.recordBlockInclusion(`tx${i}`, 200, 'hash200');
      }

      // Should succeed because auto-prune keeps us under limit
      expect(() => {
        autoPruneTracker.recordChainLock(200, Date.now());
      }).not.toThrow();
    });

    it('should handle manual clearing to stay under limit', () => {
      const limitedTracker = new TransactionTracker(false, 5);

      // Add 5 transactions
      for (let i = 1; i <= 5; i++) {
        limitedTracker.addBroadcast(`tx${i}`);
        limitedTracker.recordBlockInclusion(`tx${i}`, 100, 'hash100');
      }

      // ChainLock them
      limitedTracker.recordChainLock(100, Date.now());

      // Manually clear confirmed transactions
      limitedTracker.clearAllConfirmed();
      expect(limitedTracker.getAllTransactions()).toHaveLength(0);

      // Add 5 more transactions - should work now
      for (let i = 6; i <= 10; i++) {
        limitedTracker.addBroadcast(`tx${i}`);
        limitedTracker.recordBlockInclusion(`tx${i}`, 200, 'hash200');
      }

      expect(() => {
        limitedTracker.recordChainLock(200, Date.now());
      }).not.toThrow();
    });
  });

  // ===================================================================
  // Scenario 7: Race Condition Handling (Out-of-Order Events)
  // ===================================================================

  describe('race conditions', () => {
    it('should handle block inclusion before addBroadcast', () => {
      const txid = 'tx-race1';

      // Block inclusion arrives first (creates transaction with null broadcastTime)
      const wasNew = tracker.recordBlockInclusion(txid, 100, 'hash100');
      expect(wasNew).toBe(true);

      const tx = tracker.getTransaction(txid);
      expect(tx).toBeDefined();
      expect(tx!.broadcastTime).toBeNull(); // No broadcast recorded
      expect(tx!.blockHeight).toBe(100);
      expect(tx!.status).toBe('pending');

      // Later, we might see the broadcast (but it won't update since tx already exists)
      tracker.addBroadcast(txid);

      const tx2 = tracker.getTransaction(txid);
      expect(tx2!.broadcastTime).toBeNull(); // Still null (recordBlockInclusion created it)
    });

    it('should handle InstantLock before addBroadcast', () => {
      const txid = 'tx-race2';

      // InstantLock arrives first (for unknown transaction)
      const wasNew = tracker.recordInstantLock(txid, 1000);
      expect(wasNew).toBe(false); // Transaction doesn't exist yet

      // Then broadcast
      tracker.addBroadcast(txid);

      const tx = tracker.getTransaction(txid);
      expect(tx!.status).toBe('pending'); // No InstantLock recorded
      expect(tx!.instantLockTime).toBeNull();

      // InstantLock arrives again
      const wasNew2 = tracker.recordInstantLock(txid, 2000);
      expect(wasNew2).toBe(true);
      expect(tracker.getTransaction(txid)!.instantLockTime).toBe(2000);
    });

    it('should handle ChainLock before block inclusion', () => {
      const txid = 'tx-race3';

      tracker.addBroadcast(txid);

      // ChainLock arrives (but tx has no blockHeight yet)
      const confirmed1 = tracker.recordChainLock(100, 1000);
      expect(confirmed1).toEqual([]); // Can't confirm without blockHeight

      const tx1 = tracker.getTransaction(txid);
      expect(tx1!.status).toBe('pending');
      expect(tx1!.chainLockTime).toBeNull();

      // Then block inclusion
      tracker.recordBlockInclusion(txid, 100, 'hash100');

      // ChainLock again (now it can confirm)
      const confirmed2 = tracker.recordChainLock(100, 2000);
      expect(confirmed2).toEqual([txid]);

      const tx2 = tracker.getTransaction(txid);
      expect(tx2!.status).toBe('chainlocked');
      expect(tx2!.chainLockTime).toBe(2000);
    });

    it('should handle InstantLock after ChainLock', () => {
      const txid = 'tx-race4';
      const now = Date.now();

      tracker.addBroadcast(txid);
      tracker.recordBlockInclusion(txid, 100, 'hash100');
      tracker.recordChainLock(100, now);

      expect(tracker.getTransaction(txid)!.status).toBe('chainlocked');

      // InstantLock arrives late (transaction already chainlocked)
      const wasNew = tracker.recordInstantLock(txid, now + 1000);
      expect(wasNew).toBe(true); // Still records the timestamp

      const tx = tracker.getTransaction(txid);
      expect(tx!.status).toBe('chainlocked'); // Status stays chainlocked
      expect(tx!.instantLockTime).toBe(now + 1000);
    });

    it('should handle multiple transactions with mixed event ordering', () => {
      const now = Date.now();

      // tx1: Normal order (broadcast → instantlock → block → chainlock)
      tracker.addBroadcast('tx1');
      tracker.recordInstantLock('tx1', now);
      tracker.recordBlockInclusion('tx1', 100, 'hash100');

      // tx2: Block before broadcast
      tracker.recordBlockInclusion('tx2', 100, 'hash100');
      tracker.addBroadcast('tx2');

      // tx3: Broadcast only (no confirmations yet)
      tracker.addBroadcast('tx3');

      // ChainLock
      const confirmed = tracker.recordChainLock(100, now + 1000);
      expect(confirmed).toHaveLength(2); // tx1 and tx2
      expect(confirmed).toContain('tx1');
      expect(confirmed).toContain('tx2');

      expect(tracker.getTransaction('tx1')!.status).toBe('chainlocked');
      expect(tracker.getTransaction('tx2')!.status).toBe('chainlocked');
      expect(tracker.getTransaction('tx3')!.status).toBe('pending');
    });

    it('should handle duplicate addBroadcast calls (idempotent)', () => {
      const txid = 'tx-duplicate';

      tracker.addBroadcast(txid);
      const tx1 = tracker.getTransaction(txid);
      const broadcastTime1 = tx1!.broadcastTime;

      // Call addBroadcast again
      tracker.addBroadcast(txid);
      const tx2 = tracker.getTransaction(txid);

      // Should not create duplicate or change existing
      expect(tracker.getAllTransactions()).toHaveLength(1);
      expect(tx2!.broadcastTime).toBe(broadcastTime1);
    });
  });

  // ===================================================================
  // Scenario 8: Monitoring and Querying
  // ===================================================================

  describe('monitoring and querying', () => {
    it('should track monitored transaction IDs separately', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');

      expect(tracker.isMonitored('tx1')).toBe(true);
      expect(tracker.isMonitored('tx2')).toBe(true);
      expect(tracker.isMonitored('tx3')).toBe(false);

      const monitoredIds = tracker.getMonitoredTxIds();
      expect(monitoredIds.size).toBe(2);
      expect(monitoredIds.has('tx1')).toBe(true);
      expect(monitoredIds.has('tx2')).toBe(true);
    });

    it('should return independent copy of monitored IDs', () => {
      tracker.addBroadcast('tx1');

      const ids1 = tracker.getMonitoredTxIds();
      const ids2 = tracker.getMonitoredTxIds();

      expect(ids1).not.toBe(ids2); // Different Set instances
      expect(ids1.size).toBe(ids2.size);
    });

    it('should get all transactions as array', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');
      tracker.recordInstantLock('tx1', 1000);

      const allTxs = tracker.getAllTransactions();
      expect(allTxs).toHaveLength(2);
      expect(allTxs.some(tx => tx.txid === 'tx1')).toBe(true);
      expect(allTxs.some(tx => tx.txid === 'tx2')).toBe(true);
    });

    it('should return undefined for non-existent transaction', () => {
      expect(tracker.getTransaction('nonexistent')).toBeUndefined();
    });
  });

  // ===================================================================
  // Scenario 9: Edge Cases and Error Conditions
  // ===================================================================

  describe('edge cases', () => {
    it('should handle empty ChainLock (no transactions)', () => {
      const confirmed = tracker.recordChainLock(100, Date.now());
      expect(confirmed).toEqual([]);
    });

    it('should handle clearTransaction for non-existent transaction', () => {
      expect(() => {
        tracker.clearTransaction('nonexistent');
      }).not.toThrow();
    });

    it('should handle clearAllConfirmed with no confirmed transactions', () => {
      tracker.addBroadcast('tx1');
      tracker.addBroadcast('tx2');

      expect(() => {
        tracker.clearAllConfirmed();
      }).not.toThrow();

      expect(tracker.getAllTransactions()).toHaveLength(2);
    });

    it('should properly clean up all references when clearing transaction', () => {
      tracker.addBroadcast('tx1');
      tracker.recordBlockInclusion('tx1', 100, 'hash100');

      expect(tracker.getTransaction('tx1')).toBeDefined();
      expect(tracker.isMonitored('tx1')).toBe(true);
      expect(tracker.getBlockHeightMapSize()).toBe(1);

      tracker.clearTransaction('tx1');

      expect(tracker.getTransaction('tx1')).toBeUndefined();
      expect(tracker.isMonitored('tx1')).toBe(false);
      expect(tracker.getBlockHeightMapSize()).toBe(0);
    });

    it('should handle transaction with only broadcast (no confirmations)', () => {
      tracker.addBroadcast('tx-mempool');

      const tx = tracker.getTransaction('tx-mempool');
      expect(tx!.status).toBe('pending');
      expect(tx!.broadcastTime).toBeGreaterThan(0);
      expect(tx!.instantLockTime).toBeNull();
      expect(tx!.blockHeight).toBeNull();
      expect(tx!.blockHash).toBeNull();
      expect(tx!.chainLockTime).toBeNull();
      expect(tx!.chainLockBlockHeight).toBeNull();
    });
  });
});
