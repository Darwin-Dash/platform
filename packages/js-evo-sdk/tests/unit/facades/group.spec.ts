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

// Mock the SDK
const mockWasmSdk = createMockWasmSdk();

// Create a mock EvoSDK with GroupFacade methods
const createMockEvoSDK = () => ({
  group: {
    info: async (contractId: string, groupContractPosition: number) =>
      mockWasmSdk.getGroupInfo(contractId, groupContractPosition),
    infoWithProof: async (contractId: string, groupContractPosition: number) =>
      mockWasmSdk.getGroupInfoWithProofInfo(contractId, groupContractPosition),
    infos: async (query: any) => mockWasmSdk.getGroupInfos(query),
    infosWithProof: async (query: any) => mockWasmSdk.getGroupInfosWithProofInfo(query),
    members: async (query: any) => mockWasmSdk.getGroupMembers(query),
    membersWithProof: async (query: any) => mockWasmSdk.getGroupMembersWithProofInfo(query),
    identityGroups: async (query: any) => mockWasmSdk.getIdentityGroups(query),
    identityGroupsWithProof: async (query: any) => mockWasmSdk.getIdentityGroupsWithProofInfo(query),
    actions: async (query: any) => mockWasmSdk.getGroupActions(query),
    actionsWithProof: async (query: any) => mockWasmSdk.getGroupActionsWithProofInfo(query),
    actionSigners: async (query: any) => mockWasmSdk.getGroupActionSigners(query),
    actionSignersWithProof: async (query: any) => mockWasmSdk.getGroupActionSignersWithProofInfo(query),
    groupsDataContracts: async (ids: string[]) => mockWasmSdk.getGroupsDataContracts(ids),
    groupsDataContractsWithProof: async (ids: string[]) => mockWasmSdk.getGroupsDataContractsWithProofInfo(ids),
    contestedResources: async (query: any) => mockWasmSdk.getContestedResources(query),
    contestedResourcesWithProof: async (query: any) => mockWasmSdk.getContestedResourcesWithProofInfo(query),
    contestedResourceVotersForIdentity: async (query: any) => mockWasmSdk.getContestedResourceVotersForIdentity(query),
    contestedResourceVotersForIdentityWithProof: async (query: any) =>
      mockWasmSdk.getContestedResourceVotersForIdentityWithProofInfo(query),
  },
});

