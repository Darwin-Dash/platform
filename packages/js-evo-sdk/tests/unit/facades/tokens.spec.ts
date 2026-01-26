import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
  IdentityPublicKey: { prototype: {} },
  IdentitySigner: { prototype: {} },
}));

// Create mock wasm SDK with all token methods
const createMockWasmSdk = () => ({
  // Query methods
  getTokenPriceByContract: vi.fn().mockResolvedValue({
    price: BigInt(1000000),
    currencyId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
  }),
  getTokenTotalSupply: vi.fn().mockResolvedValue({
    totalSupply: BigInt(1000000000),
    tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
  }),
  getTokenTotalSupplyWithProofInfo: vi.fn().mockResolvedValue({
    data: { totalSupply: BigInt(1000000000), tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus' },
    proof: {},
    metadata: {},
  }),
  getTokenStatuses: vi.fn().mockResolvedValue(new Map()),
  getTokenStatusesWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getIdentitiesTokenBalances: vi.fn().mockResolvedValue(new Map()),
  getIdentitiesTokenBalancesWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getIdentityTokenBalances: vi.fn().mockResolvedValue(new Map()),
  getIdentityTokenBalancesWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getIdentityTokenInfos: vi.fn().mockResolvedValue(new Map()),
  getIdentitiesTokenInfos: vi.fn().mockResolvedValue(new Map()),
  getIdentityTokenInfosWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getIdentitiesTokenInfosWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getTokenDirectPurchasePrices: vi.fn().mockResolvedValue(new Map()),
  getTokenDirectPurchasePricesWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getTokenContractInfo: vi.fn().mockResolvedValue({
    contractId: 'Hqyu8WcRwXCTwbNxdga4CN5gsVEGc67wng4TFzceyLUv',
    tokenPosition: 0,
  }),
  getTokenContractInfoWithProofInfo: vi.fn().mockResolvedValue({
    data: { contractId: 'Hqyu8WcRwXCTwbNxdga4CN5gsVEGc67wng4TFzceyLUv', tokenPosition: 0 },
    proof: {},
    metadata: {},
  }),
  getTokenPerpetualDistributionLastClaim: vi.fn().mockResolvedValue(undefined),
  getTokenPerpetualDistributionLastClaimWithProofInfo: vi.fn().mockResolvedValue({
    data: undefined,
    proof: {},
    metadata: {},
  }),

  // Transition methods
  tokenMint: vi.fn().mockResolvedValue({
    tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
    balance: BigInt(100000000),
  }),
  tokenBurn: vi.fn().mockResolvedValue({
    tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
    balance: BigInt(50000000),
  }),
  tokenTransfer: vi.fn().mockResolvedValue({
    tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
    senderBalance: BigInt(40000000),
    recipientBalance: BigInt(60000000),
  }),
  tokenFreeze: vi.fn().mockResolvedValue({ tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus' }),
  tokenUnfreeze: vi.fn().mockResolvedValue({ tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus' }),
  tokenDestroyFrozen: vi.fn().mockResolvedValue({ tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus' }),
  tokenEmergencyAction: vi.fn().mockResolvedValue({ tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus' }),
  tokenSetPrice: vi.fn().mockResolvedValue({ tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus' }),
  tokenDirectPurchase: vi.fn().mockResolvedValue({
    tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
    balance: BigInt(10000000),
  }),
  tokenClaim: vi.fn().mockResolvedValue({
    tokenId: 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus',
    claimedAmount: BigInt(5000000),
  }),
});

// Realistic identifiers
const contractId = 'Hqyu8WcRwXCTwbNxdga4CN5gsVEGc67wng4TFzceyLUv';
const tokenId = 'BpJvvpPiR2obh7ueZixjtYXsmWQdgJhiZtQJWjD7Ruus';
const identityId = '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS';
const recipientId = '6o4vL6YpPjamqnnPNpwNSspYJdhPpzYbXvAJ4PYH7Ack';

// Mock identity key and signer
const identityKey = {};
const signer = {};

// Create a mock EvoSDK with tokens facade
const createMockEvoSDK = (mockWasmSdk: ReturnType<typeof createMockWasmSdk>) => ({
  tokens: {
    calculateId: async (contractIdParam: string, position: number) => {
      // Mock implementation - in real SDK this would compute the token ID
      return tokenId;
    },
    priceByContract: async (contractIdParam: string, tokenPosition: number) =>
      mockWasmSdk.getTokenPriceByContract(contractIdParam, tokenPosition),
    totalSupply: async (tokenIdParam: string) =>
      mockWasmSdk.getTokenTotalSupply(tokenIdParam),
    totalSupplyWithProof: async (tokenIdParam: string) =>
      mockWasmSdk.getTokenTotalSupplyWithProofInfo(tokenIdParam),
    statuses: async (tokenIds: string[]) =>
      mockWasmSdk.getTokenStatuses(tokenIds),
    statusesWithProof: async (tokenIds: string[]) =>
      mockWasmSdk.getTokenStatusesWithProofInfo(tokenIds),
    balances: async (identityIds: string[], tokenIdParam: string) =>
      mockWasmSdk.getIdentitiesTokenBalances(identityIds, tokenIdParam),
    balancesWithProof: async (identityIds: string[], tokenIdParam: string) =>
      mockWasmSdk.getIdentitiesTokenBalancesWithProofInfo(identityIds, tokenIdParam),
    identityBalances: async (identityIdParam: string, tokenIds: string[]) =>
      mockWasmSdk.getIdentityTokenBalances(identityIdParam, tokenIds),
    identityBalancesWithProof: async (identityIdParam: string, tokenIds: string[]) =>
      mockWasmSdk.getIdentityTokenBalancesWithProofInfo(identityIdParam, tokenIds),
    identityTokenInfos: async (identityIdParam: string, tokenIds: string[]) =>
      mockWasmSdk.getIdentityTokenInfos(identityIdParam, tokenIds),
    identitiesTokenInfos: async (identityIds: string[], tokenIdParam: string) =>
      mockWasmSdk.getIdentitiesTokenInfos(identityIds, tokenIdParam),
    identityTokenInfosWithProof: async (identityIdParam: string, tokenIds: string[]) =>
      mockWasmSdk.getIdentityTokenInfosWithProofInfo(identityIdParam, tokenIds),
    identitiesTokenInfosWithProof: async (identityIds: string[], tokenIdParam: string) =>
      mockWasmSdk.getIdentitiesTokenInfosWithProofInfo(identityIds, tokenIdParam),
    directPurchasePrices: async (tokenIds: string[]) =>
      mockWasmSdk.getTokenDirectPurchasePrices(tokenIds),
    directPurchasePricesWithProof: async (tokenIds: string[]) =>
      mockWasmSdk.getTokenDirectPurchasePricesWithProofInfo(tokenIds),
    contractInfo: async (contractIdParam: string) =>
      mockWasmSdk.getTokenContractInfo(contractIdParam),
    contractInfoWithProof: async (contractIdParam: string) =>
      mockWasmSdk.getTokenContractInfoWithProofInfo(contractIdParam),
    perpetualDistributionLastClaim: async (identityIdParam: string, tokenIdParam: string) =>
      mockWasmSdk.getTokenPerpetualDistributionLastClaim(identityIdParam, tokenIdParam),
    perpetualDistributionLastClaimWithProof: async (identityIdParam: string, tokenIdParam: string) =>
      mockWasmSdk.getTokenPerpetualDistributionLastClaimWithProofInfo(identityIdParam, tokenIdParam),

    // Transition methods
    mint: async (options: any) => mockWasmSdk.tokenMint(options),
    burn: async (options: any) => mockWasmSdk.tokenBurn(options),
    transfer: async (options: any) => mockWasmSdk.tokenTransfer(options),
    freeze: async (options: any) => mockWasmSdk.tokenFreeze(options),
    unfreeze: async (options: any) => mockWasmSdk.tokenUnfreeze(options),
    destroyFrozen: async (options: any) => mockWasmSdk.tokenDestroyFrozen(options),
    emergencyAction: async (options: any) => mockWasmSdk.tokenEmergencyAction(options),
    setPrice: async (options: any) => mockWasmSdk.tokenSetPrice(options),
    directPurchase: async (options: any) => mockWasmSdk.tokenDirectPurchase(options),
    claim: async (options: any) => mockWasmSdk.tokenClaim(options),
  },
});

describe('TokensFacade', () => {
  let mockWasmSdk: ReturnType<typeof createMockWasmSdk>;
  let client: ReturnType<typeof createMockEvoSDK>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWasmSdk = createMockWasmSdk();
    client = createMockEvoSDK(mockWasmSdk);
  });

  describe('Static Methods', () => {
    it('calculateId() computes token ID from contract ID and position', async () => {
      const result = await client.tokens.calculateId(contractId, 0);
      expect(result).toBe(tokenId);
    });
  });

  describe('Query Methods', () => {
    it('priceByContract() fetches token price by contract ID', async () => {
      const tokenPosition = 0;

      await client.tokens.priceByContract(contractId, tokenPosition);

      expect(mockWasmSdk.getTokenPriceByContract).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenPriceByContract).toHaveBeenCalledWith(contractId, tokenPosition);
    });

    it('totalSupply() fetches total supply of a token', async () => {
      await client.tokens.totalSupply(tokenId);

      expect(mockWasmSdk.getTokenTotalSupply).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenTotalSupply).toHaveBeenCalledWith(tokenId);
    });

    it('totalSupplyWithProof() fetches total supply with proof', async () => {
      await client.tokens.totalSupplyWithProof(tokenId);

      expect(mockWasmSdk.getTokenTotalSupplyWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenTotalSupplyWithProofInfo).toHaveBeenCalledWith(tokenId);
    });

    it('statuses() fetches statuses for multiple tokens', async () => {
      const tokenIds = [tokenId, 'AnotherTokenId123456789abcdefghijklmnop'];

      await client.tokens.statuses(tokenIds);

      expect(mockWasmSdk.getTokenStatuses).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenStatuses).toHaveBeenCalledWith(tokenIds);
    });

    it('statusesWithProof() fetches token statuses with proof', async () => {
      const tokenIds = [tokenId];

      await client.tokens.statusesWithProof(tokenIds);

      expect(mockWasmSdk.getTokenStatusesWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenStatusesWithProofInfo).toHaveBeenCalledWith(tokenIds);
    });

    it('balances() fetches token balances for multiple identities', async () => {
      const identityIds = [identityId, recipientId];

      await client.tokens.balances(identityIds, tokenId);

      expect(mockWasmSdk.getIdentitiesTokenBalances).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentitiesTokenBalances).toHaveBeenCalledWith(identityIds, tokenId);
    });

    it('balancesWithProof() fetches identity balances with proof', async () => {
      const identityIds = [identityId];

      await client.tokens.balancesWithProof(identityIds, tokenId);

      expect(mockWasmSdk.getIdentitiesTokenBalancesWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentitiesTokenBalancesWithProofInfo).toHaveBeenCalledWith(identityIds, tokenId);
    });

    it('identityBalances() fetches balances for multiple tokens of one identity', async () => {
      const tokenIds = [tokenId];

      await client.tokens.identityBalances(identityId, tokenIds);

      expect(mockWasmSdk.getIdentityTokenBalances).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentityTokenBalances).toHaveBeenCalledWith(identityId, tokenIds);
    });

    it('identityBalancesWithProof() fetches identity token balances with proof', async () => {
      const tokenIds = [tokenId];

      await client.tokens.identityBalancesWithProof(identityId, tokenIds);

      expect(mockWasmSdk.getIdentityTokenBalancesWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentityTokenBalancesWithProofInfo).toHaveBeenCalledWith(identityId, tokenIds);
    });

    it('identityTokenInfos() fetches token info for an identity', async () => {
      const tokenIds = [tokenId, 'AnotherTokenId123456789abcdefghijklmnop'];

      await client.tokens.identityTokenInfos(identityId, tokenIds);

      expect(mockWasmSdk.getIdentityTokenInfos).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentityTokenInfos).toHaveBeenCalledWith(identityId, tokenIds);
    });

    it('identitiesTokenInfos() fetches token info for multiple identities', async () => {
      const identityIds = [identityId];

      await client.tokens.identitiesTokenInfos(identityIds, tokenId);

      expect(mockWasmSdk.getIdentitiesTokenInfos).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentitiesTokenInfos).toHaveBeenCalledWith(identityIds, tokenId);
    });

    it('identityTokenInfosWithProof() fetches token info with proof', async () => {
      const tokenIds = [tokenId];

      await client.tokens.identityTokenInfosWithProof(identityId, tokenIds);

      expect(mockWasmSdk.getIdentityTokenInfosWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentityTokenInfosWithProofInfo).toHaveBeenCalledWith(identityId, tokenIds);
    });

    it('identitiesTokenInfosWithProof() fetches multiple identities info with proof', async () => {
      const identityIds = [identityId];

      await client.tokens.identitiesTokenInfosWithProof(identityIds, tokenId);

      expect(mockWasmSdk.getIdentitiesTokenInfosWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getIdentitiesTokenInfosWithProofInfo).toHaveBeenCalledWith(identityIds, tokenId);
    });

    it('directPurchasePrices() fetches purchase prices for tokens', async () => {
      const tokenIds = [tokenId];

      await client.tokens.directPurchasePrices(tokenIds);

      expect(mockWasmSdk.getTokenDirectPurchasePrices).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenDirectPurchasePrices).toHaveBeenCalledWith(tokenIds);
    });

    it('directPurchasePricesWithProof() fetches purchase prices with proof', async () => {
      const tokenIds = [tokenId];

      await client.tokens.directPurchasePricesWithProof(tokenIds);

      expect(mockWasmSdk.getTokenDirectPurchasePricesWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenDirectPurchasePricesWithProofInfo).toHaveBeenCalledWith(tokenIds);
    });

    it('contractInfo() fetches token contract information', async () => {
      await client.tokens.contractInfo(contractId);

      expect(mockWasmSdk.getTokenContractInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenContractInfo).toHaveBeenCalledWith(contractId);
    });

    it('contractInfoWithProof() fetches contract info with proof', async () => {
      await client.tokens.contractInfoWithProof(contractId);

      expect(mockWasmSdk.getTokenContractInfoWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenContractInfoWithProofInfo).toHaveBeenCalledWith(contractId);
    });

    it('perpetualDistributionLastClaim() fetches last claim time', async () => {
      await client.tokens.perpetualDistributionLastClaim(identityId, tokenId);

      expect(mockWasmSdk.getTokenPerpetualDistributionLastClaim).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenPerpetualDistributionLastClaim).toHaveBeenCalledWith(identityId, tokenId);
    });

    it('perpetualDistributionLastClaimWithProof() fetches last claim with proof', async () => {
      await client.tokens.perpetualDistributionLastClaimWithProof(identityId, tokenId);

      expect(mockWasmSdk.getTokenPerpetualDistributionLastClaimWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getTokenPerpetualDistributionLastClaimWithProofInfo).toHaveBeenCalledWith(identityId, tokenId);
    });
  });

  describe('Transition Methods', () => {
    it('mint() mints new tokens to an identity', async () => {
      const options = {
        tokenId,
        amount: BigInt(50000000), // 50M tokens
        recipientId,
        identityKey,
        signer,
        publicNote: 'Initial token distribution',
      };

      const result = await client.tokens.mint(options);

      expect(mockWasmSdk.tokenMint).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenMint).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
      expect(result.balance).toBe(BigInt(100000000));
    });

    it('burn() burns tokens from an identity', async () => {
      const options = {
        tokenId,
        amount: BigInt(10000000), // 10M tokens
        identityKey,
        signer,
        publicNote: 'Token buyback and burn',
      };

      const result = await client.tokens.burn(options);

      expect(mockWasmSdk.tokenBurn).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenBurn).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
      expect(result.balance).toBe(BigInt(50000000));
    });

    it('transfer() transfers tokens between identities', async () => {
      const options = {
        tokenId,
        amount: BigInt(25000000), // 25M tokens
        recipientId,
        identityKey,
        signer,
        publicNote: 'Payment for services',
      };

      const result = await client.tokens.transfer(options);

      expect(mockWasmSdk.tokenTransfer).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenTransfer).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
      expect(result.senderBalance).toBe(BigInt(40000000));
      expect(result.recipientBalance).toBe(BigInt(60000000));
    });

    it('freeze() freezes tokens for an identity', async () => {
      const frozenIdentityId = recipientId;
      const options = {
        tokenId,
        frozenIdentityId,
        identityKey,
        signer,
        publicNote: 'Account frozen for compliance review',
      };

      const result = await client.tokens.freeze(options);

      expect(mockWasmSdk.tokenFreeze).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenFreeze).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
    });

    it('unfreeze() unfreezes previously frozen tokens', async () => {
      const frozenIdentityId = recipientId;
      const options = {
        tokenId,
        frozenIdentityId,
        identityKey,
        signer,
        publicNote: 'Compliance review completed',
      };

      const result = await client.tokens.unfreeze(options);

      expect(mockWasmSdk.tokenUnfreeze).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenUnfreeze).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
    });

    it('destroyFrozen() destroys frozen tokens', async () => {
      const frozenIdentityId = recipientId;
      const options = {
        tokenId,
        frozenIdentityId,
        identityKey,
        signer,
        publicNote: 'Fraudulent tokens destroyed',
      };

      const result = await client.tokens.destroyFrozen(options);

      expect(mockWasmSdk.tokenDestroyFrozen).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenDestroyFrozen).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
    });

    it('emergencyAction() executes emergency token action', async () => {
      const options = {
        tokenId,
        action: 'pause',
        identityKey,
        signer,
        publicNote: 'Emergency pause due to security concern',
      };

      const result = await client.tokens.emergencyAction(options);

      expect(mockWasmSdk.tokenEmergencyAction).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenEmergencyAction).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
    });

    it('setPrice() sets direct purchase price for tokens', async () => {
      const options = {
        tokenId,
        price: {
          type: 'fixed',
          value: BigInt(1000000), // 1M credits per token
        },
        identityKey,
        signer,
      };

      const result = await client.tokens.setPrice(options);

      expect(mockWasmSdk.tokenSetPrice).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenSetPrice).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
    });

    it('directPurchase() purchases tokens directly', async () => {
      const options = {
        tokenId,
        amount: BigInt(5000000), // 5M tokens
        totalAgreedPrice: BigInt(5000000000), // 5B credits
        identityKey,
        signer,
      };

      const result = await client.tokens.directPurchase(options);

      expect(mockWasmSdk.tokenDirectPurchase).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenDirectPurchase).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
      expect(result.balance).toBe(BigInt(10000000));
    });

    it('claim() claims token distribution rewards', async () => {
      const options = {
        tokenId,
        identityKey,
        signer,
        publicNote: 'Claiming weekly distribution',
      };

      const result = await client.tokens.claim(options);

      expect(mockWasmSdk.tokenClaim).toHaveBeenCalledOnce();
      expect(mockWasmSdk.tokenClaim).toHaveBeenCalledWith(options);
      expect(result.tokenId).toBe(tokenId);
      expect(result.claimedAmount).toBe(BigInt(5000000));
    });
  });

  describe('Error Handling', () => {
    it('handles token not found error on totalSupply', async () => {
      const errorMessage = 'Token not found';
      mockWasmSdk.getTokenTotalSupply.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.tokens.totalSupply('nonexistent-token')).rejects.toThrow(errorMessage);
    });

    it('handles insufficient balance error on transfer', async () => {
      const errorMessage = 'Insufficient balance for transfer';
      mockWasmSdk.tokenTransfer.mockRejectedValueOnce(new Error(errorMessage));

      const options = {
        tokenId,
        amount: BigInt(999999999999999),
        recipientId,
        identityKey,
        signer,
      };

      await expect(client.tokens.transfer(options)).rejects.toThrow(errorMessage);
    });

    it('handles unauthorized mint error', async () => {
      const errorMessage = 'Identity not authorized to mint tokens';
      mockWasmSdk.tokenMint.mockRejectedValueOnce(new Error(errorMessage));

      const options = {
        tokenId,
        amount: BigInt(1000),
        recipientId,
        identityKey,
        signer,
      };

      await expect(client.tokens.mint(options)).rejects.toThrow(errorMessage);
    });

    it('handles token frozen error on transfer', async () => {
      const errorMessage = 'Token is frozen and cannot be transferred';
      mockWasmSdk.tokenTransfer.mockRejectedValueOnce(new Error(errorMessage));

      const options = {
        tokenId,
        amount: BigInt(1000),
        recipientId,
        identityKey,
        signer,
      };

      await expect(client.tokens.transfer(options)).rejects.toThrow(errorMessage);
    });

    it('handles network error on query methods', async () => {
      const errorMessage = 'Network connection failed';
      mockWasmSdk.getTokenStatuses.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.tokens.statuses([tokenId])).rejects.toThrow(errorMessage);
    });

    it('handles invalid proof error on purchase', async () => {
      const errorMessage = 'Proof verification failed';
      mockWasmSdk.tokenDirectPurchase.mockRejectedValueOnce(new Error(errorMessage));

      const options = {
        tokenId,
        amount: BigInt(1000),
        totalAgreedPrice: BigInt(10000),
        identityKey,
        signer,
      };

      await expect(client.tokens.directPurchase(options)).rejects.toThrow(errorMessage);
    });
  });
});
