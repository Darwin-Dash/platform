/**
 * Integration tests for wallet key derivation with real WASM SDK
 *
 * These tests verify that key derivation works correctly with the actual
 * WASM SDK implementation, not mocked versions.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { wallet } from './setup.js';
import { ensureInitialized } from '../../src/wasm.js';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('wallet.deriveIdentityKey (Integration)', () => {
  beforeAll(async () => {
    // Ensure WASM is initialized before tests
    await ensureInitialized();
  });

  describe('successful key derivation', () => {
    it('derives key 0 with valid mnemonic', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');

      // WIF format: testnet keys start with 'c' or '9'
      expect(result.privateKeyWif).toMatch(/^[c9]/);
      expect(result.privateKeyWif.length).toBeGreaterThan(40);

      // Hex format: 64 hex characters (32 bytes)
      expect(result.privateKeyHex).toHaveLength(64);
      expect(result.privateKeyHex).toMatch(/^[0-9a-f]+$/i);

      // Public key: compressed format (66 hex chars = 33 bytes)
      expect(result.publicKeyHex).toHaveLength(66);
      expect(result.publicKeyHex).toMatch(/^0[23]/); // Compressed keys start with 02 or 03

      // Metadata
      expect(result.keyId).toBe(0);
      expect(result.purpose).toBe('AUTHENTICATION');
      expect(result.securityLevel).toBe('MASTER');
    });

    it('derives key 3 (TRANSFER) with valid mnemonic', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 3, 'testnet');

      expect(result.keyId).toBe(3);
      expect(result.purpose).toBe('TRANSFER');
      expect(result.securityLevel).toBe('CRITICAL');
      expect(result.privateKeyWif).toMatch(/^[c9]/);
    });

    it('derives different keys for different identity indices', async () => {
      const key0 = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');
      const key1 = await wallet.deriveIdentityKey(TEST_MNEMONIC, 1, 0, 'testnet');

      // Different identity indices should produce different keys
      expect(key0.privateKeyWif).not.toBe(key1.privateKeyWif);
      expect(key0.privateKeyHex).not.toBe(key1.privateKeyHex);
      expect(key0.publicKeyHex).not.toBe(key1.publicKeyHex);
    });

    it('derives mainnet key with valid WIF format', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'mainnet');

      // Mainnet WIF keys are 51-52 characters in base58
      // Dash mainnet WIF starts with "7" or "X" depending on the version
      expect(result.privateKeyWif.length).toBeGreaterThanOrEqual(51);
      expect(result.privateKeyWif.length).toBeLessThanOrEqual(52);
      // Should be different from testnet keys
      const testnetResult = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');
      expect(result.privateKeyWif).not.toBe(testnetResult.privateKeyWif);
    });
  });

  describe('input validation with real WASM', () => {
    it('throws descriptive error for undefined mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey(undefined as unknown as string, 0, 0, 'testnet')
      ).rejects.toThrow('Mnemonic is required');
    });

    it('throws descriptive error for null mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey(null as unknown as string, 0, 0, 'testnet')
      ).rejects.toThrow('Mnemonic is required');
    });

    it('throws descriptive error for empty mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey('', 0, 0, 'testnet')
      ).rejects.toThrow('empty string');
    });

    it('throws descriptive error for negative identityIndex', async () => {
      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, -1, 0, 'testnet')
      ).rejects.toThrow('non-negative integer');
    });

    it('throws descriptive error for negative keyId', async () => {
      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, 0, -1, 'testnet')
      ).rejects.toThrow('non-negative integer');
    });

    it('throws error for invalid mnemonic words', async () => {
      await expect(
        wallet.deriveIdentityKey('not a valid mnemonic phrase at all', 0, 0, 'testnet')
      ).rejects.toThrow('Invalid mnemonic phrase');
    });
  });
});

describe('wallet.validateMnemonic (Integration)', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  it('returns true for valid 12-word mnemonic', async () => {
    const result = await wallet.validateMnemonic(TEST_MNEMONIC);
    expect(result).toBe(true);
  });

  it('returns false for undefined', async () => {
    const result = await wallet.validateMnemonic(undefined as unknown as string);
    expect(result).toBe(false);
  });

  it('returns false for null', async () => {
    const result = await wallet.validateMnemonic(null as unknown as string);
    expect(result).toBe(false);
  });

  it('returns false for empty string', async () => {
    const result = await wallet.validateMnemonic('');
    expect(result).toBe(false);
  });

  it('returns false for whitespace-only string', async () => {
    const result = await wallet.validateMnemonic('   ');
    expect(result).toBe(false);
  });

  it('returns false for invalid mnemonic', async () => {
    const result = await wallet.validateMnemonic('not valid words');
    expect(result).toBe(false);
  });
});