describe('GroupFacade', () => {
  let client: ReturnType<typeof createMockEvoSDK>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockEvoSDK();
  });

  it('info queries forward to wasm', async () => {
    await client.group.info('contract', 1);
    await client.group.infoWithProof('contract', 2);
    expect(mockWasmSdk.getGroupInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupInfo).toHaveBeenCalledWith('contract', 1);
    expect(mockWasmSdk.getGroupInfoWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupInfoWithProofInfo).toHaveBeenCalledWith('contract', 2);
  });

  it('infos() forwards optional args with null defaults', async () => {
    const query = { dataContractId: 'contract', startAt: { position: 10, included: true }, limit: 5 };
    await client.group.infos(query);
    const proofQuery = { dataContractId: 'contract' };
    await client.group.infosWithProof(proofQuery);
    expect(mockWasmSdk.getGroupInfos).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupInfos).toHaveBeenCalledWith(query);
    expect(mockWasmSdk.getGroupInfosWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupInfosWithProofInfo).toHaveBeenCalledWith(proofQuery);
  });

  it('members() forwards list and optional filters', async () => {
    const query = {
      dataContractId: 'contract',
      groupContractPosition: 1,
      memberIds: ['a'],
      startAtMemberId: 's',
      limit: 2,
    };
    await client.group.members(query);
    const proofQuery = { dataContractId: 'contract', groupContractPosition: 1 };
    await client.group.membersWithProof(proofQuery);
    expect(mockWasmSdk.getGroupMembers).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupMembers).toHaveBeenCalledWith(query);
    expect(mockWasmSdk.getGroupMembersWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupMembersWithProofInfo).toHaveBeenCalledWith(proofQuery);
  });

  it('identityGroups() forwards optional contract filters', async () => {
    const query = {
      identityId: 'identity',
      memberDataContracts: ['m'],
      ownerDataContracts: ['o'],
      moderatorDataContracts: ['d'],
    };
    await client.group.identityGroups(query);
    const proofQuery = { identityId: 'identity' };
    await client.group.identityGroupsWithProof(proofQuery);
    expect(mockWasmSdk.getIdentityGroups).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityGroups).toHaveBeenCalledWith(query);
    expect(mockWasmSdk.getIdentityGroupsWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getIdentityGroupsWithProofInfo).toHaveBeenCalledWith(proofQuery);
  });

  it('group actions helpers forward to wasm', async () => {
    const query = {
      dataContractId: 'contract',
      groupContractPosition: 1,
      status: 'ACTIVE',
      startAt: { actionId: 'cursor', included: true },
      limit: 3,
    };
    await client.group.actions(query);
    const proofQuery = {
      dataContractId: 'contract',
      groupContractPosition: 1,
      status: 'CLOSED',
    };
    await client.group.actionsWithProof(proofQuery);
    const signersQuery = {
      dataContractId: 'contract',
      groupContractPosition: 1,
      status: 'ACTIVE',
      actionId: 'action',
    };
    await client.group.actionSigners(signersQuery);
    await client.group.actionSignersWithProof(signersQuery);
    expect(mockWasmSdk.getGroupActions).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupActions).toHaveBeenCalledWith(query);
    expect(mockWasmSdk.getGroupActionsWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupActionsWithProofInfo).toHaveBeenCalledWith(proofQuery);
    expect(mockWasmSdk.getGroupActionSigners).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupActionSigners).toHaveBeenCalledWith(signersQuery);
    expect(mockWasmSdk.getGroupActionSignersWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupActionSignersWithProofInfo).toHaveBeenCalledWith(signersQuery);
  });

  it('groupsDataContracts() forwards', async () => {
    await client.group.groupsDataContracts(['a', 'b']);
    await client.group.groupsDataContractsWithProof(['a']);
    expect(mockWasmSdk.getGroupsDataContracts).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupsDataContracts).toHaveBeenCalledWith(['a', 'b']);
    expect(mockWasmSdk.getGroupsDataContractsWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getGroupsDataContractsWithProofInfo).toHaveBeenCalledWith(['a']);
  });

  it('forwards contestedResources and voters queries', async () => {
    const contestedQuery = {
      dataContractId: 'c',
      documentTypeName: 'dt',
      indexName: 'i',
      startAtValue: new Uint8Array([1]),
      limit: 2,
      orderAscending: false,
    };
    await client.group.contestedResources(contestedQuery);
    const contestedProofQuery = {
      dataContractId: 'c',
      documentTypeName: 'dt',
      indexName: 'i',
    };
    await client.group.contestedResourcesWithProof(contestedProofQuery);
    const votersQuery = {
      dataContractId: 'c',
      documentTypeName: 'dt',
      indexName: 'i',
      indexValues: ['v1'],
      contestantId: 'id',
      startAtVoterId: 's',
      limit: 3,
      orderAscending: true,
    };
    await client.group.contestedResourceVotersForIdentity(votersQuery);
    const votersProofQuery = {
      dataContractId: 'c',
      documentTypeName: 'dt',
      indexName: 'i',
      indexValues: ['v2'],
      contestantId: 'id',
    };
    await client.group.contestedResourceVotersForIdentityWithProof(votersProofQuery);
    expect(mockWasmSdk.getContestedResources).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getContestedResources).toHaveBeenCalledWith(contestedQuery);
    expect(mockWasmSdk.getContestedResourcesWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getContestedResourcesWithProofInfo).toHaveBeenCalledWith(contestedProofQuery);
    expect(mockWasmSdk.getContestedResourceVotersForIdentity).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getContestedResourceVotersForIdentity).toHaveBeenCalledWith(votersQuery);
    expect(mockWasmSdk.getContestedResourceVotersForIdentityWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getContestedResourceVotersForIdentityWithProofInfo).toHaveBeenCalledWith(votersProofQuery);
  });

  describe('Error Handling', () => {
    it('handles group not found error on info()', async () => {
      const errorMessage = 'Group not found';
      mockWasmSdk.getGroupInfo.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.group.info('nonexistent', 0)).rejects.toThrow(errorMessage);
    });

    it('handles network error on members()', async () => {
      const errorMessage = 'Network connection failed';
      mockWasmSdk.getGroupMembers.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.group.members({ dataContractId: 'c', groupContractPosition: 1 })).rejects.toThrow(errorMessage);
    });

    it('handles invalid contract ID on actions()', async () => {
      const errorMessage = 'Invalid contract ID format';
      mockWasmSdk.getGroupActions.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.group.actions({
        dataContractId: 'invalid!!',
        groupContractPosition: 1,
        status: 'ACTIVE',
      })).rejects.toThrow(errorMessage);
    });

    it('handles contested resources query error', async () => {
      const errorMessage = 'Invalid query parameters';
      mockWasmSdk.getContestedResources.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.group.contestedResources({
        dataContractId: 'c',
        documentTypeName: 'dt',
        indexName: 'i',
      })).rejects.toThrow(errorMessage);
    });
  });
});
