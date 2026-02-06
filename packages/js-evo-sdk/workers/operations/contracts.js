/**
 * Contract Operations for WASM Worker
 *
 * Provides data contract query operations that run in isolated worker processes.
 *
 * CRITICAL: Uses JavaScript DAPI client directly to avoid WASM RwLock issues.
 * The WASM SDK's async methods acquire reader locks that conflict with the SDK
 * connection lock. By using DAPI directly, we bypass WASM entirely.
 */

import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

/**
 * Get a data contract by ID using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.contractId - Contract ID to fetch
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Contract result
 */
export async function contractGetOperation(params, sdk, wasmModule, network = 'testnet') {
  const { contractId } = params;

  if (!contractId) {
    throw new Error('Missing required parameter: contractId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Contracts] Getting contract: ${contractId}`);
    console.log(`[Contracts] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });

  // Convert contract ID to buffer
  const contractIdBuffer = Buffer.from(bs58.decode(contractId));

  try {
    // Get contract via DAPI
    const contractResponse = await dapiClient.platform.getDataContract(
      contractIdBuffer,
      { prove: false }
    );

    if (!contractResponse || !contractResponse.dataContract) {
      return {
        found: false,
        contract: null,
      };
    }

    // Parse the contract data from platform versioned bincode format
    // Note: Full deserialization requires WASM, so we extract what we can
    const contractBuffer = Buffer.from(contractResponse.dataContract);
    const parsedContract = parseContractFromBytes(contractBuffer, contractId);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Contracts] Contract found: ${contractId}`);
    }

    return {
      found: true,
      contract: parsedContract,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Contracts] Get error: ${error.message}`);
    }

    if (error.message?.includes('not found') || error.code === 5) {
      return {
        found: false,
        contract: null,
      };
    }

    throw error;
  }
}

/**
 * Parse a data contract from platform versioned bincode format
 * Extracts basic info from raw bytes since full deserialization requires WASM
 *
 * @param {Buffer} contractBuffer - Raw contract buffer from DAPI
 * @param {string} contractId - Contract ID (for fallback)
 * @returns {object} Parsed contract with extracted fields
 */
function parseContractFromBytes(contractBuffer, contractId) {
  const bytes = Buffer.from(contractBuffer);

  // Platform contract format: version byte (0x00) + bincode data
  // Without WASM we can't fully deserialize, but we extract what we can

  let ownerId = null;
  let version = null;

  try {
    // Skip version byte if present
    let offset = bytes[0] === 0x00 ? 1 : 0;

    // Try to extract 32-byte identifiers from the contract
    // Typically contract ID and owner ID are early in the structure
    const identifiersFound = [];

    for (let i = offset; i < Math.min(bytes.length - 32, 200); i++) {
      const potentialId = bytes.slice(i, i + 32);
      // Check if this looks like an identifier (not all zeros/ones)
      const allZeros = potentialId.every(b => b === 0);
      const allOnes = potentialId.every(b => b === 255);

      if (!allZeros && !allOnes) {
        identifiersFound.push({
          offset: i,
          id: bs58.encode(potentialId)
        });

        // Skip past this identifier
        i += 31;

        // We need at most 2 identifiers
        if (identifiersFound.length >= 2) break;
      }
    }

    // Second identifier is typically owner ID (first is contract ID)
    if (identifiersFound.length >= 2) {
      ownerId = identifiersFound[1].id;
    }

    // Try to extract version (usually a small integer near the start)
    // Version is typically encoded as a varint after the IDs
    for (let i = offset; i < Math.min(bytes.length, 100); i++) {
      if (bytes[i] >= 1 && bytes[i] <= 10) {
        version = bytes[i];
        break;
      }
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Contracts] Parse error: ${error.message}`);
    }
  }

  return {
    $id: contractId,
    $ownerId: ownerId || 'unknown',
    $version: version || 1,
    _rawBytesLength: bytes.length,
    _note: 'Partial extraction - full contract requires WASM deserialization',
    // Placeholder for document schemas - can't extract without full parsing
    $defs: {},
  };
}

/**
 * Serialize a contract for JSON transport
 * Converts Buffer/Uint8Array fields to base58 strings
 *
 * @param {object} contract - Contract object with potential binary fields
 * @returns {object} Serialized contract
 */
function serializeContract(contract) {
  if (!contract || typeof contract !== 'object') {
    return contract;
  }

  const serialized = {};

  for (const [key, value] of Object.entries(contract)) {
    if (value instanceof Buffer || value instanceof Uint8Array) {
      // Convert binary to base58
      serialized[key] = bs58.encode(Buffer.from(value));
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively serialize nested objects
      serialized[key] = serializeContract(value);
    } else if (Array.isArray(value)) {
      // Handle arrays
      serialized[key] = value.map(item => {
        if (item instanceof Buffer || item instanceof Uint8Array) {
          return bs58.encode(Buffer.from(item));
        } else if (item && typeof item === 'object') {
          return serializeContract(item);
        }
        return item;
      });
    } else {
      serialized[key] = value;
    }
  }

  return serialized;
}
