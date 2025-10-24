import * as wasm from '../wasm.js';
import { asJsonString } from '../util.js';
import type { EvoSDK } from '../sdk.js';
import type {
  DataContract,
  StateTransitionResult,
  WithProof,
} from '../types/index.js';
import { withErrorHandling } from '../errors.js';

export class ContractsFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  async fetch(contractId: string): Promise<DataContract> {
    return withErrorHandling('fetch contract', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContract(contractId);
    }, contractId);
  }

  async fetchWithProof(contractId: string): Promise<WithProof<DataContract>> {
    return withErrorHandling('fetch contract with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContractWithProofInfo(contractId);
    }, contractId);
  }

  async getHistory(args: { contractId: string; limit?: number; startAtMs?: number | bigint }): Promise<any> {
    return withErrorHandling('fetch contract history', async () => {
      const { contractId, limit, startAtMs } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContractHistory(
        contractId,
        limit ?? null,
        null,
        startAtMs != null ? BigInt(startAtMs) : null,
      );
    }, args.contractId);
  }

  async getHistoryWithProof(args: { contractId: string; limit?: number; startAtMs?: number | bigint }): Promise<any> {
    return withErrorHandling('fetch contract history with proof', async () => {
      const { contractId, limit, startAtMs } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContractHistoryWithProofInfo(
        contractId,
        limit ?? null,
        null,
        startAtMs != null ? BigInt(startAtMs) : null,
      );
    }, args.contractId);
  }

  async getMany(contractIds: string[]): Promise<DataContract[]> {
    return withErrorHandling('fetch contracts', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContracts(contractIds);
    }, `${contractIds.length} contracts`);
  }

  async getManyWithProof(contractIds: string[]): Promise<WithProof<DataContract[]>> {
    return withErrorHandling('fetch contracts with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContractsWithProofInfo(contractIds);
    }, `${contractIds.length} contracts`);
  }

  async create(args: { ownerId: string; definition: unknown; privateKeyWif: string; keyId?: number }): Promise<StateTransitionResult> {
    return withErrorHandling('create contract', async () => {
      const { ownerId, definition, privateKeyWif, keyId } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.contractCreate(ownerId, asJsonString(definition)!, privateKeyWif, keyId ?? null);
    }, 'contract creation');
  }

  async update(args: { contractId: string; ownerId: string; updates: unknown; privateKeyWif: string; keyId?: number }): Promise<StateTransitionResult> {
    return withErrorHandling('update contract', async () => {
      const { contractId, ownerId, updates, privateKeyWif, keyId } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.contractUpdate(contractId, ownerId, asJsonString(updates)!, privateKeyWif, keyId ?? null);
    }, args.contractId);
  }
}
