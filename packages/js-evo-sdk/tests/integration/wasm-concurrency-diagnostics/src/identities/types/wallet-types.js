/**
 * TypeScript interfaces for wallet-lib types
 *
 * Provides type safety for wallet-lib objects used in identity operations.
 * Created as part of Phase 3.4 refactoring to replace ~20 `any` types.
 *
 * Note: wallet-lib doesn't export TypeScript definitions, so these interfaces
 * are based on runtime observations and wallet-lib source code.
 */
/**
 * Type guard to check if value is a WalletAddress object
 */
export function isWalletAddress(value) {
    return value !== null &&
        typeof value === 'object' &&
        typeof value.toString === 'function';
}
/**
 * Extract address string from wallet-lib address (string or object)
 */
export function extractAddressString(address) {
    return typeof address === 'string' ? address : address.toString();
}
