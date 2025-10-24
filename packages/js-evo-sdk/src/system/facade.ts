import type { EvoSDK } from '../sdk.js';
import type {
  SystemStatus,
  QuorumInfo,
  Balance,
  StateTransitionResult,
  PathElements,
  WithProof,
} from '../types/index.js';
import { withErrorHandling } from '../errors.js';

export class SystemFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  async status(): Promise<SystemStatus> {
    return withErrorHandling('fetch system status', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getStatus();
    });
  }

  async currentQuorumsInfo(): Promise<QuorumInfo[]> {
    return withErrorHandling('fetch current quorums info', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getCurrentQuorumsInfo();
    });
  }

  async totalCreditsInPlatform(): Promise<Balance> {
    return withErrorHandling('fetch total credits in platform', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTotalCreditsInPlatform();
    });
  }

  async totalCreditsInPlatformWithProof(): Promise<WithProof<Balance>> {
    return withErrorHandling('fetch total credits in platform with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTotalCreditsInPlatformWithProofInfo();
    });
  }

  async prefundedSpecializedBalance(identityId: string): Promise<Balance> {
    return withErrorHandling('fetch prefunded specialized balance', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getPrefundedSpecializedBalance(identityId);
    }, identityId);
  }

  async prefundedSpecializedBalanceWithProof(identityId: string): Promise<WithProof<Balance>> {
    return withErrorHandling('fetch prefunded specialized balance with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getPrefundedSpecializedBalanceWithProofInfo(identityId);
    }, identityId);
  }

  async waitForStateTransitionResult(stateTransitionHash: string): Promise<StateTransitionResult> {
    return withErrorHandling('wait for state transition result', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.waitForStateTransitionResult(stateTransitionHash);
    }, stateTransitionHash);
  }

  async pathElements(path: string[], keys: string[]): Promise<PathElements> {
    return withErrorHandling('fetch path elements', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getPathElements(path, keys);
    }, `${path.length} paths`);
  }

  async pathElementsWithProof(path: string[], keys: string[]): Promise<WithProof<PathElements>> {
    return withErrorHandling('fetch path elements with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getPathElementsWithProofInfo(path, keys);
    }, `${path.length} paths`);
  }
}
