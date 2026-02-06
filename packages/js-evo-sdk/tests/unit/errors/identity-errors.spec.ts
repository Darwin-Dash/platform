/**
 * Unit tests for domain-specific error classes
 *
 * Tests all 12 identity operation error classes for:
 * - Proper inheritance from IdentityOperationError
 * - Correct property initialization
 * - Context propagation
 * - Helper method functionality
 */

import { describe, it, expect } from 'vitest';
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

      expect(error).toBeInstanceOf(IdentityOperationError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('WalletSetupError');
      expect(error.operation).toBe('wallet_setup');
      expect(error.step).toBe('key_derivation');
      expect(error.message).toBe('Failed to derive HD keys');
      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual({ index: 5 });
    });

    it('should use default values for optional parameters', () => {
      const error = new WalletSetupError('utxo_discovery', 'No UTXOs found');

      expect(error.recoverable).toBe(false);
      expect(error.context).toEqual({});
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

      expect(error.operation).toBe('identity_discovery');
      expect(error.step).toBe('platform_query');
      expect(error.addresses).toEqual(addresses);
      expect(error.context.addressCount).toBe(2);
    });

    it('should handle missing addresses', () => {
      const error = new IdentityDiscoveryError('hash_derivation', 'Hash derivation failed');

      expect(error.addresses).toBeUndefined();
      expect(error.context.addressCount).toBeUndefined();
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

      expect(error.operation).toBe('transaction_creation');
      expect(error.step).toBe('coin_selection');
      expect(error.amount).toBe(200000);
      expect(error.context.amount).toBe(200000);
      expect(error.context.utxoCount).toBe(0);
    });
  });

  describe('TransactionBroadcastError', () => {
    it('should be recoverable by default', () => {
      const error = new TransactionBroadcastError(
        'Network error',
        'tx123'
      );

      expect(error.step).toBe('dapi_broadcast');
      expect(error.transactionId).toBe('tx123');
      expect(error.recoverable).toBe(true);
      expect(error.context.transactionId).toBe('tx123');
    });

    it('should allow non-recoverable broadcast errors', () => {
      const error = new TransactionBroadcastError(
        'Invalid transaction',
        'tx456',
        false
      );

      expect(error.recoverable).toBe(false);
    });
  });

  describe('ConfirmationTimeoutError', () => {
    it('should include transaction ID and elapsed time', () => {
      const error = new ConfirmationTimeoutError(
        'txabc',
        'Timeout waiting for lock',
        60000
      );

      expect(error.operation).toBe('confirmation_wait');
      expect(error.step).toBe('timeout');
      expect(error.transactionId).toBe('txabc');
      expect(error.elapsedMs).toBe(60000);
      expect(error.recoverable).toBe(true);
      expect(error.context.elapsedMs).toBe(60000);
    });

    it('should generate default message from transaction ID', () => {
      const error = new ConfirmationTimeoutError('tx123');

      expect(error.message).toContain('tx123');
      expect(error.message.toLowerCase()).toContain('timeout');
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

      expect(error.operation).toBe('asset_lock_proof');
      expect(error.step).toBe('proof_generation');
      expect(error.transactionId).toBe('tx789');
      expect(error.context.proofType).toBe('instantlock');
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

      expect(error.operation).toBe('platform_submission');
      expect(error.step).toBe('identity_create');
      expect(error.identityId).toBe('identityXYZ');
      expect(error.context.identityId).toBe('identityXYZ');
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

      expect(error.operation).toBe('validation');
      expect(error.step).toBe('mnemonic_validation');
      expect(error.field).toBe('mnemonic');
      expect(error.context.field).toBe('mnemonic');
      expect(error.context.wordCount).toBe(11);
    });
  });

  describe('InsufficientFundsError', () => {
    it('should calculate shortfall and provide user message', () => {
      const error = new InsufficientFundsError(
        'Not enough funds',
        250000,
        150000
      );

      expect(error.operation).toBe('transaction_creation');
      expect(error.step).toBe('insufficient_funds');
      expect(error.requiredAmount).toBe(250000);
      expect(error.availableAmount).toBe(150000);
      expect(error.context.shortfall).toBe(100000);

      const userMsg = error.getUserMessage();
      expect(userMsg).toContain('250000');
      expect(userMsg).toContain('150000');
      expect(userMsg).toContain('100000');
    });

    it('should handle exact match (zero shortfall)', () => {
      const error = new InsufficientFundsError('Exact match', 100000, 100000);

      expect(error.context.shortfall).toBe(0);
    });
  });

  describe('NetworkError', () => {
    it('should be recoverable by default', () => {
      const error = new NetworkError(
        'dapi_connect',
        'Connection refused'
      );

      expect(error.operation).toBe('network');
      expect(error.step).toBe('dapi_connect');
      expect(error.recoverable).toBe(true);
    });

    it('should allow non-recoverable network errors', () => {
      const error = new NetworkError(
        'dapi_query',
        'Invalid query',
        false
      );

      expect(error.recoverable).toBe(false);
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

      expect(error.operation).toBe('identity_creation');
      expect(error.step).toBe('confirmation_wait');
      expect(error.timeoutMs).toBe(120000);
      expect(error.context.timeoutMs).toBe(120000);
      expect(error.recoverable).toBe(true);
    });

    it('should generate default message from timeout value', () => {
      const error = new TimeoutError('test_op', 'test_step', 60000);

      expect(error.message).toContain('60000ms');
    });
  });

  describe('ConfigurationError', () => {
    it('should include config key information', () => {
      const error = new ConfigurationError(
        'network',
        'Invalid network configuration'
      );

      expect(error.operation).toBe('configuration');
      expect(error.step).toBe('invalid_config');
      expect(error.configKey).toBe('network');
      expect(error.context.configKey).toBe('network');
      expect(error.recoverable).toBe(false);
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

      expect(error.operation).toBe('test_operation');
      expect(error.step).toBe('test_step');
      expect(error.message).toBe('Test message');
      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual({ foo: 'bar' });
    });

    it('should implement getUserMessage', () => {
      const error = new TestError();
      expect(error.getUserMessage()).toBe('Test message');
    });

    it('should implement getDetails', () => {
      const error = new TestError();
      const details = error.getDetails();

      expect(details.name).toBe('TestError');
      expect(details.operation).toBe('test_operation');
      expect(details.step).toBe('test_step');
      expect(details.message).toBe('Test message');
      expect(details.recoverable).toBe(true);
      expect(details.context).toEqual({ foo: 'bar' });
    });

    it('should capture stack trace', () => {
      const error = new TestError();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('TestError');
    });
  });

  describe('ErrorHelpers', () => {
    describe('isRecoverable()', () => {
      it('should identify recoverable IdentityOperationError', () => {
        const error = new NetworkError('dapi_connect', 'Connection failed', true);
        expect(ErrorHelpers.isRecoverable(error)).toBe(true);
      });

      it('should identify non-recoverable IdentityOperationError', () => {
        const error = new ValidationError('mnemonic_validation', 'Invalid mnemonic', 'mnemonic', false);
        expect(ErrorHelpers.isRecoverable(error)).toBe(false);
      });

      it('should identify generic network errors as recoverable', () => {
        const error = new Error('network connection failed');
        expect(ErrorHelpers.isRecoverable(error)).toBe(true);
      });

      it('should identify non-network generic errors as non-recoverable', () => {
        const error = new Error('Something went wrong');
        expect(ErrorHelpers.isRecoverable(error)).toBe(false);
      });

      it('should handle non-Error objects', () => {
        expect(ErrorHelpers.isRecoverable('string error')).toBe(false);
        expect(ErrorHelpers.isRecoverable(null)).toBe(false);
        expect(ErrorHelpers.isRecoverable(undefined)).toBe(false);
        expect(ErrorHelpers.isRecoverable(123)).toBe(false);
      });
    });

    describe('getUserMessage()', () => {
      it('should get message from IdentityOperationError', () => {
        const error = new NetworkError('dapi_query', 'Connection timeout');
        const message = ErrorHelpers.getUserMessage(error);

        expect(message).toBe('Connection timeout');
      });

      it('should get message from generic Error', () => {
        const error = new Error('Generic error message');
        const message = ErrorHelpers.getUserMessage(error);

        expect(message).toBe('Generic error message');
      });

      it('should convert non-Error to string', () => {
        expect(ErrorHelpers.getUserMessage('string error')).toBe('string error');
        expect(ErrorHelpers.getUserMessage(123)).toBe('123');
        expect(ErrorHelpers.getUserMessage(null)).toBe('null');
      });
    });

    describe('getDetails()', () => {
      it('should get full details from IdentityOperationError', () => {
        const error = new ValidationError('mnemonic_validation', 'Invalid mnemonic', 'mnemonic');
        const details = ErrorHelpers.getDetails(error);

        expect(details.name).toBe('ValidationError');
        expect(details.operation).toBe('validation');
        expect(details.step).toBe('mnemonic_validation');
        expect(details.message).toBe('Invalid mnemonic');
      });

      it('should get basic details from generic Error', () => {
        const error = new Error('Some error');
        const details = ErrorHelpers.getDetails(error);

        expect(details.name).toBe('Error');
        expect(details.message).toBe('Some error');
        expect(typeof details.stack).toBe('string');
      });

      it('should handle non-Error objects', () => {
        const details1 = ErrorHelpers.getDetails('error string');
        expect(details1.error).toBe('error string');

        const details2 = ErrorHelpers.getDetails(null);
        expect(details2.error).toBeNull();
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

      expect(error.context).toEqual({
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

      expect(error.context.amount).toBe(300000);
      expect(error.context.keyIndex).toBe(0);
    });

    it('should calculate shortfall for InsufficientFundsError', () => {
      const error = new InsufficientFundsError('Not enough', 500000, 400000);

      expect(error.context.requiredAmount).toBe(500000);
      expect(error.context.availableAmount).toBe(400000);
      expect(error.context.shortfall).toBe(100000);
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

      expect(details.name).toBe('PlatformSubmissionError');
      expect(details.operation).toBe('platform_submission');
      expect(details.step).toBe('identity_topup');
      expect(details.message).toBe('Top-up rejected');
      expect(details.recoverable).toBe(false);
      expect(details.context).toEqual({
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
        // @ts-expect-error - Dynamic constructor call
        const error = new Class(...constructorArgs);

        expect(error).toBeInstanceOf(IdentityOperationError);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe(Class.name);
      });
    });
  });
});
