import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

describe('SystemFacade', () => {
  // Mock responses for verification
  const mockStatus = { connected: true, version: '1.0.0' };
  const mockQuorums = { quorums: [] };
  const mockCredits = { totalCredits: BigInt(1000000) };
  const mockCreditsWithProof = { data: { totalCredits: BigInt(1000000) }, proof: {} };
  const mockBalance = { balance: BigInt(500) };
  const mockBalanceWithProof = { data: { balance: BigInt(500) }, proof: {} };
  const mockSTResult = { hash: 'abc123', status: 'confirmed' };
  const mockPathElements = { elements: ['elem1'] };
  const mockPathElementsWithProof = { data: { elements: ['elem1'] }, proof: {} };

  // Mock SDK
  let mockWasmSdk: {
    getStatus: Mock;
    getCurrentQuorumsInfo: Mock;
    getTotalCreditsInPlatform: Mock;
    getTotalCreditsInPlatformWithProofInfo: Mock;
    getPrefundedSpecializedBalance: Mock;
    getPrefundedSpecializedBalanceWithProofInfo: Mock;
    waitForStateTransitionResult: Mock;
    getPathElements: Mock;
    getPathElementsWithProofInfo: Mock;
  };

  let client: {
    system: {
      status: () => Promise<typeof mockStatus>;
      currentQuorumsInfo: () => Promise<typeof mockQuorums>;
      totalCreditsInPlatform: () => Promise<typeof mockCredits>;
      totalCreditsInPlatformWithProof: () => Promise<typeof mockCreditsWithProof>;
      prefundedSpecializedBalance: (identityId: string) => Promise<typeof mockBalance>;
      prefundedSpecializedBalanceWithProof: (identityId: string) => Promise<typeof mockBalanceWithProof>;
      waitForStateTransitionResult: (hash: string) => Promise<typeof mockSTResult>;
      pathElements: (path: string[], keys: string[]) => Promise<typeof mockPathElements>;
      pathElementsWithProof: (path: string[], keys: string[]) => Promise<typeof mockPathElementsWithProof>;
    };
  };

  beforeEach(() => {
    mockWasmSdk = {
      getStatus: vi.fn().mockResolvedValue(mockStatus),
      getCurrentQuorumsInfo: vi.fn().mockResolvedValue(mockQuorums),
      getTotalCreditsInPlatform: vi.fn().mockResolvedValue(mockCredits),
      getTotalCreditsInPlatformWithProofInfo: vi.fn().mockResolvedValue(mockCreditsWithProof),
      getPrefundedSpecializedBalance: vi.fn().mockResolvedValue(mockBalance),
      getPrefundedSpecializedBalanceWithProofInfo: vi.fn().mockResolvedValue(mockBalanceWithProof),
      waitForStateTransitionResult: vi.fn().mockResolvedValue(mockSTResult),
      getPathElements: vi.fn().mockResolvedValue(mockPathElements),
      getPathElementsWithProofInfo: vi.fn().mockResolvedValue(mockPathElementsWithProof),
    };

    // Create a mock client that wraps the mock SDK
    client = {
      system: {
        status: () => mockWasmSdk.getStatus(),
        currentQuorumsInfo: () => mockWasmSdk.getCurrentQuorumsInfo(),
        totalCreditsInPlatform: () => mockWasmSdk.getTotalCreditsInPlatform(),
        totalCreditsInPlatformWithProof: () => mockWasmSdk.getTotalCreditsInPlatformWithProofInfo(),
        prefundedSpecializedBalance: (identityId: string) => mockWasmSdk.getPrefundedSpecializedBalance(identityId),
        prefundedSpecializedBalanceWithProof: (identityId: string) => mockWasmSdk.getPrefundedSpecializedBalanceWithProofInfo(identityId),
        waitForStateTransitionResult: (hash: string) => mockWasmSdk.waitForStateTransitionResult(hash),
        pathElements: (path: string[], keys: string[]) => mockWasmSdk.getPathElements(path, keys),
        pathElementsWithProof: (path: string[], keys: string[]) => mockWasmSdk.getPathElementsWithProofInfo(path, keys),
      },
    };
  });

  it('status() and currentQuorumsInfo() forward to wasm and return results', async () => {
    const statusResult = await client.system.status();
    const quorumsResult = await client.system.currentQuorumsInfo();

    expect(mockWasmSdk.getStatus).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getStatus).toHaveBeenCalledWith();
    expect(mockWasmSdk.getCurrentQuorumsInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getCurrentQuorumsInfo).toHaveBeenCalledWith();
    expect(statusResult).toEqual(mockStatus);
    expect(quorumsResult).toEqual(mockQuorums);
  });

  it('totalCreditsInPlatform() and totalCreditsInPlatformWithProof() forward correctly', async () => {
    const result = await client.system.totalCreditsInPlatform();
    const resultWithProof = await client.system.totalCreditsInPlatformWithProof();

    expect(mockWasmSdk.getTotalCreditsInPlatform).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getTotalCreditsInPlatform).toHaveBeenCalledWith();
    expect(mockWasmSdk.getTotalCreditsInPlatformWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getTotalCreditsInPlatformWithProofInfo).toHaveBeenCalledWith();
    expect(result).toEqual(mockCredits);
    expect(resultWithProof).toEqual(mockCreditsWithProof);
  });

  it('prefundedSpecializedBalance() forwards with identity ID', async () => {
    const identityId = 'testIdentityId123';
    const result = await client.system.prefundedSpecializedBalance(identityId);
    const resultWithProof = await client.system.prefundedSpecializedBalanceWithProof(identityId);

    expect(mockWasmSdk.getPrefundedSpecializedBalance).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getPrefundedSpecializedBalance).toHaveBeenCalledWith(identityId);
    expect(mockWasmSdk.getPrefundedSpecializedBalanceWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getPrefundedSpecializedBalanceWithProofInfo).toHaveBeenCalledWith(identityId);
    expect(result).toEqual(mockBalance);
    expect(resultWithProof).toEqual(mockBalanceWithProof);
  });

  it('waitForStateTransitionResult() forwards hash and returns result', async () => {
    const hash = 'stateTransitionHash456';
    const result = await client.system.waitForStateTransitionResult(hash);

    expect(mockWasmSdk.waitForStateTransitionResult).toHaveBeenCalledOnce();
    expect(mockWasmSdk.waitForStateTransitionResult).toHaveBeenCalledWith(hash);
    expect(result).toEqual(mockSTResult);
  });

  it('pathElements() and pathElementsWithProof() forward path and keys', async () => {
    const path = ['root', 'child'];
    const keys = ['key1', 'key2'];
    const result = await client.system.pathElements(path, keys);
    const resultWithProof = await client.system.pathElementsWithProof(path, keys);

    expect(mockWasmSdk.getPathElements).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getPathElements).toHaveBeenCalledWith(path, keys);
    expect(mockWasmSdk.getPathElementsWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getPathElementsWithProofInfo).toHaveBeenCalledWith(path, keys);
    expect(result).toEqual(mockPathElements);
    expect(resultWithProof).toEqual(mockPathElementsWithProof);
  });

  it('handles errors from wasm methods', async () => {
    const errorMessage = 'Network connection failed';
    mockWasmSdk.getStatus.mockRejectedValue(new Error(errorMessage));

    await expect(client.system.status()).rejects.toThrow(errorMessage);
  });
});
