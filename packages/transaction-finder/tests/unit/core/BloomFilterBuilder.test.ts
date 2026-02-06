/**
 * Unit tests for BloomFilterBuilder
 * Tests bloom filter creation for address sets
 */

import { describe, it, expect } from 'vitest';
import { BloomFilterBuilder } from '../../../src/core/BloomFilterBuilder.js';
import {
  TESTNET_ADDRESSES,
  MAINNET_ADDRESSES,
  INVALID_ADDRESSES,
} from '../../fixtures/addresses.js';

describe('BloomFilterBuilder', () => {
  describe('build', () => {
    it('should create bloom filter from valid testnet addresses', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
      expect(bloomFilter.vData.length).toBeGreaterThan(0);
      expect(bloomFilter.nHashFuncs).toBeGreaterThan(0);
      expect(typeof bloomFilter.nTweak).toBe('number');
      expect(typeof bloomFilter.nFlags).toBe('number');
    });

    it('should create bloom filter from single address', () => {
      const addresses = [TESTNET_ADDRESSES.address1];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should handle empty address array', () => {
      const addresses: string[] = [];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      // Should create minimal valid filter
      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should skip invalid addresses and use valid ones', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        INVALID_ADDRESSES.invalidFormat,
        TESTNET_ADDRESSES.address2,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      // Should not throw, should process valid addresses
      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should produce consistent filters for same inputs', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
      ];

      const filter1 = BloomFilterBuilder.build(addresses, 'testnet');
      const filter2 = BloomFilterBuilder.build(addresses, 'testnet');

      expect(filter1.vData.toString('hex')).toEqual(filter2.vData.toString('hex'));
      expect(filter1.nHashFuncs).toEqual(filter2.nHashFuncs);
    });
  });

  describe('buildForAddress', () => {
    it('should create bloom filter from single address (convenience method)', () => {
      const bloomFilter = BloomFilterBuilder.buildForAddress(
        TESTNET_ADDRESSES.address1,
        'testnet'
      );

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });
  });

  describe('network handling', () => {
    it('should handle testnet network parameter', () => {
      const addresses = [TESTNET_ADDRESSES.address1];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
    });

    it('should handle mainnet network parameter', () => {
      const addresses = [MAINNET_ADDRESSES.address1];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'mainnet');

      expect(bloomFilter).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return bloom filter statistics', () => {
      const addresses = [TESTNET_ADDRESSES.address1, TESTNET_ADDRESSES.address2];
      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      const stats = BloomFilterBuilder.getStats(bloomFilter);

      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hashFunctions).toBeGreaterThan(0);
    });
  });
});
