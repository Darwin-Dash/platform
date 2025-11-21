import { asJsonString } from '../util.js';
import { withErrorHandling } from '../errors.js';
export class ContractsFacade {
    sdk;
    constructor(sdk) {
        this.sdk = sdk;
    }
    async get(contractId) {
        return withErrorHandling('fetch contract', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDataContract(contractId);
        }, contractId);
    }
    async getWithProof(contractId) {
        return withErrorHandling('fetch contract with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDataContractWithProofInfo(contractId);
        }, contractId);
    }
    async getHistory(args) {
        return withErrorHandling('fetch contract history', async () => {
            const { contractId, limit, startAtMs } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDataContractHistory(contractId, limit ?? null, null, startAtMs != null ? BigInt(startAtMs) : null);
        }, args.contractId);
    }
    async getHistoryWithProof(args) {
        return withErrorHandling('fetch contract history with proof', async () => {
            const { contractId, limit, startAtMs } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDataContractHistoryWithProofInfo(contractId, limit ?? null, null, startAtMs != null ? BigInt(startAtMs) : null);
        }, args.contractId);
    }
    async getMany(contractIds) {
        return withErrorHandling('fetch contracts', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDataContracts(contractIds);
        }, `${contractIds.length} contracts`);
    }
    async getManyWithProof(contractIds) {
        return withErrorHandling('fetch contracts with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDataContractsWithProofInfo(contractIds);
        }, `${contractIds.length} contracts`);
    }
    async create(args) {
        return withErrorHandling('create contract', async () => {
            const { ownerId, definition, privateKeyWif, keyId } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.contractCreate(ownerId, asJsonString(definition), privateKeyWif, keyId ?? null);
        }, 'contract creation');
    }
    async update(args) {
        return withErrorHandling('update contract', async () => {
            const { contractId, ownerId, updates, privateKeyWif, keyId } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.contractUpdate(contractId, ownerId, asJsonString(updates), privateKeyWif, keyId ?? null);
        }, args.contractId);
    }
}
