import { describe, it, expect } from 'vitest';
import {
  duffsToDash,
  dashToDuffs,
  formatDuffs,
  formatDuffsFull,
  formatIdentityId,
  formatTransactionHash,
  formatAddress,
  formatPublicKey,
  formatTimestamp,
  formatNumber,
  formatTransactionStatus,
  formatKeyPurpose,
  formatSecurityLevel,
  formatPercentage,
  formatFileSize
} from '../../../utils/formatter.js';

describe('formatter utilities', () => {
  describe('duffsToDash', () => {
    it('converts duffs to DASH correctly', () => {
      expect(duffsToDash(100000000)).toBe(1);
      expect(duffsToDash(50000000)).toBe(0.5);
      expect(duffsToDash(1)).toBe(0.00000001);
      expect(duffsToDash(0)).toBe(0);
    });

    it('handles large amounts', () => {
      expect(duffsToDash(2100000000000000)).toBe(21000000); // Max supply
    });

    it('handles decimals accurately', () => {
      expect(duffsToDash(12345678)).toBe(0.12345678);
    });
  });

  describe('dashToDuffs', () => {
    it('converts DASH to duffs correctly', () => {
      expect(dashToDuffs(1)).toBe(100000000);
      expect(dashToDuffs(0.5)).toBe(50000000);
      expect(dashToDuffs(0.00000001)).toBe(1);
      expect(dashToDuffs(0)).toBe(0);
    });

    it('handles large amounts', () => {
      expect(dashToDuffs(21000000)).toBe(2100000000000000);
    });

    it('floors to integer', () => {
      expect(dashToDuffs(0.123456789)).toBe(12345678);
    });
  });

  describe('formatDuffs', () => {
    it('formats duffs with DASH unit', () => {
      expect(formatDuffs(100000000)).toBe('1 DASH');
      expect(formatDuffs(50000000)).toBe('0.5 DASH');
    });

    it('removes trailing zeros', () => {
      expect(formatDuffs(100000000)).toBe('1 DASH');
      expect(formatDuffs(10000000)).toBe('0.1 DASH');
    });

    it('formats without unit when showUnit is false', () => {
      expect(formatDuffs(100000000, false)).toBe('1');
      expect(formatDuffs(50000000, false)).toBe('0.5');
    });

    it('handles zero', () => {
      expect(formatDuffs(0)).toBe('0 DASH');
    });

    it('handles very small amounts', () => {
      expect(formatDuffs(1)).toBe('0.00000001 DASH');
    });
  });

  describe('formatDuffsFull', () => {
    it('formats with both DASH and duffs', () => {
      const result = formatDuffsFull(100000000);
      expect(result).toContain('1 DASH');
      // toLocaleString may use commas or spaces depending on locale
      expect(result).toMatch(/100[,\s]000[,\s]000 duffs/);
    });

    it('formats large amounts with commas', () => {
      const result = formatDuffsFull(1000000000);
      expect(result).toContain('10 DASH');
      // toLocaleString may use commas or spaces depending on locale
      expect(result).toMatch(/1[,\s]000[,\s]000[,\s]000/);
    });
  });

  describe('formatIdentityId', () => {
    const fullId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

    it('truncates identity ID', () => {
      const result = formatIdentityId(fullId);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(fullId.length);
    });

    it('uses custom start and end character counts', () => {
      const result = formatIdentityId(fullId, 10, 10);
      // Should show first 10 chars, then ..., then last 10 chars
      expect(result).toContain('GWRSAVFMjX');
      expect(result).toContain('...');
      expect(result).toContain('4S31Ec'); // Last chars
      expect(result.length).toBe(10 + 3 + 10); // start + ... + end
    });

    it('returns full ID if shorter than truncation', () => {
      const shortId = 'ABC123';
      expect(formatIdentityId(shortId)).toBe(shortId);
    });

    it('handles null/undefined', () => {
      expect(formatIdentityId(null)).toBe(null);
      expect(formatIdentityId(undefined)).toBe(undefined);
    });
  });

  describe('formatTransactionHash', () => {
    const fullHash = '7f3e2a1b9c8d5e4f0a2b3c4d6e7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f';

    it('truncates transaction hash', () => {
      const result = formatTransactionHash(fullHash);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(fullHash.length);
    });

    it('uses custom character count', () => {
      const result = formatTransactionHash(fullHash, 4);
      expect(result).toBe('7f3e...5e6f');
    });

    it('returns short hashes unchanged', () => {
      const shortHash = '123abc';
      expect(formatTransactionHash(shortHash)).toBe(shortHash);
    });
  });

  describe('formatAddress', () => {
    const address = 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd';

    it('truncates address', () => {
      const result = formatAddress(address);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(address.length);
    });

    it('returns short addresses unchanged', () => {
      const shortAddr = 'yABC123';
      expect(formatAddress(shortAddr)).toBe(shortAddr);
    });
  });

  describe('formatPublicKey', () => {
    const key = '0x2d3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d';

    it('removes 0x prefix and truncates', () => {
      const result = formatPublicKey(key);
      expect(result).not.toContain('0x');
      expect(result).toContain('...');
    });

    it('handles keys without 0x prefix', () => {
      const keyWithoutPrefix = key.substring(2);
      const result = formatPublicKey(keyWithoutPrefix);
      expect(result).toContain('...');
    });

    it('returns empty string for falsy values', () => {
      expect(formatPublicKey(null)).toBe('');
      expect(formatPublicKey('')).toBe('');
    });
  });

  describe('formatTimestamp', () => {
    it('returns "Just now" for recent timestamps', () => {
      const now = Date.now();
      expect(formatTimestamp(now)).toBe('Just now');
      expect(formatTimestamp(now - 30000)).toBe('Just now'); // 30 seconds ago
    });

    it('formats minutes ago', () => {
      const oneMinuteAgo = Date.now() - 60000;
      expect(formatTimestamp(oneMinuteAgo)).toContain('minute');
    });

    it('formats hours ago', () => {
      const twoHoursAgo = Date.now() - 7200000;
      expect(formatTimestamp(twoHoursAgo)).toContain('hour');
    });

    it('formats days ago', () => {
      const twoDaysAgo = Date.now() - 172800000;
      expect(formatTimestamp(twoDaysAgo)).toContain('day');
    });

    it('formats full date for old timestamps', () => {
      const oneMonthAgo = Date.now() - 2592000000;
      const result = formatTimestamp(oneMonthAgo);
      expect(result).not.toContain('ago');
    });

    it('handles ISO string format', () => {
      const isoString = new Date().toISOString();
      expect(formatTimestamp(isoString)).toBe('Just now');
    });

    it('handles plurals correctly', () => {
      const oneMinute = Date.now() - 60000;
      expect(formatTimestamp(oneMinute)).toBe('1 minute ago');

      const twoMinutes = Date.now() - 120000;
      expect(formatTimestamp(twoMinutes)).toBe('2 minutes ago');
    });
  });

  describe('formatNumber', () => {
    it('adds thousands separators', () => {
      // toLocaleString may use commas or spaces depending on locale
      expect(formatNumber(1000)).toMatch(/1[,\s]000/);
      expect(formatNumber(1000000)).toMatch(/1[,\s]000[,\s]000/);
      expect(formatNumber(123456789)).toMatch(/123[,\s]456[,\s]789/);
    });

    it('handles small numbers', () => {
      expect(formatNumber(100)).toBe('100');
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatTransactionStatus', () => {
    it('formats pending status', () => {
      const result = formatTransactionStatus('pending');
      expect(result.text).toBe('Pending');
      expect(result.class).toBe('status-pending');
    });

    it('formats confirmed status', () => {
      const result = formatTransactionStatus('confirmed');
      expect(result.text).toBe('Confirmed');
      expect(result.class).toBe('status-confirmed');
    });

    it('formats failed status', () => {
      const result = formatTransactionStatus('failed');
      expect(result.text).toBe('Failed');
      expect(result.class).toBe('status-failed');
    });

    it('handles unknown status', () => {
      const result = formatTransactionStatus('unknown');
      expect(result.text).toBe('unknown');
      expect(result.class).toBe('status-unknown');
    });
  });

  describe('formatKeyPurpose', () => {
    it('formats AUTHENTICATION purpose', () => {
      expect(formatKeyPurpose('AUTHENTICATION')).toBe('Authentication');
    });

    it('formats TRANSFER purpose', () => {
      expect(formatKeyPurpose('TRANSFER')).toBe('Transfer');
    });

    it('returns original for unknown purpose', () => {
      expect(formatKeyPurpose('CUSTOM')).toBe('CUSTOM');
    });
  });

  describe('formatSecurityLevel', () => {
    it('formats MASTER level', () => {
      const result = formatSecurityLevel('MASTER');
      expect(result.text).toBe('Master');
      expect(result.class).toBe('level-master');
    });

    it('formats CRITICAL level', () => {
      const result = formatSecurityLevel('CRITICAL');
      expect(result.text).toBe('Critical');
      expect(result.class).toBe('level-critical');
    });

    it('formats HIGH level', () => {
      const result = formatSecurityLevel('HIGH');
      expect(result.text).toBe('High');
      expect(result.class).toBe('level-high');
    });

    it('handles unknown level', () => {
      const result = formatSecurityLevel('UNKNOWN');
      expect(result.text).toBe('UNKNOWN');
      expect(result.class).toBe('level-unknown');
    });
  });

  describe('formatPercentage', () => {
    it('formats percentages with default decimals', () => {
      expect(formatPercentage(75)).toBe('75%');
      expect(formatPercentage(100)).toBe('100%');
    });

    it('formats with custom decimal places', () => {
      expect(formatPercentage(75.5, 1)).toBe('75.5%');
      expect(formatPercentage(75.123, 2)).toBe('75.12%');
    });

    it('handles zero', () => {
      expect(formatPercentage(0)).toBe('0%');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512.00 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB');
      expect(formatFileSize(2048)).toBe('2.00 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.00 MB');
      expect(formatFileSize(5242880)).toBe('5.00 MB');
    });

    it('formats gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1.00 GB');
    });
  });
});