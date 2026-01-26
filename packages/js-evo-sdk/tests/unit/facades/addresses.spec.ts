import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock types for testing
interface MockAddressInfo {
  address: any;
  nonce: bigint | number;
  balance: bigint | string;
}

interface MockTransferResult {
  type: string;
  addressInfos?: MockAddressInfo[];
  message?: string;
}

interface MockTopUpResult {
  addressInfos: Map<any, MockAddressInfo>;
  newBalance: bigint;
}

interface MockIdentityResult {
  identity: { id: () => any };
  addressInfos: Map<any, MockAddressInfo>;
}

// Create mock WASM SDK with address methods
const createMockWasmSdk = () => {
  const mockAddress = { addressType: 'P2PKH', toBytes: vi.fn() };

  return {
    // Address query methods
    getAddressInfo: vi.fn().mockResolvedValue('ok'),
    getAddressInfoWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getAddressesInfos: vi.fn().mockResolvedValue('ok'),
    getAddressesInfosWithProofInfo: vi.fn().mockResolvedValue('ok'),

    // Address transaction methods
    addressFundsTransfer: vi.fn().mockResolvedValue({
      type: 'VerifiedAddressInfos',
      addressInfos: [{ address: mockAddress, nonce: 1, balance: '90000' }],
    } as MockTransferResult),
    addressFundsWithdraw: vi.fn().mockResolvedValue(new Map()),
    addressFundingFromAssetLock: vi.fn().mockResolvedValue(new Map()),

    // Identity-address methods
    identityTopUpFromAddresses: vi.fn().mockResolvedValue({
      addressInfos: new Map(),
      newBalance: 150000n,
    } as MockTopUpResult),
    identityTransferToAddresses: vi.fn().mockResolvedValue({
      addressInfos: new Map(),
      newBalance: 400000n,
    }),
    identityCreateFromAddresses: vi.fn().mockResolvedValue({
      identity: { id: () => ({ toBase58: () => 'mockId' }) },
      addressInfos: new Map(),
    } as MockIdentityResult),
  };
};

// Mock WASM SDK package types
const createMockWasmPackage = () => {
  const mockAddress = { addressType: 'P2PKH', toBytes: vi.fn() };

  return {
    PlatformAddress: {
      fromBytes: vi.fn().mockReturnValue(mockAddress),
    },
    PrivateKey: {
      fromBytes: vi.fn().mockReturnValue({ toPublicKey: vi.fn() }),
    },
    PlatformAddressSigner: vi.fn().mockImplementation(() => ({
      addKey: vi.fn().mockReturnValue(mockAddress),
    })),
    PlatformAddressInput: vi.fn().mockImplementation((addr, nonce, amount) => ({
      address: addr,
      nonce,
      amount,
    })),
    PlatformAddressOutput: vi.fn().mockImplementation((addr, amount) => ({
      address: addr,
      amount,
    })),
    Identifier: {
      fromBytes: vi.fn().mockReturnValue({ toBase58: () => 'mockId' }),
    },
    CoreScript: {
      newP2PKH: vi.fn().mockReturnValue({ toBytes: vi.fn() }),
    },
    PoolingWasm: {
      Standard: 'Standard',
    },
  };
};

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
}));

// Declare mock variables that will be created fresh in beforeEach
let mockWasmSdk: ReturnType<typeof createMockWasmSdk>;
let mockWasmPackage: ReturnType<typeof createMockWasmPackage>;

