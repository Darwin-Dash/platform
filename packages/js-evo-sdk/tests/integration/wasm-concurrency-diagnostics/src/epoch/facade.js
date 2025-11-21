export class EpochFacade {
    sdk;
    constructor(sdk) { this.sdk = sdk; }
    async epochsInfo(params = {}) {
        const { startEpoch, count, ascending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getEpochsInfo(startEpoch ?? null, count ?? null, ascending ?? null);
    }
    async epochsInfoWithProof(params = {}) {
        const { startEpoch, count, ascending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getEpochsInfoWithProofInfo(startEpoch ?? null, count ?? null, ascending ?? null);
    }
    async finalizedInfos(params = {}) {
        const { startEpoch, count, ascending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getFinalizedEpochInfos(startEpoch ?? null, count ?? null, ascending ?? null);
    }
    async finalizedInfosWithProof(params = {}) {
        const { startEpoch, count, ascending } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getFinalizedEpochInfosWithProofInfo(startEpoch ?? null, count ?? null, ascending ?? null);
    }
    async current() { const w = await this.sdk.getWasmSdkConnected(); return w.getCurrentEpoch(); }
    async currentWithProof() { const w = await this.sdk.getWasmSdkConnected(); return w.getCurrentEpochWithProofInfo(); }
    async evonodesProposedBlocksByIds(epoch, ids) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getEvonodesProposedEpochBlocksByIds(epoch, ids);
    }
    async evonodesProposedBlocksByIdsWithProof(epoch, ids) {
        const w = await this.sdk.getWasmSdkConnected();
        return w.getEvonodesProposedEpochBlocksByIdsWithProofInfo(epoch, ids);
    }
    async evonodesProposedBlocksByRange(epoch, opts = {}) {
        const { limit, startAfter, orderAscending } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getEvonodesProposedEpochBlocksByRange(epoch, limit ?? null, startAfter ?? null, orderAscending ?? null);
    }
    async evonodesProposedBlocksByRangeWithProof(epoch, opts = {}) {
        const { limit, startAfter, orderAscending } = opts;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getEvonodesProposedEpochBlocksByRangeWithProofInfo(epoch, limit ?? null, startAfter ?? null, orderAscending ?? null);
    }
}
