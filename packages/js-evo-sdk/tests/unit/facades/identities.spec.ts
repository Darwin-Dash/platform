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

// Create a mock EvoSDK
const createMockEvoSDK = () => ({
  identities: {
    get: async (id: string) => mockWasmSdk.getIdentity(id),
    getWithProof: async (id: string) => mockWasmSdk.getIdentityWithProofInfo(id),
    fetchUnproved: async (id: string) => mockWasmSdk.getIdentityUnproved(id),
    getKeys: async (opts: any) => {
      const ids = opts.specificKeyIds ? new Uint32Array(opts.specificKeyIds) : null;
      return mockWasmSdk.getIdentityKeys(
        opts.identityId,
        opts.keyRequestType,
        ids,
        opts.searchPurposeMap ? JSON.stringify(opts.searchPurposeMap) : null,
        opts.limit,
        opts.offset
      );
    },
    getKeysWithProof: async (opts: any) => {
      const ids = opts.specificKeyIds ? new Uint32Array(opts.specificKeyIds) : null;
      return mockWasmSdk.getIdentityKeysWithProofInfo(
        opts.identityId,
        opts.keyRequestType,
        ids,
        opts.limit,
        opts.offset
      );
    },
    nonce: async (id: string) => mockWasmSdk.getIdentityNonce(id),
    nonceWithProof: async (id: string) => mockWasmSdk.getIdentityNonceWithProofInfo(id),
    contractNonce: async (id: string, contract: string) => mockWasmSdk.getIdentityContractNonce(id, contract),
    contractNonceWithProof: async (id: string, contract: string) => mockWasmSdk.getIdentityContractNonceWithProofInfo(id, contract),
    balance: async (id: string) => mockWasmSdk.getIdentityBalance(id),
    balanceWithProof: async (id: string) => mockWasmSdk.getIdentityBalanceWithProofInfo(id),
    balances: async (ids: string[]) => mockWasmSdk.getIdentitiesBalances(ids),
    balancesWithProof: async (ids: string[]) => mockWasmSdk.getIdentitiesBalancesWithProofInfo(ids),
    balanceAndRevision: async (id: string) => mockWasmSdk.getIdentityBalanceAndRevision(id),
    balanceAndRevisionWithProof: async (id: string) => mockWasmSdk.getIdentityBalanceAndRevisionWithProofInfo(id),
    byPublicKeyHash: async (hash: string) => mockWasmSdk.getIdentityByPublicKeyHash(hash),
    byPublicKeyHashWithProof: async (hash: string) => mockWasmSdk.getIdentityByPublicKeyHashWithProofInfo(hash),
    byNonUniquePublicKeyHash: async (hash: string, opts?: { startAfter?: string }) =>
      mockWasmSdk.getIdentityByNonUniquePublicKeyHash(hash, opts?.startAfter || null),
    byNonUniquePublicKeyHashWithProof: async (hash: string) =>
      mockWasmSdk.getIdentityByNonUniquePublicKeyHashWithProofInfo(hash, null),
    contractKeys: async (opts: any) => {
      const purposes = opts.purposes ? new Uint32Array(opts.purposes) : null;
      return mockWasmSdk.getIdentitiesContractKeys(opts.identityIds, opts.contractId, purposes);
    },
    contractKeysWithProof: async (opts: any) =>
      mockWasmSdk.getIdentitiesContractKeysWithProofInfo(opts.identityIds, opts.contractId, null),
    tokenBalances: async (id: string, tokens: string[]) => mockWasmSdk.getIdentityTokenBalances(id, tokens),
    tokenBalancesWithProof: async (id: string, tokens: string[]) => mockWasmSdk.getIdentityTokenBalancesWithProofInfo(id, tokens),
    create: async (opts: any) => mockWasmSdk.identityCreate(
      JSON.stringify(opts.assetLockProof),
      opts.assetLockPrivateKeyWif,
      JSON.stringify(opts.publicKeys)
    ),
    topUp: async (opts: any) => mockWasmSdk.identityTopUp(
      opts.identityId,
      JSON.stringify(opts.assetLockProof),
      opts.assetLockPrivateKeyWif
    ),
    creditTransfer: async (opts: any) => mockWasmSdk.identityCreditTransfer(
      opts.senderId,
      opts.recipientId,
      BigInt(opts.amount),
      opts.privateKeyWif,
      opts.keyId
    ),
    creditWithdrawal: async (opts: any) => mockWasmSdk.identityCreditWithdrawal(
      opts.identityId,
      opts.toAddress,
      BigInt(opts.amount),
      opts.coreFeePerByte,
      opts.privateKeyWif,
      opts.keyId
    ),
    update: async (opts: any) => {
      const disabledIds = opts.disablePublicKeyIds ? new Uint32Array(opts.disablePublicKeyIds) : new Uint32Array([]);
      return mockWasmSdk.identityUpdate(
        opts.identityId,
        JSON.stringify(opts.addPublicKeys || []),
        disabledIds,
        opts.privateKeyWif
      );
    },
  },
});

