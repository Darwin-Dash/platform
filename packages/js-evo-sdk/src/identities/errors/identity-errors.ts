/**
 * Domain-Specific Error Classes for Identity Operations
 *
 * Provides semantic error types that allow callers to:
 * - Understand exactly what went wrong
 * - Implement retry logic based on error type
 * - Display appropriate user messages
 * - Log errors with proper context
 */

/**
 * Base class for all identity operation errors
 * Provides common error handling patterns
 */
export abstract class IdentityOperationError extends Error {
  /**
   * @param operation Name of the operation that failed (e.g., 'identity_creation')
   * @param step Step within the operation (e.g., 'wallet_setup', 'broadcast')
   * @param message Human-readable error message
   * @param recoverable Whether operation can be retried
   * @param context Additional context for debugging
   */
  constructor(
    public operation: string,
    public step: string,
    message: string,
    public recoverable: boolean = false,
    public context: Record<string, any> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Get developer-friendly error details
   */
  getDetails(): Record<string, any> {
    return {
      name: this.name,
      operation: this.operation,
      step: this.step,
      message: this.message,
      recoverable: this.recoverable,
      context: this.context,
    };
  }
}

/**
 * Wallet setup errors
 * Raised when wallet initialization, key derivation, or UTXO discovery fails
 */
export class WalletSetupError extends IdentityOperationError {
  constructor(
    step: 'key_derivation' | 'dapi_connection' | 'utxo_discovery' | 'monitor_creation' | string,
    message: string,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('wallet_setup', step, message, recoverable, context);
  }
}

/**
 * Identity discovery errors
 * Raised when querying Platform for existing identities fails
 */
export class IdentityDiscoveryError extends IdentityOperationError {
  constructor(
    step: 'hash_derivation' | 'platform_query' | 'batch_discovery' | string,
    message: string,
    public addresses?: string[],
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('identity_discovery', step, message, recoverable, {
      ...context,
      addressCount: addresses?.length,
    });
  }
}

/**
 * Transaction creation errors
 * Raised during asset lock transaction building
 */
export class TransactionCreationError extends IdentityOperationError {
  constructor(
    step: 'coin_selection' | 'transaction_build' | 'signing' | string,
    message: string,
    public amount?: number,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('transaction_creation', step, message, recoverable, {
      ...context,
      amount,
    });
  }
}

/**
 * Transaction broadcast errors
 * Raised when broadcasting transaction to network fails
 */
export class TransactionBroadcastError extends IdentityOperationError {
  constructor(
    message: string,
    public transactionId?: string,
    recoverable: boolean = true, // Usually recoverable - network might be temporarily down
    context: Record<string, any> = {}
  ) {
    super('transaction_broadcast', 'dapi_broadcast', message, recoverable, {
      ...context,
      transactionId,
    });
  }
}

/**
 * Confirmation waiting errors
 * Raised when waiting for InstantLock/ChainLock confirmation fails
 */
export class ConfirmationTimeoutError extends IdentityOperationError {
  constructor(
    public transactionId: string,
    message: string = `Transaction confirmation timeout: ${transactionId}`,
    public elapsedMs?: number,
    recoverable: boolean = true, // Can retry waiting
    context: Record<string, any> = {}
  ) {
    super('confirmation_wait', 'timeout', message, recoverable, {
      ...context,
      transactionId,
      elapsedMs,
    });
  }
}

/**
 * Asset lock proof errors
 * Raised when generating asset lock proof fails
 */
export class AssetLockProofError extends IdentityOperationError {
  constructor(
    step: 'proof_generation' | 'proof_validation' | string,
    message: string,
    public transactionId?: string,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('asset_lock_proof', step, message, recoverable, {
      ...context,
      transactionId,
    });
  }
}

/**
 * Platform submission errors
 * Raised when submitting identity creation/update to Platform fails
 */
export class PlatformSubmissionError extends IdentityOperationError {
  constructor(
    step: 'identity_create' | 'identity_topup' | 'wasm_worker' | string,
    message: string,
    public identityId?: string,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('platform_submission', step, message, recoverable, {
      ...context,
      identityId,
    });
  }
}

/**
 * Validation errors
 * Raised when input validation fails
 */
export class ValidationError extends IdentityOperationError {
  constructor(
    step: 'mnemonic_validation' | 'amount_validation' | 'address_validation' | string,
    message: string,
    public field?: string,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('validation', step, message, recoverable, {
      ...context,
      field,
    });
  }
}

/**
 * Insufficient funds error
 * Raised when wallet has insufficient UTXOs
 */
export class InsufficientFundsError extends IdentityOperationError {
  constructor(
    message: string,
    public requiredAmount: number,
    public availableAmount: number,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('transaction_creation', 'insufficient_funds', message, recoverable, {
      ...context,
      requiredAmount,
      availableAmount,
      shortfall: requiredAmount - availableAmount,
    });
  }

  getUserMessage(): string {
    const shortfall = this.requiredAmount - this.availableAmount;
    return `Insufficient funds. Need ${this.requiredAmount} duffs but only have ${this.availableAmount}. Need ${shortfall} more duffs.`;
  }
}

/**
 * Network errors
 * Raised when DAPI or network operations fail
 */
export class NetworkError extends IdentityOperationError {
  constructor(
    step: 'dapi_connect' | 'dapi_query' | 'dapi_broadcast' | string,
    message: string,
    recoverable: boolean = true, // Network errors are usually recoverable
    context: Record<string, any> = {}
  ) {
    super('network', step, message, recoverable, context);
  }
}

/**
 * Timeout error
 * Raised when an operation exceeds maximum time
 */
export class TimeoutError extends IdentityOperationError {
  constructor(
    operation: string,
    step: string,
    public timeoutMs: number,
    message: string = `Operation timeout after ${timeoutMs}ms`,
    recoverable: boolean = true,
    context: Record<string, any> = {}
  ) {
    super(operation, step, message, recoverable, {
      ...context,
      timeoutMs,
    });
  }
}

/**
 * Configuration error
 * Raised when SDK is misconfigured
 */
export class ConfigurationError extends IdentityOperationError {
  constructor(
    public configKey: string,
    message: string,
    recoverable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super('configuration', 'invalid_config', message, recoverable, {
      ...context,
      configKey,
    });
  }
}

/**
 * Error helper functions for common patterns
 */
export const ErrorHelpers = {
  /**
   * Check if error is recoverable and should be retried
   */
  isRecoverable(error: unknown): boolean {
    if (error instanceof IdentityOperationError) {
      return error.recoverable;
    }
    // Network-related errors are typically recoverable
    if (error instanceof Error && error.message.includes('network')) {
      return true;
    }
    return false;
  },

  /**
   * Get user-friendly message from any error
   */
  getUserMessage(error: unknown): string {
    if (error instanceof IdentityOperationError) {
      return error.getUserMessage();
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  },

  /**
   * Get detailed error information for logging
   */
  getDetails(error: unknown): Record<string, any> {
    if (error instanceof IdentityOperationError) {
      return error.getDetails();
    }
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return { error };
  },
};
