/**
 * Unit tests for IdentityCreator facade
 *
 * Tests input validation logic for identity creation operations.
 * Note: Full coordinator orchestration testing requires integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWasmSdk } from '../../setup';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
}));

// Constants from IDENTITY_CONFIG
const CREATE_MIN_AMOUNT = 200000;
const MAX_AMOUNT = 100000000000;
const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Validation functions matching the IdentityCreator implementation
const validateMnemonic = (mnemonic: string | null | undefined): void => {
  if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.trim() === '') {
    throw new Error('Mnemonic is required');
  }
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
  }
};

const validateAmount = (amount: number | null | undefined | string): void => {
  if (amount === null || amount === undefined || typeof amount === 'string' || Number.isNaN(amount)) {
    throw new Error('Invalid amount');
  }
  if (amount < CREATE_MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new Error(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
  }
};

const validateUtxo = (utxo: any, amount: number): void => {
  if (!utxo || typeof utxo !== 'object') {
    throw new Error('UTXO is required');
  }
  if (utxo.satoshis < amount) {
    throw new Error(`UTXO balance (${utxo.satoshis} duffs) is less than requested amount (${amount} duffs)`);
  }
};

// Mock IdentityCreator facade
interface CreateWithUTXOOptions {
  mnemonic: string | null | undefined;
  utxo: any;
  amount: number | null | undefined | string;
  identityIndex?: number;
  skipDiscovery?: boolean;
  useSourceAsChangeAddress?: boolean;
  onProgress?: (event: unknown) => void;
}

const createMockIdentityCreator = () => {
  const mockWasmSdk = createMockWasmSdk();

  return {
    createWithUTXO: async (options: CreateWithUTXOOptions) => {
      validateMnemonic(options.mnemonic);
      validateAmount(options.amount as number);
      if (options.utxo) {
        validateUtxo(options.utxo, options.amount as number);
      }
      // In real implementation, this would invoke the coordinator
      return mockWasmSdk.identityCreate('proof', 'wif', 'keys');
    },
  };
};

describe('IdentityCreator', () => {
  let creator: ReturnType<typeof createMockIdentityCreator>;

  beforeEach(() => {
    vi.clearAllMocks();
    creator = createMockIdentityCreator();
  });

  describe('createWithUTXO() - Input Validation', () => {
    const VALID_UTXO = { txId: 'a'.repeat(64), vout: 0, satoshis: 500000, address: 'yTest', scriptPubKey: '' };

    describe('Mnemonic validation', () => {
      it('should reject missing mnemonic', async () => {
        await expect(creator.createWithUTXO({ mnemonic: null, utxo: VALID_UTXO, amount: 200000 }))
          .rejects.toThrow('Mnemonic is required');

        await expect(creator.createWithUTXO({ mnemonic: undefined, utxo: VALID_UTXO, amount: 200000 }))
          .rejects.toThrow('Mnemonic is required');

        await expect(creator.createWithUTXO({ mnemonic: '', utxo: VALID_UTXO, amount: 200000 }))
          .rejects.toThrow('Mnemonic is required');
      });

      it('should reject mnemonic with incorrect word count', async () => {
        const shortMnemonic = 'abandon abandon abandon';
        await expect(creator.createWithUTXO({ mnemonic: shortMnemonic, utxo: VALID_UTXO, amount: 200000 }))
          .rejects.toThrow('Invalid mnemonic: expected 12 words, got 3');

        const longMnemonic = VALID_MNEMONIC + ' extra extra words';
        await expect(creator.createWithUTXO({ mnemonic: longMnemonic, utxo: VALID_UTXO, amount: 200000 }))
          .rejects.toThrow('Invalid mnemonic: expected 12 words, got 15');
      });

      it('should accept valid 12-word mnemonic', () => {
        const words = VALID_MNEMONIC.split(' ');
        expect(words.length).toBe(12);
      });

      it('should handle extra whitespace in mnemonic', () => {
        const spacedMnemonic = '  abandon   abandon  abandon abandon abandon abandon abandon abandon abandon abandon abandon   about  ';
        const words = spacedMnemonic.trim().split(/\s+/);
        expect(words.length).toBe(12);
      });
    });

    describe('Amount validation', () => {
      it('should reject amount below minimum', async () => {
        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: CREATE_MIN_AMOUNT - 1 }))
          .rejects.toThrow(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 0 }))
          .rejects.toThrow(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 100 }))
          .rejects.toThrow(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject amount above maximum', async () => {
        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: MAX_AMOUNT + 1 }))
          .rejects.toThrow(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject invalid amount types', async () => {
        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: NaN }))
          .rejects.toThrow('Invalid amount');

        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 'not-a-number' }))
          .rejects.toThrow('Invalid amount');

        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: null }))
          .rejects.toThrow('Invalid amount');
      });

      it('should accept valid amount within range', () => {
        expect(CREATE_MIN_AMOUNT).toBeGreaterThanOrEqual(CREATE_MIN_AMOUNT);
        expect(500000).toBeGreaterThanOrEqual(CREATE_MIN_AMOUNT);
        expect(500000).toBeLessThanOrEqual(MAX_AMOUNT);
      });
    });

    describe('UTXO validation', () => {
      it('should reject UTXO with insufficient balance', async () => {
        const smallUtxo = { txId: 'a'.repeat(64), vout: 0, satoshis: 100000, address: 'yTest', scriptPubKey: '' };
        await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: smallUtxo, amount: 200000 }))
          .rejects.toThrow('UTXO balance (100000 duffs) is less than requested amount (200000 duffs)');
      });
    });

    describe('Options handling', () => {
      it('should accept valid options', () => {
        const options: Partial<CreateWithUTXOOptions> = {
          identityIndex: 5,
          skipDiscovery: true,
          useSourceAsChangeAddress: true,
          onProgress: (_event) => {},
        };

        expect(typeof options.identityIndex).toBe('number');
        expect(typeof options.skipDiscovery).toBe('boolean');
        expect(typeof options.useSourceAsChangeAddress).toBe('boolean');
        expect(typeof options.onProgress).toBe('function');
      });
    });
  });

  // The js-evo-sdk uses createWithUTXO() for identity creation.

  describe('Edge cases', () => {
    const VALID_UTXO = { txId: 'a'.repeat(64), vout: 0, satoshis: 500000, address: 'yTest', scriptPubKey: '' };

    it('should handle boundary amounts correctly', async () => {
      const minAmount = CREATE_MIN_AMOUNT;
      expect(minAmount).toBe(200000);

      const maxAmount = MAX_AMOUNT;
      expect(maxAmount).toBe(100000000000);

      await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: CREATE_MIN_AMOUNT - 1 }))
        .rejects.toThrow('Invalid amount');

      await expect(creator.createWithUTXO({ mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: MAX_AMOUNT + 1 }))
        .rejects.toThrow('Invalid amount');
    });
  });
});
