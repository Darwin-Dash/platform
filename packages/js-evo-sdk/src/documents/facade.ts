import { asJsonString } from '../util.js';
import type { EvoSDK } from '../sdk.js';
import type {
  Document,
  DocumentQueryResult,
  StateTransitionResult,
  WithProof,
} from '../types/index.js';
import { withErrorHandling } from '../errors.js';

export class DocumentsFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  /**
   * Query many documents
   */
  async query(params: {
    contractId: string;
    type: string;
    where?: unknown;
    orderBy?: unknown;
    limit?: number;
    startAfter?: string;
    startAt?: string;
  }): Promise<DocumentQueryResult> {
    return withErrorHandling('query documents', async () => {
      const { contractId, type, where, orderBy, limit, startAfter, startAt } = params;
      const whereJson = asJsonString(where);
      const orderJson = asJsonString(orderBy);
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocuments(
        contractId,
        type,
        whereJson ?? null,
        orderJson ?? null,
        limit ?? null,
        startAfter ?? null,
        startAt ?? null,
      );
    }, `${params.contractId}/${params.type}`);
  }

  async queryWithProof(params: {
    contractId: string;
    type: string;
    where?: unknown;
    orderBy?: unknown;
    limit?: number;
    startAfter?: string;
    startAt?: string;
  }): Promise<WithProof<DocumentQueryResult>> {
    return withErrorHandling('query documents with proof', async () => {
      const { contractId, type, where, orderBy, limit, startAfter, startAt } = params;
      const whereJson = asJsonString(where);
      const orderJson = asJsonString(orderBy);
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocumentsWithProofInfo(
        contractId,
        type,
        whereJson ?? null,
        orderJson ?? null,
        limit ?? null,
        startAfter ?? null,
        startAt ?? null,
      );
    }, `${params.contractId}/${params.type}`);
  }

  async get(contractId: string, type: string, documentId: string): Promise<Document> {
    return withErrorHandling('fetch document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocument(contractId, type, documentId);
    }, documentId);
  }

  async getWithProof(contractId: string, type: string, documentId: string): Promise<WithProof<Document>> {
    return withErrorHandling('fetch document with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocumentWithProofInfo(contractId, type, documentId);
    }, documentId);
  }

  async create(args: {
    contractId: string;
    type: string;
    ownerId: string;
    data: unknown;
    entropyHex: string;
    privateKeyWif: string;
  }): Promise<StateTransitionResult> {
    return withErrorHandling('create document', async () => {
      const { contractId, type, ownerId, data, entropyHex, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentCreate(
        contractId,
        type,
        ownerId,
        asJsonString(data)!,
        entropyHex,
        privateKeyWif,
      );
    }, `${args.contractId}/${args.type}`);
  }

  async replace(args: {
    contractId: string;
    type: string;
    documentId: string;
    ownerId: string;
    data: unknown;
    revision: number | bigint;
    privateKeyWif: string;
  }): Promise<StateTransitionResult> {
    return withErrorHandling('replace document', async () => {
      const { contractId, type, documentId, ownerId, data, revision, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentReplace(
        contractId,
        type,
        documentId,
        ownerId,
        asJsonString(data)!,
        BigInt(revision),
        privateKeyWif,
      );
    }, args.documentId);
  }

  async delete(args: { contractId: string; type: string; documentId: string; ownerId: string; privateKeyWif: string }): Promise<StateTransitionResult> {
    return withErrorHandling('delete document', async () => {
      const { contractId, type, documentId, ownerId, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentDelete(contractId, type, documentId, ownerId, privateKeyWif);
    }, args.documentId);
  }

  async transfer(args: { contractId: string; type: string; documentId: string; ownerId: string; recipientId: string; privateKeyWif: string }): Promise<StateTransitionResult> {
    return withErrorHandling('transfer document', async () => {
      const { contractId, type, documentId, ownerId, recipientId, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentTransfer(contractId, type, documentId, ownerId, recipientId, privateKeyWif);
    }, `${args.documentId} → ${args.recipientId}`);
  }

  async purchase(args: { contractId: string; type: string; documentId: string; buyerId: string; price: number | bigint | string; privateKeyWif: string }): Promise<StateTransitionResult> {
    return withErrorHandling('purchase document', async () => {
      const { contractId, type, documentId, buyerId, price, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentPurchase(contractId, type, documentId, buyerId, BigInt(price), privateKeyWif);
    }, args.documentId);
  }

  async setPrice(args: { contractId: string; type: string; documentId: string; ownerId: string; price: number | bigint | string; privateKeyWif: string }): Promise<StateTransitionResult> {
    return withErrorHandling('set document price', async () => {
      const { contractId, type, documentId, ownerId, price, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentSetPrice(contractId, type, documentId, ownerId, BigInt(price), privateKeyWif);
    }, args.documentId);
  }
}
