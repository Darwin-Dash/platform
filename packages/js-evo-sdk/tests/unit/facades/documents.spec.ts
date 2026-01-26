import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createMockWasmSdk } from '../../setup';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
}));

// Mock the SDK
const mockWasmSdk = createMockWasmSdk();

// Add document-specific mock methods not in the base setup
Object.assign(mockWasmSdk, {
  getDocuments: vi.fn().mockResolvedValue(new Map()),
  getDocumentsWithProofInfo: vi.fn().mockResolvedValue({
    data: new Map(),
    proof: {},
    metadata: {},
  }),
  getDocument: vi.fn().mockResolvedValue({}),
  getDocumentWithProofInfo: vi.fn().mockResolvedValue({
    data: {},
    proof: {},
    metadata: {},
  }),
  documentCreate: vi.fn().mockResolvedValue(undefined),
  documentReplace: vi.fn().mockResolvedValue(undefined),
  documentDelete: vi.fn().mockResolvedValue(undefined),
  documentTransfer: vi.fn().mockResolvedValue(undefined),
  documentPurchase: vi.fn().mockResolvedValue(undefined),
  documentSetPrice: vi.fn().mockResolvedValue(undefined),
});

// Create a mock EvoSDK for documents
const createMockEvoSDK = () => ({
  documents: {
    query: async (query: any) => mockWasmSdk.getDocuments(query),
    queryWithProof: async (query: any) => mockWasmSdk.getDocumentsWithProofInfo(query),
    get: async (contractId: string, type: string, documentId: string) =>
      mockWasmSdk.getDocument(contractId, type, documentId),
    getWithProof: async (contractId: string, type: string, documentId: string) =>
      mockWasmSdk.getDocumentWithProofInfo(contractId, type, documentId),
    create: async (options: any) => mockWasmSdk.documentCreate(options),
    replace: async (options: any) => mockWasmSdk.documentReplace(options),
    delete: async (options: any) => mockWasmSdk.documentDelete(options),
    transfer: async (options: any) => mockWasmSdk.documentTransfer(options),
    purchase: async (options: any) => mockWasmSdk.documentPurchase(options),
    setPrice: async (options: any) => mockWasmSdk.documentSetPrice(options),
  },
});

// Mock document and identity objects
const createMockDocument = () => ({});
const createMockIdentityKey = () => ({});
const createMockSigner = () => ({});

