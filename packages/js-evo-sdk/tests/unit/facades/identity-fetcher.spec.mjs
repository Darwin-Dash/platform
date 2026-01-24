/**
 * Unit tests for IdentityFetcher facade
 *
 * Tests the read-only operations for fetching and retrieving identity information.
 * Uses mocked WASM SDK to avoid network dependencies.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('IdentityFetcher', () => {
  let wasmSdk;
  let client;
  let sandbox;

  beforeEach(async function setup() {
    await init();
    const builder = wasmSDKPackage.WasmSdkBuilder.testnetTrusted();
    wasmSdk = builder.build();
    client = EvoSDK.fromWasm(wasmSdk);
    sandbox = sinon.createSandbox();

    // Stub WASM SDK methods
    sandbox.stub(wasmSdk, 'getIdentity');
    sandbox.stub(wasmSdk, 'getIdentityWithProofInfo');
    sandbox.stub(wasmSdk, 'getIdentityUnproved');
    sandbox.stub(wasmSdk, 'getIdentityKeys');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('fetch()', () => {
    it('should fetch identity by ID successfully', async () => {
      const mockIdentity = { id: 'test-id', balance: 100 };
      wasmSdk.getIdentity.resolves(mockIdentity);

      const result = await client.identities.fetch('test-id');

      expect(wasmSdk.getIdentity).to.have.been.calledOnceWithExactly('test-id');
      expect(result).to.deep.equal(mockIdentity);
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.fetch()).to.be.rejectedWith('Identity ID is required');
      await expect(client.identities.fetch('')).to.be.rejectedWith('Identity ID is required');
      await expect(client.identities.fetch(null)).to.be.rejectedWith('Identity ID is required');
    });

    it('should throw error when identity not found', async () => {
      wasmSdk.getIdentity.resolves(null);

      await expect(client.identities.fetch('non-existent-id'))
        .to.be.rejectedWith('Identity not found: non-existent-id');
    });

    it('should wrap WASM SDK errors with descriptive message', async () => {
      wasmSdk.getIdentity.rejects(new Error('Network timeout'));

      await expect(client.identities.fetch('test-id'))
        .to.be.rejectedWith('Failed to fetch identity: Network timeout');
    });
  });

  describe('fetchWithProof()', () => {
    it('should fetch identity with proof successfully', async () => {
      const mockIdentityWithProof = {
        identity: { id: 'test-id', balance: 100 },
        proof: { signature: 'abc123' },
      };
      wasmSdk.getIdentityWithProofInfo.resolves(mockIdentityWithProof);

      const result = await client.identities.fetchWithProof('test-id');

      expect(wasmSdk.getIdentityWithProofInfo).to.have.been.calledOnceWithExactly('test-id');
      expect(result).to.deep.equal(mockIdentityWithProof);
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.fetchWithProof()).to.be.rejectedWith('Identity ID is required');
      await expect(client.identities.fetchWithProof('')).to.be.rejectedWith('Identity ID is required');
    });

    it('should throw error when identity not found', async () => {
      wasmSdk.getIdentityWithProofInfo.resolves(null);

      await expect(client.identities.fetchWithProof('non-existent-id'))
        .to.be.rejectedWith('Identity not found: non-existent-id');
    });
  });

  describe('fetchUnproved()', () => {
    it('should fetch unproved identity successfully', async () => {
      const mockIdentity = { id: 'test-id', balance: 100 };
      wasmSdk.getIdentityUnproved.resolves(mockIdentity);

      const result = await client.identities.fetchUnproved('test-id');

      expect(wasmSdk.getIdentityUnproved).to.have.been.calledOnceWithExactly('test-id');
      expect(result).to.deep.equal(mockIdentity);
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.fetchUnproved()).to.be.rejectedWith('Identity ID is required');
    });

    it('should throw error when identity not found', async () => {
      wasmSdk.getIdentityUnproved.resolves(null);

      await expect(client.identities.fetchUnproved('non-existent-id'))
        .to.be.rejectedWith('Identity not found: non-existent-id');
    });
  });

  describe('getKeys()', () => {
    it('should get all keys successfully', async () => {
      const mockKeys = [
        { id: 1, type: 'ECDSA_SECP256K1', purpose: 'AUTHENTICATION' },
        { id: 2, type: 'BLS12_381', purpose: 'TRANSFER' },
      ];
      wasmSdk.getIdentityKeys.resolves(mockKeys);

      const result = await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'all',
      });

      expect(wasmSdk.getIdentityKeys).to.have.been.calledOnce;
      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[0]).to.equal('test-id');
      expect(callArgs[1]).to.equal('all');
      expect(callArgs[2]).to.be.null;
      expect(callArgs[3]).to.be.null;
      expect(callArgs[4]).to.be.null;
      expect(callArgs[5]).to.be.null;
      expect(result).to.deep.equal(mockKeys);
    });

    it('should get specific keys with Uint32Array conversion', async () => {
      const mockKeys = [{ id: 1, type: 'ECDSA_SECP256K1' }];
      wasmSdk.getIdentityKeys.resolves(mockKeys);

      await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'specific',
        specificKeyIds: [1, 2, 3],
      });

      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[0]).to.equal('test-id');
      expect(callArgs[1]).to.equal('specific');
      expect(callArgs[2]).to.be.instanceOf(Uint32Array);
      expect(Array.from(callArgs[2])).to.deep.equal([1, 2, 3]);
    });

    it('should search keys by purpose map with JSON serialization', async () => {
      const mockKeys = [{ id: 1, purpose: 'AUTHENTICATION' }];
      wasmSdk.getIdentityKeys.resolves(mockKeys);

      const purposeMap = { AUTHENTICATION: [1, 2] };
      await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'search',
        searchPurposeMap: purposeMap,
      });

      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[0]).to.equal('test-id');
      expect(callArgs[1]).to.equal('search');
      expect(callArgs[3]).to.equal(JSON.stringify(purposeMap));
    });

    it('should support pagination with limit and offset', async () => {
      wasmSdk.getIdentityKeys.resolves([]);

      await client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'all',
        limit: 10,
        offset: 5,
      });

      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[4]).to.equal(10); // limit
      expect(callArgs[5]).to.equal(5);  // offset
    });

    it('should throw error when identity ID is missing', async () => {
      await expect(client.identities.getKeys({
        keyRequestType: 'all',
      })).to.be.rejectedWith('Identity ID is required');
    });

    it('should throw error for invalid keyRequestType', async () => {
      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'invalid',
      })).to.be.rejectedWith('Invalid keyRequestType: invalid');
    });

    it('should throw error when specificKeyIds missing for specific type', async () => {
      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'specific',
      })).to.be.rejectedWith('specificKeyIds is required when keyRequestType is "specific"');

      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'specific',
        specificKeyIds: [],
      })).to.be.rejectedWith('specificKeyIds is required when keyRequestType is "specific"');
    });

    it('should throw error when searchPurposeMap missing for search type', async () => {
      await expect(client.identities.getKeys({
        identityId: 'test-id',
        keyRequestType: 'search',
      })).to.be.rejectedWith('searchPurposeMap is required when keyRequestType is "search"');
    });
  });

  describe('getKey()', () => {
    it('should get a single key by ID', async () => {
      const mockKey = { id: 5, type: 'ECDSA_SECP256K1' };
      wasmSdk.getIdentityKeys.resolves([mockKey]);

      // getKey is on the fetcher, not exposed on main facade
      const fetcher = client.identities.fetcher;
      const result = await fetcher.getKey('test-id', 5);

      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[0]).to.equal('test-id');
      expect(callArgs[1]).to.equal('specific');
      expect(Array.from(callArgs[2])).to.deep.equal([5]);
      expect(result).to.deep.equal([mockKey]);
    });

    it('should throw error for invalid keyId', async () => {
      const fetcher = client.identities.fetcher;
      await expect(fetcher.getKey('test-id', -1))
        .to.be.rejectedWith('Invalid keyId: -1');

      await expect(fetcher.getKey('test-id', 'not-a-number'))
        .to.be.rejectedWith('Invalid keyId: not-a-number');
    });
  });

  describe('listKeys()', () => {
    it('should list all keys with default pagination', async () => {
      const mockKeys = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      wasmSdk.getIdentityKeys.resolves(mockKeys);

      const fetcher = client.identities.fetcher;
      const result = await fetcher.listKeys('test-id');

      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[0]).to.equal('test-id');
      expect(callArgs[1]).to.equal('all');
      expect(callArgs[4]).to.equal(100);  // default limit
      expect(callArgs[5]).to.equal(0);    // default offset
      expect(result).to.deep.equal(mockKeys);
    });

    it('should support custom pagination', async () => {
      wasmSdk.getIdentityKeys.resolves([]);

      const fetcher = client.identities.fetcher;
      await fetcher.listKeys('test-id', 50, 10);

      const callArgs = wasmSdk.getIdentityKeys.firstCall.args;
      expect(callArgs[4]).to.equal(50);   // custom limit
      expect(callArgs[5]).to.equal(10);   // custom offset
    });

    it('should throw error for invalid limit', async () => {
      const fetcher = client.identities.fetcher;
      await expect(fetcher.listKeys('test-id', 0))
        .to.be.rejectedWith('Invalid limit: 0');

      await expect(fetcher.listKeys('test-id', -10))
        .to.be.rejectedWith('Invalid limit: -10');
    });

    it('should throw error for invalid offset', async () => {
      const fetcher = client.identities.fetcher;
      await expect(fetcher.listKeys('test-id', 100, -5))
        .to.be.rejectedWith('Invalid offset: -5');
    });
  });

  describe('Error handling', () => {
    it('should wrap network errors consistently across all methods', async () => {
      const networkError = new Error('Connection refused');

      wasmSdk.getIdentity.rejects(networkError);
      wasmSdk.getIdentityWithProofInfo.rejects(networkError);
      wasmSdk.getIdentityUnproved.rejects(networkError);
      wasmSdk.getIdentityKeys.rejects(networkError);

      await expect(client.identities.fetch('id'))
        .to.be.rejectedWith('Failed to fetch identity: Connection refused');

      await expect(client.identities.fetchWithProof('id'))
        .to.be.rejectedWith('Failed to fetch identity: Connection refused');

      await expect(client.identities.fetchUnproved('id'))
        .to.be.rejectedWith('Failed to fetch identity: Connection refused');

      await expect(client.identities.getKeys({ identityId: 'id', keyRequestType: 'all' }))
        .to.be.rejectedWith('Failed to get identity keys: Connection refused');
    });
  });
});
