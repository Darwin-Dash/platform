export class GroupFacade {
    sdk;
    constructor(sdk) { this.sdk = sdk; }
    async info(contractId, groupContractPosition) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupInfo(contractId, groupContractPosition);
    }
    async infoWithProof(contractId, groupContractPosition) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupInfoWithProofInfo(contractId, groupContractPosition);
    }
    async infos(contractId, startAtInfo, count) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupInfos(contractId, startAtInfo ?? null, count ?? null);
    }
    async infosWithProof(contractId, startAtInfo, count) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupInfosWithProofInfo(contractId, startAtInfo ?? null, count ?? null);
    }
    async members(contractId, groupContractPosition, opts = {}) {
        const { memberIds, startAt, limit } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupMembers(contractId, groupContractPosition, memberIds ?? null, startAt ?? null, limit ?? null);
    }
    async membersWithProof(contractId, groupContractPosition, opts = {}) {
        const { memberIds, startAt, limit } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupMembersWithProofInfo(contractId, groupContractPosition, memberIds ?? null, startAt ?? null, limit ?? null);
    }
    async identityGroups(identityId, opts = {}) {
        const { memberDataContracts, ownerDataContracts, moderatorDataContracts } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getIdentityGroups(identityId, memberDataContracts ?? null, ownerDataContracts ?? null, moderatorDataContracts ?? null);
    }
    async identityGroupsWithProof(identityId, opts = {}) {
        const { memberDataContracts, ownerDataContracts, moderatorDataContracts } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getIdentityGroupsWithProofInfo(identityId, memberDataContracts ?? null, ownerDataContracts ?? null, moderatorDataContracts ?? null);
    }
    async actions(contractId, groupContractPosition, status, opts = {}) {
        const { startAtInfo, count } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupActions(contractId, groupContractPosition, status, startAtInfo ?? null, count ?? null);
    }
    async actionsWithProof(contractId, groupContractPosition, status, opts = {}) {
        const { startAtInfo, count } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupActionsWithProofInfo(contractId, groupContractPosition, status, startAtInfo ?? null, count ?? null);
    }
    async actionSigners(contractId, groupContractPosition, status, actionId) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupActionSigners(contractId, groupContractPosition, status, actionId);
    }
    async actionSignersWithProof(contractId, groupContractPosition, status, actionId) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupActionSignersWithProofInfo(contractId, groupContractPosition, status, actionId);
    }
    async groupsDataContracts(dataContractIds) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupsDataContracts(dataContractIds);
    }
    async groupsDataContractsWithProof(dataContractIds) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getGroupsDataContractsWithProofInfo(dataContractIds);
    }
    async contestedResources(params) {
        const { documentTypeName, contractId, indexName, startAtValue, limit, orderAscending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResources(documentTypeName, contractId, indexName, startAtValue ?? null, limit ?? null, null, orderAscending ?? null);
    }
    async contestedResourcesWithProof(params) {
        const { documentTypeName, contractId, indexName, startAtValue, limit, orderAscending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourcesWithProofInfo(documentTypeName, contractId, indexName, startAtValue ?? null, limit ?? null, null, orderAscending ?? null);
    }
    async contestedResourceVotersForIdentity(params) {
        const { contractId, documentTypeName, indexName, indexValues, contestantId, startAtVoterInfo, limit, orderAscending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourceVotersForIdentity(contractId, documentTypeName, indexName, indexValues, contestantId, startAtVoterInfo ?? null, limit ?? null, orderAscending ?? null);
    }
    async contestedResourceVotersForIdentityWithProof(params) {
        const { contractId, documentTypeName, indexName, indexValues, contestantId, startAtIdentifierInfo, count, orderAscending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourceVotersForIdentityWithProofInfo(contractId, documentTypeName, indexName, indexValues, contestantId, startAtIdentifierInfo ?? null, count ?? null, orderAscending ?? null);
    }
}
