import { withErrorHandling } from '../errors.js';
export class SystemFacade {
    sdk;
    constructor(sdk) {
        this.sdk = sdk;
    }
    async status() {
        return withErrorHandling('fetch system status', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getStatus();
        });
    }
    async currentQuorumsInfo() {
        return withErrorHandling('fetch current quorums info', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getCurrentQuorumsInfo();
        });
    }
    async totalCreditsInPlatform() {
        return withErrorHandling('fetch total credits in platform', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTotalCreditsInPlatform();
        });
    }
    async totalCreditsInPlatformWithProof() {
        return withErrorHandling('fetch total credits in platform with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTotalCreditsInPlatformWithProofInfo();
        });
    }
    async prefundedSpecializedBalance(identityId) {
        return withErrorHandling('fetch prefunded specialized balance', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getPrefundedSpecializedBalance(identityId);
        }, identityId);
    }
    async prefundedSpecializedBalanceWithProof(identityId) {
        return withErrorHandling('fetch prefunded specialized balance with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getPrefundedSpecializedBalanceWithProofInfo(identityId);
        }, identityId);
    }
    async waitForStateTransitionResult(stateTransitionHash) {
        return withErrorHandling('wait for state transition result', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.waitForStateTransitionResult(stateTransitionHash);
        }, stateTransitionHash);
    }
    async pathElements(path, keys) {
        return withErrorHandling('fetch path elements', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getPathElements(path, keys);
        }, `${path.length} paths`);
    }
    async pathElementsWithProof(path, keys) {
        return withErrorHandling('fetch path elements with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getPathElementsWithProofInfo(path, keys);
        }, `${path.length} paths`);
    }
}