describe('AddressesFacade', () => {
  let client: {
    addresses: {
      get: (address: string | Uint8Array) => Promise<any>;
      getWithProof: (address: string | Uint8Array) => Promise<any>;
      getMany: (addresses: (string | Uint8Array)[]) => Promise<any>;
      getManyWithProof: (addresses: (string | Uint8Array)[]) => Promise<any>;
      transfer: (options: any) => Promise<any>;
      withdraw: (options: any) => Promise<any>;
      topUpIdentity: (options: any) => Promise<any>;
      transferFromIdentity: (options: any) => Promise<any>;
      fundFromAssetLock: (options: any) => Promise<any>;
      createIdentity: (options: any) => Promise<any>;
    };
  };

  beforeEach(() => {
    // Create fresh mocks in beforeEach
    mockWasmSdk = createMockWasmSdk();
    mockWasmPackage = createMockWasmPackage();

    // Create a mock EvoSDK client with fresh mocks
    client = {
      addresses: {
        get: async (address: string | Uint8Array) => mockWasmSdk.getAddressInfo(address),
        getWithProof: async (address: string | Uint8Array) => mockWasmSdk.getAddressInfoWithProofInfo(address),
        getMany: async (addresses: (string | Uint8Array)[]) => mockWasmSdk.getAddressesInfos(addresses),
        getManyWithProof: async (addresses: (string | Uint8Array)[]) => mockWasmSdk.getAddressesInfosWithProofInfo(addresses),
        transfer: async (options: any) => mockWasmSdk.addressFundsTransfer(options.inputs, options.outputs, options.signer),
        withdraw: async (options: any) => mockWasmSdk.addressFundsWithdraw(
          options.inputs,
          options.coreFeePerByte,
          options.pooling,
          options.outputScript,
          options.signer
        ),
        topUpIdentity: async (options: any) => mockWasmSdk.identityTopUpFromAddresses(
          options.identityId,
          options.inputs,
          options.signer
        ),
        transferFromIdentity: async (options: any) => mockWasmSdk.identityTransferToAddresses(
          options.identityId,
          options.outputs,
          options.signer
        ),
        fundFromAssetLock: async (options: any) => mockWasmSdk.addressFundingFromAssetLock(
          options.assetLockProof,
          options.assetLockPrivateKey,
          options.outputs,
          options.signer
        ),
        createIdentity: async (options: any) => mockWasmSdk.identityCreateFromAddresses(
          options.identity,
          options.inputs,
          options.identitySigner,
          options.addressSigner
        ),
      },
    };
  });

  it('get() forwards address to getAddressInfo', async () => {
    const address = 'tdashevo1qr4nl2m5z7v7g7d2c4z6k8x9w3y2f5p6h0s1t4';
    await client.addresses.get(address);
    expect(mockWasmSdk.getAddressInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getAddressInfo).toHaveBeenCalledWith(address);
  });

  it('getWithProof() forwards address to getAddressInfoWithProofInfo', async () => {
    const address = 'tdashevo1qr4nl2m5z7v7g7d2c4z6k8x9w3y2f5p6h0s1t4';
    await client.addresses.getWithProof(address);
    expect(mockWasmSdk.getAddressInfoWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getAddressInfoWithProofInfo).toHaveBeenCalledWith(address);
  });

  it('getMany() forwards array of addresses to getAddressesInfos', async () => {
    const addresses = [
      'tdashevo1qr4nl2m5z7v7g7d2c4z6k8x9w3y2f5p6h0s1t4',
      'tdashevo1abc123def456ghi789jkl012mno345pqr678st',
    ];
    await client.addresses.getMany(addresses);
    expect(mockWasmSdk.getAddressesInfos).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getAddressesInfos).toHaveBeenCalledWith(addresses);
  });

  it('getManyWithProof() forwards array of addresses to getAddressesInfosWithProofInfo', async () => {
    const addresses = [
      'tdashevo1qr4nl2m5z7v7g7d2c4z6k8x9w3y2f5p6h0s1t4',
    ];
    await client.addresses.getManyWithProof(addresses);
    expect(mockWasmSdk.getAddressesInfosWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getAddressesInfosWithProofInfo).toHaveBeenCalledWith(addresses);
  });

  it('get() accepts Uint8Array address', async () => {
    const addressBytes = new Uint8Array(21);
    await client.addresses.get(addressBytes);
    expect(mockWasmSdk.getAddressInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getAddressInfo).toHaveBeenCalledWith(addressBytes);
  });

  it('getMany() accepts mixed address formats', async () => {
    const bech32Address = 'tdashevo1qr4nl2m5z7v7g7d2c4z6k8x9w3y2f5p6h0s1t4';
    const bytesAddress = new Uint8Array(21);
    const mixedAddresses = [bech32Address, bytesAddress];
    await client.addresses.getMany(mixedAddresses);
    expect(mockWasmSdk.getAddressesInfos).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getAddressesInfos).toHaveBeenCalledWith(mixedAddresses);
  });

  it('transfer() forwards options to addressFundsTransfer with PlatformAddressSigner', async () => {
    // Create proper mock objects
    const recipientAddr = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
    );

    const privateKeyBytes = new Uint8Array(32).fill(1);
    const privateKey = mockWasmPackage.PrivateKey.fromBytes(privateKeyBytes, 'testnet');

    const signer = new mockWasmPackage.PlatformAddressSigner();
    const derivedSenderAddr = signer.addKey(privateKey);

    const input = new mockWasmPackage.PlatformAddressInput(derivedSenderAddr, 0, 100000n);
    const output = new mockWasmPackage.PlatformAddressOutput(recipientAddr, 90000n);

    const options = {
      inputs: [input],
      outputs: [output],
      signer,
    };
    const result = await client.addresses.transfer(options);
    expect(mockWasmSdk.addressFundsTransfer).toHaveBeenCalledOnce();
    expect(result.type).toBe('VerifiedAddressInfos');
    expect(result.addressInfos).toHaveLength(1);
    expect(result.addressInfos[0].address.addressType).toBe('P2PKH');
  });

  it('transfer() handles success result type', async () => {
    mockWasmSdk.addressFundsTransfer.mockResolvedValueOnce({
      type: 'Success',
      message: 'Address funds transfer completed successfully',
    });

    const recipientAddr = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
    );

    const privateKeyBytes = new Uint8Array(32).fill(1);
    const privateKey = mockWasmPackage.PrivateKey.fromBytes(privateKeyBytes, 'testnet');

    const signer = new mockWasmPackage.PlatformAddressSigner();
    const derivedSenderAddr = signer.addKey(privateKey);

    const input = new mockWasmPackage.PlatformAddressInput(derivedSenderAddr, 0, 100000n);
    const output = new mockWasmPackage.PlatformAddressOutput(recipientAddr, 90000n);

    const options = {
      inputs: [input],
      outputs: [output],
      signer,
    };
    const result = await client.addresses.transfer(options);
    expect(result.type).toBe('Success');
    expect(result.message).toContain('successfully');
  });

  it('topUpIdentity() forwards options to identityTopUpFromAddresses', async () => {
    const mockAddress = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
    );

    mockWasmSdk.identityTopUpFromAddresses.mockResolvedValueOnce({
      addressInfos: new Map([[mockAddress, { address: mockAddress, nonce: 1n, balance: 50000n }]]),
      newBalance: 150000n,
    });

    const identityId = mockWasmPackage.Identifier.fromBytes(new Uint8Array(32).fill(42));

    const options = {
      identityId,
      inputs: [],
      signer: {},
    };

    const result = await client.addresses.topUpIdentity(options);
    expect(mockWasmSdk.identityTopUpFromAddresses).toHaveBeenCalledOnce();
    expect(result.newBalance).toBe(150000n);
  });

  it('withdraw() forwards options to addressFundsWithdraw', async () => {
    const mockAddress = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
    );

    const resultMap = new Map();
    resultMap.set(mockAddress, { address: mockAddress, nonce: 1n, balance: 0n });

    mockWasmSdk.addressFundsWithdraw.mockResolvedValueOnce(resultMap);

    const coreScript = mockWasmPackage.CoreScript.newP2PKH(new Uint8Array(20).fill(5));

    const options = {
      inputs: [],
      coreFeePerByte: 1,
      pooling: mockWasmPackage.PoolingWasm.Standard,
      outputScript: coreScript,
      signer: {},
    };

    const result = await client.addresses.withdraw(options);
    expect(mockWasmSdk.addressFundsWithdraw).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Map);
  });

  it('transferFromIdentity() forwards options to identityTransferToAddresses', async () => {
    const mockAddress = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
    );

    mockWasmSdk.identityTransferToAddresses.mockResolvedValueOnce({
      addressInfos: new Map([[mockAddress, { address: mockAddress, nonce: 0n, balance: 100000n }]]),
      newBalance: 400000n,
    });

    const identityId = mockWasmPackage.Identifier.fromBytes(new Uint8Array(32).fill(42));

    const options = {
      identityId,
      outputs: [],
      signer: {},
    };

    const result = await client.addresses.transferFromIdentity(options);
    expect(mockWasmSdk.identityTransferToAddresses).toHaveBeenCalledOnce();
    expect(result.newBalance).toBe(400000n);
  });

  it('fundFromAssetLock() forwards options to addressFundingFromAssetLock', async () => {
    const mockAddress = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
    );

    const resultMap = new Map();
    resultMap.set(mockAddress, { address: mockAddress, nonce: 0n, balance: 100000n });

    mockWasmSdk.addressFundingFromAssetLock.mockResolvedValueOnce(resultMap);

    const options = {
      assetLockProof: {},
      assetLockPrivateKey: {},
      outputs: [],
      signer: {},
    };

    const result = await client.addresses.fundFromAssetLock(options);
    expect(mockWasmSdk.addressFundingFromAssetLock).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Map);
  });

  it('createIdentity() forwards options to identityCreateFromAddresses', async () => {
    const mockAddress = mockWasmPackage.PlatformAddress.fromBytes(
      new Uint8Array([0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
    );

    const mockIdentityId = mockWasmPackage.Identifier.fromBytes(new Uint8Array(32).fill(99));

    mockWasmSdk.identityCreateFromAddresses.mockResolvedValueOnce({
      identity: { id: () => mockIdentityId },
      addressInfos: new Map([[mockAddress, { address: mockAddress, nonce: 1n, balance: 0n }]]),
    });

    const options = {
      identity: {},
      inputs: [],
      identitySigner: {},
      addressSigner: {},
    };

    const result = await client.addresses.createIdentity(options);
    expect(mockWasmSdk.identityCreateFromAddresses).toHaveBeenCalledOnce();
    expect(result.identity).toBeDefined();
  });

  describe('Error Handling', () => {
    it('handles address not found error on get()', async () => {
      const errorMessage = 'Address not found';
      mockWasmSdk.getAddressInfo.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.addresses.get('tdashevo1invalid')).rejects.toThrow(errorMessage);
    });

    it('handles invalid proof error on fundFromAssetLock()', async () => {
      const errorMessage = 'Invalid asset lock proof';
      mockWasmSdk.addressFundingFromAssetLock.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.addresses.fundFromAssetLock({
        assetLockProof: {},
        assetLockPrivateKey: {},
        outputs: [],
        signer: {},
      })).rejects.toThrow(errorMessage);
    });

    it('handles insufficient funds error on transfer()', async () => {
      const errorMessage = 'Insufficient funds for transfer';
      mockWasmSdk.addressFundsTransfer.mockRejectedValueOnce(new Error(errorMessage));

      const recipientAddr = mockWasmPackage.PlatformAddress.fromBytes(
        new Uint8Array([0x00, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
      );
      const privateKeyBytes = new Uint8Array(32).fill(1);
      const privateKey = mockWasmPackage.PrivateKey.fromBytes(privateKeyBytes, 'testnet');
      const signer = new mockWasmPackage.PlatformAddressSigner();
      const derivedSenderAddr = signer.addKey(privateKey);
      const input = new mockWasmPackage.PlatformAddressInput(derivedSenderAddr, 0, 100n);
      const output = new mockWasmPackage.PlatformAddressOutput(recipientAddr, 999999999n);

      await expect(client.addresses.transfer({
        inputs: [input],
        outputs: [output],
        signer,
      })).rejects.toThrow(errorMessage);
    });

    it('handles network error on getMany()', async () => {
      const errorMessage = 'Network connection failed';
      mockWasmSdk.getAddressesInfos.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.addresses.getMany(['addr1', 'addr2'])).rejects.toThrow(errorMessage);
    });

    it('handles createIdentity failure', async () => {
      const errorMessage = 'Failed to create identity from addresses';
      mockWasmSdk.identityCreateFromAddresses.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.addresses.createIdentity({
        identity: {},
        inputs: [],
        identitySigner: {},
        addressSigner: {},
      })).rejects.toThrow(errorMessage);
    });
  });
});