describe('DocumentsFacade', () => {
  let client: ReturnType<typeof createMockEvoSDK>;
  let document: ReturnType<typeof createMockDocument>;
  let identityKey: ReturnType<typeof createMockIdentityKey>;
  let signer: ReturnType<typeof createMockSigner>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockEvoSDK();
    document = createMockDocument();
    identityKey = createMockIdentityKey();
    signer = createMockSigner();
  });

  describe('Query Methods', () => {
    it('query() fetches documents matching criteria', async () => {
      const query = {
        dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
        documentTypeName: 'note',
        where: [['authorId', '==', '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS']],
        orderBy: [['createdAt', 'desc']],
        limit: 10,
      };

      await client.documents.query(query);

      expect(mockWasmSdk.getDocuments).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDocuments).toHaveBeenCalledWith(query);
    });

    it('queryWithProof() fetches documents with proof metadata', async () => {
      const query = {
        dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
        documentTypeName: 'note',
      };

      await client.documents.queryWithProof(query);

      expect(mockWasmSdk.getDocumentsWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDocumentsWithProofInfo).toHaveBeenCalledWith(query);
    });

    it('get() fetches a single document by ID', async () => {
      const contractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const documentTypeName = 'note';
      const documentId = '4mZmxva49PBb7BE7srw9o3gixvDfj1dAx1K6z4A7P9Ah';

      await client.documents.get(contractId, documentTypeName, documentId);

      expect(mockWasmSdk.getDocument).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDocument).toHaveBeenCalledWith(contractId, documentTypeName, documentId);
    });

    it('getWithProof() fetches a single document with proof', async () => {
      const contractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const documentTypeName = 'note';
      const documentId = '4mZmxva49PBb7BE7srw9o3gixvDfj1dAx1K6z4A7P9Ah';

      await client.documents.getWithProof(contractId, documentTypeName, documentId);

      expect(mockWasmSdk.getDocumentWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDocumentWithProofInfo).toHaveBeenCalledWith(contractId, documentTypeName, documentId);
    });
  });

  describe('Transition Methods', () => {
    it('create() creates a new document', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await client.documents.create(options);

      expect(mockWasmSdk.documentCreate).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentCreate).toHaveBeenCalledWith(options);
    });

    it('replace() replaces an existing document', async () => {
      const options = {
        document,
        identityKey,
        signer,
        settings: { retries: 3 },
      };

      await client.documents.replace(options);

      expect(mockWasmSdk.documentReplace).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentReplace).toHaveBeenCalledWith(options);
    });

    it('delete() deletes a document', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await client.documents.delete(options);

      expect(mockWasmSdk.documentDelete).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentDelete).toHaveBeenCalledWith(options);
    });

    it('delete() accepts document identifiers instead of Document instance', async () => {
      const options = {
        document: {
          id: '4mZmxva49PBb7BE7srw9o3gixvDfj1dAx1K6z4A7P9Ah',
          ownerId: '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS',
          dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
          documentTypeName: 'note',
        },
        identityKey,
        signer,
      };

      await client.documents.delete(options);

      expect(mockWasmSdk.documentDelete).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentDelete).toHaveBeenCalledWith(options);
    });

    it('transfer() transfers document ownership to another identity', async () => {
      const recipientId = '6o4vL6YpPjamqnnPNpwNSspYJdhPpzYbXvAJ4PYH7Ack';
      const options = {
        document,
        recipientId,
        identityKey,
        signer,
      };

      await client.documents.transfer(options);

      expect(mockWasmSdk.documentTransfer).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentTransfer).toHaveBeenCalledWith(options);
    });

    it('purchase() purchases a document from another identity', async () => {
      const buyerId = '6o4vL6YpPjamqnnPNpwNSspYJdhPpzYbXvAJ4PYH7Ack';
      const options = {
        document,
        buyerId,
        price: BigInt(1000000), // 1M credits
        identityKey,
        signer,
      };

      await client.documents.purchase(options);

      expect(mockWasmSdk.documentPurchase).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentPurchase).toHaveBeenCalledWith(options);
    });

    it('setPrice() sets a price on a document for sale', async () => {
      const options = {
        document,
        price: BigInt(5000000), // 5M credits
        identityKey,
        signer,
      };

      await client.documents.setPrice(options);

      expect(mockWasmSdk.documentSetPrice).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentSetPrice).toHaveBeenCalledWith(options);
    });
  });

  describe('Error Handling', () => {
    it('query() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Connection timeout');
      (mockWasmSdk.getDocuments as Mock).mockRejectedValueOnce(originalError);

      const query = {
        dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
        documentTypeName: 'note',
      };

      await expect(client.documents.query(query)).rejects.toThrow('Connection timeout');
    });

    it('get() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Document not found');
      (mockWasmSdk.getDocument as Mock).mockRejectedValueOnce(originalError);

      await expect(
        client.documents.get('contractId', 'type', 'docId123')
      ).rejects.toThrow('Document not found');
    });

    it('create() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Insufficient balance');
      (mockWasmSdk.documentCreate as Mock).mockRejectedValueOnce(originalError);

      const options = {
        document,
        identityKey,
        signer,
      };

      await expect(client.documents.create(options)).rejects.toThrow('Insufficient balance');
    });

    it('replace() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Document revision mismatch');
      (mockWasmSdk.documentReplace as Mock).mockRejectedValueOnce(originalError);

      const options = {
        document,
        identityKey,
        signer,
      };

      await expect(client.documents.replace(options)).rejects.toThrow('Document revision mismatch');
    });

    it('delete() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Not authorized to delete');
      (mockWasmSdk.documentDelete as Mock).mockRejectedValueOnce(originalError);

      const options = {
        document,
        identityKey,
        signer,
      };

      await expect(client.documents.delete(options)).rejects.toThrow('Not authorized to delete');
    });

    it('transfer() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Recipient identity not found');
      (mockWasmSdk.documentTransfer as Mock).mockRejectedValueOnce(originalError);

      const options = {
        document,
        recipientId: 'invalid-id',
        identityKey,
        signer,
      };

      await expect(client.documents.transfer(options)).rejects.toThrow('Recipient identity not found');
    });

    it('purchase() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Document not for sale');
      (mockWasmSdk.documentPurchase as Mock).mockRejectedValueOnce(originalError);

      const options = {
        document,
        buyerId: 'buyer-id',
        price: BigInt(1000000),
        identityKey,
        signer,
      };

      await expect(client.documents.purchase(options)).rejects.toThrow('Document not for sale');
    });

    it('setPrice() propagates errors from WASM SDK', async () => {
      const originalError = new Error('Not document owner');
      (mockWasmSdk.documentSetPrice as Mock).mockRejectedValueOnce(originalError);

      const options = {
        document,
        price: BigInt(5000000),
        identityKey,
        signer,
      };

      await expect(client.documents.setPrice(options)).rejects.toThrow('Not document owner');
    });
  });
});
