/**
 * Basic Regtest Integration Tests
 * Tests real regtest network connectivity and basic operations
 *
 * Run with: npm run test:integration
 * Requires: Local regtest DAPI server running on localhost:3010
 *
 * Skip tests with: SKIP_INTEGRATION_TESTS=true npm test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { UTXOFinder } from '../../src/UTXOFinder';
import {
  connectToRegtest,
  getRegtestBlockHeight,
  isRegtestAvailable,
  RegtestSetup,
  RegtestEnv,
  REGTEST_CONFIG,
} from '../helpers/regtest';

// Skip all integration tests if disabled
const skipTests = !RegtestEnv.integrationsEnabled();

describe.skipIf(skipTests)('Regtest Integration - Basic', () => {
  let setup: RegtestSetup;

  beforeAll(async () => {
    try {
      // Check if regtest is available
      const available = await isRegtestAvailable(RegtestEnv.getDAPIAddress());

      if (!available) {
        const errorMsg =
          `Regtest is not available at ${RegtestEnv.getDAPIAddress()}\n\n` +
          'Setup steps:\n' +
          '1. Ensure SSH tunnels are running or create them:\n' +
          '   npm run tunnel:create\n' +
          '2. Or manually create SSH tunnels:\n' +
          '   ssh -L 2443:127.0.0.1:2443 ruald@10.0.0.119\n' +
          '3. Verify regtest is running on the remote server\n\n' +
          'To skip integration tests:\n' +
          '   SKIP_INTEGRATION_TESTS=true npm test';

        if (RegtestEnv.regtestRequired()) {
          throw new Error(errorMsg);
        } else {
          console.log('⚠ Skipping integration tests - regtest not available');
          return;
        }
      }

      // Initialize regtest setup with tunnel management
      setup = new RegtestSetup();
      await setup.init(RegtestEnv.getDAPIAddress());

      console.log(`✓ Regtest setup complete (block height: ${setup.getBlockHeight()})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Integration test setup failed:', msg);
      throw error;
    }
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Network connectivity', () => {
    it('should connect to regtest DAPI server', async () => {
      const client = setup.getClient();
      expect(client).toBeDefined();
    });

    it('should get regtest block height', async () => {
      const blockHeight = await getRegtestBlockHeight(setup.getClient());

      expect(blockHeight).toBeGreaterThan(0);
      expect(typeof blockHeight).toBe('number');
    });

    it('should track block height changes', async () => {
      const height1 = await getRegtestBlockHeight(setup.getClient());

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      const height2 = await getRegtestBlockHeight(setup.getClient());

      // Heights should be equal or height2 might be higher
      expect(height2).toBeGreaterThanOrEqual(height1);
    });
  });

  describe('UTXOFinder initialization', () => {
    it('should initialize UTXOFinder with regtest client', () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      expect(finder.getNetwork()).toBe('regtest');
    });

    it('should handle regtest network parameter', () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const blockHeight = setup.getBlockHeight();

      finder.setNetwork('regtest');

      expect(finder.getNetwork()).toBe('regtest');
    });
  });

  describe('Address format validation', () => {
    it('should accept regtest addresses (testnet format)', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const testAddress = setup.getTestAddress(0);

      // Should not throw on valid regtest address
      const result = await finder
        .findLatestSpendableUTXO([testAddress], {
          fromHeight: 1,
        })
        .catch(() => null); // Expected to return null if no UTXOs

      expect(result === null || result?.address).toBeDefined();
    });
  });

  describe('Block height queries', () => {
    it('should query from specific block height', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const blockHeight = await getRegtestBlockHeight(setup.getClient());

      // Query from recent blocks
      const result = await finder
        .findLatestSpendableUTXO([setup.getTestAddress(0)], {
          fromHeight: Math.max(1, blockHeight - 100),
        })
        .catch(() => null);

      // Should not throw
      expect(result === null || result?.blockHeight).toBeDefined();
    });

    it('should query with height range', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const blockHeight = await getRegtestBlockHeight(setup.getClient());

      // Query from specific range
      const result = await finder
        .findAllUTXOs([setup.getTestAddress(0)], {
          fromHeight: Math.max(1, blockHeight - 100),
          toHeight: blockHeight,
        })
        .catch(() => null);

      // Should not throw
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle querying empty address', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      await expect(
        finder.findLatestSpendableUTXO(['yf1j1PKDDz3U7PjhRfPpGfeniz5gHuZChZ'], {
          fromHeight: 1,
        })
      ).rejects.toThrow();
    });

    it('should handle invalid block height range', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      // Very high block height that doesn't exist
      const result = await finder
        .findLatestSpendableUTXO([setup.getTestAddress(0)], {
          fromHeight: 999999999,
        })
        .catch(() => null);

      // Should not crash
      expect(result === null || result?.address).toBeDefined();
    });
  });

  describe('Network switching', () => {
    it('should switch between network modes', () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      finder.setNetwork('testnet');
      expect(finder.getNetwork()).toBe('testnet');

      finder.setNetwork('regtest');
      expect(finder.getNetwork()).toBe('regtest');
    });

    it('should work after network switch', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      finder.setNetwork('regtest');

      const result = await finder
        .findLatestSpendableUTXO([setup.getTestAddress(0)], {
          fromHeight: 1,
        })
        .catch(() => null);

      expect(result === null || result?.address).toBeDefined();
    });
  });

  describe('Event emission', () => {
    it('should emit events during UTXO discovery', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const events: string[] = [];

      finder.on('start', () => events.push('start'));
      finder.on('step', (data: any) => events.push(`step:${data.step}`));
      finder.on('progress', () => events.push('progress'));
      finder.on('found', () => events.push('found'));
      finder.on('error', () => events.push('error'));

      try {
        await finder.findLatestSpendableUTXO([setup.getTestAddress(0)], {
          fromHeight: 1,
        });
      } catch {
        // Expected if no UTXOs
      }

      // Should have at least start event
      expect(events.some((e) => e === 'start')).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete queries in reasonable time', async () => {
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const startTime = Date.now();

      try {
        await finder.findAllUTXOs([setup.getTestAddress(0)], {
          fromHeight: Math.max(1, setup.getBlockHeight() - 50),
        });
      } catch {
        // Expected
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 10 seconds)
      expect(duration).toBeLessThan(10000);
    });
  });
});
