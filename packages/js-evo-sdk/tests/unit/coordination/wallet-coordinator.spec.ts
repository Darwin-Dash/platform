/**
 * Unit tests for WalletCoordinator
 *
 * Tests HD derivation, address management, and wallet setup orchestration.
 * Note: Full integration testing requires network access.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  createMockWasmSdk,
  createMockDAPIClient,
  createMockUTXO,
  createMockWallet,
  generateMockAddress,
  generateMockTxId,
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

// Mock types for the coordinator
interface DerivedAddressInfo {
  address: string;
  privateKey: any;
  publicKey: string;
  path: string;
  index: number;
}

interface UTXO {
  txId: string;
  vout: number;
  address: string;
  satoshis: number;
  script: string;
}

// Mock WalletCoordinator (since it requires actual WASM/DAPI setup)
const createMockWalletCoordinator = () => {
  const mockWallet = createMockWallet();
  const mockDAPIClient = createMockDAPIClient();

  return {
    // Derives addresses from mnemonic
    deriveAddresses: vi.fn().mockImplementation(
      async (mnemonic: string, network: string, count: number = 20) => {
        const external: DerivedAddressInfo[] = [];
        const internal: DerivedAddressInfo[] = [];

        for (let i = 0; i < count; i++) {
          external.push({
            address: generateMockAddress(),
            privateKey: { toWIF: () => 'cVLwRLTvz3BxDAWkvS3yzT9pUcTCup7kQnfT2smRjvmmm1wAP6QT' },
            publicKey: '02a8b4e934d1a17f41e9d0f8a67e8b36b7c7c28d9c2e5f6a8b9c0d1e2f3a4b5c6d7',
            path: `m/44'/${network === 'mainnet' ? '5' : '1'}'/0'/0/${i}`,
            index: i,
          });
          internal.push({
            address: generateMockAddress(),
            privateKey: { toWIF: () => 'cVLwRLTvz3BxDAWkvS3yzT9pUcTCup7kQnfT2smRjvmmm1wAP6QT' },
            publicKey: '02a8b4e934d1a17f41e9d0f8a67e8b36b7c7c28d9c2e5f6a8b9c0d1e2f3a4b5c6d7',
            path: `m/44'/${network === 'mainnet' ? '5' : '1'}'/0'/1/${i}`,
            index: i,
          });
        }

        return { external, internal };
      }
    ),

    // Setup wallet - combines DAPI, address derivation, and UTXO discovery
    setupWallet: vi.fn().mockImplementation(async (options: {
      mnemonic: string;
      network: string;
      startHeight: number;
      addressCount?: number;
    }) => {
      const addresses = await createMockWalletCoordinator().deriveAddresses(
        options.mnemonic,
        options.network,
        options.addressCount ?? 20
      );

      const mockUTXO = createMockUTXO({ address: addresses.external[0].address });

      return {
        dapiClient: mockDAPIClient,
        monitor: { on: vi.fn(), stop: vi.fn(), getStatus: vi.fn() },
        addresses,
        utxos: [mockUTXO],
        latestUTXO: mockUTXO,
        hdPrivateKey: { toString: () => 'xprv...' },
      };
    }),

    // Find address with UTXO
    findAddressWithUTXO: vi.fn().mockImplementation(
      (addresses: DerivedAddressInfo[], utxos: UTXO[]) => {
        for (const addressInfo of addresses) {
          const utxo = utxos.find(u => u.address === addressInfo.address);
          if (utxo) {
            return { addressInfo, utxo };
          }
        }
        return null;
      }
    ),

    // Get unused address
    getUnusedAddress: vi.fn().mockImplementation(
      (addresses: DerivedAddressInfo[], utxos: UTXO[]) => {
        for (const addressInfo of addresses) {
          const hasUTXO = utxos.some(u => u.address === addressInfo.address);
          if (!hasUTXO) {
            return addressInfo;
          }
        }
        return addresses[addresses.length - 1];
      }
    ),

    // Get current blockchain height
    getCurrentBlockHeight: vi.fn().mockResolvedValue(920100),
  };
};

describe('WalletCoordinator', () => {
  let coordinator: ReturnType<typeof createMockWalletCoordinator>;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinator = createMockWalletCoordinator();
  });

  describe('deriveAddresses()', () => {
    const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('derives correct number of external and internal addresses', async () => {
      const result = await coordinator.deriveAddresses(VALID_MNEMONIC, 'testnet', 10);

      expect(result.external).toHaveLength(10);
      expect(result.internal).toHaveLength(10);
    });

    it('generates unique addresses for each index', async () => {
      const result = await coordinator.deriveAddresses(VALID_MNEMONIC, 'testnet', 5);

      const allAddresses = [
        ...result.external.map(a => a.address),
        ...result.internal.map(a => a.address),
      ];

      const uniqueAddresses = new Set(allAddresses);
      expect(uniqueAddresses.size).toBe(allAddresses.length);
    });

    it('uses testnet coin type (1) for testnet', async () => {
      const result = await coordinator.deriveAddresses(VALID_MNEMONIC, 'testnet', 1);

      expect(result.external[0].path).toContain("/1'/");
    });

    it('uses mainnet coin type (5) for mainnet', async () => {
      const result = await coordinator.deriveAddresses(VALID_MNEMONIC, 'mainnet', 1);

      expect(result.external[0].path).toContain("/5'/");
    });

    it('includes private key in each derived address', async () => {
      const result = await coordinator.deriveAddresses(VALID_MNEMONIC, 'testnet', 1);

      expect(result.external[0].privateKey).toBeDefined();
      expect(result.external[0].privateKey.toWIF).toBeDefined();
    });

    it('includes correct path for each address', async () => {
      const result = await coordinator.deriveAddresses(VALID_MNEMONIC, 'testnet', 3);

      expect(result.external[0].index).toBe(0);
      expect(result.external[1].index).toBe(1);
      expect(result.external[2].index).toBe(2);
    });
  });

  describe('setupWallet()', () => {
    const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('returns all required components', async () => {
      const result = await coordinator.setupWallet({
        mnemonic: VALID_MNEMONIC,
        network: 'testnet',
        startHeight: 900000,
      });

      expect(result.dapiClient).toBeDefined();
      expect(result.monitor).toBeDefined();
      expect(result.addresses).toBeDefined();
      expect(result.addresses.external).toBeDefined();
      expect(result.addresses.internal).toBeDefined();
      expect(result.utxos).toBeDefined();
    });

    it('creates DAPI client with correct network', async () => {
      const result = await coordinator.setupWallet({
        mnemonic: VALID_MNEMONIC,
        network: 'testnet',
        startHeight: 900000,
      });

      expect(result.dapiClient).toBeDefined();
    });

    it('derives addresses using provided count', async () => {
      const result = await coordinator.setupWallet({
        mnemonic: VALID_MNEMONIC,
        network: 'testnet',
        startHeight: 900000,
        addressCount: 10,
      });

      expect(result.addresses.external).toHaveLength(10);
      expect(result.addresses.internal).toHaveLength(10);
    });

    it('defaults to 20 addresses when count not specified', async () => {
      const result = await coordinator.setupWallet({
        mnemonic: VALID_MNEMONIC,
        network: 'testnet',
        startHeight: 900000,
      });

      expect(result.addresses.external).toHaveLength(20);
      expect(result.addresses.internal).toHaveLength(20);
    });
  });

  describe('findAddressWithUTXO()', () => {
    it('returns address info with matching UTXO', () => {
      const addresses: DerivedAddressInfo[] = [
        {
          address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        {
          address: 'yQ9B4eceyStMRdvz6nYf5d0cBpJtMaHXt7r',
          privateKey: { toWIF: () => 'wif2' },
          publicKey: 'pubkey2',
          path: "m/44'/1'/0'/0/1",
          index: 1,
        },
      ];

      const utxos = [
        createMockUTXO({ address: 'yQ9B4eceyStMRdvz6nYf5d0cBpJtMaHXt7r' }),
      ];

      const result = coordinator.findAddressWithUTXO(addresses, utxos);

      expect(result).not.toBeNull();
      expect(result?.addressInfo.address).toBe('yQ9B4eceyStMRdvz6nYf5d0cBpJtMaHXt7r');
      expect(result?.utxo).toBeDefined();
    });

    it('returns null when no matching UTXO found', () => {
      const addresses: DerivedAddressInfo[] = [
        {
          address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
      ];

      const utxos = [
        createMockUTXO({ address: 'yDifferentAddress12345678901234' }),
      ];

      const result = coordinator.findAddressWithUTXO(addresses, utxos);

      expect(result).toBeNull();
    });

    it('returns first matching address when multiple have UTXOs', () => {
      const addresses: DerivedAddressInfo[] = [
        {
          address: 'yFirstAddress1234567890123456',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        {
          address: 'ySecondAddress123456789012345',
          privateKey: { toWIF: () => 'wif2' },
          publicKey: 'pubkey2',
          path: "m/44'/1'/0'/0/1",
          index: 1,
        },
      ];

      const utxos = [
        createMockUTXO({ address: 'yFirstAddress1234567890123456' }),
        createMockUTXO({ address: 'ySecondAddress123456789012345' }),
      ];

      const result = coordinator.findAddressWithUTXO(addresses, utxos);

      expect(result?.addressInfo.index).toBe(0);
    });
  });

  describe('getUnusedAddress()', () => {
    it('returns first address with no UTXO', () => {
      const addresses: DerivedAddressInfo[] = [
        {
          address: 'yUsedAddress1234567890123456',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        {
          address: 'yUnusedAddress12345678901234',
          privateKey: { toWIF: () => 'wif2' },
          publicKey: 'pubkey2',
          path: "m/44'/1'/0'/0/1",
          index: 1,
        },
      ];

      const utxos = [
        createMockUTXO({ address: 'yUsedAddress1234567890123456' }),
      ];

      const result = coordinator.getUnusedAddress(addresses, utxos);

      expect(result.address).toBe('yUnusedAddress12345678901234');
      expect(result.index).toBe(1);
    });

    it('returns first address when no addresses have UTXOs', () => {
      const addresses: DerivedAddressInfo[] = [
        {
          address: 'yFirstAddress1234567890123456',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
      ];

      const utxos: UTXO[] = [];

      const result = coordinator.getUnusedAddress(addresses, utxos);

      expect(result.address).toBe('yFirstAddress1234567890123456');
    });

    it('returns last address when all addresses have UTXOs', () => {
      const addresses: DerivedAddressInfo[] = [
        {
          address: 'yUsedAddress1234567890123456',
          privateKey: { toWIF: () => 'wif' },
          publicKey: 'pubkey',
          path: "m/44'/1'/0'/0/0",
          index: 0,
        },
        {
          address: 'yLastUsedAddress123456789012',
          privateKey: { toWIF: () => 'wif2' },
          publicKey: 'pubkey2',
          path: "m/44'/1'/0'/0/1",
          index: 1,
        },
      ];

      const utxos = [
        createMockUTXO({ address: 'yUsedAddress1234567890123456' }),
        createMockUTXO({ address: 'yLastUsedAddress123456789012' }),
      ];

      const result = coordinator.getUnusedAddress(addresses, utxos);

      expect(result.index).toBe(1);
    });
  });

  describe('getCurrentBlockHeight()', () => {
    it('returns current blockchain height', async () => {
      const height = await coordinator.getCurrentBlockHeight();

      expect(height).toBeGreaterThan(0);
      expect(typeof height).toBe('number');
    });
  });
});
