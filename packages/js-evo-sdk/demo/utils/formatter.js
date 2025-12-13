/**
 * Formatter utilities for displaying Dash values and data
 */

/**
 * Convert duffs (satoshis) to DASH
 * @param {number} duffs - Amount in duffs
 * @returns {number} Amount in DASH
 */
export function duffsToDash(duffs) {
  return duffs / 100000000;
}

/**
 * Convert DASH to duffs (satoshis)
 * @param {number} dash - Amount in DASH
 * @returns {number} Amount in duffs
 */
export function dashToDuffs(dash) {
  return Math.floor(dash * 100000000);
}

/**
 * Convert duffs to credits (Platform unit)
 * 1 DASH = 100,000,000 duffs = 100,000,000,000 credits
 * Therefore: credits = duffs * 1000
 * @param {number} duffs - Amount in duffs
 * @returns {number} Amount in credits
 */
export function duffsToCredits(duffs) {
  return duffs * 1000;
}

/**
 * Format duffs for display with proper DASH formatting
 * @param {number} duffs - Amount in duffs
 * @param {boolean} showUnit - Whether to show the DASH unit
 * @returns {string} Formatted string
 */
export function formatDuffs(duffs, showUnit = true) {
  const dash = duffsToDash(duffs);
  const formatted = dash.toFixed(8).replace(/\.?0+$/, '');
  return showUnit ? `${formatted} DASH` : formatted;
}

/**
 * Format credits for display
 * @param {number} duffs - Amount in duffs (will be converted to credits)
 * @returns {string} Formatted credits string
 */
export function formatCredits(duffs) {
  const credits = duffsToCredits(duffs);
  return credits.toLocaleString() + ' credits';
}

/**
 * Format balance showing credits (primary) and DASH (secondary)
 * @param {number} duffs - Amount in duffs
 * @returns {object} Object with credits and dash formatted strings
 */
export function formatBalance(duffs) {
  const credits = duffsToCredits(duffs);
  const dash = duffsToDash(duffs);
  return {
    credits: credits.toLocaleString() + ' credits',
    dash: dash.toFixed(8).replace(/\.?0+$/, '') + ' DASH'
  };
}

/**
 * Format duffs with both DASH and duffs display
 * @param {number} duffs - Amount in duffs
 * @returns {string} Formatted string with both units
 */
export function formatDuffsFull(duffs) {
  const dash = duffsToDash(duffs);
  const dashStr = dash.toFixed(8).replace(/\.?0+$/, '');
  const duffsStr = duffs.toLocaleString();
  return `${dashStr} DASH (${duffsStr} duffs)`;
}

/**
 * Format an identity ID for display (truncate middle)
 * @param {string} id - Full identity ID
 * @param {number} startChars - Number of characters to show at start
 * @param {number} endChars - Number of characters to show at end
 * @returns {string} Truncated ID
 */
export function formatIdentityId(id, startChars = 8, endChars = 4) {
  if (!id || id.length <= startChars + endChars + 3) {
    return id;
  }
  return `${id.substring(0, startChars)}...${id.substring(id.length - endChars)}`;
}

/**
 * Format a transaction hash for display
 * @param {string} hash - Full transaction hash
 * @param {number} chars - Number of characters to show at start and end
 * @returns {string} Truncated hash
 */
export function formatTransactionHash(hash, chars = 8) {
  if (!hash || hash.length <= chars * 2 + 3) {
    return hash;
  }
  return `${hash.substring(0, chars)}...${hash.substring(hash.length - chars)}`;
}

/**
 * Format an address for display
 * @param {string} address - Full address
 * @param {number} chars - Number of characters to show at start and end
 * @returns {string} Truncated address
 */
export function formatAddress(address, chars = 6) {
  if (!address || address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
}

/**
 * Format a public key for display
 * @param {string} key - Full public key (hex)
 * @param {number} chars - Number of characters to show
 * @returns {string} Truncated key
 */
export function formatPublicKey(key, chars = 10) {
  if (!key) return '';

  // Remove 0x prefix if present
  const cleanKey = key.startsWith('0x') ? key.substring(2) : key;

  if (cleanKey.length <= chars + 3) {
    return cleanKey;
  }
  return `${cleanKey.substring(0, chars)}...`;
}

/**
 * Format a timestamp for display
 * @param {number|string} timestamp - Timestamp in ms or ISO string
 * @returns {string} Formatted date/time string
 */
export function formatTimestamp(timestamp) {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // If less than a minute ago
  if (seconds < 60) {
    return 'Just now';
  }

  // If less than an hour ago
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  // If less than 24 hours ago
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  // If less than 7 days ago
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  // Otherwise, show full date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a number with thousands separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Format transaction status for display
 * @param {string} status - Transaction status
 * @returns {object} Status text and CSS class
 */
export function formatTransactionStatus(status) {
  const statusMap = {
    'pending': { text: 'Pending', class: 'status-pending' },
    'confirming': { text: 'Confirming', class: 'status-confirming' },
    'confirmed': { text: 'Confirmed', class: 'status-confirmed' },
    'failed': { text: 'Failed', class: 'status-failed' }
  };

  return statusMap[status] || { text: status, class: 'status-unknown' };
}

/**
 * Format key purpose for display
 * @param {string} purpose - Key purpose
 * @returns {string} Formatted purpose
 */
export function formatKeyPurpose(purpose) {
  const purposeMap = {
    'AUTHENTICATION': 'Authentication',
    'TRANSFER': 'Transfer',
    'SIGNING': 'Signing',
    'ENCRYPTION': 'Encryption'
  };

  return purposeMap[purpose] || purpose;
}

/**
 * Format security level for display
 * @param {string} level - Security level
 * @returns {object} Level text and CSS class
 */
export function formatSecurityLevel(level) {
  const levelMap = {
    'MASTER': { text: 'Master', class: 'level-master' },
    'CRITICAL': { text: 'Critical', class: 'level-critical' },
    'HIGH': { text: 'High', class: 'level-high' },
    'MEDIUM': { text: 'Medium', class: 'level-medium' },
    'LOW': { text: 'Low', class: 'level-low' }
  };

  return levelMap[level] || { text: level, class: 'level-unknown' };
}

/**
 * Format percentage
 * @param {number} value - Value between 0 and 100
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, decimals = 0) {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}