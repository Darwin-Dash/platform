/**
 * Retry Utilities for Demo App
 *
 * Provides exponential backoff retry logic and error classification
 * for handling transient network errors with Dash Platform SDK.
 *
 * Based on patterns from test-contact-request-sdk.mjs
 */

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} maxDelay - Maximum delay cap in milliseconds (default: 30000)
 * @returns {number} Delay in milliseconds
 *
 * Progression: 1s → 2s → 4s → 8s → 16s → 30s (capped)
 */
export function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  const jitter = delay * 0.1 * Math.random(); // 10% jitter to avoid thundering herd
  return delay + jitter;
}

/**
 * Classify an error as transient (retryable) or permanent (fail-fast)
 * @param {Error|string} error - Error to classify
 * @returns {boolean} True if error is transient and should be retried
 *
 * Transient errors: Network issues, timeouts, temporary server errors
 * Permanent errors: Validation failures, duplicates, insufficient balance
 */
export function isTransientError(error) {
  const message = error?.message || String(error);

  // Transient errors - SHOULD RETRY
  const transientPatterns = [
    /prefetch.*quorums/i,
    /HTTP request error/i,
    /transport error/i,
    /grpc error/i,
    /Internal error/i,
    /UNAVAILABLE/i,
    /DEADLINE_EXCEEDED/i,
    /connection.*refused/i,
    /network.*error/i,
    /timeout/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /socket hang up/i,
    /Unknown error/i, // SDK sometimes returns this for transient issues
    /Tenderdash.*not available/i, // Platform consensus layer temporarily unavailable
    /consensus.*error/i // Consensus related temporary errors
  ];

  // Permanent errors - FAIL FAST, DO NOT RETRY
  const permanentPatterns = [
    /identity.*not found/i,
    /document.*already exists/i,
    /duplicate unique properties/i,
    /invalid.*signature/i,
    /insufficient.*balance/i,
    /validation.*failed/i,
    /unauthorized/i,
    /permission denied/i,
    /contract.*not found/i,
    /invalid.*state transition/i
  ];

  // Check permanent patterns FIRST for fail-fast behavior
  if (permanentPatterns.some(p => p.test(message))) {
    return false;
  }

  // Check transient patterns
  return transientPatterns.some(p => p.test(message));
}

/**
 * Generic retry operation wrapper with exponential backoff
 * @param {Function} operation - Async function to retry, receives attempt number
 * @param {Object} options - Configuration options
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 5)
 * @param {string} options.operationName - Name for logging (default: 'operation')
 * @param {Function} options.onRetry - Callback on retry (attempt, maxAttempts, delay, error)
 * @param {Function} options.onSuccess - Callback on success (result, attempts)
 * @param {Function} options.onFailure - Callback on final failure (error, attempts)
 * @returns {Promise<any>} Result of the operation
 * @throws {Error} Last error if all retries exhausted or permanent error
 */
export async function retryOperation(operation, options = {}) {
  const {
    maxAttempts = 5,
    operationName = 'operation',
    onRetry,
    onSuccess,
    onFailure
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation(attempt);

      // Success callback
      if (onSuccess) {
        onSuccess(result, attempt);
      }

      return result;
    } catch (error) {
      lastError = error;
      const isTransient = isTransientError(error);

      // Log for debugging
      console.log(`[RETRY] ${operationName} attempt ${attempt}/${maxAttempts}: ${error.message?.slice(0, 100) || error}`);
      console.log(`[RETRY] Error type: ${isTransient ? 'TRANSIENT' : 'PERMANENT'}`);

      // Fail immediately on permanent errors or max attempts reached
      if (!isTransient || attempt >= maxAttempts) {
        console.error(`[RETRY] ${operationName} failed after ${attempt} attempt(s)`);

        if (onFailure) {
          onFailure(error, attempt);
        }

        throw error;
      }

      // Calculate backoff delay
      const delay = exponentialBackoff(attempt);

      // Retry callback
      if (onRetry) {
        onRetry(attempt, maxAttempts, delay, error);
      }

      console.log(`[RETRY] ${operationName} retrying in ${Math.round(delay)}ms...`);

      // Wait before retry
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Verify operation success by checking balance decrease
 * Used as fallback when SDK returns "Unknown error" but operation may have succeeded
 *
 * @param {Object} sdk - SDK instance with identities.get() method
 * @param {string} identityId - Identity ID to check
 * @param {number} initialBalance - Balance before operation
 * @param {number} waitMs - Time to wait for propagation (default: 2000)
 * @returns {Promise<{success: boolean, balanceChange: number}>}
 */
export async function verifyByBalanceChange(sdk, identityId, initialBalance, waitMs = 2000) {
  if (initialBalance === null || initialBalance === undefined) {
    return { success: false, balanceChange: 0 };
  }

  // Wait for blockchain propagation
  await new Promise(r => setTimeout(r, waitMs));

  try {
    const currentIdentity = await sdk.identities.get(identityId);
    const currentBalance = currentIdentity?.balance;

    if (currentBalance !== null && currentBalance !== undefined) {
      const balanceChange = initialBalance - currentBalance;

      if (balanceChange > 0) {
        console.log(`[VERIFY] Balance decreased by ${balanceChange} credits - operation likely succeeded`);
        return { success: true, balanceChange };
      }
    }

    return { success: false, balanceChange: 0 };
  } catch (error) {
    console.warn(`[VERIFY] Balance check failed: ${error.message}`);
    return { success: false, balanceChange: 0 };
  }
}

/**
 * Wrap an SDK operation with retry logic and balance verification fallback
 *
 * @param {Object} params - Operation parameters
 * @param {Function} params.operation - The SDK operation to perform
 * @param {Object} params.sdk - SDK instance for balance verification
 * @param {string} params.identityId - Identity performing the operation
 * @param {string} params.operationName - Name for logging
 * @param {number} params.maxAttempts - Max retry attempts (default: 5)
 * @returns {Promise<{result: any, verifiedByBalance: boolean}>}
 */
export async function executeWithRetryAndVerification(params) {
  const {
    operation,
    sdk,
    identityId,
    operationName = 'SDK operation',
    maxAttempts = 5
  } = params;

  // Get initial balance for verification fallback
  let initialBalance = null;
  try {
    const identity = await sdk.identities.get(identityId);
    initialBalance = identity?.balance;
    console.log(`[${operationName}] Initial balance: ${initialBalance}`);
  } catch (e) {
    console.warn(`[${operationName}] Could not get initial balance: ${e.message}`);
  }

  let result = null;
  let lastError = null;

  try {
    result = await retryOperation(operation, {
      maxAttempts,
      operationName
    });

    return { result, verifiedByBalance: false };
  } catch (error) {
    lastError = error;

    // Check if it's an "Unknown error" that might have actually succeeded
    if (error.message?.includes('Unknown error') && initialBalance !== null) {
      console.log(`[${operationName}] Got "Unknown error" - attempting balance verification...`);

      const verification = await verifyByBalanceChange(sdk, identityId, initialBalance);

      if (verification.success) {
        console.log(`[${operationName}] Operation verified by balance change!`);
        return {
          result: { documentId: 'verified-by-balance', verifiedByBalance: true },
          verifiedByBalance: true
        };
      }
    }

    throw lastError;
  }
}
