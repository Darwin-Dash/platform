import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { DashPayFacade, DASHPAY_CONTRACT_ID } from '../../../src/dashpay/facade.js';

// Mock the wasm module
vi.mock('../../../src/wasm.js', () => ({
  ensureInitialized: vi.fn().mockResolvedValue(undefined),
  WasmSdk: {
    deriveDashpayContactKey: vi.fn().mockResolvedValue({
      address: 'testAddress',
      privateKeyWif: 'testKey',
    }),
  },
}));

// Import the mocked module
import * as wasmModule from '../../../src/wasm.js';

describe('DashPayFacade', () => {
  let mockWasmSdk: {
    getDocuments: Mock;
    getDocumentsWithProofInfo: Mock;
    getDataContract: Mock;
    documentCreate: Mock;
    documentReplace: Mock;
  };
  let mockSdk: {
    getWasmSdkConnected: Mock;
  };
  let facade: DashPayFacade;
  let document: object;
  let identityKey: object;
  let signer: object;
  let contract: object;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock document
    document = { id: 'doc1', type: 'profile' };
    identityKey = { keyId: 0 };
    signer = { sign: vi.fn() };
    contract = { id: 'contract1' };

    // Create mock WASM SDK
    mockWasmSdk = {
      getDocuments: vi.fn().mockResolvedValue(new Map([['doc1', document]])),
      getDocumentsWithProofInfo: vi.fn().mockResolvedValue({
        data: new Map([['doc1', document]]),
        proof: {},
        metadata: {},
      }),
      getDataContract: vi.fn().mockResolvedValue(contract),
      documentCreate: vi.fn().mockResolvedValue(undefined),
      documentReplace: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock SDK
    mockSdk = {
      getWasmSdkConnected: vi.fn().mockResolvedValue(mockWasmSdk),
    };

    facade = new DashPayFacade(mockSdk as any);
  });

  describe('getContractId', () => {
    it('returns the default DashPay contract ID', () => {
      expect(facade.getContractId()).toBe('Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7');
    });
  });

  describe('Profile Methods', () => {
    it('getProfile() fetches profile by identity ID', async () => {
      await facade.getProfile({
        identityId: 'identity123',
      });

      expect(mockWasmSdk.getDocuments).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocuments.mock.calls[0][0];
      expect(callArgs.documentTypeName).toBe('profile');
      expect(callArgs.where).toContainEqual(['$ownerId', '==', 'identity123']);
      expect(callArgs.limit).toBe(1);
    });

    it('getProfile() returns undefined when no profile exists', async () => {
      mockWasmSdk.getDocuments.mockResolvedValue(new Map());

      const result = await facade.getProfile({
        identityId: 'identity123',
      });

      expect(result).toBeUndefined();
    });

    it('getProfileWithProof() fetches profile with proof metadata', async () => {
      await facade.getProfileWithProof({
        identityId: 'identity123',
      });

      expect(mockWasmSdk.getDocumentsWithProofInfo).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocumentsWithProofInfo.mock.calls[0][0];
      expect(callArgs.documentTypeName).toBe('profile');
      expect(callArgs.where).toContainEqual(['$ownerId', '==', 'identity123']);
    });

    it('createProfile() calls documentCreate', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await facade.createProfile(options as any);

      expect(mockWasmSdk.documentCreate).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentCreate).toHaveBeenCalledWith(options);
    });

    it('updateProfile() calls documentReplace', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await facade.updateProfile(options as any);

      expect(mockWasmSdk.documentReplace).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentReplace).toHaveBeenCalledWith(options);
    });
  });

  describe('Contact Request Methods', () => {
    it('sendContactRequest() calls documentCreate', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await facade.sendContactRequest(options as any);

      expect(mockWasmSdk.documentCreate).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentCreate).toHaveBeenCalledWith(options);
    });

    it('acceptContactRequest() calls documentCreate', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await facade.acceptContactRequest(options as any);

      expect(mockWasmSdk.documentCreate).toHaveBeenCalledOnce();
      expect(mockWasmSdk.documentCreate).toHaveBeenCalledWith(options);
    });

    it('getInboundContactRequests() queries by toUserId', async () => {
      await facade.getInboundContactRequests({
        identityId: 'identity123',
        limit: 20,
      });

      expect(mockWasmSdk.getDocuments).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocuments.mock.calls[0][0];
      expect(callArgs.documentTypeName).toBe('contactRequest');
      expect(callArgs.where).toContainEqual(['toUserId', '==', 'identity123']);
      expect(callArgs.limit).toBe(20);
    });

    it('getOutboundContactRequests() queries by $ownerId', async () => {
      await facade.getOutboundContactRequests({
        identityId: 'identity123',
        limit: 15,
      });

      expect(mockWasmSdk.getDocuments).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocuments.mock.calls[0][0];
      expect(callArgs.documentTypeName).toBe('contactRequest');
      expect(callArgs.where).toContainEqual(['$ownerId', '==', 'identity123']);
      expect(callArgs.limit).toBe(15);
    });

    it('getInboundContactRequests() with pagination via startAfter', async () => {
      const startDate = new Date('2024-01-01');
      await facade.getInboundContactRequests({
        identityId: 'identity123',
        startAfter: startDate,
      });

      expect(mockWasmSdk.getDocuments).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocuments.mock.calls[0][0];
      expect(callArgs.where).toHaveLength(2);
      expect(callArgs.where[1]).toEqual(['$createdAt', '>', startDate.getTime()]);
    });
  });

  describe('Contact Methods', () => {
    it('getContacts() queries contactInfo documents', async () => {
      await facade.getContacts({
        identityId: 'identity123',
        limit: 50,
      });

      expect(mockWasmSdk.getDocuments).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocuments.mock.calls[0][0];
      expect(callArgs.documentTypeName).toBe('contactInfo');
      expect(callArgs.where).toContainEqual(['$ownerId', '==', 'identity123']);
      expect(callArgs.limit).toBe(50);
    });

    it('getContacts() uses default limit of 100', async () => {
      await facade.getContacts({
        identityId: 'identity123',
      });

      const callArgs = mockWasmSdk.getDocuments.mock.calls[0][0];
      expect(callArgs.limit).toBe(100);
    });

    it('getContactsWithProof() fetches contacts with proof metadata', async () => {
      await facade.getContactsWithProof({
        identityId: 'identity123',
      });

      expect(mockWasmSdk.getDocumentsWithProofInfo).toHaveBeenCalledOnce();
      const callArgs = mockWasmSdk.getDocumentsWithProofInfo.mock.calls[0][0];
      expect(callArgs.documentTypeName).toBe('contactInfo');
    });
  });

  describe('Helper Methods', () => {
    it('getContract() fetches DashPay contract', async () => {
      await facade.getContract();

      expect(mockWasmSdk.getDataContract).toHaveBeenCalledOnce();
      const contractId = mockWasmSdk.getDataContract.mock.calls[0][0];
      expect(contractId).toBe('Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7');
    });
  });

  describe('Error Handling', () => {
    it('getProfile() wraps errors with context', async () => {
      const originalError = new Error('Connection timeout');
      mockWasmSdk.getDocuments.mockRejectedValue(originalError);

      try {
        await facade.getProfile({ identityId: 'identity123' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to get profile');
        expect(error.message).toContain('identity123');
      }
    });

    it('sendContactRequest() wraps errors with helpful context', async () => {
      const originalError = new Error('Insufficient balance');
      mockWasmSdk.documentCreate.mockRejectedValue(originalError);

      const options = {
        document,
        identityKey,
        signer,
      };

      try {
        await facade.sendContactRequest(options as any);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to send contact request');
      }
    });

    it('getContacts() wraps errors with identity context', async () => {
      const originalError = new Error('Network error');
      mockWasmSdk.getDocuments.mockRejectedValue(originalError);

      try {
        await facade.getContacts({ identityId: 'identity123' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to get contacts');
        expect(error.message).toContain('identity123');
      }
    });
  });

  describe('deriveContactKey()', () => {
    it('derives contact key using WASM SDK', async () => {
      const options = {
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        senderIdentityId: 'sender123',
        receiverIdentityId: 'receiver123',
        account: 0,
        addressIndex: 0,
        network: 'testnet',
      };

      await facade.deriveContactKey(options);

      expect(wasmModule.ensureInitialized).toHaveBeenCalled();
      expect(wasmModule.WasmSdk.deriveDashpayContactKey).toHaveBeenCalledOnce();
      const callArgs = (wasmModule.WasmSdk.deriveDashpayContactKey as Mock).mock.calls[0][0];
      expect(callArgs.senderIdentityId).toBe('sender123');
      expect(callArgs.receiverIdentityId).toBe('receiver123');
      expect(callArgs.account).toBe(0);
      expect(callArgs.addressIndex).toBe(0);
      expect(callArgs.network).toBe('testnet');
    });
  });
});
