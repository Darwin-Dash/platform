/**
 * Validator utilities for input validation
 */

/**
 * Validate a Dash amount
 * @param {string|number} amount - Amount to validate
 * @param {boolean} inDash - Whether amount is in DASH (true) or duffs (false)
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateAmount(amount, inDash = true) {
  if (amount === '' || amount === null || amount === undefined) {
    return { valid: false, error: 'Amount is required' };
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return { valid: false, error: 'Invalid amount' };
  }

  if (numAmount <= 0) {
    return { valid: false, error: 'Amount must be positive' };
  }

  if (inDash) {
    // Check minimum amount (0.0005 DASH = 50,000 duffs)
    if (numAmount < 0.0005) {
      return { valid: false, error: 'Minimum amount is 0.0005 DASH' };
    }

    // Check maximum amount (21 million DASH)
    if (numAmount > 21000000) {
      return { valid: false, error: 'Amount exceeds maximum supply' };
    }

    // Check decimal places (max 8)
    const decimals = (amount.toString().split('.')[1] || '').length;
    if (decimals > 8) {
      return { valid: false, error: 'Maximum 8 decimal places allowed' };
    }
  } else {
    // Validating duffs
    if (numAmount < 50000) {
      return { valid: false, error: 'Minimum amount is 50,000 duffs' };
    }

    if (!Number.isInteger(numAmount)) {
      return { valid: false, error: 'Duffs must be a whole number' };
    }
  }

  return { valid: true };
}

/**
 * Validate a Dash address
 * @param {string} address - Address to validate
 * @param {string} network - Network ('testnet' or 'mainnet')
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateAddress(address, network = 'testnet') {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  // Basic format check
  if (typeof address !== 'string' || address.length < 26 || address.length > 35) {
    return { valid: false, error: 'Invalid address format' };
  }

  // Check prefix based on network
  const validPrefixes = network === 'mainnet'
    ? ['X', '7'] // Mainnet prefixes
    : ['y', '8', '9']; // Testnet prefixes

  const firstChar = address[0];
  if (!validPrefixes.includes(firstChar)) {
    return { valid: false, error: `Invalid ${network} address prefix` };
  }

  // Basic Base58 character check
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (!base58Regex.test(address)) {
    return { valid: false, error: 'Address contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate an identity ID
 * @param {string} identityId - Identity ID to validate
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateIdentityId(identityId) {
  if (!identityId) {
    return { valid: false, error: 'Identity ID is required' };
  }

  // Identity IDs are typically 44 characters Base58
  if (typeof identityId !== 'string' || identityId.length !== 44) {
    return { valid: false, error: 'Invalid identity ID format' };
  }

  // Base58 character check (no 0, O, I, l)
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (!base58Regex.test(identityId)) {
    return { valid: false, error: 'Identity ID contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate a private key WIF
 * @param {string} wif - Private key in WIF format
 * @param {string} network - Network ('testnet' or 'mainnet')
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validatePrivateKeyWIF(wif, network = 'testnet') {
  if (!wif) {
    return { valid: false, error: 'Private key is required' };
  }

  // WIF format check
  if (typeof wif !== 'string' || wif.length < 51 || wif.length > 52) {
    return { valid: false, error: 'Invalid private key format' };
  }

  // Check prefix based on network
  const prefix = wif[0];
  const validPrefixes = network === 'mainnet'
    ? ['5', 'K', 'L'] // Mainnet uncompressed and compressed
    : ['9', 'c']; // Testnet uncompressed and compressed

  if (!validPrefixes.includes(prefix)) {
    return { valid: false, error: `Invalid ${network} private key prefix` };
  }

  // Base58 character check
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (!base58Regex.test(wif)) {
    return { valid: false, error: 'Private key contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate a mnemonic phrase
 * @param {string} mnemonic - Mnemonic phrase
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateMnemonic(mnemonic) {
  if (!mnemonic) {
    return { valid: false, error: 'Mnemonic is required' };
  }

  const words = mnemonic.trim().split(/\s+/);

  // Check word count (12, 15, 18, 21, or 24 words)
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    return { valid: false, error: `Mnemonic must contain ${validWordCounts.join(', ')} words` };
  }

  // Basic check for word format (lowercase letters only)
  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) {
      return { valid: false, error: 'Mnemonic contains invalid characters' };
    }
  }

  return { valid: true };
}

/**
 * Validate a transaction hash
 * @param {string} hash - Transaction hash
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateTransactionHash(hash) {
  if (!hash) {
    return { valid: false, error: 'Transaction hash is required' };
  }

  // Transaction hash should be 64 hex characters
  if (typeof hash !== 'string' || hash.length !== 64) {
    return { valid: false, error: 'Invalid transaction hash format' };
  }

  // Hex character check
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(hash)) {
    return { valid: false, error: 'Transaction hash contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate a label/name
 * @param {string} label - Label to validate
 * @param {number} maxLength - Maximum length
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateLabel(label, maxLength = 50) {
  if (!label) {
    return { valid: true }; // Labels are optional
  }

  if (typeof label !== 'string') {
    return { valid: false, error: 'Label must be a string' };
  }

  if (label.length > maxLength) {
    return { valid: false, error: `Label must be ${maxLength} characters or less` };
  }

  // Allow alphanumeric, spaces, and basic punctuation
  const labelRegex = /^[a-zA-Z0-9\s\-_.,!?]+$/;
  if (!labelRegex.test(label)) {
    return { valid: false, error: 'Label contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate sufficient balance for operation
 * @param {number} balance - Available balance in duffs
 * @param {number} amount - Required amount in duffs
 * @param {number} fee - Estimated fee in duffs
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateSufficientBalance(balance, amount, fee = 226) {
  const total = amount + fee;

  if (balance < total) {
    const shortfall = total - balance;
    return {
      valid: false,
      error: `Insufficient balance. Need ${total} duffs, have ${balance} duffs (short ${shortfall} duffs)`
    };
  }

  return { valid: true };
}

/**
 * Validate email address (for optional notifications)
 * @param {string} email - Email address
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateEmail(email) {
  if (!email) {
    return { valid: true }; // Email is optional
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
}

/**
 * Validate a key index
 * @param {number} keyIndex - HD key derivation index
 * @returns {object} Validation result { valid: boolean, error?: string }
 */
export function validateKeyIndex(keyIndex) {
  if (keyIndex === undefined || keyIndex === null) {
    return { valid: false, error: 'Key index is required' };
  }

  const index = typeof keyIndex === 'string' ? parseInt(keyIndex, 10) : keyIndex;

  if (isNaN(index)) {
    return { valid: false, error: 'Key index must be a number' };
  }

  if (!Number.isInteger(index)) {
    return { valid: false, error: 'Key index must be an integer' };
  }

  if (index < 0) {
    return { valid: false, error: 'Key index must be non-negative' };
  }

  if (index > 2147483647) { // Max hardened key index
    return { valid: false, error: 'Key index exceeds maximum value' };
  }

  return { valid: true };
}