/**
 * Error handling utilities for EvoSDK
 * Provides helpful error messages and recovery suggestions
 */
/**
 * Parse WASM error and extract readable error message
 */
export function parseWasmError(error) {
    if (!error)
        return 'Unknown error occurred';
    // Handle error objects with message property
    if (error instanceof Error) {
        return error.message;
    }
    // Handle string errors
    if (typeof error === 'string') {
        return error;
    }
    // Handle objects with error info
    if (typeof error === 'object') {
        if (error.message) {
            return error.message;
        }
        if (error.error) {
            return String(error.error);
        }
        if (error.reason) {
            return error.reason;
        }
    }
    return String(error);
}
/**
 * Create a helpful SDK error with context and recovery suggestions
 */
export function createSdkError(operation, originalError, context) {
    const errorMessage = parseWasmError(originalError);
    let message = `Failed to ${operation}`;
    if (context) {
        message += ` (${context})`;
    }
    message += `: ${errorMessage}`;
    // Add recovery suggestions based on error type
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        message += '\n\nSuggestion: The request timed out. Your network may be slow or the server may be unresponsive. Try again.';
    }
    else if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
        message += '\n\nSuggestion: The requested resource was not found. Verify the ID is correct.';
    }
    else if (errorMessage.includes('Connection') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('Network')) {
        message += '\n\nSuggestion: Check your internet connection and verify the Dash Platform endpoint is reachable.';
    }
    else if (errorMessage.includes('Invalid') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('Validation')) {
        message += '\n\nSuggestion: The data format is invalid. Check the input parameters match the expected format.';
    }
    else if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('Permission')) {
        message += '\n\nSuggestion: You may not have permission to access this resource. Verify your credentials.';
    }
    const error = new Error(message);
    error.cause = originalError;
    return error;
}
/**
 * Wrap an async function with error handling
 */
export async function withErrorHandling(operation, fn, context) {
    try {
        return await fn();
    }
    catch (error) {
        throw createSdkError(operation, error, context);
    }
}
/**
 * Check if error is a network/connection error
 */
export function isNetworkError(error) {
    const message = parseWasmError(error).toLowerCase();
    return (message.includes('connection') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('unreachable') ||
        message.includes('offline'));
}
/**
 * Check if error is a validation/input error
 */
export function isValidationError(error) {
    const message = parseWasmError(error).toLowerCase();
    return message.includes('invalid') || message.includes('validation') || message.includes('malformed');
}
/**
 * Check if error is a not-found error
 */
export function isNotFoundError(error) {
    const message = parseWasmError(error).toLowerCase();
    return message.includes('not found') || message.includes('does not exist');
}
