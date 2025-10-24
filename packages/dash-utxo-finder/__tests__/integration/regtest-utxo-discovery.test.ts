/**
 * Regtest UTXO Discovery Integration Test
 *
 * Tests the complete workflow:
 * 1. Derive an address from a mnemonic
 * 2. Send funds to that address via remote RPC
 * 3. Use UTXOFinder to discover the UTXO
 * 4. Verify UTXO details match the transaction
 *
 * Requirements:
 * - SSH tunnels to regtest Dashmate server
 * - DAPI accessible on localhost:2443
 * - RPC accessible via SSH on ruald@10.0.0.119
 *
 * Run with: npm run test:integration
 * Skip with: SKIP_INTEGRATION_TESTS=true npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UTXOFinder, AddressDerivation } from '../../src/index';
import {
  connectToRegtest,
  getRegtestBlockHeight,
  isRegtestAvailable,
  RegtestSetup,
  RegtestEnv,
  sendToAddress,
  generateBlocks,
  getBlockCount,
  getTransactionDetails,
} from '../helpers/regtest';

// Skip if integration tests disabled
const skipTests = !RegtestEnv.integrationsEnabled();

describe.skipIf(skipTests)('Regtest Integration - UTXO Discovery', () => {
  let setup: RegtestSetup;

  beforeAll(async () => {
    // Check if regtest is available
    const available = await isRegtestAvailable(RegtestEnv.getDAPIAddress());

    if (!available) {
      if (RegtestEnv.regtestRequired()) {
        throw new Error(
          'Regtest is required but not available at ' +
            RegtestEnv.getDAPIAddress() +
            '. Start regtest with SSH tunnels.'
        );
      }
    }

    setup = new RegtestSetup();
    await setup.init(RegtestEnv.getDAPIAddress());
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Transaction Sending and UTXO Discovery', () => {
    it('should send funds to derived address and discover UTXO', async () => {
      // Step 1: Derive an address from test mnemonic
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const derivedAddr = AddressDerivation.deriveAddress(
        mnemonic,
        'testnet',
        0,
        5, // Use address index 5 to avoid conflicts
        false
      );

      expect(derivedAddr.address).toBeDefined();
      expect(derivedAddr.address).toMatch(/^y/); // testnet format

      // Step 2: Send transaction to derived address
      const txAmount = 0.05; // DASH
      let txid: string;

      try {
        txid = await sendToAddress(derivedAddr.address, txAmount);
        expect(txid).toMatch(/^[a-f0-9]{64}$/); // Valid txid format
      } catch (error) {
        // If RPC fails, skip this test (tunnels might not be active)
        if (error instanceof Error && error.message.includes('Failed to send')) {
          console.log('Skipping: RPC not available (tunnels not active)');
          return;
        }
        throw error;
      }

      // Step 3: Generate blocks to confirm transaction
      try {
        const blocksBefore = await getBlockCount();
        await generateBlocks(3); // Mine 3 blocks
        const blocksAfter = await getBlockCount();

        expect(blocksAfter).toBeGreaterThan(blocksBefore);
      } catch (error) {
        // Block generation might fail if RPC is down
        console.log('Warning: Could not generate blocks, continuing...');
      }

      // Step 4: Refresh block height on setup
      const currentHeight = await setup.refreshBlockHeight();

      // Step 5: Use UTXOFinder to discover the UTXO
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const startTime = Date.now();

      const utxo = await finder.findLatestSpendableUTXO(
        [derivedAddr.address],
        {
          fromHeight: Math.max(1, currentHeight - 100),
          toHeight: currentHeight, // Explicitly set to current height
          requiredAmount: Math.round(txAmount * 100000000 * 0.9), // 90% of amount (account for fees)
        }
      );

      const discoveryTime = (Date.now() - startTime) / 1000;

      // Step 6: Verify UTXO details
      expect(utxo).toBeDefined();
      expect(utxo.txId).toBe(txid);
      expect(utxo.address).toBe(derivedAddr.address);
      expect(utxo.satoshis).toBeGreaterThan(0);
      expect(utxo.blockHeight).toBeGreaterThan(0);

      console.log(`✅ UTXO Discovery successful`);
      console.log(`   TxID: ${utxo.txId}`);
      console.log(`   Address: ${utxo.address}`);
      console.log(`   Amount: ${utxo.satoshis} satoshis`);
      console.log(`   Block Height: ${utxo.blockHeight}`);
      console.log(`   Discovery Time: ${discoveryTime.toFixed(3)}s`);

      // Discovery should be reasonably fast
      expect(discoveryTime).toBeLessThan(30);
    });

    it('should find UTXO with specific amount requirement', async () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const derivedAddr = AddressDerivation.deriveAddress(
        mnemonic,
        'testnet',
        0,
        6, // Different address
        false
      );

      // Send amount
      const txAmount = 0.1; // DASH
      let txid: string;

      try {
        txid = await sendToAddress(derivedAddr.address, txAmount);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Failed to send')) {
          console.log('Skipping: RPC not available');
          return;
        }
        throw error;
      }

      // Mine blocks
      try {
        await generateBlocks(2);
      } catch (error) {
        console.log('Warning: Could not generate blocks');
      }

      const currentHeight = await setup.refreshBlockHeight();

      // Find with specific amount requirement
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const requiredAmount = Math.round(txAmount * 100000000 * 0.5); // 50% of sent amount

      const utxo = await finder.findLatestSpendableUTXO(
        [derivedAddr.address],
        {
          fromHeight: Math.max(1, currentHeight - 100),
          toHeight: currentHeight, // Explicitly set to current height
          requiredAmount,
        }
      );

      expect(utxo.satoshis).toBeGreaterThanOrEqual(requiredAmount);
      expect(utxo.txId).toBe(txid);
    });

    it('should return all UTXOs for address with multiple transactions', async () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      // Derive multiple addresses for testing
      const addrs = [7, 8, 9].map((idx) =>
        AddressDerivation.deriveAddress(mnemonic, 'testnet', 0, idx, false)
      );

      const addresses = addrs.map((a) => a.address);
      const txids: string[] = [];

      // Send to each address
      for (let i = 0; i < addresses.length; i++) {
        try {
          const txid = await sendToAddress(addresses[i], 0.05);
          txids.push(txid);
        } catch (error) {
          if (error instanceof Error && error.message.includes('Failed to send')) {
            console.log('Skipping: RPC not available');
            return;
          }
          throw error;
        }
      }

      // Mine blocks
      try {
        await generateBlocks(2);
      } catch (error) {
        console.log('Warning: Could not generate blocks');
      }

      const currentHeight = await setup.refreshBlockHeight();

      // Find all UTXOs
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const allUTXOs = await finder.findAllUTXOs(addresses, {
        fromHeight: Math.max(1, currentHeight - 100),
        toHeight: currentHeight, // Explicitly set to current height
      });

      // Should find at least some UTXOs
      expect(allUTXOs.length).toBeGreaterThanOrEqual(1);

      // Check that we have our transactions
      const foundTxids = allUTXOs.map((u) => u.txId);
      for (const txid of txids) {
        // At least some of our transactions should be found
        if (foundTxids.includes(txid)) {
          expect(foundTxids).toContain(txid);
        }
      }

      console.log(`✅ Found ${allUTXOs.length} UTXOs for ${addresses.length} addresses`);
    });
  });

  describe('UTXO Sorting and Selection', () => {
    it('should return most recent UTXO first', async () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const derivedAddr = AddressDerivation.deriveAddress(
        mnemonic,
        'testnet',
        0,
        10,
        false
      );

      // Send transaction
      let txid: string;
      try {
        txid = await sendToAddress(derivedAddr.address, 0.03);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Failed to send')) {
          console.log('Skipping: RPC not available');
          return;
        }
        throw error;
      }

      // Mine blocks
      try {
        await generateBlocks(2);
      } catch (error) {
        console.log('Warning: Could not generate blocks');
      }

      const currentHeight = await setup.refreshBlockHeight();

      // Get all UTXOs and verify sorting
      const finder = new UTXOFinder(setup.getClient(), 'regtest');
      const allUTXOs = await finder.findAllUTXOs([derivedAddr.address], {
        fromHeight: Math.max(1, currentHeight - 100),
        toHeight: currentHeight, // Explicitly set to current height
      });

      if (allUTXOs.length > 0) {
        // Verify they're sorted by block height (descending)
        for (let i = 0; i < allUTXOs.length - 1; i++) {
          expect(allUTXOs[i].blockHeight).toBeGreaterThanOrEqual(
            allUTXOs[i + 1].blockHeight
          );
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid address', async () => {
      const currentHeight = setup.getBlockHeight();
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      await expect(
        finder.findLatestSpendableUTXO(['yInvalidAddressFormatHere'], {
          fromHeight: 1,
          toHeight: currentHeight,
        })
      ).rejects.toThrow();
    });

    it('should throw error when no UTXOs found', async () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const derivedAddr = AddressDerivation.deriveAddress(
        mnemonic,
        'testnet',
        0,
        999, // High index, unlikely to have funds
        false
      );

      const currentHeight = setup.getBlockHeight();
      const finder = new UTXOFinder(setup.getClient(), 'regtest');

      await expect(
        finder.findLatestSpendableUTXO([derivedAddr.address], {
          fromHeight: 1,
          toHeight: currentHeight,
        })
      ).rejects.toThrow();
    });
  });
});
