/**
 * Unit tests for LatestUTXOSelector
 * Tests UTXO selection by chronological ordering and spendability criteria
 */

import { describe, it, expect } from 'vitest';
import { LatestUTXOSelector } from '../../../src/utils/utxo-selector.js';
import { UTXO } from '../../../src/types/index.js';

describe('LatestUTXOSelector', () => {
  // Helper function to create test UTXOs
  const createUTXO = (
    overrides: Partial<UTXO> = {}
  ): UTXO => ({
    txId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    vout: 0,
    satoshis: 100000,
    script: '',
    address: 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
    blockHeight: 1000,
    blockTime: 1609459200000,
    blockHash: null,
    isChainLocked: false,
    isInstantLocked: false,
    ...overrides,
  });

  describe('select', () => {
    describe('spendability filtering', () => {
      it('should select a confirmed UTXO', () => {
        const utxos = [createUTXO({ blockHeight: 1000 })];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.blockHeight).toBe(1000);
      });

      it('should select a ChainLocked UTXO even without confirmations', () => {
        const utxos = [createUTXO({ blockHeight: 0, isChainLocked: true })];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.isChainLocked).toBe(true);
      });

      it('should select an InstantLocked UTXO even without confirmations', () => {
        const utxos = [createUTXO({ blockHeight: 0, isInstantLocked: true })];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.isInstantLocked).toBe(true);
      });

      it('should throw when no spendable UTXOs are available', () => {
        const utxos = [
          createUTXO({
            blockHeight: 0,
            isChainLocked: false,
            isInstantLocked: false,
          }),
        ];

        expect(() => LatestUTXOSelector.select(utxos)).toThrow(
          'No spendable UTXOs available'
        );
      });

      it('should throw when UTXOs array is empty', () => {
        expect(() => LatestUTXOSelector.select([])).toThrow(
          'No spendable UTXOs available'
        );
      });

      it('should filter out unspendable UTXOs and select from spendable ones', () => {
        const utxos = [
          createUTXO({
            txId: 'bbbb',
            blockHeight: 0,
            isChainLocked: false,
            isInstantLocked: false,
          }),
          createUTXO({
            txId: 'aaaa',
            blockHeight: 500,
            isChainLocked: false,
            isInstantLocked: false,
          }),
        ];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.txId).toBe('aaaa');
        expect(result.blockHeight).toBe(500);
      });
    });

    describe('chronological ordering', () => {
      it('should select UTXO with highest block height', () => {
        const utxos = [
          createUTXO({ txId: 'oldest', blockHeight: 100 }),
          createUTXO({ txId: 'latest', blockHeight: 200 }),
          createUTXO({ txId: 'middle', blockHeight: 150 }),
        ];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.txId).toBe('latest');
        expect(result.blockHeight).toBe(200);
      });

      it('should use block time as tiebreaker for same block height', () => {
        const utxos = [
          createUTXO({ txId: 'earlier', blockHeight: 100, blockTime: 1000 }),
          createUTXO({ txId: 'later', blockHeight: 100, blockTime: 2000 }),
        ];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.txId).toBe('later');
        expect(result.blockTime).toBe(2000);
      });

      it('should use value as final tiebreaker when height and time are same', () => {
        const utxos = [
          createUTXO({
            txId: 'smaller',
            blockHeight: 100,
            blockTime: 1000,
            satoshis: 50000,
          }),
          createUTXO({
            txId: 'larger',
            blockHeight: 100,
            blockTime: 1000,
            satoshis: 100000,
          }),
        ];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.txId).toBe('larger');
        expect(result.satoshis).toBe(100000);
      });
    });

    describe('required amount filtering', () => {
      it('should return UTXO when it meets required amount', () => {
        const utxos = [createUTXO({ satoshis: 100000 })];

        const result = LatestUTXOSelector.select(utxos, 50000);

        expect(result.satoshis).toBe(100000);
      });

      it('should return UTXO when it exactly matches required amount', () => {
        const utxos = [createUTXO({ satoshis: 100000 })];

        const result = LatestUTXOSelector.select(utxos, 100000);

        expect(result.satoshis).toBe(100000);
      });

      it('should throw when latest UTXO does not meet required amount', () => {
        const utxos = [createUTXO({ satoshis: 50000 })];

        expect(() => LatestUTXOSelector.select(utxos, 100000)).toThrow(
          'Insufficient funds'
        );
      });

      it('should include amounts in insufficient funds error message', () => {
        const utxos = [createUTXO({ satoshis: 50000 })];

        expect(() => LatestUTXOSelector.select(utxos, 100000)).toThrow(
          /50000 sats.*100000 sats/
        );
      });

      it('should select latest UTXO even if earlier UTXO has more value', () => {
        // The algorithm selects by recency first, not by amount
        const utxos = [
          createUTXO({ txId: 'older-bigger', blockHeight: 100, satoshis: 500000 }),
          createUTXO({ txId: 'newer-smaller', blockHeight: 200, satoshis: 100000 }),
        ];

        const result = LatestUTXOSelector.select(utxos, 50000);

        expect(result.txId).toBe('newer-smaller');
        expect(result.satoshis).toBe(100000);
      });
    });

    describe('edge cases', () => {
      it('should handle single UTXO array', () => {
        const utxos = [createUTXO()];

        const result = LatestUTXOSelector.select(utxos);

        expect(result).toEqual(utxos[0]);
      });

      it('should handle UTXOs with zero block time', () => {
        const utxos = [
          createUTXO({ txId: 'a', blockHeight: 100, blockTime: 0 }),
          createUTXO({ txId: 'b', blockHeight: 200, blockTime: 0 }),
        ];

        const result = LatestUTXOSelector.select(utxos);

        expect(result.txId).toBe('b');
      });

      it('should handle required amount of zero', () => {
        const utxos = [createUTXO({ satoshis: 100000 })];

        const result = LatestUTXOSelector.select(utxos, 0);

        expect(result.satoshis).toBe(100000);
      });

      it('should handle mix of lock states', () => {
        const utxos = [
          createUTXO({
            txId: 'confirmed',
            blockHeight: 100,
            isChainLocked: false,
            isInstantLocked: false,
          }),
          createUTXO({
            txId: 'chainlocked',
            blockHeight: 150,
            isChainLocked: true,
            isInstantLocked: false,
          }),
          createUTXO({
            txId: 'instantlocked',
            blockHeight: 200,
            isChainLocked: false,
            isInstantLocked: true,
          }),
        ];

        const result = LatestUTXOSelector.select(utxos);

        // Should select the latest (highest block) regardless of lock type
        expect(result.txId).toBe('instantlocked');
        expect(result.blockHeight).toBe(200);
      });

      it('should handle large number of UTXOs', () => {
        const utxos: UTXO[] = [];
        for (let i = 0; i < 1000; i++) {
          utxos.push(
            createUTXO({
              txId: `tx-${i.toString().padStart(4, '0')}`,
              blockHeight: i + 1,
            })
          );
        }

        const result = LatestUTXOSelector.select(utxos);

        expect(result.txId).toBe('tx-0999');
        expect(result.blockHeight).toBe(1000);
      });
    });
  });
});
