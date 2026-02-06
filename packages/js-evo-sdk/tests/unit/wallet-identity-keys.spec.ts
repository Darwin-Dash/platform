/**
 * Tests for wallet.deriveIdentityKey() function
 *
 * This function derives identity keys using DIP13 standard derivation path:
 * m/9'/coin_type'/5'/0'/0'/identityIndex'/keyId'
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the WASM SDK module
vi.mock('../../src/wasm.js', () => ({
  ensureInitialized: vi.fn().mockResolvedValue(undefined),
  WasmSdk: {
    validateMnemonic: vi.fn(),
    deriveKeyFromSeedWithPath: vi.fn(),
    keyPairFromWif: vi.fn(),
  },
}));

import { wallet } from '../../src/wallet/functions.js';
import * as wasm from '../../src/wasm.js';

describe('wallet.deriveIdentityKey', () => {
  const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations using WASM SDK's camelCase field names
    (wasm.WasmSdk.validateMnemonic as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (wasm.WasmSdk.deriveKeyFromSeedWithPath as ReturnType<typeof vi.fn>).mockResolvedValue({
      privateKeyWif: 'cTestPrivateKeyWif123456789',
      publicKey: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
    });
    (wasm.WasmSdk.keyPairFromWif as ReturnType<typeof vi.fn>).mockResolvedValue({
      privateKeyHex: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      publicKey: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
    });
  });

  describe('key derivation', () => {
    it('derives key 0 (MASTER) correctly', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');

      expect(result.keyId).toBe(0);
      expect(result.purpose).toBe('AUTHENTICATION');
      expect(result.securityLevel).toBe('MASTER');
      expect(result.privateKeyWif).toBe('cTestPrivateKeyWif123456789');
      expect(result.privateKeyHex).toBe('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
      expect(result.publicKeyHex).toBe('02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab');
    });

    it('derives key 1 (HIGH) correctly', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 1, 'testnet');

      expect(result.keyId).toBe(1);
      expect(result.purpose).toBe('AUTHENTICATION');
      expect(result.securityLevel).toBe('HIGH');
    });

    it('derives key 2 (CRITICAL authentication) correctly', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 2, 'testnet');

      expect(result.keyId).toBe(2);
      expect(result.purpose).toBe('AUTHENTICATION');
      expect(result.securityLevel).toBe('CRITICAL');
    });

    it('derives key 3 (TRANSFER/CRITICAL) correctly', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 3, 'testnet');

      expect(result.keyId).toBe(3);
      expect(result.purpose).toBe('TRANSFER');
      expect(result.securityLevel).toBe('CRITICAL');
    });

    it('uses correct testnet derivation path', async () => {
      await wallet.deriveIdentityKey(TEST_MNEMONIC, 5, 2, 'testnet');

      expect(wasm.WasmSdk.deriveKeyFromSeedWithPath).toHaveBeenCalledWith({
        mnemonic: TEST_MNEMONIC,
        passphrase: null,
        path: "m/9'/1'/5'/0'/0'/5'/2'",  // coin_type=1 for testnet
        network: 'testnet',
      });
    });

    it('uses correct mainnet derivation path', async () => {
      await wallet.deriveIdentityKey(TEST_MNEMONIC, 3, 1, 'mainnet');

      expect(wasm.WasmSdk.deriveKeyFromSeedWithPath).toHaveBeenCalledWith({
        mnemonic: TEST_MNEMONIC,
        passphrase: null,
        path: "m/9'/5'/5'/0'/0'/3'/1'",  // coin_type=5 for mainnet
        network: 'mainnet',
      });
    });

    it('different identity indices produce different derivation paths', async () => {
      await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');
      await wallet.deriveIdentityKey(TEST_MNEMONIC, 10, 0, 'testnet');

      const calls = (wasm.WasmSdk.deriveKeyFromSeedWithPath as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].path).toBe("m/9'/1'/5'/0'/0'/0'/0'");
      expect(calls[1][0].path).toBe("m/9'/1'/5'/0'/0'/10'/0'");
    });

    it('handles non-standard key IDs with fallback purpose/securityLevel', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 99, 'testnet');

      expect(result.keyId).toBe(99);
      // Non-standard keys default to AUTHENTICATION/HIGH
      expect(result.purpose).toBe('AUTHENTICATION');
      expect(result.securityLevel).toBe('HIGH');
    });
  });

  describe('error handling', () => {
    it('throws error for undefined mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey(undefined as unknown as string, 0, 0, 'testnet')
      ).rejects.toThrow('Mnemonic is required');
    });

    it('throws error for null mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey(null as unknown as string, 0, 0, 'testnet')
      ).rejects.toThrow('Mnemonic is required');
    });

    it('throws error for empty string mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey('', 0, 0, 'testnet')
      ).rejects.toThrow('empty string');
    });

    it('throws error for whitespace-only mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey('   ', 0, 0, 'testnet')
      ).rejects.toThrow('empty string');
    });

    it('throws error for non-string mnemonic', async () => {
      await expect(
        wallet.deriveIdentityKey(12345 as unknown as string, 0, 0, 'testnet')
      ).rejects.toThrow('must be a string');
    });

    it('throws error for negative identityIndex', async () => {
      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, -1, 0, 'testnet')
      ).rejects.toThrow('non-negative integer');
    });

    it('throws error for non-integer identityIndex', async () => {
      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, 1.5, 0, 'testnet')
      ).rejects.toThrow('non-negative integer');
    });

    it('throws error for negative keyId', async () => {
      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, 0, -1, 'testnet')
      ).rejects.toThrow('non-negative integer');
    });

    it('throws error for non-integer keyId', async () => {
      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 2.5, 'testnet')
      ).rejects.toThrow('non-negative integer');
    });

    it('throws error for invalid mnemonic content', async () => {
      (wasm.WasmSdk.validateMnemonic as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        wallet.deriveIdentityKey('invalid mnemonic words', 0, 0, 'testnet')
      ).rejects.toThrow('Invalid mnemonic phrase');
    });

    it('propagates derivation errors from WASM SDK', async () => {
      (wasm.WasmSdk.deriveKeyFromSeedWithPath as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Derivation failed')
      );

      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet')
      ).rejects.toThrow('Derivation failed');
    });

    it('propagates keyPairFromWif errors', async () => {
      (wasm.WasmSdk.keyPairFromWif as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Invalid WIF')
      );

      await expect(
        wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet')
      ).rejects.toThrow('Invalid WIF');
    });
  });

  describe('return value format', () => {
    it('returns all required fields', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');

      expect(result).toHaveProperty('privateKeyWif');
      expect(result).toHaveProperty('privateKeyHex');
      expect(result).toHaveProperty('publicKeyHex');
      expect(result).toHaveProperty('keyId');
      expect(result).toHaveProperty('purpose');
      expect(result).toHaveProperty('securityLevel');
    });

    it('privateKeyWif is a string', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');
      expect(typeof result.privateKeyWif).toBe('string');
    });

    it('privateKeyHex is a string', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');
      expect(typeof result.privateKeyHex).toBe('string');
    });

    it('publicKeyHex is a string', async () => {
      const result = await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0, 'testnet');
      expect(typeof result.publicKeyHex).toBe('string');
    });
  });

  describe('defaults', () => {
    it('defaults to testnet when network not specified', async () => {
      await wallet.deriveIdentityKey(TEST_MNEMONIC, 0, 0);

      expect(wasm.WasmSdk.deriveKeyFromSeedWithPath).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("/1'/"),  // coin_type=1 for testnet
          network: 'testnet',
        })
      );
    });
  });
});
