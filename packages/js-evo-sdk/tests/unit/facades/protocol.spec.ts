import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ProtocolFacade } from '../../../src/protocol/facade.js';

describe('ProtocolFacade', () => {
  let mockWasmSdk: {
    getProtocolVersionUpgradeState: Mock;
    getProtocolVersionUpgradeStateWithProofInfo: Mock;
    getProtocolVersionUpgradeVoteStatus: Mock;
    getProtocolVersionUpgradeVoteStatusWithProofInfo: Mock;
  };
  let mockEvoSdk: {
    getWasmSdkConnected: Mock;
  };
  let facade: ProtocolFacade;

  beforeEach(() => {
    // Create the mock WASM SDK with the methods the facade calls
    mockWasmSdk = {
      getProtocolVersionUpgradeState: vi.fn().mockResolvedValue('ok'),
      getProtocolVersionUpgradeStateWithProofInfo: vi.fn().mockResolvedValue('ok'),
      getProtocolVersionUpgradeVoteStatus: vi.fn().mockResolvedValue('ok'),
      getProtocolVersionUpgradeVoteStatusWithProofInfo: vi.fn().mockResolvedValue('ok'),
    };
    // Create the mock EvoSDK that returns the WASM SDK
    mockEvoSdk = {
      getWasmSdkConnected: vi.fn().mockResolvedValue(mockWasmSdk),
    };
    facade = new ProtocolFacade(mockEvoSdk as any);
  });

  it('versionUpgradeState and versionUpgradeStateWithProof forward', async () => {
    await facade.versionUpgradeState();
    await facade.versionUpgradeStateWithProof();
    expect(mockWasmSdk.getProtocolVersionUpgradeState).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getProtocolVersionUpgradeState).toHaveBeenCalledWith();
    expect(mockWasmSdk.getProtocolVersionUpgradeStateWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getProtocolVersionUpgradeStateWithProofInfo).toHaveBeenCalledWith();
  });

  it('versionUpgradeVoteStatus and withProof forward with positional args', async () => {
    await facade.versionUpgradeVoteStatus('h', 5);
    await facade.versionUpgradeVoteStatusWithProof('g', 3);
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatus).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatus).toHaveBeenCalledWith('h', 5);
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatusWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatusWithProofInfo).toHaveBeenCalledWith('g', 3);
  });

  it('versionUpgradeVoteStatus accepts Uint8Array and positional args', async () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await facade.versionUpgradeVoteStatus(bytes, 2);
    await facade.versionUpgradeVoteStatusWithProof(bytes, 4);
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatus).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatus).toHaveBeenCalledWith(bytes, 2);
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatusWithProofInfo).toHaveBeenCalledOnce();
    expect(mockWasmSdk.getProtocolVersionUpgradeVoteStatusWithProofInfo).toHaveBeenCalledWith(bytes, 4);
  });
});
