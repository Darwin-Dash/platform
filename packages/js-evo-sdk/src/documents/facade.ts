import * as wasm from '../wasm.js';
import type { EvoSDK } from '../sdk.js';
import { withErrorHandling } from '../errors.js';

export class DocumentsFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  /**
   * Query documents matching specified criteria.
   *
   * @param query - Query parameters including contractId, documentType, where clauses, etc.
   * @returns Map of document IDs to documents (or undefined for deleted docs)
   *
   * @example
   * ```typescript
   * const docs = await sdk.documents.query({
   *   dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
   *   documentTypeName: 'note',
   *   where: [['authorId', '==', '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS']],
   *   orderBy: [['createdAt', 'desc']],
   *   limit: 10,
   * });
   * ```
   */
  async query(query: wasm.DocumentsQuery): Promise<Map<wasm.Identifier, wasm.Document | undefined>> {
    return withErrorHandling('query documents', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocuments(query);
    }, `${query.dataContractId}/${query.documentTypeName}`);
  }

  /**
   * Query documents with proof metadata for verification.
   *
   * @param query - Query parameters
   * @returns Documents with proof metadata
   */
  async queryWithProof(query: wasm.DocumentsQuery): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, wasm.Document | undefined>>> {
    return withErrorHandling('query documents with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocumentsWithProofInfo(query);
    }, `${query.dataContractId}/${query.documentTypeName}`);
  }

  /**
   * Get a single document by ID.
   *
   * @param contractId - Data contract identifier
   * @param type - Document type name
   * @param documentId - Document identifier
   * @returns Document if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const doc = await sdk.documents.get(
   *   'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
   *   'note',
   *   '4mZmxva49PBb7BE7srw9o3gixvDfj1dAx1K6z4A7P9Ah'
   * );
   * ```
   */
  async get(contractId: wasm.IdentifierLike, type: string, documentId: wasm.IdentifierLike): Promise<wasm.Document | undefined> {
    return withErrorHandling('fetch document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocument(contractId, type, documentId);
    }, String(documentId));
  }

  /**
   * Get a single document by ID with proof metadata.
   *
   * @param contractId - Data contract identifier
   * @param type - Document type name
   * @param documentId - Document identifier
   * @returns Document with proof metadata
   */
  async getWithProof(contractId: wasm.IdentifierLike, type: string, documentId: wasm.IdentifierLike): Promise<wasm.ProofMetadataResponseTyped<wasm.Document | undefined>> {
    return withErrorHandling('fetch document with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDocumentWithProofInfo(contractId, type, documentId);
    }, String(documentId));
  }

  /**
   * Create a new document on Dash Platform.
   *
   * @param options - Creation options including document, identityKey, and signer
   *
   * @example
   * ```typescript
   * await sdk.documents.create({
   *   document: myDocument,
   *   identityKey: identity.publicKeys[0],
   *   signer: mySigner,
   * });
   * ```
   */
  async create(options: wasm.DocumentCreateOptions): Promise<void> {
    return withErrorHandling('create document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentCreate(options);
    });
  }

  /**
   * Replace an existing document on Dash Platform.
   *
   * @param options - Replace options including updated document, identityKey, and signer
   */
  async replace(options: wasm.DocumentReplaceOptions): Promise<void> {
    return withErrorHandling('replace document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentReplace(options);
    });
  }

  /**
   * Delete a document from Dash Platform.
   *
   * @param options - Delete options including document (or identifiers), identityKey, and signer
   *
   * @example
   * ```typescript
   * // Using a Document instance
   * await sdk.documents.delete({
   *   document: myDocument,
   *   identityKey: identity.publicKeys[0],
   *   signer: mySigner,
   * });
   *
   * // Using document identifiers
   * await sdk.documents.delete({
   *   document: {
   *     id: '4mZmxva49PBb7BE7srw9o3gixvDfj1dAx1K6z4A7P9Ah',
   *     ownerId: '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS',
   *     dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
   *     documentTypeName: 'note',
   *   },
   *   identityKey: identity.publicKeys[0],
   *   signer: mySigner,
   * });
   * ```
   */
  async delete(options: wasm.DocumentDeleteOptions): Promise<void> {
    return withErrorHandling('delete document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentDelete(options);
    });
  }

  /**
   * Transfer document ownership to another identity.
   *
   * @param options - Transfer options including document, recipientId, identityKey, and signer
   */
  async transfer(options: wasm.DocumentTransferOptions): Promise<void> {
    return withErrorHandling('transfer document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentTransfer(options);
    });
  }

  /**
   * Purchase a document that has a price set.
   *
   * @param options - Purchase options including document, buyerId, price, identityKey, and signer
   */
  async purchase(options: wasm.DocumentPurchaseOptions): Promise<void> {
    return withErrorHandling('purchase document', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentPurchase(options);
    });
  }

  /**
   * Set a price on a document to enable purchases.
   *
   * @param options - Set price options including document, price, identityKey, and signer
   */
  async setPrice(options: wasm.DocumentSetPriceOptions): Promise<void> {
    return withErrorHandling('set document price', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.documentSetPrice(options);
    });
  }
}
