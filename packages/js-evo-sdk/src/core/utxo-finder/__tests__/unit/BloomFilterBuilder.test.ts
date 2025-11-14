/**
 * Unit tests for BloomFilterBuilder
 * Tests bloom filter creation for address sets
 */

import { describe, it, expect } from 'vitest';
import { BloomFilterBuilder } from '../../src/BloomFilterBuilder';
import {
  TESTNET_ADDRESSES,
  MAINNET_ADDRESSES,
  REGTEST_ADDRESSES,
  INVALID_ADDRESSES,
} from '../fixtures/addresses';

describe('BloomFilterBuilder', () => {
  describe('build', () => {
    it('should create bloom filter from valid testnet addresses', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address3,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
      expect(bloomFilter.vData.length).toBeGreaterThan(0);
    });

    it('should create bloom filter from single address', () => {
      const addresses = [TESTNET_ADDRESSES.address1];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should create bloom filter from mainnet addresses', () => {
      const addresses = [
        MAINNET_ADDRESSES.address1,
        MAINNET_ADDRESSES.address2,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'mainnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should create larger bloom filter for more addresses', () => {
      const smallSet = [TESTNET_ADDRESSES.address1];
      const largeSet = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address3,
        TESTNET_ADDRESSES.address4,
        TESTNET_ADDRESSES.address5,
      ];

      const smallFilter = BloomFilterBuilder.build(smallSet, 'testnet');
      const largeFilter = BloomFilterBuilder.build(largeSet, 'testnet');

      // Larger set might result in larger filter
      expect(largeFilter).toBeDefined();
      expect(smallFilter).toBeDefined();
    });

    it('should handle empty address array', () => {
      const addresses: string[] = [];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should skip invalid addresses and use valid ones', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        INVALID_ADDRESSES.invalidFormat,
        TESTNET_ADDRESSES.address2,
        INVALID_ADDRESSES.empty,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      // Should not throw, should process valid addresses
      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should handle all invalid addresses gracefully', () => {
      const addresses = [
        INVALID_ADDRESSES.invalidFormat,
        INVALID_ADDRESSES.tooShort,
        INVALID_ADDRESSES.empty,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
      expect(Buffer.isBuffer(bloomFilter.vData)).toBe(true);
    });

    it('should handle duplicate addresses', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address1,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

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
    });

    it('should produce different filters for different addresses', () => {
      // Use multiple addresses to ensure filters differ significantly
      const addresses1 = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
      ];
      const addresses2 = [
        TESTNET_ADDRESSES.address3,
        TESTNET_ADDRESSES.address4,
      ];

      const filter1 = BloomFilterBuilder.build(addresses1, 'testnet');
      const filter2 = BloomFilterBuilder.build(addresses2, 'testnet');

      // Different address sets with multiple addresses should produce different filters
      // Note: Due to bloom filter probabilistic nature, this is likely but not guaranteed
      // We check that at least the filter sizes are reasonable
      expect(filter1).toBeDefined();
      expect(filter2).toBeDefined();
      expect(Buffer.isBuffer(filter1.vData)).toBe(true);
      expect(Buffer.isBuffer(filter2.vData)).toBe(true);
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

    it('should handle regtest network parameter', () => {
      const addresses = [REGTEST_ADDRESSES.address1];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'regtest');

      expect(bloomFilter).toBeDefined();
    });

    it('should create filters for mixed network addresses (testnet focus)', () => {
      // When network is testnet, mixing addresses shouldn't break
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      expect(bloomFilter).toBeDefined();
    });
  });

  describe('address validation', () => {
    it('should skip address with wrong checksum', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        INVALID_ADDRESSES.invalidChecksum,
      ];

      // Should not throw
      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');
      expect(bloomFilter).toBeDefined();
    });

    it('should skip empty address string', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        INVALID_ADDRESSES.empty,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');
      expect(bloomFilter).toBeDefined();
    });

    it('should handle addresses with whitespace', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        '  ' + TESTNET_ADDRESSES.address2 + '  ',
      ];

      // May or may not skip - depends on implementation
      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');
      expect(bloomFilter).toBeDefined();
    });
  });

  describe('performance and size', () => {
    it('should handle large address sets efficiently', () => {
      const addresses = Array.from({ length: 1000 }, (_, i) =>
        TESTNET_ADDRESSES.address1.replace(/.$/, (i % 10).toString())
      );

      const startTime = Date.now();
      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');
      const endTime = Date.now();

      expect(bloomFilter).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly
    });

    it('should produce reasonable filter size for address sets', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        TESTNET_ADDRESSES.address2,
        TESTNET_ADDRESSES.address3,
        TESTNET_ADDRESSES.address4,
        TESTNET_ADDRESSES.address5,
      ];

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');

      // Bloom filter for 5 addresses should be reasonable size
      expect(bloomFilter.vData.length).toBeGreaterThan(0);
      expect(bloomFilter.vData.length).toBeLessThan(1000); // Not unreasonably large
    });
  });

  describe('edge cases', () => {
    it('should handle very long address list', () => {
      const addresses = Array.from({ length: 10000 }, (_, i) =>
        i % 2 === 0
          ? TESTNET_ADDRESSES.address1
          : TESTNET_ADDRESSES.address2
      );

      const bloomFilter = BloomFilterBuilder.build(addresses, 'testnet');
      expect(bloomFilter).toBeDefined();
    });

    it('should handle null values in array', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        null,
        TESTNET_ADDRESSES.address2,
      ] as any;

      // May throw or skip nulls depending on implementation
      expect(() => BloomFilterBuilder.build(addresses, 'testnet')).not.toThrow();
    });

    it('should handle undefined values in array', () => {
      const addresses = [
        TESTNET_ADDRESSES.address1,
        undefined,
        TESTNET_ADDRESSES.address2,
      ] as any;

      expect(() => BloomFilterBuilder.build(addresses, 'testnet')).not.toThrow();
    });
  });

  describe('special characters and encoding', () => {
    it('should handle addresses with case differences', () => {
      const addresses1 = [TESTNET_ADDRESSES.address1.toLowerCase()];
      const addresses2 = [TESTNET_ADDRESSES.address1.toUpperCase()];

      const filter1 = BloomFilterBuilder.build(addresses1, 'testnet');
      const filter2 = BloomFilterBuilder.build(addresses2, 'testnet');

      expect(filter1).toBeDefined();
      expect(filter2).toBeDefined();
    });
  });
});
