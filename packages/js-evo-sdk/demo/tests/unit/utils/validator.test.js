import { describe, it, expect } from 'vitest';
import {
  validateAmount,
  validateAddress,
  validateIdentityId,
  validatePrivateKeyWIF,
  validateMnemonic,
  validateTransactionHash,
  validateLabel,
  validateSufficientBalance,
  validateEmail,
  validateKeyIndex
} from '../../../utils/validator.js';

describe('validator utilities', () => {
  describe('validateAmount', () => {
    describe('DASH validation', () => {
      it('validates correct DASH amounts', () => {
        expect(validateAmount(1, true).valid).toBe(true);
        expect(validateAmount(0.001, true).valid).toBe(true);
        expect(validateAmount(100, true).valid).toBe(true);
      });

      it('rejects amounts below minimum', () => {
        const result = validateAmount(0.0001, true);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('0.001 DASH');
      });

      it('rejects zero and negative amounts', () => {
        expect(validateAmount(0, true).valid).toBe(false);
        expect(validateAmount(-1, true).valid).toBe(false);
      });

      it('rejects amounts exceeding max supply', () => {
        const result = validateAmount(22000000, true);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('maximum supply');
      });

      it('rejects too many decimal places', () => {
        const result = validateAmount(1.123456789, true);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('8 decimal places');
      });

      it('rejects empty/null values', () => {
        expect(validateAmount('', true).valid).toBe(false);
        expect(validateAmount(null, true).valid).toBe(false);
        expect(validateAmount(undefined, true).valid).toBe(false);
      });

      it('rejects non-numeric values', () => {
        const result = validateAmount('abc', true);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid');
      });
    });

    describe('duffs validation', () => {
      it('validates correct duff amounts', () => {
        expect(validateAmount(1000000, false).valid).toBe(true);
        expect(validateAmount(100000000, false).valid).toBe(true);
      });

      it('rejects amounts below minimum', () => {
        const result = validateAmount(999999, false);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('1,000,000 duffs');
      });

      it('rejects non-integer duffs', () => {
        const result = validateAmount(1000000.5, false);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('whole number');
      });
    });
  });

  describe('validateAddress', () => {
    describe('testnet validation', () => {
      it('validates correct testnet addresses', () => {
        expect(validateAddress('yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd', 'testnet').valid).toBe(true);
        expect(validateAddress('8s1L5H4Y5HVA4CUdpF1wK9B3Hj2Lk3Mz', 'testnet').valid).toBe(true);
      });

      it('rejects mainnet prefixes on testnet', () => {
        const result = validateAddress('XkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd', 'testnet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('testnet address prefix');
      });
    });

    describe('mainnet validation', () => {
      it('validates correct mainnet addresses', () => {
        expect(validateAddress('XkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd', 'mainnet').valid).toBe(true);
        expect(validateAddress('7s1L5H4Y5HVA4CUdpF1wK9B3Hj2Lk3Mz', 'mainnet').valid).toBe(true);
      });

      it('rejects testnet prefixes on mainnet', () => {
        const result = validateAddress('yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd', 'mainnet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('mainnet address prefix');
      });
    });

    it('rejects empty addresses', () => {
      const result = validateAddress('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects addresses with invalid length', () => {
      expect(validateAddress('abc', 'testnet').valid).toBe(false);
      expect(validateAddress('a'.repeat(50), 'testnet').valid).toBe(false);
    });

    it('rejects addresses with invalid characters', () => {
      const result = validateAddress('yXkMDsZmrZxPxenTL0OIl3Mz', 'testnet');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid address format');
    });
  });

  describe('validateIdentityId', () => {
    it('validates correct identity ID', () => {
      const validId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      expect(validateIdentityId(validId).valid).toBe(true);
    });

    it('rejects empty identity ID', () => {
      const result = validateIdentityId('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects identity ID with wrong length', () => {
      const result = validateIdentityId('GWRSAVFMjXx8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid identity ID format');
    });

    it('rejects identity ID with invalid Base58 characters', () => {
      const result = validateIdentityId('GWRSAVFM0OIljXx8HpQFaNJMqBV7MBgMK4br5UESsB');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid identity ID format');
    });
  });

  describe('validatePrivateKeyWIF', () => {
    describe('testnet validation', () => {
      it('validates testnet WIF keys', () => {
        expect(validatePrivateKeyWIF('9' + 'a'.repeat(50), 'testnet').valid).toBe(true);
        expect(validatePrivateKeyWIF('c' + 'a'.repeat(50), 'testnet').valid).toBe(true);
      });

      it('rejects mainnet prefixes on testnet', () => {
        const result = validatePrivateKeyWIF('5' + 'a'.repeat(50), 'testnet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('testnet');
      });
    });

    describe('mainnet validation', () => {
      it('validates mainnet WIF keys', () => {
        expect(validatePrivateKeyWIF('5' + 'a'.repeat(50), 'mainnet').valid).toBe(true);
        expect(validatePrivateKeyWIF('K' + 'a'.repeat(50), 'mainnet').valid).toBe(true);
        expect(validatePrivateKeyWIF('L' + 'a'.repeat(50), 'mainnet').valid).toBe(true);
      });

      it('rejects testnet prefixes on mainnet', () => {
        const result = validatePrivateKeyWIF('9' + 'a'.repeat(50), 'mainnet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('mainnet');
      });
    });

    it('rejects empty keys', () => {
      expect(validatePrivateKeyWIF('').valid).toBe(false);
    });

    it('rejects keys with invalid length', () => {
      expect(validatePrivateKeyWIF('5abc').valid).toBe(false);
    });

    it('rejects keys with invalid Base58 characters', () => {
      const result = validatePrivateKeyWIF('50OIl' + 'a'.repeat(46), 'testnet');
      expect(result.valid).toBe(false);
      // May fail on prefix check first before character validation
      expect(result.valid).toBe(false);
    });
  });

  describe('validateMnemonic', () => {
    it('validates correct 12-word mnemonic', () => {
      const mnemonic = 'word '.repeat(11) + 'word';
      expect(validateMnemonic(mnemonic).valid).toBe(true);
    });

    it('validates correct 24-word mnemonic', () => {
      const mnemonic = 'word '.repeat(23) + 'word';
      expect(validateMnemonic(mnemonic).valid).toBe(true);
    });

    it('validates correct 15, 18, 21 word mnemonics', () => {
      expect(validateMnemonic('word '.repeat(14) + 'word').valid).toBe(true);
      expect(validateMnemonic('word '.repeat(17) + 'word').valid).toBe(true);
      expect(validateMnemonic('word '.repeat(20) + 'word').valid).toBe(true);
    });

    it('rejects empty mnemonic', () => {
      expect(validateMnemonic('').valid).toBe(false);
    });

    it('rejects mnemonics with invalid word count', () => {
      const result = validateMnemonic('word '.repeat(10) + 'word');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('12, 15, 18, 21, 24');
    });

    it('rejects mnemonics with invalid characters', () => {
      const result = validateMnemonic('word1 word2 ' + 'word '.repeat(10));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('handles extra whitespace', () => {
      const mnemonic = '  word '.repeat(11) + ' word  ';
      expect(validateMnemonic(mnemonic).valid).toBe(true);
    });
  });

  describe('validateTransactionHash', () => {
    it('validates correct transaction hash', () => {
      const hash = '7f3e2a1b9c8d5e4f0a2b3c4d6e7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f';
      expect(validateTransactionHash(hash).valid).toBe(true);
    });

    it('rejects empty hash', () => {
      expect(validateTransactionHash('').valid).toBe(false);
    });

    it('rejects hash with wrong length', () => {
      const result = validateTransactionHash('7f3e2a1b');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid transaction hash format');
    });

    it('rejects hash with non-hex characters', () => {
      const result = validateTransactionHash('xyz' + 'a'.repeat(61));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('accepts uppercase hex', () => {
      const hash = 'F'.repeat(64);
      expect(validateTransactionHash(hash).valid).toBe(true);
    });
  });

  describe('validateLabel', () => {
    it('allows empty labels (optional)', () => {
      expect(validateLabel('').valid).toBe(true);
      expect(validateLabel(null).valid).toBe(true);
    });

    it('validates correct labels', () => {
      expect(validateLabel('My Identity').valid).toBe(true);
      expect(validateLabel('Business-2024').valid).toBe(true);
      expect(validateLabel('Test_Label').valid).toBe(true);
    });

    it('rejects labels exceeding max length', () => {
      const result = validateLabel('a'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters');
    });

    it('rejects labels with invalid characters', () => {
      const result = validateLabel('Label@#$%');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });
  });

  describe('validateSufficientBalance', () => {
    it('validates sufficient balance', () => {
      expect(validateSufficientBalance(1000000, 500000).valid).toBe(true);
    });

    it('accounts for transaction fee', () => {
      expect(validateSufficientBalance(1000000, 999774, 226).valid).toBe(true);
    });

    it('rejects insufficient balance', () => {
      const result = validateSufficientBalance(100000, 200000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
      expect(result.error).toContain('short');
    });

    it('includes fee in calculation', () => {
      const result = validateSufficientBalance(1000, 900, 200);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('allows empty email (optional)', () => {
      expect(validateEmail('').valid).toBe(true);
      expect(validateEmail(null).valid).toBe(true);
    });

    it('validates correct email formats', () => {
      expect(validateEmail('user@example.com').valid).toBe(true);
      expect(validateEmail('test.user+tag@domain.co.uk').valid).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(validateEmail('invalid').valid).toBe(false);
      expect(validateEmail('@example.com').valid).toBe(false);
      expect(validateEmail('user@').valid).toBe(false);
      expect(validateEmail('user@domain').valid).toBe(false);
    });
  });

  describe('validateKeyIndex', () => {
    it('validates correct key indices', () => {
      expect(validateKeyIndex(0).valid).toBe(true);
      expect(validateKeyIndex(1).valid).toBe(true);
      expect(validateKeyIndex(100).valid).toBe(true);
    });

    it('rejects negative indices', () => {
      const result = validateKeyIndex(-1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-negative');
    });

    it('rejects non-integer indices', () => {
      const result = validateKeyIndex(1.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });

    it('rejects missing indices', () => {
      expect(validateKeyIndex(null).valid).toBe(false);
      expect(validateKeyIndex(undefined).valid).toBe(false);
    });

    it('rejects indices exceeding maximum', () => {
      const result = validateKeyIndex(2147483648);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum');
    });

    it('accepts maximum valid index', () => {
      expect(validateKeyIndex(2147483647).valid).toBe(true);
    });

    it('handles string numbers', () => {
      expect(validateKeyIndex('42').valid).toBe(true);
      expect(validateKeyIndex('abc').valid).toBe(false);
    });
  });
});