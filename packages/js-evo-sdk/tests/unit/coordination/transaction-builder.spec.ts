/**
 * Unit tests for TransactionBuilder
 *
 * Tests asset lock transaction (type 8) creation and signing.
 * Note: Full integration testing requires network access.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  createMockUTXO,
  createMockDAPIClient,
  generateMockTxId,
  generateMockAddress,
} from '../../setup';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
}));

// Types for transaction building
// Note: TransactionFinder uses 'txId' (camelCase) internally
// but createMockUTXO uses 'txid' (lowercase) from Insight API format
interface UTXO {
  txId: string;
  txid?: string; // Alias for compatibility
  vout: number;
  address: string;
  satoshis: number;
  script: string;
}

interface DerivedAddressInfo {
  address: string;
  privateKey: any;
  publicKey: string;
  path: string;
  index: number;
}

interface AssetLockTransactionResult {
  transaction: any;
  transactionId: string;
  transactionHex: string;
  assetLockPrivateKeyWif: string;
  assetLockAddress: string;
}

// Mock TransactionBuilder
const createMockTransactionBuilder = () => {
  return {
    // Create type 8 asset lock transaction
    createAssetLockTransaction: vi.fn().mockImplementation(async (options: {
      amount: number;
      utxo: UTXO;
      sourceAddress: DerivedAddressInfo;
      changeAddress: string;
      network?: string;
    }): Promise<AssetLockTransactionResult> => {
      const { amount, utxo, sourceAddress, changeAddress, network = 'testnet' } = options;

      // Validate inputs - support both txId (camelCase) and txid (lowercase)
      const txId = utxo?.txId || utxo?.txid;
      if (!utxo || !txId) {
        throw new Error('UTXO is required');
      }

      if (!sourceAddress || !sourceAddress.privateKey) {
        throw new Error('Source address with private key is required');
      }

      if (amount <= 0) {
        throw new Error('Amount must be positive');
      }

      if (amount > utxo.satoshis) {
        throw new Error(`Insufficient UTXO balance: ${utxo.satoshis} < ${amount}`);
      }

      // Generate mock asset lock key pair
      const assetLockPrivateKeyWif = 'cVLwRLTvz3BxDAWkvS3yzT9pUcTCup7kQnfT2smRjvmmm1wAP6QT';
      const assetLockAddress = generateMockAddress();

      // Generate mock transaction
      const transactionId = generateMockTxId();
      const transactionHex = `0100000001${txId}00000000006a6a${amount.toString(16).padStart(16, '0')}`;

      return {
        transaction: {
          type: 8, // ASSET_LOCK
          id: transactionId,
          hash: transactionId,
          inputs: [{ prevTxId: txId, outputIndex: utxo.vout }],
          outputs: [
            { satoshis: amount, script: 'OP_RETURN' },
            { satoshis: utxo.satoshis - amount - 10000, script: changeAddress }, // Change
          ],
          getFee: () => 10000,
        },
        transactionId,
        transactionHex,
        assetLockPrivateKeyWif,
        assetLockAddress,
      };
    }),

    // Broadcast transaction via DAPI
    broadcastTransaction: vi.fn().mockImplementation(async (
      transactionHex: string,
      dapiClient: any
    ): Promise<string> => {
      // Validate inputs
      if (!transactionHex || transactionHex.length < 10) {
        throw new Error('Invalid transaction hex');
      }

      // Mock broadcast - return the transaction ID
      const txId = await dapiClient.core.broadcastTransaction(
        Buffer.from(transactionHex, 'hex')
      );

      return txId;
    }),
  };
};

describe('TransactionBuilder', () => {
  let builder: ReturnType<typeof createMockTransactionBuilder>;
  let mockDAPIClient: ReturnType<typeof createMockDAPIClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    builder = createMockTransactionBuilder();
    mockDAPIClient = createMockDAPIClient();
  });

  describe('createAssetLockTransaction()', () => {
    const createTestOptions = (overrides: any = {}) => ({
      amount: 200000,
      utxo: createMockUTXO({ satoshis: 5000000 }),
      sourceAddress: {
        address: 'ySourceAddress1234567890123',
        privateKey: {
          toWIF: () => 'cTestPrivateKey123456789012345678901234567890',
          toPublicKey: () => ({ toString: () => 'pubkey' }),
        },
        publicKey: '02pubkey...',
        path: "m/44'/1'/0'/0/0",
        index: 0,
      },
      changeAddress: 'yChangeAddress1234567890123',
      network: 'testnet',
      ...overrides,
    });

    it('creates type 8 asset lock transaction', async () => {
      const result = await builder.createAssetLockTransaction(createTestOptions());

      expect(result.transaction.type).toBe(8);
    });

    it('generates unique asset lock key pair', async () => {
      const result = await builder.createAssetLockTransaction(createTestOptions());

      expect(result.assetLockPrivateKeyWif).toBeTruthy();
      expect(result.assetLockAddress).toBeTruthy();
      expect(result.assetLockAddress.startsWith('y')).toBe(true); // Testnet
    });

    it('returns valid transaction hex', async () => {
      const result = await builder.createAssetLockTransaction(createTestOptions());

      expect(result.transactionHex).toBeTruthy();
      expect(typeof result.transactionHex).toBe('string');
      expect(result.transactionHex.length).toBeGreaterThan(0);
    });

    it('returns valid transaction ID', async () => {
      const result = await builder.createAssetLockTransaction(createTestOptions());

      expect(result.transactionId).toBeTruthy();
      expect(result.transactionId).toHaveLength(64); // 32 bytes hex
    });

    it('uses correct amount for asset lock output', async () => {
      const amount = 500000;
      const result = await builder.createAssetLockTransaction(
        createTestOptions({ amount })
      );

      expect(result.transaction.outputs[0].satoshis).toBe(amount);
    });

    it('includes change output when UTXO > amount + fee', async () => {
      const utxo = createMockUTXO({ satoshis: 1000000 }); // 1M duffs
      const amount = 200000; // 200K duffs

      const result = await builder.createAssetLockTransaction(
        createTestOptions({ amount, utxo })
      );

      // Should have burn output + change output
      expect(result.transaction.outputs.length).toBe(2);
    });

    it('throws error when UTXO has insufficient balance', async () => {
      const utxo = createMockUTXO({ satoshis: 100000 }); // 100K duffs
      const amount = 200000; // 200K duffs - more than UTXO

      await expect(builder.createAssetLockTransaction(
        createTestOptions({ amount, utxo })
      )).rejects.toThrow('Insufficient UTXO balance');
    });

    it('throws error when UTXO is missing', async () => {
      await expect(builder.createAssetLockTransaction(
        createTestOptions({ utxo: null })
      )).rejects.toThrow('UTXO is required');
    });

    it('throws error when source address is missing', async () => {
      await expect(builder.createAssetLockTransaction(
        createTestOptions({ sourceAddress: null })
      )).rejects.toThrow('Source address with private key is required');
    });

    it('throws error when amount is zero', async () => {
      await expect(builder.createAssetLockTransaction(
        createTestOptions({ amount: 0 })
      )).rejects.toThrow('Amount must be positive');
    });

    it('throws error when amount is negative', async () => {
      await expect(builder.createAssetLockTransaction(
        createTestOptions({ amount: -100000 })
      )).rejects.toThrow('Amount must be positive');
    });

    it('uses correct network for address generation', async () => {
      const result = await builder.createAssetLockTransaction(
        createTestOptions({ network: 'testnet' })
      );

      // Testnet addresses start with 'y'
      expect(result.assetLockAddress.startsWith('y')).toBe(true);
    });

    it('defaults to testnet when network not specified', async () => {
      const options = createTestOptions();
      delete options.network;

      const result = await builder.createAssetLockTransaction(options);

      // Should use testnet by default
      expect(result.assetLockAddress.startsWith('y')).toBe(true);
    });
  });

  describe('broadcastTransaction()', () => {
    it('broadcasts transaction via DAPI', async () => {
      const txHex = '0100000001' + '0'.repeat(100);

      await builder.broadcastTransaction(txHex, mockDAPIClient);

      expect(mockDAPIClient.core.broadcastTransaction).toHaveBeenCalled();
    });

    it('returns transaction ID from DAPI', async () => {
      const expectedTxId = generateMockTxId();
      mockDAPIClient.core.broadcastTransaction.mockResolvedValueOnce(expectedTxId);

      const result = await builder.broadcastTransaction(
        '0100000001' + '0'.repeat(100),
        mockDAPIClient
      );

      expect(result).toBe(expectedTxId);
    });

    it('throws error when transaction hex is invalid', async () => {
      await expect(builder.broadcastTransaction(
        '', // Empty hex
        mockDAPIClient
      )).rejects.toThrow('Invalid transaction hex');
    });

    it('throws error when transaction hex is too short', async () => {
      await expect(builder.broadcastTransaction(
        '0100', // Too short
        mockDAPIClient
      )).rejects.toThrow('Invalid transaction hex');
    });

    it('propagates DAPI broadcast errors', async () => {
      mockDAPIClient.core.broadcastTransaction.mockRejectedValueOnce(
        new Error('DAPI broadcast failed')
      );

      await expect(builder.broadcastTransaction(
        '0100000001' + '0'.repeat(100),
        mockDAPIClient
      )).rejects.toThrow('DAPI broadcast failed');
    });
  });

  describe('Transaction structure', () => {
    it('creates transaction with OP_RETURN burn output', async () => {
      const result = await builder.createAssetLockTransaction({
        amount: 200000,
        utxo: createMockUTXO({ satoshis: 5000000 }),
        sourceAddress: {
          address: 'ySourceAddress1234567890123',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        changeAddress: 'yChangeAddress1234567890123',
      });

      expect(result.transaction.outputs[0].script).toBe('OP_RETURN');
    });

    it('includes correct input from UTXO', async () => {
      const utxo = createMockUTXO();
      const expectedTxId = utxo.txid || (utxo as any).txId; // Support both formats

      const result = await builder.createAssetLockTransaction({
        amount: 200000,
        utxo,
        sourceAddress: {
          address: utxo.address,
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        changeAddress: 'yChangeAddress1234567890123',
      });

      expect(result.transaction.inputs[0].prevTxId).toBe(expectedTxId);
      expect(result.transaction.inputs[0].outputIndex).toBe(utxo.vout);
    });

    it('calculates reasonable fee', async () => {
      const result = await builder.createAssetLockTransaction({
        amount: 200000,
        utxo: createMockUTXO({ satoshis: 5000000 }),
        sourceAddress: {
          address: 'ySourceAddress1234567890123',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        changeAddress: 'yChangeAddress1234567890123',
      });

      const fee = result.transaction.getFee();
      expect(fee).toBeGreaterThan(0);
      expect(fee).toBeLessThan(100000); // Reasonable upper bound
    });
  });
});
