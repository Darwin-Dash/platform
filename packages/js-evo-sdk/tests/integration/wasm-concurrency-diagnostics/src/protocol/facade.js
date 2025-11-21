export class ProtocolFacade {
    sdk;
    constructor(sdk) { this.sdk = sdk; }
    async versionUpgradeState() { const w = await this.sdk.getWasmSdkConnected(); return w.getProtocolVersionUpgradeState(); }
    async versionUpgradeStateWithProof() { const w = await this.sdk.getWasmSdkConnected(); return w.getProtocolVersionUpgradeStateWithProofInfo(); }
    async versionUpgradeVoteStatus(params) {
        const { startProTxHash, count } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getProtocolVersionUpgradeVoteStatus(startProTxHash, count);
    }
    async versionUpgradeVoteStatusWithProof(params) {
        const { startProTxHash, count } = params;
        const w = await this.sdk.getWasmSdkConnected();
        return w.getProtocolVersionUpgradeVoteStatusWithProofInfo(startProTxHash, count);
    }
}
