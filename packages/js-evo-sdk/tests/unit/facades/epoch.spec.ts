import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { EvoSDK } from '../../../dist/sdk.js';

describe('EpochFacade', () => {
  let mockWasmSdk: {
    getEpochsInfo: Mock;
    getEpochsInfoWithProofInfo: Mock;
    getFinalizedEpochInfos: Mock;
    getFinalizedEpochInfosWithProofInfo: Mock;
    getCurrentEpoch: Mock;
    getCurrentEpochWithProofInfo: Mock;
    getEvonodesProposedEpochBlocksByIds: Mock;
    getEvonodesProposedEpochBlocksByIdsWithProofInfo: Mock;
    getEvonodesProposedEpochBlocksByRange: Mock;
    getEvonodesProposedEpochBlocksByRangeWithProofInfo: Mock;
  };
  let client: EvoSDK;

  beforeEach(() => {
    mockWasmSdk = {
      getEpochsInfo: vi.fn().mockResolvedValue('ok'),
      getEpochsInfoWithProofInfo: vi.fn().mockResolvedValue('ok'),
      getFinalizedEpochInfos: vi.fn().mockResolvedValue('ok'),
      getFinalizedEpochInfosWithProofInfo: vi.fn().mockResolvedValue('ok'),
      getCurrentEpoch: vi.fn().mockResolvedValue('ok'),
      getCurrentEpochWithProofInfo: vi.fn().mockResolvedValue('ok'),
      getEvonodesProposedEpochBlocksByIds: vi.fn().mockResolvedValue('ok'),
      getEvonodesProposedEpochBlocksByIdsWithProofInfo: vi.fn().mockResolvedValue('ok'),
      getEvonodesProposedEpochBlocksByRange: vi.fn().mockResolvedValue('ok'),
      getEvonodesProposedEpochBlocksByRangeWithProofInfo: vi.fn().mockResolvedValue('ok'),
    };
    client = EvoSDK.fromWasm(mockWasmSdk as any);
  });

  it('epochsInfo and finalizedInfos forward queries untouched', async () => {
    const epochsQuery = { startEpoch: 1, count: 2, ascending: true };
    await client.epoch.epochsInfo(epochsQuery);
    await client.epoch.epochsInfoWithProof();
    const finalizedQuery = { startEpoch: 3 };
    await client.epoch.finalizedInfos(finalizedQuery);
    const finalizedProofQuery = { startEpoch: 4, count: 5 };
    await client.epoch.finalizedInfosWithProof(finalizedProofQuery);

    expect(mockWasmSdk.getEpochsInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getEpochsInfo).toHaveBeenCalledWith(epochsQuery);
    expect(mockWasmSdk.getEpochsInfoWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getEpochsInfoWithProofInfo).toHaveBeenCalledWith({});
    expect(mockWasmSdk.getFinalizedEpochInfos).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getFinalizedEpochInfos).toHaveBeenCalledWith(finalizedQuery);
    expect(mockWasmSdk.getFinalizedEpochInfosWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getFinalizedEpochInfosWithProofInfo).toHaveBeenCalledWith(finalizedProofQuery);
  });

  it('current and currentWithProof forward', async () => {
    await client.epoch.current();
    await client.epoch.currentWithProof();

    expect(mockWasmSdk.getCurrentEpoch).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getCurrentEpochWithProofInfo).toHaveBeenCalledOnce();
  });

  it('evonodesProposedBlocks* forward with args', async () => {
    await client.epoch.evonodesProposedBlocksByIds(10, ['a', 'b']);
    await client.epoch.evonodesProposedBlocksByIdsWithProof(11, ['x']);
    const rangeQuery = {
      epoch: 12, limit: 2, startAfter: 's', orderAscending: false,
    };
    await client.epoch.evonodesProposedBlocksByRange(rangeQuery);
    const rangeProofQuery = { epoch: 13 };
    await client.epoch.evonodesProposedBlocksByRangeWithProof(rangeProofQuery);

    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByIds).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByIds).toHaveBeenCalledWith(10, ['a', 'b']);
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByIdsWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByIdsWithProofInfo).toHaveBeenCalledWith(11, ['x']);
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByRange).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByRange).toHaveBeenCalledWith(rangeQuery);
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByRangeWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getEvonodesProposedEpochBlocksByRangeWithProofInfo).toHaveBeenCalledWith(rangeProofQuery);
  });
});
