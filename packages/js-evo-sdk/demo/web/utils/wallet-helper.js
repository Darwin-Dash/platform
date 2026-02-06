/**
 * Wallet Initialization Helper
 * Provides utilities for creating and initializing wallets from mnemonics
 */

import { validateMnemonic } from './validator.js';

// Lazy-loaded Wallet from wallet-lib (Node.js only)
let Wallet = null;
let _walletLoadAttempted = false;

async function loadWalletLib() {
  if (_walletLoadAttempted) return Wallet;
  _walletLoadAttempted = true;
  try {
    const walletLibModule = await import('@dashevo/wallet-lib');
    Wallet = walletLibModule.Wallet;
  } catch (e) {
    // Expected in browser context
    Wallet = null;
  }
  return Wallet;
}

/**
 * Initialize a wallet account from a mnemonic (Node.js only)
 *
 * This function is designed for Node.js backends or test environments.
 * In the browser demo, we should use the SDK's built-in methods instead.
 *
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @param {string} network - Network ('testnet' or 'mainnet')
 * @param {Object} options - Additional wallet options
 * @param {number} options.startHeight - Blockchain height to start syncing from
 * @returns {Promise<Object>} Wallet account instance
 * @throws {Error} If mnemonic is invalid or wallet-lib unavailable
 */
export async function initializeWalletFromMnemonic(mnemonic, network = 'testnet', options = {}) {
  await loadWalletLib();
  if (!Wallet) {
    throw new Error('wallet-lib not available - use SDK methods in browser context instead');
  }

  // Validate mnemonic is provided
  if (!mnemonic || typeof mnemonic !== 'string') {
    throw new Error('Mnemonic must be a non-empty string');
  }

  // Validate network
  if (!['testnet', 'mainnet'].includes(network)) {
    throw new Error(`Network must be 'testnet' or 'mainnet', got '${network}'`);
  }

  try {
    // Create wallet with DAPIClient-first pattern from PRD
    const wallet = new Wallet({
      mnemonic: mnemonic.trim(),
      network,
      transport: null, // js-dash-sdk pattern: null initially
      offlineMode: false,
      // Note: Not specifying plugins to let wallet-lib use defaults (enables SPV discovery)
      unsafeOptions: {
        // CRITICAL: Use START_HEIGHT from options or environment
        skipSynchronizationBeforeHeight: options.startHeight || process.env.START_HEIGHT || 0
      }
    });

    // Return a promise that resolves when wallet is ready
    return {
      wallet,
      async getAccount(accountOptions = {}) {
        // Get account with built-in sync
        const account = await wallet.getAccount({
          index: accountOptions.index || 0,
          synchronize: accountOptions.synchronize !== false, // Default true
          disableIdentitySync: accountOptions.disableIdentitySync !== false // Default true
        });

        return account;
      },

      /**
       * Setup DAPIClient transport (js-dash-sdk pattern)
       * Must be called before account operations
       */
      setTransport(dapiClientTransport) {
        wallet.transport = dapiClientTransport;
      }
    };
  } catch (error) {
    if (error.message.includes('Invalid')) {
      throw new Error(`Invalid mnemonic: ${error.message}`);
    }
    throw error;
  }
}

// validateMnemonic is re-exported from validator.js for backward compatibility
export { validateMnemonic };

/**
 * Browser-safe wallet info extraction
 * Extracts basic info from a wallet without requiring full initialization
 *
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @returns {Object} Wallet info { words: number, isValid: boolean }
 */
export function getWalletInfo(mnemonic) {
  const validation = validateMnemonic(mnemonic);

  return {
    isValid: validation.valid,
    error: validation.error,
    wordCount: mnemonic ? mnemonic.trim().split(/\s+/).length : 0
  };
}

export default {
  initializeWalletFromMnemonic,
  validateMnemonic,
  getWalletInfo
};
