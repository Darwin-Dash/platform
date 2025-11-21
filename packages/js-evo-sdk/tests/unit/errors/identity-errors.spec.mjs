/**
 * Unit tests for domain-specific error classes
 *
 * Tests all 12 identity operation error classes for:
 * - Proper inheritance from IdentityOperationError
 * - Correct property initialization
 * - Context propagation
 * - Helper method functionality
 */

import { expect } from 'chai';
import {
  IdentityOperationError,
  WalletSetupError,
  IdentityDiscoveryError,
  TransactionCreationError,
  TransactionBroadcastError,
  ConfirmationTimeoutError,
  AssetLockProofError,
  PlatformSubmissionError,
  ValidationError,
  InsufficientFundsError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  ErrorHelpers,
} from '../../../dist/identities/errors/identity-errors.js';

describe('Identity Error Classes', () => {
  describe('WalletSetupError', () => {
    it('should create error with all properties', () => {
      const error = new WalletSetupError(
        'key_derivation',
        'Failed to derive HD keys',
        true,
        { index: 5 }
      );

      expect(error).to.be.instanceOf(IdentityOperationError);
      expect(error).to.be.instanceOf(Error);
      expect(error.name).to.equal('WalletSetupError');
      expect(error.operation).to.equal('wallet_setup');
      expect(error.step).to.equal('key_derivation');
      expect(error.message).to.equal('Failed to derive HD keys');
      expect(error.recoverable).to.equal(true);
      expect(error.context).to.deep.equal({ index: 5 });
    });

    it('should use default values for optional parameters', () => {
      const error = new WalletSetupError('utxo_discovery', 'No UTXOs found');

      expect(error.recoverable).to.equal(false);
      expect(error.context).to.deep.equal({});
    });
  });

  describe('IdentityDiscoveryError', () => {
    it('should include address information in context', () => {
      const addresses = ['addr1', 'addr2'];
      const error = new IdentityDiscoveryError(
        'platform_query',
        'Platform query failed',
        addresses,
        true
      );

      expect(error.operation).to.equal('identity_discovery');
      expect(error.step).to.equal('platform_query');
      expect(error.addresses).to.deep.equal(addresses);
      expect(error.context.addressCount).to.equal(2);
    });

    it('should handle missing addresses', () => {
      const error = new IdentityDiscoveryError('hash_derivation', 'Hash derivation failed');

      expect(error.addresses).to.be.undefined;
      expect(error.context.addressCount).to.be.undefined;
    });
  });

  describe('TransactionCreationError', () => {
    it('should include amount in context', () => {
      const error = new TransactionCreationError(
        'coin_selection',
        'No suitable UTXOs',
        200000,
        false,
        { utxoCount: 0 }
      );

      expect(error.operation).to.equal('transaction_creation');
      expect(error.step).to.equal('coin_selection');
      expect(error.amount).to.equal(200000);
      expect(error.context.amount).to.equal(200000);
      expect(error.context.utxoCount).to.equal(0);
    });
  });

  describe('TransactionBroadcastError', () => {
    it('should be recoverable by default', () => {
      const error = new TransactionBroadcastError(
        'Network error',
        'tx123'
      );

      expect(error.step).to.equal('dapi_broadcast');
      expect(error.transactionId).to.equal('tx123');
      expect(error.recoverable).to.equal(true);
      expect(error.context.transactionId).to.equal('tx123');
    });

    it('should allow non-recoverable broadcast errors', () => {
      const error = new TransactionBroadcastError(
        'Invalid transaction',
        'tx456',
        false
      );

      expect(error.recoverable).to.equal(false);
    });
  });

  describe('ConfirmationTimeoutError', () => {
    it('should include transaction ID and elapsed time', () => {
      const error = new ConfirmationTimeoutError(
        'txabc',
        'Timeout waiting for lock',
        60000
      );

      expect(error.operation).to.equal('confirmation_wait');
      expect(error.step).to.equal('timeout');
      expect(error.transactionId).to.equal('txabc');
      expect(error.elapsedMs).to.equal(60000);
      expect(error.recoverable).to.equal(true);
      expect(error.context.elapsedMs).to.equal(60000);
    });

    it('should generate default message from transaction ID', () => {
      const error = new ConfirmationTimeoutError('tx123');

      expect(error.message).to.include('tx123');
      expect(error.message).to.include('timeout');
    });
  });

  describe('AssetLockProofError', () => {
    it('should create proof generation error', () => {
      const error = new AssetLockProofError(
        'proof_generation',
        'Failed to generate proof',
        'tx789',
        false,
        { proofType: 'instantlock' }
      );

      expect(error.operation).to.equal('asset_lock_proof');
      expect(error.step).to.equal('proof_generation');
      expect(error.transactionId).to.equal('tx789');
      expect(error.context.proofType).to.equal('instantlock');
    });
  });

  describe('PlatformSubmissionError', () => {
    it('should create identity creation submission error', () => {
      const error = new PlatformSubmissionError(
        'identity_create',
        'Platform rejected identity',
        'identityXYZ',
        false
      );

      expect(error.operation).to.equal('platform_submission');
      expect(error.step).to.equal('identity_create');
      expect(error.identityId).to.equal('identityXYZ');
      expect(error.context.identityId).to.equal('identityXYZ');
    });
  });

  describe('ValidationError', () => {
    it('should include field information', () => {
      const error = new ValidationError(
        'mnemonic_validation',
        'Invalid mnemonic',
        'mnemonic',
        false,
        { wordCount: 11 }
      );

      expect(error.operation).to.equal('validation');
      expect(error.step).to.equal('mnemonic_validation');
      expect(error.field).to.equal('mnemonic');
      expect(error.context.field).to.equal('mnemonic');
      expect(error.context.wordCount).to.equal(11);
    });
  });

  describe('InsufficientFundsError', () => {
    it('should calculate shortfall and provide user message', () => {
      const error = new InsufficientFundsError(
        'Not enough funds',
        250000,
        150000
      );

      expect(error.operation).to.equal('transaction_creation');
      expect(error.step).to.equal('insufficient_funds');
      expect(error.requiredAmount).to.equal(250000);
      expect(error.availableAmount).to.equal(150000);
      expect(error.context.shortfall).to.equal(100000);

      const userMsg = error.getUserMessage();
      expect(userMsg).to.include('250000');
      expect(userMsg).to.include('150000');
      expect(userMsg).to.include('100000');
    });

    it('should handle exact match (zero shortfall)', () => {
      const error = new InsufficientFundsError('Exact match', 100000, 100000);

      expect(error.context.shortfall).to.equal(0);
    });
  });

  describe('NetworkError', () => {
    it('should be recoverable by default', () => {
      const error = new NetworkError(
        'dapi_connect',
        'Connection refused'
      );

      expect(error.operation).to.equal('network');
      expect(error.step).to.equal('dapi_connect');
      expect(error.recoverable).to.equal(true);
    });

    it('should allow non-recoverable network errors', () => {
      const error = new NetworkError(
        'dapi_query',
        'Invalid query',
        false
      );

      expect(error.recoverable).to.equal(false);
    });
  });

  describe('TimeoutError', () => {
    it('should include timeout duration in context', () => {
      const error = new TimeoutError(
        'identity_creation',
        'confirmation_wait',
        120000,
        'Operation timed out after 120 seconds'
      );

      expect(error.operation).to.equal('identity_creation');
      expect(error.step).to.equal('confirmation_wait');
      expect(error.timeoutMs).to.equal(120000);
      expect(error.context.timeoutMs).to.equal(120000);
      expect(error.recoverable).to.equal(true);
    });

    it('should generate default message from timeout value', () => {
      const error = new TimeoutError('test_op', 'test_step', 60000);

      expect(error.message).to.include('60000ms');
    });
  });

  describe('ConfigurationError', () => {
    it('should include config key information', () => {
      const error = new ConfigurationError(
        'network',
        'Invalid network configuration'
      );

      expect(error.operation).to.equal('configuration');
      expect(error.step).to.equal('invalid_config');
      expect(error.configKey).to.equal('network');
      expect(error.context.configKey).to.equal('network');
      expect(error.recoverable).to.equal(false);
    });
  });

  describe('Base IdentityOperationError', () => {
    // Create concrete class for testing abstract base
    class TestError extends IdentityOperationError {
      constructor() {
        super('test_operation', 'test_step', 'Test message', true, { foo: 'bar' });
      }
    }

    it('should initialize all base properties', () => {
      const error = new TestError();

      expect(error.operation).to.equal('test_operation');
      expect(error.step).to.equal('test_step');
      expect(error.message).to.equal('Test message');
      expect(error.recoverable).to.equal(true);
      expect(error.context).to.deep.equal({ foo: 'bar' });
    });

    it('should implement getUserMessage', () => {
      const error = new TestError();
      expect(error.getUserMessage()).to.equal('Test message');
    });

    it('should implement getDetails', () => {
      const error = new TestError();
      const details = error.getDetails();

      expect(details.name).to.equal('TestError');
      expect(details.operation).to.equal('test_operation');
      expect(details.step).to.equal('test_step');
      expect(details.message).to.equal('Test message');
      expect(details.recoverable).to.equal(true);
      expect(details.context).to.deep.equal({ foo: 'bar' });
    });

    it('should capture stack trace', () => {
      const error = new TestError();
      expect(error.stack).to.be.a('string');
      expect(error.stack).to.include('TestError');
    });
  });

  describe('ErrorHelpers', () => {
    describe('isRecoverable()', () => {
      it('should identify recoverable IdentityOperationError', () => {
        const error = new NetworkError('dapi_connect', 'Connection failed', true);
        expect(ErrorHelpers.isRecoverable(error)).to.equal(true);
      });

      it('should identify non-recoverable IdentityOperationError', () => {
        const error = new ValidationError('mnemonic_validation', 'Invalid mnemonic', 'mnemonic', false);
        expect(ErrorHelpers.isRecoverable(error)).to.equal(false);
      });

      it('should identify generic network errors as recoverable', () => {
        const error = new Error('network connection failed');
        expect(ErrorHelpers.isRecoverable(error)).to.equal(true);
      });

      it('should identify non-network generic errors as non-recoverable', () => {
        const error = new Error('Something went wrong');
        expect(ErrorHelpers.isRecoverable(error)).to.equal(false);
      });

      it('should handle non-Error objects', () => {
        expect(ErrorHelpers.isRecoverable('string error')).to.equal(false);
        expect(ErrorHelpers.isRecoverable(null)).to.equal(false);
        expect(ErrorHelpers.isRecoverable(undefined)).to.equal(false);
        expect(ErrorHelpers.isRecoverable(123)).to.equal(false);
      });
    });

    describe('getUserMessage()', () => {
      it('should get message from IdentityOperationError', () => {
        const error = new NetworkError('dapi_query', 'Connection timeout');
        const message = ErrorHelpers.getUserMessage(error);

        expect(message).to.equal('Connection timeout');
      });

      it('should get message from generic Error', () => {
        const error = new Error('Generic error message');
        const message = ErrorHelpers.getUserMessage(error);

        expect(message).to.equal('Generic error message');
      });

      it('should convert non-Error to string', () => {
        expect(ErrorHelpers.getUserMessage('string error')).to.equal('string error');
        expect(ErrorHelpers.getUserMessage(123)).to.equal('123');
        expect(ErrorHelpers.getUserMessage(null)).to.equal('null');
      });
    });

    describe('getDetails()', () => {
      it('should get full details from IdentityOperationError', () => {
        const error = new ValidationError('mnemonic_validation', 'Invalid mnemonic', 'mnemonic');
        const details = ErrorHelpers.getDetails(error);

        expect(details.name).to.equal('ValidationError');
        expect(details.operation).to.equal('validation');
        expect(details.step).to.equal('mnemonic_validation');
        expect(details.message).to.equal('Invalid mnemonic');
      });

      it('should get basic details from generic Error', () => {
        const error = new Error('Some error');
        const details = ErrorHelpers.getDetails(error);

        expect(details.name).to.equal('Error');
        expect(details.message).to.equal('Some error');
        expect(details.stack).to.be.a('string');
      });

      it('should handle non-Error objects', () => {
        const details1 = ErrorHelpers.getDetails('error string');
        expect(details1.error).to.equal('error string');

        const details2 = ErrorHelpers.getDetails(null);
        expect(details2.error).to.be.null;
      });
    });
  });

  describe('Error context propagation', () => {
    it('should merge context with custom properties', () => {
      const error = new IdentityDiscoveryError(
        'batch_discovery',
        'Batch failed',
        ['addr1', 'addr2'],
        true,
        { batchSize: 50 }
      );

      expect(error.context).to.deep.equal({
        batchSize: 50,
        addressCount: 2,
      });
    });

    it('should include amount in TransactionCreationError context', () => {
      const error = new TransactionCreationError(
        'signing',
        'Signing failed',
        300000,
        false,
        { keyIndex: 0 }
      );

      expect(error.context.amount).to.equal(300000);
      expect(error.context.keyIndex).to.equal(0);
    });

    it('should calculate shortfall for InsufficientFundsError', () => {
      const error = new InsufficientFundsError('Not enough', 500000, 400000);

      expect(error.context.requiredAmount).to.equal(500000);
      expect(error.context.availableAmount).to.equal(400000);
      expect(error.context.shortfall).to.equal(100000);
    });
  });

  describe('Error details', () => {
    it('should provide complete details via getDetails()', () => {
      const error = new PlatformSubmissionError(
        'identity_topup',
        'Top-up rejected',
        'id123',
        false,
        { reason: 'insufficient balance' }
      );

      const details = error.getDetails();

      expect(details.name).to.equal('PlatformSubmissionError');
      expect(details.operation).to.equal('platform_submission');
      expect(details.step).to.equal('identity_topup');
      expect(details.message).to.equal('Top-up rejected');
      expect(details.recoverable).to.equal(false);
      expect(details.context).to.deep.equal({
        reason: 'insufficient balance',
        identityId: 'id123',
      });
    });
  });

  describe('All error classes', () => {
    const errorClasses = [
      { Class: WalletSetupError, step: 'test_step', args: [] },
      { Class: IdentityDiscoveryError, step: 'test_step', args: [undefined] },
      { Class: TransactionCreationError, step: 'test_step', args: [undefined] },
      { Class: TransactionBroadcastError, step: null, args: ['tx'] },
      { Class: ConfirmationTimeoutError, step: null, args: ['tx'] },
      { Class: AssetLockProofError, step: 'test_step', args: ['tx'] },
      { Class: PlatformSubmissionError, step: 'test_step', args: ['id'] },
      { Class: ValidationError, step: 'test_step', args: ['field'] },
      { Class: InsufficientFundsError, step: null, args: [100, 50] },
      { Class: NetworkError, step: 'test_step', args: [] },
      { Class: TimeoutError, step: null, args: ['op', 'step', 5000] },
      { Class: ConfigurationError, step: null, args: ['key'] },
    ];

    it('should all extend IdentityOperationError', () => {
      errorClasses.forEach(({ Class, step, args }) => {
        const constructorArgs = step ? [step, 'test message', ...args] : ['test message', ...args];
        const error = new Class(...constructorArgs);

        expect(error).to.be.instanceOf(IdentityOperationError);
        expect(error).to.be.instanceOf(Error);
        expect(error.name).to.equal(Class.name);
      });
    });
  });
});