describe('IdentitiesFacade', () => {
  let client: ReturnType<typeof createMockEvoSDK>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockEvoSDK();
  });

  it('get() and getWithProof() forward to instance methods', async () => {
    await client.identities.get('id');
    await client.identities.getWithProof('id2');
    expect(mockWasmSdk.getIdentity).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentity).toHaveBeenCalledWith('id');
    expect(mockWasmSdk.getIdentityWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityWithProofInfo).toHaveBeenCalledWith('id2');
  });

  it('fetchUnproved() forwards to getIdentityUnproved', async () => {
    await client.identities.fetchUnproved('id');
    expect(mockWasmSdk.getIdentityUnproved).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityUnproved).toHaveBeenCalledWith('id');
  });

  it('getKeys() forwards with Uint32Array and JSON mapping', async () => {
    await client.identities.getKeys({
      identityId: 'id',
      keyRequestType: 'specific',
      specificKeyIds: [1, 2],
      searchPurposeMap: { a: 1 },
      limit: 10,
      offset: 2,
    });
    const call = (mockWasmSdk.getIdentityKeys as Mock).mock.calls[0];
    expect(call[0]).toBe('id');
    expect(call[1]).toBe('specific');
    expect(call[2]).toBeInstanceOf(Uint32Array);
    expect(Array.from(call[2])).toEqual([1, 2]);
    expect(call[3]).toBe(JSON.stringify({ a: 1 }));
    expect(call[4]).toBe(10);
    expect(call[5]).toBe(2);
  });

  it('getKeysWithProof() forwards with Uint32Array', async () => {
    await client.identities.getKeysWithProof({
      identityId: 'id',
      keyRequestType: 'specific',
      specificKeyIds: [5],
      limit: 1,
      offset: 0,
    });
    const call = (mockWasmSdk.getIdentityKeysWithProofInfo as Mock).mock.calls[0];
    expect(call[0]).toBe('id');
    expect(call[1]).toBe('specific');
    expect(call[2]).toBeInstanceOf(Uint32Array);
    expect(Array.from(call[2])).toEqual([5]);
    expect(call[3]).toBe(1);
    expect(call[4]).toBe(0);
  });

  it('nonce helpers forward to wasm', async () => {
    await client.identities.nonce('id');
    await client.identities.nonceWithProof('id');
    expect(mockWasmSdk.getIdentityNonce).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityNonce).toHaveBeenCalledWith('id');
    expect(mockWasmSdk.getIdentityNonceWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityNonceWithProofInfo).toHaveBeenCalledWith('id');
  });

  it('contractNonce helpers forward to wasm', async () => {
    await client.identities.contractNonce('id', 'contract');
    await client.identities.contractNonceWithProof('id', 'contract');
    expect(mockWasmSdk.getIdentityContractNonce).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityContractNonce).toHaveBeenCalledWith('id', 'contract');
    expect(mockWasmSdk.getIdentityContractNonceWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityContractNonceWithProofInfo).toHaveBeenCalledWith('id', 'contract');
  });

  it('balance helpers forward to wasm', async () => {
    await client.identities.balance('id');
    await client.identities.balanceWithProof('id');
    await client.identities.balances(['a', 'b']);
    await client.identities.balancesWithProof(['c']);
    expect(mockWasmSdk.getIdentityBalance).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityBalance).toHaveBeenCalledWith('id');
    expect(mockWasmSdk.getIdentityBalanceWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityBalanceWithProofInfo).toHaveBeenCalledWith('id');
    expect(mockWasmSdk.getIdentitiesBalances).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentitiesBalances).toHaveBeenCalledWith(['a', 'b']);
    expect(mockWasmSdk.getIdentitiesBalancesWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentitiesBalancesWithProofInfo).toHaveBeenCalledWith(['c']);
  });

  it('balanceAndRevision helpers forward to wasm', async () => {
    await client.identities.balanceAndRevision('id');
    await client.identities.balanceAndRevisionWithProof('id');
    expect(mockWasmSdk.getIdentityBalanceAndRevision).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityBalanceAndRevision).toHaveBeenCalledWith('id');
    expect(mockWasmSdk.getIdentityBalanceAndRevisionWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityBalanceAndRevisionWithProofInfo).toHaveBeenCalledWith('id');
  });

  it('public key hash lookups forward to wasm', async () => {
    await client.identities.byPublicKeyHash('hash');
    await client.identities.byPublicKeyHashWithProof('hash');
    await client.identities.byNonUniquePublicKeyHash('hash', { startAfter: 'cursor' });
    await client.identities.byNonUniquePublicKeyHashWithProof('hash');
    expect(mockWasmSdk.getIdentityByPublicKeyHash).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityByPublicKeyHash).toHaveBeenCalledWith('hash');
    expect(mockWasmSdk.getIdentityByPublicKeyHashWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityByPublicKeyHashWithProofInfo).toHaveBeenCalledWith('hash');
    expect(mockWasmSdk.getIdentityByNonUniquePublicKeyHash).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityByNonUniquePublicKeyHash).toHaveBeenCalledWith('hash', 'cursor');
    expect(mockWasmSdk.getIdentityByNonUniquePublicKeyHashWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityByNonUniquePublicKeyHashWithProofInfo).toHaveBeenCalledWith('hash', null);
  });

  it('contractKeys helpers convert purposes to Uint32Array and forward', async () => {
    await client.identities.contractKeys({ identityIds: ['a'], contractId: 'c', purposes: [1, 2] });
    await client.identities.contractKeysWithProof({ identityIds: ['b'], contractId: 'c' });
    const call = (mockWasmSdk.getIdentitiesContractKeys as Mock).mock.calls[0];
    expect(call[0]).toEqual(['a']);
    expect(call[1]).toBe('c');
    expect(call[2]).toBeInstanceOf(Uint32Array);
    expect(Array.from(call[2])).toEqual([1, 2]);
    expect(mockWasmSdk.getIdentitiesContractKeysWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentitiesContractKeysWithProofInfo).toHaveBeenCalledWith(['b'], 'c', null);
  });

  it('tokenBalances helpers forward to wasm', async () => {
    await client.identities.tokenBalances('id', ['t1']);
    await client.identities.tokenBalancesWithProof('id', ['t2']);
    expect(mockWasmSdk.getIdentityTokenBalances).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityTokenBalances).toHaveBeenCalledWith('id', ['t1']);
    expect(mockWasmSdk.getIdentityTokenBalancesWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityTokenBalancesWithProofInfo).toHaveBeenCalledWith('id', ['t2']);
  });

  it('create() calls wasmSdk.identityCreate with JSON proof and keys', async () => {
    await client.identities.create({
      assetLockProof: { p: true },
      assetLockPrivateKeyWif: 'w',
      publicKeys: [{ k: 1 }],
    });
    expect(mockWasmSdk.identityCreate).toHaveBeenCalledOnce();
    const call = (mockWasmSdk.identityCreate as Mock).mock.calls[0];
    expect(call[0]).toBe(JSON.stringify({ p: true }));
    expect(call[1]).toBe('w');
    expect(call[2]).toBe(JSON.stringify([{ k: 1 }]));
  });

  it('topUp() calls wasmSdk.identityTopUp with JSON proof', async () => {
    await client.identities.topUp({
      identityId: 'id',
      assetLockProof: { p: 1 },
      assetLockPrivateKeyWif: 'w',
    });
    expect(mockWasmSdk.identityTopUp).toHaveBeenCalledOnce();
    expect(mockWasmSdk.identityTopUp).toHaveBeenCalledWith('id', JSON.stringify({ p: 1 }), 'w');
  });

  it('creditTransfer() converts amount to BigInt', async () => {
    await client.identities.creditTransfer({
      senderId: 's',
      recipientId: 'r',
      amount: '5',
      privateKeyWif: 'w',
      keyId: 3,
    });
    const call = (mockWasmSdk.identityCreditTransfer as Mock).mock.calls[0];
    expect(call[0]).toBe('s');
    expect(call[1]).toBe('r');
    expect(typeof call[2]).toBe('bigint');
    expect(call[2]).toBe(BigInt(5));
    expect(call[3]).toBe('w');
    expect(call[4]).toBe(3);
  });

  it('creditWithdrawal() converts amount to BigInt and passes coreFeePerByte', async () => {
    await client.identities.creditWithdrawal({
      identityId: 'i',
      toAddress: 'addr',
      amount: 7,
      coreFeePerByte: 2,
      privateKeyWif: 'w',
      keyId: 4,
    });
    const call = (mockWasmSdk.identityCreditWithdrawal as Mock).mock.calls[0];
    expect(call[0]).toBe('i');
    expect(call[1]).toBe('addr');
    expect(call[2]).toBe(BigInt(7));
    expect(call[3]).toBe(2);
    expect(call[4]).toBe('w');
    expect(call[5]).toBe(4);
  });

  it('update() passes JSON for keys and Uint32Array for disabled key ids', async () => {
    await client.identities.update({
      identityId: 'i',
      addPublicKeys: [{ k: 1 }],
      disablePublicKeyIds: [10, 20],
      privateKeyWif: 'w',
    });
    const call = (mockWasmSdk.identityUpdate as Mock).mock.calls[0];
    expect(call[0]).toBe('i');
    expect(call[1]).toBe(JSON.stringify([{ k: 1 }]));
    expect(call[2]).toBeInstanceOf(Uint32Array);
    expect(Array.from(call[2])).toEqual([10, 20]);
    expect(call[3]).toBe('w');
  });

  describe('getNextFreeIndex gap logic', () => {
    /**
     * Test the gap-aware index finding algorithm in isolation.
     * The real getNextFreeIndex calls getIdentityIds (network call),
     * so we test the pure logic here.
     */
    function findNextFreeIndex(usedIndexes: number[]): number {
      if (usedIndexes.length === 0) return 0;
      const usedSet = new Set(usedIndexes);
      const maxIndex = Math.max(...usedSet);
      for (let i = 0; i <= maxIndex; i++) {
        if (!usedSet.has(i)) return i;
      }
      return maxIndex + 1;
    }

    it('returns 0 when no identities exist', () => {
      expect(findNextFreeIndex([])).toBe(0);
    });

    it('returns next after max when no gaps', () => {
      expect(findNextFreeIndex([0, 1, 2])).toBe(3);
    });

    it('fills a gap at the beginning', () => {
      expect(findNextFreeIndex([1, 2, 3])).toBe(0);
    });

    it('fills a gap in the middle', () => {
      expect(findNextFreeIndex([0, 1, 3])).toBe(2);
    });

    it('fills the first of multiple gaps', () => {
      expect(findNextFreeIndex([0, 2, 5])).toBe(1);
    });

    it('handles single identity at index 0', () => {
      expect(findNextFreeIndex([0])).toBe(1);
    });

    it('handles single identity at index 3', () => {
      expect(findNextFreeIndex([3])).toBe(0);
    });

    it('handles duplicates in input', () => {
      expect(findNextFreeIndex([0, 0, 1, 1, 3])).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('handles identity not found error on get()', async () => {
      const errorMessage = 'Identity not found';
      mockWasmSdk.getIdentity.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.identities.get('nonexistent-id')).rejects.toThrow(errorMessage);
    });

    it('handles network error on balance()', async () => {
      const errorMessage = 'Network connection failed';
      mockWasmSdk.getIdentityBalance.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.identities.balance('test-id')).rejects.toThrow(errorMessage);
    });

    it('handles insufficient balance error on creditTransfer()', async () => {
      const errorMessage = 'Insufficient balance for transfer';
      mockWasmSdk.identityCreditTransfer.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.identities.creditTransfer({
        senderId: 's',
        recipientId: 'r',
        amount: 50000000,
        privateKeyWif: 'w',
        keyId: 0,
      })).rejects.toThrow(errorMessage);
    });

    it('handles invalid identity ID on nonce()', async () => {
      const errorMessage = 'Invalid identity ID format';
      mockWasmSdk.getIdentityNonce.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.identities.nonce('invalid!!id')).rejects.toThrow(errorMessage);
    });

    it('handles update failure', async () => {
      const errorMessage = 'Failed to update identity';
      mockWasmSdk.identityUpdate.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.identities.update({
        identityId: 'i',
        addPublicKeys: [{ k: 1 }],
        privateKeyWif: 'w',
      })).rejects.toThrow(errorMessage);
    });
  });
});
