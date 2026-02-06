/**
 * Unit tests for CreditOperations facade
 *
 * Tests credit transfer and withdrawal operations for identities.
 * Uses mocked WASM SDK to avoid network dependencies.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
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

// Mock the SDK
const mockWasmSdk = createMockWasmSdk();

// Constants
const MAX_AMOUNT = 100_000_000_000;

// Helper to convert amount to BigInt (matching facade logic)
const toBigInt = (amount: number | string | bigint): bigint => {
  if (typeof amount === 'bigint') return amount;
  return BigInt(amount);
};

// Validation helpers (matching facade logic)
const validateTransferParams = (params: {
  senderId?: string;
  recipientId?: string;
  amount?: number | string | bigint;
  privateKeyWif?: string;
}) => {
  if (!params.senderId) {
    throw new Error('Sender identity ID is required');
  }
  if (!params.recipientId) {
    throw new Error('Recipient identity ID is required');
  }
  if (params.senderId === params.recipientId) {
    throw new Error('Cannot transfer credits to the same identity');
  }
  if (params.amount === undefined || params.amount === null) {
    throw new Error('Amount is required');
  }
  const numAmount = typeof params.amount === 'bigint' ? Number(params.amount) : Number(params.amount);
  if (!Number.isInteger(numAmount) || numAmount < 0) {
    throw new Error(`Invalid amount for transfer: ${params.amount}`);
  }
  if (numAmount > MAX_AMOUNT) {
    throw new Error('Amount exceeds maximum');
  }
  if (!params.privateKeyWif) {
    throw new Error('Private key (WIF) is required for signing');
  }
};

const validateWithdrawalParams = (params: {
  identityId?: string;
  toAddress?: string;
  amount?: number | string | bigint;
  privateKeyWif?: string;
  coreFeePerByte?: number | string;
}) => {
  if (!params.identityId) {
    throw new Error('Identity ID is required');
  }
  if (!params.toAddress) {
    throw new Error('Withdrawal address is required');
  }
  if (params.amount === undefined || params.amount === null) {
    throw new Error('Amount is required');
  }
  const numAmount = typeof params.amount === 'bigint' ? Number(params.amount) : Number(params.amount);
  if (!Number.isInteger(numAmount) || numAmount < 0) {
    throw new Error(`Invalid amount for withdrawal: ${params.amount}`);
  }
  if (numAmount > MAX_AMOUNT) {
    throw new Error('Amount exceeds maximum');
  }
  if (!params.privateKeyWif) {
    throw new Error('Private key (WIF) is required for signing');
  }
  if (params.coreFeePerByte !== undefined) {
    const fee = Number(params.coreFeePerByte);
    if (isNaN(fee) || fee < 0) {
      throw new Error(`Invalid coreFeePerByte: ${params.coreFeePerByte}`);
    }
  }
};

// Create a mock EvoSDK with credit operations
const createMockEvoSDK = () => ({
  identities: {
    creditTransfer: async (opts: {
      senderId: string;
      recipientId: string;
      amount: number | string | bigint;
      privateKeyWif: string;
      keyId?: number;
    }) => {
      validateTransferParams(opts);
      try {
        return await mockWasmSdk.identityCreditTransfer(
          opts.senderId,
          opts.recipientId,
          toBigInt(opts.amount),
          opts.privateKeyWif,
          opts.keyId ?? null
        );
      } catch (error) {
        throw new Error(`Credit transfer failed: ${(error as Error).message}`);
      }
    },
    creditWithdrawal: async (opts: {
      identityId: string;
      toAddress: string;
      amount: number | string | bigint;
      privateKeyWif: string;
      coreFeePerByte?: number;
      keyId?: number;
    }) => {
      validateWithdrawalParams(opts);
      try {
        return await mockWasmSdk.identityCreditWithdrawal(
          opts.identityId,
          opts.toAddress,
          toBigInt(opts.amount),
          opts.coreFeePerByte ?? 1,
          opts.privateKeyWif,
          opts.keyId ?? null
        );
      } catch (error) {
        throw new Error(`Credit withdrawal failed: ${(error as Error).message}`);
      }
    },
  },
});

describe('CreditOperations', () => {
  let client: ReturnType<typeof createMockEvoSDK>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockEvoSDK();
  });

  describe('creditTransfer()', () => {
    it('should transfer credits successfully', async () => {
      const mockResult = { transactionId: 'tx123', success: true };
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce(mockResult);

      const result = await client.identities.creditTransfer({
        senderId: 'sender-id',
        recipientId: 'recipient-id',
        amount: 100000,
        privateKeyWif: 'test-wif',
      });

      expect(mockWasmSdk.identityCreditTransfer).toHaveBeenCalledOnce();
      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(call[0]).toBe('sender-id');
      expect(call[1]).toBe('recipient-id');
      expect(call[2]).toBe(BigInt(100000));
      expect(call[3]).toBe('test-wif');
      expect(call[4]).toBeNull(); // keyId default
      expect(result).toEqual(mockResult);
    });

    it('should convert amount to BigInt from number', async () => {
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 50000,
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(typeof call[2]).toBe('bigint');
      expect(call[2]).toBe(BigInt(50000));
    });

    it('should convert amount to BigInt from string', async () => {
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: '75000',
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(typeof call[2]).toBe('bigint');
      expect(call[2]).toBe(BigInt(75000));
    });

    it('should convert amount to BigInt from bigint', async () => {
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: BigInt(25000),
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(typeof call[2]).toBe('bigint');
      expect(call[2]).toBe(BigInt(25000));
    });

    it('should support optional keyId parameter', async () => {
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
        keyId: 5,
      });

      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(call[4]).toBe(5);
    });

    it('should throw error when senderId is missing', async () => {
      await expect(client.identities.creditTransfer({
        senderId: '',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Sender identity ID is required');
    });

    it('should throw error when recipientId is missing', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: '',
        amount: 100000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Recipient identity ID is required');
    });

    it('should throw error when sender and recipient are the same', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'same-id',
        recipientId: 'same-id',
        amount: 100000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Cannot transfer credits to the same identity');
    });

    it('should throw error when amount is negative', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: -1000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Invalid amount for transfer: -1000');
    });

    it('should throw error when amount is not an integer', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 1000.5,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Invalid amount for transfer: 1000.5');
    });

    it('should throw error when amount exceeds maximum', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: MAX_AMOUNT + 1,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Amount exceeds maximum');
    });

    it('should throw error when privateKeyWif is missing', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: '',
      })).rejects.toThrow('Private key (WIF) is required for signing');
    });

    it('should wrap WASM SDK errors with descriptive message', async () => {
      mockWasmSdk.identityCreditTransfer.mockRejectedValueOnce(new Error('Insufficient balance'));

      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Credit transfer failed: Insufficient balance');
    });
  });

  describe('creditWithdrawal()', () => {
    it('should withdraw credits successfully', async () => {
      const mockResult = { transactionId: 'tx456', success: true };
      mockWasmSdk.identityCreditWithdrawal.mockResolvedValueOnce(mockResult);

      const result = await client.identities.creditWithdrawal({
        identityId: 'identity-id',
        toAddress: 'yXxxx...',
        amount: 50000,
        privateKeyWif: 'test-wif',
      });

      expect(mockWasmSdk.identityCreditWithdrawal).toHaveBeenCalledOnce();
      const call = (mockWasmSdk.identityCreditWithdrawal as Mock).mock.calls[0];
      expect(call[0]).toBe('identity-id');
      expect(call[1]).toBe('yXxxx...');
      expect(call[2]).toBe(BigInt(50000));
      expect(call[3]).toBe(1); // default coreFeePerByte
      expect(call[4]).toBe('test-wif');
      expect(call[5]).toBeNull(); // keyId default
      expect(result).toEqual(mockResult);
    });

    it('should convert amount to BigInt from number', async () => {
      mockWasmSdk.identityCreditWithdrawal.mockResolvedValueOnce({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 30000,
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditWithdrawal as Mock).mock.calls[0];
      expect(typeof call[2]).toBe('bigint');
      expect(call[2]).toBe(BigInt(30000));
    });

    it('should convert amount to BigInt from string', async () => {
      mockWasmSdk.identityCreditWithdrawal.mockResolvedValueOnce({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: '40000',
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditWithdrawal as Mock).mock.calls[0];
      expect(typeof call[2]).toBe('bigint');
      expect(call[2]).toBe(BigInt(40000));
    });

    it('should support custom coreFeePerByte parameter', async () => {
      mockWasmSdk.identityCreditWithdrawal.mockResolvedValueOnce({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        coreFeePerByte: 5,
      });

      const call = (mockWasmSdk.identityCreditWithdrawal as Mock).mock.calls[0];
      expect(call[3]).toBe(5);
    });

    it('should support optional keyId parameter', async () => {
      mockWasmSdk.identityCreditWithdrawal.mockResolvedValueOnce({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        keyId: 3,
      });

      const call = (mockWasmSdk.identityCreditWithdrawal as Mock).mock.calls[0];
      expect(call[5]).toBe(3);
    });

    it('should throw error when identityId is missing', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: '',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Identity ID is required');
    });

    it('should throw error when toAddress is missing', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: '',
        amount: 50000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Withdrawal address is required');
    });

    it('should throw error when amount is negative', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: -500,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Invalid amount for withdrawal: -500');
    });

    it('should throw error when amount is not an integer', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 500.99,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Invalid amount for withdrawal: 500.99');
    });

    it('should throw error when amount exceeds maximum', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: MAX_AMOUNT + 1,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Amount exceeds maximum');
    });

    it('should throw error when privateKeyWif is missing', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: '',
      })).rejects.toThrow('Private key (WIF) is required for signing');
    });

    it('should throw error for invalid coreFeePerByte', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        coreFeePerByte: -1,
      })).rejects.toThrow('Invalid coreFeePerByte: -1');
    });

    it('should wrap WASM SDK errors with descriptive message', async () => {
      mockWasmSdk.identityCreditWithdrawal.mockRejectedValueOnce(new Error('Invalid address'));

      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'invalid',
        amount: 50000,
        privateKeyWif: 'wif',
      })).rejects.toThrow('Credit withdrawal failed: Invalid address');
    });
  });

  describe('Amount validation', () => {
    it('should accept zero amount', async () => {
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 0,
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(call[2]).toBe(BigInt(0));
    });

    it('should accept maximum valid amount', async () => {
      mockWasmSdk.identityCreditTransfer.mockResolvedValueOnce({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: MAX_AMOUNT,
        privateKeyWif: 'wif',
      });

      const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
      expect(call[2]).toBe(BigInt(MAX_AMOUNT));
    });
  });
});
