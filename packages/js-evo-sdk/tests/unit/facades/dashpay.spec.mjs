import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('DashPayFacade', () => {
  let wasmSdk;
  let client;
  let document;
  let identityKey;
  let signer;
  let contract;

  beforeEach(async function setup() {
    await init();
    const builder = wasmSDKPackage.WasmSdkBuilder.testnetTrusted();
    wasmSdk = builder.build();
    client = EvoSDK.fromWasm(wasmSdk);

    // Create mock objects
    document = Object.create(wasmSDKPackage.Document.prototype);
    identityKey = Object.create(wasmSDKPackage.IdentityPublicKey.prototype);
    signer = Object.create(wasmSDKPackage.IdentitySigner.prototype);
    contract = Object.create(wasmSDKPackage.DataContract.prototype);

    // Stub query methods
    this.sinon.stub(wasmSdk, 'getDocuments').resolves(new Map([
      ['doc1', document],
    ]));
    this.sinon.stub(wasmSdk, 'getDocumentsWithProofInfo').resolves({
      data: new Map([['doc1', document]]),
      proof: {},
      metadata: {},
    });
    this.sinon.stub(wasmSdk, 'getDataContract').resolves(contract);

    // Stub document transition methods
    this.sinon.stub(wasmSdk, 'documentCreate').resolves();
    this.sinon.stub(wasmSdk, 'documentReplace').resolves();
  });

  describe('getContractId', () => {
    it('returns the default DashPay contract ID', () => {
      expect(client.dashpay.getContractId()).to.equal('Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7');
    });
  });

  describe('Profile Methods', () => {
    it('getProfile() fetches profile by identity ID', async () => {
      await client.dashpay.getProfile({
        identityId: 'identity123',
      });

      expect(wasmSdk.getDocuments).to.be.calledOnce();
      const callArgs = wasmSdk.getDocuments.firstCall.args[0];
      expect(callArgs.documentTypeName).to.equal('profile');
      expect(callArgs.where).to.deep.include(['$ownerId', '==', 'identity123']);
      expect(callArgs.limit).to.equal(1);
    });

    it('getProfile() returns undefined when no profile exists', async () => {
      wasmSdk.getDocuments.resolves(new Map());

      const result = await client.dashpay.getProfile({
        identityId: 'identity123',
      });

      expect(result).to.be.undefined();
    });

    it('getProfileWithProof() fetches profile with proof metadata', async () => {
      await client.dashpay.getProfileWithProof({
        identityId: 'identity123',
      });

      expect(wasmSdk.getDocumentsWithProofInfo).to.be.calledOnce();
      const callArgs = wasmSdk.getDocumentsWithProofInfo.firstCall.args[0];
      expect(callArgs.documentTypeName).to.equal('profile');
      expect(callArgs.where).to.deep.include(['$ownerId', '==', 'identity123']);
    });

    it('createProfile() calls documentCreate', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await client.dashpay.createProfile(options);

      expect(wasmSdk.documentCreate).to.be.calledOnceWithExactly(options);
    });

    it('updateProfile() calls documentReplace', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await client.dashpay.updateProfile(options);

      expect(wasmSdk.documentReplace).to.be.calledOnceWithExactly(options);
    });
  });

  describe('Contact Request Methods', () => {
    it('sendContactRequest() calls documentCreate', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await client.dashpay.sendContactRequest(options);

      expect(wasmSdk.documentCreate).to.be.calledOnceWithExactly(options);
    });

    it('acceptContactRequest() calls documentCreate', async () => {
      const options = {
        document,
        identityKey,
        signer,
      };

      await client.dashpay.acceptContactRequest(options);

      expect(wasmSdk.documentCreate).to.be.calledOnceWithExactly(options);
    });

    it('getInboundContactRequests() queries by toUserId', async () => {
      await client.dashpay.getInboundContactRequests({
        identityId: 'identity123',
        limit: 20,
      });

      expect(wasmSdk.getDocuments).to.be.calledOnce();
      const callArgs = wasmSdk.getDocuments.firstCall.args[0];
      expect(callArgs.documentTypeName).to.equal('contactRequest');
      expect(callArgs.where).to.deep.include(['toUserId', '==', 'identity123']);
      expect(callArgs.limit).to.equal(20);
    });

    it('getOutboundContactRequests() queries by $ownerId', async () => {
      await client.dashpay.getOutboundContactRequests({
        identityId: 'identity123',
        limit: 15,
      });

      expect(wasmSdk.getDocuments).to.be.calledOnce();
      const callArgs = wasmSdk.getDocuments.firstCall.args[0];
      expect(callArgs.documentTypeName).to.equal('contactRequest');
      expect(callArgs.where).to.deep.include(['$ownerId', '==', 'identity123']);
      expect(callArgs.limit).to.equal(15);
    });

    it('getInboundContactRequests() with pagination via startAfter', async () => {
      const startDate = new Date('2024-01-01');
      await client.dashpay.getInboundContactRequests({
        identityId: 'identity123',
        startAfter: startDate,
      });

      expect(wasmSdk.getDocuments).to.be.calledOnce();
      const callArgs = wasmSdk.getDocuments.firstCall.args[0];
      expect(callArgs.where).to.have.lengthOf(2);
      expect(callArgs.where[1]).to.deep.equal(['$createdAt', '>', startDate.getTime()]);
    });
  });

  describe('Contact Methods', () => {
    it('getContacts() queries contactInfo documents', async () => {
      await client.dashpay.getContacts({
        identityId: 'identity123',
        limit: 50,
      });

      expect(wasmSdk.getDocuments).to.be.calledOnce();
      const callArgs = wasmSdk.getDocuments.firstCall.args[0];
      expect(callArgs.documentTypeName).to.equal('contactInfo');
      expect(callArgs.where).to.deep.include(['$ownerId', '==', 'identity123']);
      expect(callArgs.limit).to.equal(50);
    });

    it('getContacts() uses default limit of 100', async () => {
      await client.dashpay.getContacts({
        identityId: 'identity123',
      });

      const callArgs = wasmSdk.getDocuments.firstCall.args[0];
      expect(callArgs.limit).to.equal(100);
    });

    it('getContactsWithProof() fetches contacts with proof metadata', async () => {
      await client.dashpay.getContactsWithProof({
        identityId: 'identity123',
      });

      expect(wasmSdk.getDocumentsWithProofInfo).to.be.calledOnce();
      const callArgs = wasmSdk.getDocumentsWithProofInfo.firstCall.args[0];
      expect(callArgs.documentTypeName).to.equal('contactInfo');
    });
  });

  describe('Helper Methods', () => {
    it('getContract() fetches DashPay contract', async () => {
      await client.dashpay.getContract();

      expect(wasmSdk.getDataContract).to.be.calledOnce();
      const contractId = wasmSdk.getDataContract.firstCall.args[0];
      expect(contractId).to.equal('Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7');
    });
  });

  describe('Error Handling', () => {
    it('getProfile() wraps errors with context', async function () {
      const originalError = new Error('Connection timeout');
      wasmSdk.getDocuments.rejects(originalError);

      try {
        await client.dashpay.getProfile({ identityId: 'identity123' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.include('Failed to get profile');
        expect(error.message).to.include('identity123');
        expect(error.cause).to.equal(originalError);
      }
    });

    it('sendContactRequest() wraps errors with helpful context', async function () {
      const originalError = new Error('Insufficient balance');
      wasmSdk.documentCreate.rejects(originalError);

      const options = {
        document,
        identityKey,
        signer,
      };

      try {
        await client.dashpay.sendContactRequest(options);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.include('Failed to send contact request');
        expect(error.message).to.include('Insufficient balance');
        expect(error.cause).to.equal(originalError);
      }
    });

    it('getContacts() wraps errors with identity context', async function () {
      const originalError = new Error('Network error');
      wasmSdk.getDocuments.rejects(originalError);

      try {
        await client.dashpay.getContacts({ identityId: 'identity123' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.include('Failed to get contacts');
        expect(error.message).to.include('identity123');
        expect(error.cause).to.equal(originalError);
      }
    });
  });

  describe('deriveContactKey()', () => {
    it('derives contact key using WASM SDK', async function () {
      // Note: This test verifies the method calls the WASM SDK correctly
      // The actual derivation is handled by the WASM module
      const deriveStub = this.sinon.stub(wasmSDKPackage.WasmSdk, 'deriveDashpayContactKey').resolves({
        address: 'testAddress',
        privateKeyWif: 'testKey',
      });

      try {
        await client.dashpay.deriveContactKey({
          mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
          senderIdentityId: 'sender123',
          receiverIdentityId: 'receiver123',
          account: 0,
          addressIndex: 0,
          network: 'testnet',
        });

        expect(deriveStub).to.be.calledOnce();
        expect(deriveStub.firstCall.args[0]).to.deep.include({
          senderIdentityId: 'sender123',
          receiverIdentityId: 'receiver123',
          account: 0,
          addressIndex: 0,
          network: 'testnet',
        });
      } finally {
        deriveStub.restore();
      }
    });
  });
});
