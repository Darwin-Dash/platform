/**
 * Unit tests for CreditOperations facade
 *
 * Tests credit transfer and withdrawal operations for identities.
 * Uses mocked WASM SDK to avoid network dependencies.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('CreditOperations', () => {
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
    sandbox.stub(wasmSdk, 'identityCreditTransfer');
    sandbox.stub(wasmSdk, 'identityCreditWithdrawal');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('creditTransfer()', () => {
    it('should transfer credits successfully', async () => {
      const mockResult = { transactionId: 'tx123', success: true };
      wasmSdk.identityCreditTransfer.resolves(mockResult);

      const result = await client.identities.creditTransfer({
        senderId: 'sender-id',
        recipientId: 'recipient-id',
        amount: 100000,
        privateKeyWif: 'test-wif',
      });

      expect(wasmSdk.identityCreditTransfer).to.have.been.calledOnce;
      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(callArgs[0]).to.equal('sender-id');
      expect(callArgs[1]).to.equal('recipient-id');
      expect(callArgs[2]).to.equal(BigInt(100000));
      expect(callArgs[3]).to.equal('test-wif');
      expect(callArgs[4]).to.be.null; // keyId default
      expect(result).to.deep.equal(mockResult);
    });

    it('should convert amount to BigInt from number', async () => {
      wasmSdk.identityCreditTransfer.resolves({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 50000,
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(typeof callArgs[2]).to.equal('bigint');
      expect(callArgs[2]).to.equal(BigInt(50000));
    });

    it('should convert amount to BigInt from string', async () => {
      wasmSdk.identityCreditTransfer.resolves({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: '75000',
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(typeof callArgs[2]).to.equal('bigint');
      expect(callArgs[2]).to.equal(BigInt(75000));
    });

    it('should convert amount to BigInt from bigint', async () => {
      wasmSdk.identityCreditTransfer.resolves({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: BigInt(25000),
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(typeof callArgs[2]).to.equal('bigint');
      expect(callArgs[2]).to.equal(BigInt(25000));
    });

    it('should support optional keyId parameter', async () => {
      wasmSdk.identityCreditTransfer.resolves({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
        keyId: 5,
      });

      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(callArgs[4]).to.equal(5);
    });

    it('should throw error when senderId is missing', async () => {
      await expect(client.identities.creditTransfer({
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Sender identity ID is required');

      await expect(client.identities.creditTransfer({
        senderId: '',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Sender identity ID is required');
    });

    it('should throw error when recipientId is missing', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        amount: 100000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Recipient identity ID is required');

      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: '',
        amount: 100000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Recipient identity ID is required');
    });

    it('should throw error when sender and recipient are the same', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'same-id',
        recipientId: 'same-id',
        amount: 100000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Cannot transfer credits to the same identity');
    });

    it('should throw error when amount is negative', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: -1000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Invalid amount for transfer: -1000');
    });

    it('should throw error when amount is not an integer', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 1000.5,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Invalid amount for transfer: 1000.5');
    });

    it('should throw error when amount exceeds maximum', async () => {
      const MAX_AMOUNT = 100_000_000_000;
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: MAX_AMOUNT + 1,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Amount exceeds maximum');
    });

    it('should throw error when privateKeyWif is missing', async () => {
      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
      })).to.be.rejectedWith('Private key (WIF) is required for signing');

      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: '',
      })).to.be.rejectedWith('Private key (WIF) is required for signing');
    });

    it('should wrap WASM SDK errors with descriptive message', async () => {
      wasmSdk.identityCreditTransfer.rejects(new Error('Insufficient balance'));

      await expect(client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 100000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Credit transfer failed: Insufficient balance');
    });
  });

  describe('creditWithdrawal()', () => {
    it('should withdraw credits successfully', async () => {
      const mockResult = { transactionId: 'tx456', success: true };
      wasmSdk.identityCreditWithdrawal.resolves(mockResult);

      const result = await client.identities.creditWithdrawal({
        identityId: 'identity-id',
        toAddress: 'yXxxx...',
        amount: 50000,
        privateKeyWif: 'test-wif',
      });

      expect(wasmSdk.identityCreditWithdrawal).to.have.been.calledOnce;
      const callArgs = wasmSdk.identityCreditWithdrawal.firstCall.args;
      expect(callArgs[0]).to.equal('identity-id');
      expect(callArgs[1]).to.equal('yXxxx...');
      expect(callArgs[2]).to.equal(BigInt(50000));
      expect(callArgs[3]).to.equal(1); // default coreFeePerByte
      expect(callArgs[4]).to.equal('test-wif');
      expect(callArgs[5]).to.be.null; // keyId default
      expect(result).to.deep.equal(mockResult);
    });

    it('should convert amount to BigInt from number', async () => {
      wasmSdk.identityCreditWithdrawal.resolves({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 30000,
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditWithdrawal.firstCall.args;
      expect(typeof callArgs[2]).to.equal('bigint');
      expect(callArgs[2]).to.equal(BigInt(30000));
    });

    it('should convert amount to BigInt from string', async () => {
      wasmSdk.identityCreditWithdrawal.resolves({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: '40000',
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditWithdrawal.firstCall.args;
      expect(typeof callArgs[2]).to.equal('bigint');
      expect(callArgs[2]).to.equal(BigInt(40000));
    });

    it('should support custom coreFeePerByte parameter', async () => {
      wasmSdk.identityCreditWithdrawal.resolves({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        coreFeePerByte: 5,
      });

      const callArgs = wasmSdk.identityCreditWithdrawal.firstCall.args;
      expect(callArgs[3]).to.equal(5);
    });

    it('should support optional keyId parameter', async () => {
      wasmSdk.identityCreditWithdrawal.resolves({});

      await client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        keyId: 3,
      });

      const callArgs = wasmSdk.identityCreditWithdrawal.firstCall.args;
      expect(callArgs[5]).to.equal(3);
    });

    it('should throw error when identityId is missing', async () => {
      await expect(client.identities.creditWithdrawal({
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Identity ID is required');

      await expect(client.identities.creditWithdrawal({
        identityId: '',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Identity ID is required');
    });

    it('should throw error when toAddress is missing', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        amount: 50000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Withdrawal address is required');

      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: '',
        amount: 50000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Withdrawal address is required');
    });

    it('should throw error when amount is negative', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: -500,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Invalid amount for withdrawal: -500');
    });

    it('should throw error when amount is not an integer', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 500.99,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Invalid amount for withdrawal: 500.99');
    });

    it('should throw error when amount exceeds maximum', async () => {
      const MAX_AMOUNT = 100_000_000_000;
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: MAX_AMOUNT + 1,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Amount exceeds maximum');
    });

    it('should throw error when privateKeyWif is missing', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
      })).to.be.rejectedWith('Private key (WIF) is required for signing');
    });

    it('should throw error for invalid coreFeePerByte', async () => {
      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        coreFeePerByte: -1,
      })).to.be.rejectedWith('Invalid coreFeePerByte: -1');

      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'addr',
        amount: 50000,
        privateKeyWif: 'wif',
        coreFeePerByte: 'not-a-number',
      })).to.be.rejectedWith('Invalid coreFeePerByte: not-a-number');
    });

    it('should wrap WASM SDK errors with descriptive message', async () => {
      wasmSdk.identityCreditWithdrawal.rejects(new Error('Invalid address'));

      await expect(client.identities.creditWithdrawal({
        identityId: 'id',
        toAddress: 'invalid',
        amount: 50000,
        privateKeyWif: 'wif',
      })).to.be.rejectedWith('Credit withdrawal failed: Invalid address');
    });
  });

  describe('Amount validation', () => {
    it('should accept zero amount', async () => {
      wasmSdk.identityCreditTransfer.resolves({});

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: 0,
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(callArgs[2]).to.equal(BigInt(0));
    });

    it('should accept maximum valid amount', async () => {
      wasmSdk.identityCreditTransfer.resolves({});
      const MAX_AMOUNT = 100_000_000_000;

      await client.identities.creditTransfer({
        senderId: 'sender',
        recipientId: 'recipient',
        amount: MAX_AMOUNT,
        privateKeyWif: 'wif',
      });

      const callArgs = wasmSdk.identityCreditTransfer.firstCall.args;
      expect(callArgs[2]).to.equal(BigInt(MAX_AMOUNT));
    });
  });
});
