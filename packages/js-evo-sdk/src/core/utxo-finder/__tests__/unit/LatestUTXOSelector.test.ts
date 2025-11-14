/**
 * Unit tests for LatestUTXOSelector
 * Tests UTXO selection algorithms and sorting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LatestUTXOSelector } from '../../src/LatestUTXOSelector';
import { MOCK_UTXOS, UTXO_SETS, createUTXO } from '../fixtures/utxos';
import { TESTNET_ADDRESSES } from '../fixtures/addresses';

describe('LatestUTXOSelector', () => {
  describe('select - get latest single UTXO', () => {
    it('should select latest UTXO by block height', () => {
      const utxos = UTXO_SETS.multiple;

      const latest = LatestUTXOSelector.select(utxos);

      expect(latest).toBeDefined();
      expect(latest.txId).toBe(MOCK_UTXOS.unspent3.txId);
      expect(latest.blockHeight).toBe(510);
    });

    it('should select from single UTXO', () => {
      const utxos = UTXO_SETS.single;

      const latest = LatestUTXOSelector.select(utxos);

      expect(latest).toEqual(MOCK_UTXOS.unspent1);
    });

    it('should select highest block height when multiple', () => {
      const utxos = [
        createUTXO({ blockHeight: 500 }),
        createUTXO({ blockHeight: 600, txId: 'newer' }),
        createUTXO({ blockHeight: 550, txId: 'middle' }),
      ];

      const latest = LatestUTXOSelector.select(utxos);

      expect(latest.blockHeight).toBe(600);
      expect(latest.txId).toBe('newer');
    });

    it('should use block time as tiebreaker when heights equal', () => {
      const now = Date.now();
      const utxos = [
        createUTXO({
          blockHeight: 500,
          blockTime: new Date(now),
          txId: 'tx1',
        }),
        createUTXO({
          blockHeight: 500,
          blockTime: new Date(now + 1000),
          txId: 'tx2',
        }),
      ];

      const latest = LatestUTXOSelector.select(utxos);

      expect(latest.txId).toBe('tx2');
    });

    it('should use satoshis as final tiebreaker', () => {
      const blockTime = new Date('2024-01-01T10:00:00Z');
      const utxos = [
        createUTXO({
          blockHeight: 500,
          blockTime,
          satoshis: 100000,
          txId: 'tx1',
        }),
        createUTXO({
          blockHeight: 500,
          blockTime,
          satoshis: 200000,
          txId: 'tx2',
        }),
      ];

      const latest = LatestUTXOSelector.select(utxos);

      expect(latest.txId).toBe('tx2');
      expect(latest.satoshis).toBe(200000);
    });

    it('should throw when no spendable UTXOs', () => {
      const utxos = UTXO_SETS.empty;

      expect(() => LatestUTXOSelector.select(utxos)).toThrow(
        'No spendable UTXOs available'
      );
    });

    it('should throw when only unconfirmed UTXOs', () => {
      const utxos = UTXO_SETS.onlyUnconfirmed;

      expect(() => LatestUTXOSelector.select(utxos)).toThrow(
        'No spendable UTXOs available'
      );
    });

    it('should skip unconfirmed when confirmed available', () => {
      const utxos = UTXO_SETS.withUnconfirmed;

      const latest = LatestUTXOSelector.select(utxos);

      expect(latest.blockHeight).toBeGreaterThan(0);
      expect(latest.txId).toBe(MOCK_UTXOS.unspent3.txId);
    });

    it('should check required amount', () => {
      const utxos = UTXO_SETS.multiple;

      expect(() => LatestUTXOSelector.select(utxos, 999999999)).toThrow(
        'Insufficient funds'
      );
    });

    it('should accept when amount is available', () => {
      const utxos = UTXO_SETS.multiple;

      const selected = LatestUTXOSelector.select(utxos, 100000);

      expect(selected).toBeDefined();
      expect(selected.satoshis).toBeGreaterThanOrEqual(100000);
    });

    it('should accept when amount exactly matches', () => {
      const utxos = [createUTXO({ satoshis: 100000 })];

      const selected = LatestUTXOSelector.select(utxos, 100000);

      expect(selected.satoshis).toBe(100000);
    });
  });

});
