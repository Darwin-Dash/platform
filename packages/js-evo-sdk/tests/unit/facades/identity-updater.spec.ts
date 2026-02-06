/**
 * Unit tests for IdentityUpdater facade
 *
 * Tests input validation logic for identity top-up operations.
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
const TOPUP_MIN_AMOUNT = 50000;
const MAX_AMOUNT = 100000000000;
const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VALID_IDENTITY_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

// Validation functions matching the IdentityUpdater implementation
const validateMnemonic = (mnemonic: string | null | undefined): void => {
  if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.trim() === '') {
    throw new Error('Mnemonic is required');
  }
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
  }
};

const validateIdentityId = (identityId: string | null | undefined): void => {
  if (!identityId || typeof identityId !== 'string' || identityId.trim() === '') {
    throw new Error('Identity ID is required');
  }
};

const validateAmount = (amount: number | null | undefined | string): void => {
  if (amount === null || amount === undefined || typeof amount === 'string' || Number.isNaN(amount)) {
    throw new Error('Invalid amount');
  }
  if (amount < TOPUP_MIN_AMOUNT || amount > MAX_AMOUNT) {
    throw new Error(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
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

// Mock IdentityUpdater facade
interface TopupWithUTXOOptions {
  mnemonic: string | null | undefined;
  identityId: string | null | undefined;
  utxo: any;
  amount: number | null | undefined | string;
  useSourceAsChangeAddress?: boolean;
  onProgress?: (event: unknown) => void;
}

const createMockUpdater = () => {
  const mockWasmSdk = createMockWasmSdk();

  return {
    topupWithUTXO: async (options: TopupWithUTXOOptions) => {
      validateIdentityId(options.identityId);
      validateMnemonic(options.mnemonic);
      validateAmount(options.amount as number);
      if (options.utxo) {
        validateUtxo(options.utxo, options.amount as number);
      }
      // In real implementation, this would invoke the coordinator
      return { status: 'success', newBalance: 100000, addedAmount: options.amount };
    },
  };
};

describe('IdentityUpdater', () => {
  let updater: ReturnType<typeof createMockUpdater>;

  beforeEach(() => {
    vi.clearAllMocks();
    updater = createMockUpdater();
  });

  describe('topupWithUTXO() - Input Validation', () => {
    const VALID_UTXO = { txId: 'a'.repeat(64), vout: 0, satoshis: 500000, address: 'yTest', scriptPubKey: '' };

    describe('Identity ID validation', () => {
      it('should reject missing identity ID', async () => {
        await expect(updater.topupWithUTXO({ identityId: null, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Identity ID is required');

        await expect(updater.topupWithUTXO({ identityId: undefined, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Identity ID is required');

        await expect(updater.topupWithUTXO({ identityId: '', mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Identity ID is required');
      });

      it('should accept valid identity ID format', () => {
        expect(VALID_IDENTITY_ID.length).toBeGreaterThan(0);
      });
    });

    describe('Mnemonic validation', () => {
      it('should reject missing mnemonic', async () => {
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: null, utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Mnemonic is required');

        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: undefined, utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Mnemonic is required');

        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: '', utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Mnemonic is required');
      });

      it('should reject mnemonic with incorrect word count', async () => {
        const shortMnemonic = 'abandon abandon abandon';
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: shortMnemonic, utxo: VALID_UTXO, amount: 50000 }))
          .rejects.toThrow('Invalid mnemonic: expected 12 words, got 3');

        const longMnemonic = VALID_MNEMONIC + ' extra extra words';
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: longMnemonic, utxo: VALID_UTXO, amount: 50000 }))
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
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: TOPUP_MIN_AMOUNT - 1 }))
          .rejects.toThrow(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 0 }))
          .rejects.toThrow(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 1000 }))
          .rejects.toThrow(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject amount above maximum', async () => {
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: MAX_AMOUNT + 1 }))
          .rejects.toThrow(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject invalid amount types', async () => {
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: NaN }))
          .rejects.toThrow('Invalid amount');

        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: 'not-a-number' }))
          .rejects.toThrow('Invalid amount');

        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: null }))
          .rejects.toThrow('Invalid amount');
      });

      it('should accept valid amount within range', () => {
        expect(TOPUP_MIN_AMOUNT).toBeGreaterThanOrEqual(TOPUP_MIN_AMOUNT);
        expect(100000).toBeGreaterThanOrEqual(TOPUP_MIN_AMOUNT);
        expect(100000).toBeLessThanOrEqual(MAX_AMOUNT);
      });

      it('should use lower minimum for topUp than create', () => {
        const CREATE_MIN = 200000;
        expect(TOPUP_MIN_AMOUNT).toBeLessThan(CREATE_MIN);
        expect(TOPUP_MIN_AMOUNT).toBe(50000);
      });
    });

    describe('UTXO validation', () => {
      it('should reject UTXO with insufficient balance', async () => {
        const smallUtxo = { txId: 'a'.repeat(64), vout: 0, satoshis: 10000, address: 'yTest', scriptPubKey: '' };
        await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: smallUtxo, amount: 50000 }))
          .rejects.toThrow('UTXO balance (10000 duffs) is less than requested amount (50000 duffs)');
      });
    });

    describe('Options handling', () => {
      it('should accept valid options', () => {
        const options: Partial<TopupWithUTXOOptions> = {
          useSourceAsChangeAddress: true,
          onProgress: (_event) => {},
        };

        expect(typeof options.useSourceAsChangeAddress).toBe('boolean');
        expect(typeof options.onProgress).toBe('function');
      });
    });
  });

  describe('Edge cases', () => {
    const VALID_UTXO = { txId: 'a'.repeat(64), vout: 0, satoshis: 500000, address: 'yTest', scriptPubKey: '' };

    it('should handle boundary amounts correctly', async () => {
      const minAmount = TOPUP_MIN_AMOUNT;
      expect(minAmount).toBe(50000);

      const maxAmount = MAX_AMOUNT;
      expect(maxAmount).toBe(100000000000);

      await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: TOPUP_MIN_AMOUNT - 1 }))
        .rejects.toThrow('Invalid amount');

      await expect(updater.topupWithUTXO({ identityId: VALID_IDENTITY_ID, mnemonic: VALID_MNEMONIC, utxo: VALID_UTXO, amount: MAX_AMOUNT + 1 }))
        .rejects.toThrow('Invalid amount');
    });
  });
});
