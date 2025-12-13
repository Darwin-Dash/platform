/**
 * Wallet Funding Helper
 * Utilities for wallet funding flow including sync optimization and balance monitoring
 */

/**
 * Calculate optimized sync start height based on timeframe
 * @param {string} timeframe - 'hour' | 'day' | 'week'
 * @param {number} currentHeight - Current blockchain height
 * @returns {number} - Block height to start sync from
 */
export function calculateSyncHeight(timeframe, currentHeight) {
  const blocksToScan = {
    'hour': 60,      // ~1 hour at 2.5 min per block
    'day': 576,      // ~24 hours
    'week': 4032     // ~7 days
  };

  const blocksBack = blocksToScan[timeframe] || 60;
  return Math.max(0, currentHeight - blocksBack);
}

/**
 * Get estimated sync time for timeframe
 * @param {string} timeframe - 'hour' | 'day' | 'week'
 * @returns {string} - Human-readable estimate
 */
export function getEstimatedSyncTime(timeframe) {
  const estimates = {
    'hour': '10-30 seconds',
    'day': '1-2 minutes',
    'week': '3-5 minutes'
  };
  return estimates[timeframe] || 'Unknown';
}

/**
 * Validate if balance is sufficient for identity creation
 * @param {number} balance - Balance in duffs
 * @returns {Object} - { valid: boolean, message: string }
 */
export function validateFundingBalance(balance) {
  const MIN_BALANCE = 100000; // 0.001 DASH in duffs (1 DASH = 100,000,000 duffs)
  const RECOMMENDED_BALANCE = 1000000; // 0.01 DASH in duffs

  if (balance < MIN_BALANCE) {
    return {
      valid: false,
      message: `Insufficient funds. Minimum required: 0.001 DASH (${MIN_BALANCE.toLocaleString()} duffs)`
    };
  }

  if (balance < RECOMMENDED_BALANCE) {
    return {
      valid: true,
      warning: true,
      message: `Balance is below recommended amount. Recommended: 0.01 DASH for multiple operations`
    };
  }

  return {
    valid: true,
    warning: false,
    message: 'Balance is sufficient'
  };
}

/**
 * Generate mock funding address for development
 * In production, this would use the actual wallet
 * @returns {string} - Mock testnet address
 */
export function generateMockFundingAddress() {
  // Generate a realistic-looking testnet address (starts with 'y')
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789';
  let address = 'y';
  for (let i = 0; i < 33; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

/**
 * Monitor address for incoming funds (mock implementation)
 * @param {string} address - Address to monitor
 * @param {Function} onBalanceDetected - Callback when funds detected
 * @param {Function} onError - Error callback
 * @returns {Object} - { stop: Function } to stop monitoring
 */
export function monitorAddressBalance(address, onBalanceDetected, onError) {
  let intervalId = null;
  let timeoutId = null;
  let stopped = false;

  // Mock: Simulate receiving funds after 7 seconds
  timeoutId = setTimeout(() => {
    if (!stopped) {
      const mockBalance = 5000000000; // 0.05 DASH
      onBalanceDetected({
        address,
        balance: mockBalance,
        txid: 'mock_instant_' + Date.now(),
        confirmations: 1
      });
    }
  }, 7000);

  return {
    stop: () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
}

/**
 * Check if InstantSend is available (mock)
 * @returns {boolean}
 */
export function isInstantSendAvailable() {
  // In production, check actual network conditions
  return true;
}

/**
 * Format balance for display
 * @param {number} duffs - Balance in duffs
 * @returns {string} - Formatted balance
 */
export function formatBalanceForDisplay(duffs) {
  const dash = duffs / 100000000;
  return `${dash.toFixed(8)} DASH`;
}

/**
 * Get current block height (mock)
 * In production, fetch from DAPI
 * @returns {Promise<number>}
 */
export async function getCurrentBlockHeight() {
  // Mock current height for testnet
  return Promise.resolve(920000);
}

/**
 * Generate QR code data URL for address
 * @param {string} address - Address to encode
 * @returns {string} - Data URL for QR code image
 */
export function generateQRCode(address) {
  // For now, return a placeholder
  // In production, use a QR code library like qrcode.js
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`;
}
