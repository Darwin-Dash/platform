import { asJsonString } from '../util.js';
import { withErrorHandling } from '../errors.js';
export class DocumentsFacade {
    sdk;
    constructor(sdk) {
        this.sdk = sdk;
    }
    /**
     * Query many documents
     */
    async query(params) {
        return withErrorHandling('query documents', async () => {
            const { contractId, type, where, orderBy, limit, startAfter, startAt } = params;
            const whereJson = asJsonString(where);
            const orderJson = asJsonString(orderBy);
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDocuments(contractId, type, whereJson ?? null, orderJson ?? null, limit ?? null, startAfter ?? null, startAt ?? null);
        }, `${params.contractId}/${params.type}`);
    }
    async queryWithProof(params) {
        return withErrorHandling('query documents with proof', async () => {
            const { contractId, type, where, orderBy, limit, startAfter, startAt } = params;
            const whereJson = asJsonString(where);
            const orderJson = asJsonString(orderBy);
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDocumentsWithProofInfo(contractId, type, whereJson ?? null, orderJson ?? null, limit ?? null, startAfter ?? null, startAt ?? null);
        }, `${params.contractId}/${params.type}`);
    }
    async get(contractId, type, documentId) {
        return withErrorHandling('fetch document', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDocument(contractId, type, documentId);
        }, documentId);
    }
    async getWithProof(contractId, type, documentId) {
        return withErrorHandling('fetch document with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getDocumentWithProofInfo(contractId, type, documentId);
        }, documentId);
    }
    async create(args) {
        return withErrorHandling('create document', async () => {
            const { contractId, type, ownerId, data, entropyHex, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.documentCreate(contractId, type, ownerId, asJsonString(data), entropyHex, privateKeyWif);
        }, `${args.contractId}/${args.type}`);
    }
    async replace(args) {
        return withErrorHandling('replace document', async () => {
            const { contractId, type, documentId, ownerId, data, revision, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.documentReplace(contractId, type, documentId, ownerId, asJsonString(data), BigInt(revision), privateKeyWif);
        }, args.documentId);
    }
    async delete(args) {
        return withErrorHandling('delete document', async () => {
            const { contractId, type, documentId, ownerId, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.documentDelete(contractId, type, documentId, ownerId, privateKeyWif);
        }, args.documentId);
    }
    async transfer(args) {
        return withErrorHandling('transfer document', async () => {
            const { contractId, type, documentId, ownerId, recipientId, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.documentTransfer(contractId, type, documentId, ownerId, recipientId, privateKeyWif);
        }, `${args.documentId} → ${args.recipientId}`);
    }
    async purchase(args) {
        return withErrorHandling('purchase document', async () => {
            const { contractId, type, documentId, buyerId, price, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.documentPurchase(contractId, type, documentId, buyerId, BigInt(price), privateKeyWif);
        }, args.documentId);
    }
    async setPrice(args) {
        return withErrorHandling('set document price', async () => {
            const { contractId, type, documentId, ownerId, price, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.documentSetPrice(contractId, type, documentId, ownerId, BigInt(price), privateKeyWif);
        }, args.documentId);
    }
}
