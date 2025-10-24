/**
 * DNS Resolution Module for DAPI Address Hostnames
 *
 * This module handles the conversion of DNS hostnames to IP addresses for DAPI connections.
 *
 * CRITICAL ISSUE SOLVED:
 * DAPI server TLS certificates are REGISTERED TO IP ADDRESSES, NOT to DNS hostnames.
 *
 * When connecting via hostname without DNS resolution:
 * - Connection target: hostname (e.g., seed-1.testnet.networks.dash.org)
 * - Certificate registered for: IP address (e.g., 34.214.48.68)
 * - Result: TLS certificate validation FAILS (hostname ≠ IP in certificate)
 *
 * SOLUTION:
 * Resolve hostname to IP address BEFORE connecting. This ensures:
 * - Connection target matches certificate subject (both are the IP address)
 * - TLS validation succeeds
 * - gRPC connection is established reliably
 *
 * IMPLEMENTATION:
 * Uses Node.js native dns.promises.resolve4() for non-blocking IPv4 resolution.
 * IP addresses are passed through unchanged (skip DNS lookup).
 * Includes error handling with fallback to original hostname if DNS fails.
 *
 * For browsers: DNS resolution is skipped (browsers don't have dns module).
 * Demo uses direct IP addresses or relies on browser's native DNS resolution.
 *
 * See: packages/js-dapi-client/docs/DNS_RESOLUTION.md for complete documentation
 */

// DNS module only available in Node.js
let dns = null;
if (typeof require !== 'undefined') {
  try {
    dns = require('dns').promises;
  } catch (e) {
    // dns not available (browser environment)
    dns = null;
  }
}

const logger = require('../logger');

/**
 * Check if a string is an IP address (IPv4)
 * @param {string} host
 * @returns {boolean}
 */
function isIPAddress(host) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(host)) {
    return false;
  }
  // Validate octets are 0-255
  const parts = host.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Resolve a DAPIAddress hostname to IP if it's a hostname
 * @param {DAPIAddress} dapiAddress
 * @param {object} [options]
 * @param {string} [options.loggerIdentifier]
 * @returns {Promise<DAPIAddress>}
 */
async function resolveDAPIAddress(dapiAddress, options = {}) {
  const host = dapiAddress.getHost();
  const log = logger.getForId(options.loggerIdentifier);

  // Check if it's already an IP address
  if (isIPAddress(host)) {
    log.debug(`Address ${host} is already an IP, skipping DNS resolution`);
    return dapiAddress;
  }

  // In browser environment, dns module is not available
  // Rely on browser's native DNS resolution or direct IP usage
  if (!dns) {
    log.debug(`DNS module not available (browser environment), using hostname: ${host}`);
    return dapiAddress;
  }

  try {
    log.debug(`Resolving DNS name: ${host}`);

    // Resolve hostname to IPv4 address
    const addresses = await dns.resolve4(host);

    if (!addresses || addresses.length === 0) {
      log.warn(`DNS resolution returned no addresses for ${host}, using hostname`);
      return dapiAddress;
    }

    const resolvedIP = addresses[0];
    log.debug(`Successfully resolved ${host} to ${resolvedIP}`);

    // Create a new DAPIAddress with the resolved IP
    dapiAddress.setHost(resolvedIP);
    return dapiAddress;
  } catch (error) {
    log.warn(`Failed to resolve DNS name ${host}: ${error.message}`, { error });
    // Fallback to original hostname
    return dapiAddress;
  }
}

module.exports = resolveDAPIAddress;
