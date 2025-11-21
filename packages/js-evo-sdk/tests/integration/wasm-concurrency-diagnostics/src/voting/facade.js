import { asJsonString } from '../util.js';
export class VotingFacade {
    sdk;
    constructor(sdk) { this.sdk = sdk; }
    async contestedResourceVoteState(params) {
        const { contractId, documentTypeName, indexName, indexValues, resultType, allowIncludeLockedAndAbstainingVoteTally, startAtIdentifierInfo, count, orderAscending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourceVoteState(contractId, documentTypeName, indexName, indexValues, resultType, allowIncludeLockedAndAbstainingVoteTally ?? null, startAtIdentifierInfo ?? null, count ?? null, orderAscending ?? null);
    }
    async contestedResourceVoteStateWithProof(params) {
        const { contractId, documentTypeName, indexName, indexValues, resultType, allowIncludeLockedAndAbstainingVoteTally, startAtIdentifierInfo, count, orderAscending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourceVoteStateWithProofInfo(contractId, documentTypeName, indexName, indexValues, resultType, allowIncludeLockedAndAbstainingVoteTally ?? null, startAtIdentifierInfo ?? null, count ?? null, orderAscending ?? null);
    }
    async contestedResourceIdentityVotes(identityId, opts = {}) {
        const { limit, startAtVotePollIdInfo, orderAscending } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourceIdentityVotes(identityId, limit ?? null, startAtVotePollIdInfo ?? null, orderAscending ?? null);
    }
    async contestedResourceIdentityVotesWithProof(identityId, opts = {}) {
        const { limit, offset, orderAscending } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getContestedResourceIdentityVotesWithProofInfo(identityId, limit ?? null, offset ?? null, orderAscending ?? null);
    }
    async votePollsByEndDate(opts = {}) {
        const { startTimeInfo, endTimeInfo, limit, orderAscending } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getVotePollsByEndDate(startTimeInfo ?? null, endTimeInfo ?? null, limit ?? null, orderAscending ?? null);
    }
    async votePollsByEndDateWithProof(opts = {}) {
        const { startTimeMs, endTimeMs, limit, offset, orderAscending } = opts;
        const start = startTimeMs != null ? BigInt(startTimeMs) : null;
        const end = endTimeMs != null ? BigInt(endTimeMs) : null;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getVotePollsByEndDateWithProofInfo(start ?? null, end ?? null, limit ?? null, offset ?? null, orderAscending ?? null);
    }
    async masternodeVote(args) {
        const { masternodeProTxHash, contractId, documentTypeName, indexName, indexValues, voteChoice, votingKeyWif } = args;
        const indexValuesStr = typeof indexValues === 'string' ? indexValues : asJsonString(indexValues);
        const w = await this.sdk.getWasmSdkConnected();
        return w.masternodeVote(masternodeProTxHash, contractId, documentTypeName, indexName, indexValuesStr, voteChoice, votingKeyWif);
    }
}
