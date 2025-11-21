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
export class IdentityOperationError extends Error {
    operation;
    step;
    recoverable;
    context;
    /**
     * @param operation Name of the operation that failed (e.g., 'identity_creation')
     * @param step Step within the operation (e.g., 'wallet_setup', 'broadcast')
     * @param message Human-readable error message
     * @param recoverable Whether operation can be retried
     * @param context Additional context for debugging
     */
    constructor(operation, step, message, recoverable = false, context = {}) {
        super(message);
        this.operation = operation;
        this.step = step;
        this.recoverable = recoverable;
        this.context = context;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
    /**
     * Get user-friendly error message
     */
    getUserMessage() {
        return this.message;
    }
    /**
     * Get developer-friendly error details
     */
    getDetails() {
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
    constructor(step, message, recoverable = false, context = {}) {
        super('wallet_setup', step, message, recoverable, context);
    }
}
/**
 * Identity discovery errors
 * Raised when querying Platform for existing identities fails
 */
export class IdentityDiscoveryError extends IdentityOperationError {
    addresses;
    constructor(step, message, addresses, recoverable = false, context = {}) {
        super('identity_discovery', step, message, recoverable, {
            ...context,
            addressCount: addresses?.length,
        });
        this.addresses = addresses;
    }
}
/**
 * Transaction creation errors
 * Raised during asset lock transaction building
 */
export class TransactionCreationError extends IdentityOperationError {
    amount;
    constructor(step, message, amount, recoverable = false, context = {}) {
        super('transaction_creation', step, message, recoverable, {
            ...context,
            amount,
        });
        this.amount = amount;
    }
}
/**
 * Transaction broadcast errors
 * Raised when broadcasting transaction to network fails
 */
export class TransactionBroadcastError extends IdentityOperationError {
    transactionId;
    constructor(message, transactionId, recoverable = true, // Usually recoverable - network might be temporarily down
    context = {}) {
        super('transaction_broadcast', 'dapi_broadcast', message, recoverable, {
            ...context,
            transactionId,
        });
        this.transactionId = transactionId;
    }
}
/**
 * Confirmation waiting errors
 * Raised when waiting for InstantLock/ChainLock confirmation fails
 */
export class ConfirmationTimeoutError extends IdentityOperationError {
    transactionId;
    elapsedMs;
    constructor(transactionId, message = `Transaction confirmation timeout: ${transactionId}`, elapsedMs, recoverable = true, // Can retry waiting
    context = {}) {
        super('confirmation_wait', 'timeout', message, recoverable, {
            ...context,
            transactionId,
            elapsedMs,
        });
        this.transactionId = transactionId;
        this.elapsedMs = elapsedMs;
    }
}
/**
 * Asset lock proof errors
 * Raised when generating asset lock proof fails
 */
export class AssetLockProofError extends IdentityOperationError {
    transactionId;
    constructor(step, message, transactionId, recoverable = false, context = {}) {
        super('asset_lock_proof', step, message, recoverable, {
            ...context,
            transactionId,
        });
        this.transactionId = transactionId;
    }
}
/**
 * Platform submission errors
 * Raised when submitting identity creation/update to Platform fails
 */
export class PlatformSubmissionError extends IdentityOperationError {
    identityId;
    constructor(step, message, identityId, recoverable = false, context = {}) {
        super('platform_submission', step, message, recoverable, {
            ...context,
            identityId,
        });
        this.identityId = identityId;
    }
}
/**
 * Validation errors
 * Raised when input validation fails
 */
export class ValidationError extends IdentityOperationError {
    field;
    constructor(step, message, field, recoverable = false, context = {}) {
        super('validation', step, message, recoverable, {
            ...context,
            field,
        });
        this.field = field;
    }
}
/**
 * Insufficient funds error
 * Raised when wallet has insufficient UTXOs
 */
export class InsufficientFundsError extends IdentityOperationError {
    requiredAmount;
    availableAmount;
    constructor(message, requiredAmount, availableAmount, recoverable = false, context = {}) {
        super('transaction_creation', 'insufficient_funds', message, recoverable, {
            ...context,
            requiredAmount,
            availableAmount,
            shortfall: requiredAmount - availableAmount,
        });
        this.requiredAmount = requiredAmount;
        this.availableAmount = availableAmount;
    }
    getUserMessage() {
        const shortfall = this.requiredAmount - this.availableAmount;
        return `Insufficient funds. Need ${this.requiredAmount} duffs but only have ${this.availableAmount}. Need ${shortfall} more duffs.`;
    }
}
/**
 * Network errors
 * Raised when DAPI or network operations fail
 */
export class NetworkError extends IdentityOperationError {
    constructor(step, message, recoverable = true, // Network errors are usually recoverable
    context = {}) {
        super('network', step, message, recoverable, context);
    }
}
/**
 * Timeout error
 * Raised when an operation exceeds maximum time
 */
export class TimeoutError extends IdentityOperationError {
    timeoutMs;
    constructor(operation, step, timeoutMs, message = `Operation timeout after ${timeoutMs}ms`, recoverable = true, context = {}) {
        super(operation, step, message, recoverable, {
            ...context,
            timeoutMs,
        });
        this.timeoutMs = timeoutMs;
    }
}
/**
 * Configuration error
 * Raised when SDK is misconfigured
 */
export class ConfigurationError extends IdentityOperationError {
    configKey;
    constructor(configKey, message, recoverable = false, context = {}) {
        super('configuration', 'invalid_config', message, recoverable, {
            ...context,
            configKey,
        });
        this.configKey = configKey;
    }
}
/**
 * Error helper functions for common patterns
 */
export const ErrorHelpers = {
    /**
     * Check if error is recoverable and should be retried
     */
    isRecoverable(error) {
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
    getUserMessage(error) {
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
    getDetails(error) {
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
