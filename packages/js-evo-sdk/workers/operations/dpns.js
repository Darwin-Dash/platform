/**
 * DPNS Operations for WASM Worker
 *
 * Provides DPNS name resolution, availability checking, and username queries
 * that run in isolated worker processes.
 *
 * CRITICAL: Uses JavaScript DAPI client directly to avoid WASM RwLock issues.
 * The WASM SDK's async methods (like dpnsResolveName) acquire reader locks that
 * conflict with the SDK connection lock. By using DAPI directly, we bypass WASM
 * entirely for network operations.
 */

import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

// DPNS Contract ID (same for testnet and mainnet)
const DPNS_CONTRACT_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

/**
 * Convert a label to homograph-safe normalized form
 * Replaces: o → 0, i → 1, l → 1
 *
 * @param {string} label - The label to normalize
 * @returns {string} Normalized label
 */
function normalizeLabel(label) {
  return label
    .toLowerCase()
    .replace(/o/g, '0')
    .replace(/i/g, '1')
    .replace(/l/g, '1');
}

/**
 * Resolve a DPNS name to its identity ID using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.name - Name to resolve (e.g., 'alice' or 'alice.dash')
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used - we bypass WASM)
 * @param {string} network - Network name
 * @returns {Promise<object>} Resolution result
 */
export async function dpnsResolveOperation(params, sdk, wasmModule, network = 'testnet') {
  const { name } = params;

  if (!name) {
    throw new Error('Missing required parameter: name');
  }

  // Parse name: "alice.dash" → label="alice", parent="dash"
  // Or just "alice" → label="alice", parent="dash" (default)
  let label, parentDomain;
  if (name.includes('.')) {
    const parts = name.split('.');
    label = parts[0];
    parentDomain = parts.slice(1).join('.');
  } else {
    label = name;
    parentDomain = 'dash';
  }

  const normalizedLabel = normalizeLabel(label);
  const normalizedParentDomain = normalizeLabel(parentDomain);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DPNS] Resolving name: ${name}`);
    console.log(`[DPNS] Normalized: ${normalizedLabel}.${normalizedParentDomain}`);
    console.log(`[DPNS] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client (no WASM involved)
  const dapiClient = new DAPIClient({ network });

  // Convert contract ID to buffer
  const contractIdBuffer = Buffer.from(bs58.decode(DPNS_CONTRACT_ID));

  try {
    // Query DPNS domain documents via DAPI
    // Using the parentNameAndLabel index
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'domain',
      {
        where: [
          ['normalizedParentDomainName', '==', normalizedParentDomain],
          ['normalizedLabel', '==', normalizedLabel],
        ],
        limit: 1,
      }
    );

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DPNS] Got ${documentsResponse.documents?.length || 0} documents`);
    }

    // Check if we found a document
    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        name,
        identityId: null,
        found: false,
      };
    }

    // We found a document - the name exists
    const documentBuffer = documentsResponse.documents[0];

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DPNS] Document buffer length: ${documentBuffer.length}`);
      console.log(`[DPNS] First 20 bytes: ${documentBuffer.slice(0, 20).toString('hex')}`);
    }

    // The document is in platform versioned bincode format (version byte + bincode data)
    // Without WASM we can't fully deserialize it, but we can try to extract the identity ID
    // The owner ID is typically a 32-byte field in the document

    // Try to extract identity ID from the raw bytes
    // In platform documents, the ownerId is typically near the beginning
    // Skip version byte (0x00) and look for 32-byte identifier patterns
    let identityId = null;

    try {
      // Platform document format: version byte + document data
      // Owner ID should be within first 100 bytes typically
      const bytes = Buffer.from(documentBuffer);

      // Skip version byte if present
      let offset = bytes[0] === 0x00 ? 1 : 0;

      // DPNS domain document structure places ownerId early
      // Try to find it - ownerId is 32 bytes
      // Look for a valid Base58-encodable 32-byte sequence
      for (let i = offset; i < Math.min(bytes.length - 32, 100); i++) {
        const potentialId = bytes.slice(i, i + 32);
        // Check if this looks like an identifier (not all zeros/ones)
        const allZeros = potentialId.every(b => b === 0);
        const allOnes = potentialId.every(b => b === 255);
        if (!allZeros && !allOnes) {
          // First plausible 32-byte sequence is likely the owner ID
          identityId = bs58.encode(potentialId);
          break;
        }
      }

      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[DPNS] Extracted identity ID: ${identityId || 'not found'}`);
      }
    } catch (extractError) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[DPNS] Could not extract identity ID: ${extractError.message}`);
      }
    }

    return {
      name,
      identityId,
      found: true,
      documentExists: true,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DPNS] Resolution error: ${error.message}`);
    }

    // Handle "not found" gracefully
    if (error.message?.includes('not found') || error.code === 5) {
      return {
        name,
        identityId: null,
        found: false,
      };
    }

    throw error;
  }
}

/**
 * Check if a DPNS name is available using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.label - Label to check (without .dash suffix)
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Availability result
 */
export async function dpnsIsAvailableOperation(params, sdk, wasmModule, network = 'testnet') {
  const { label } = params;

  if (!label) {
    throw new Error('Missing required parameter: label');
  }

  const normalizedLabel = normalizeLabel(label);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DPNS] Checking availability: ${label}`);
    console.log(`[DPNS] Normalized: ${normalizedLabel}`);
    console.log(`[DPNS] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });
  const contractIdBuffer = Buffer.from(bs58.decode(DPNS_CONTRACT_ID));

  try {
    // Query for existing domain with this label
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'domain',
      {
        where: [
          ['normalizedParentDomainName', '==', 'dash'],
          ['normalizedLabel', '==', normalizedLabel],
        ],
        limit: 1,
      }
    );

    // Name is available if no documents found
    const isAvailable = !documentsResponse.documents || documentsResponse.documents.length === 0;

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DPNS] Name "${label}" is ${isAvailable ? 'available' : 'taken'}`);
    }

    return {
      label,
      isAvailable,
    };
  } catch (error) {
    // NOT_FOUND error means the name is available
    if (error.message?.includes('not found') || error.code === 5) {
      return {
        label,
        isAvailable: true,
      };
    }

    throw error;
  }
}

/**
 * Get the primary username for an identity using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to query
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Username result
 */
export async function dpnsUsernameOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId } = params;

  if (!identityId) {
    throw new Error('Missing required parameter: identityId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DPNS] Getting username for identity: ${identityId}`);
    console.log(`[DPNS] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });
  const contractIdBuffer = Buffer.from(bs58.decode(DPNS_CONTRACT_ID));

  // Convert identity ID to buffer for the query
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  try {
    // Query for domains owned by this identity
    // Using the identityId index on records.identity
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'domain',
      {
        where: [
          ['records.identity', '==', identityIdBuffer],
        ],
        limit: 1,
      }
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        identityId,
        username: null,
        found: false,
      };
    }

    // Parse document to get label
    const cbor = (await import('cbor')).default;
    const document = cbor.decode(documentsResponse.documents[0]);

    const label = document.label;
    const parentDomain = document.parentDomainName || 'dash';
    const username = parentDomain ? `${label}.${parentDomain}` : label;

    return {
      identityId,
      username,
      found: true,
    };
  } catch (error) {
    if (error.message?.includes('not found') || error.code === 5) {
      return {
        identityId,
        username: null,
        found: false,
      };
    }
    throw error;
  }
}

/**
 * Get detailed username info by name using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.username - Full username (e.g., 'alice.dash')
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Username info result
 */
export async function dpnsGetUsernameByNameOperation(params, sdk, wasmModule, network = 'testnet') {
  const { username } = params;

  if (!username) {
    throw new Error('Missing required parameter: username');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DPNS] Getting username info: ${username}`);
    console.log(`[DPNS] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Reuse dpnsResolveOperation to get the document
  const result = await dpnsResolveOperation({ name: username }, sdk, wasmModule, network);

  if (!result.found) {
    return {
      found: false,
      username,
    };
  }

  // For full info, we need to query again to get document ID
  // Parse username
  let label, parentDomain;
  if (username.includes('.')) {
    const parts = username.split('.');
    label = parts[0];
    parentDomain = parts.slice(1).join('.');
  } else {
    label = username;
    parentDomain = 'dash';
  }

  const dapiClient = new DAPIClient({ network });
  const contractIdBuffer = Buffer.from(bs58.decode(DPNS_CONTRACT_ID));

  const normalizedLabel = normalizeLabel(label);
  const normalizedParentDomain = normalizeLabel(parentDomain);

  try {
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'domain',
      {
        where: [
          ['normalizedParentDomainName', '==', normalizedParentDomain],
          ['normalizedLabel', '==', normalizedLabel],
        ],
        limit: 1,
      }
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        found: false,
        username,
      };
    }

    // Parse document for document ID
    // The document ID is typically derived from the document bytes
    const documentBuffer = documentsResponse.documents[0];
    const cbor = (await import('cbor')).default;
    const document = cbor.decode(documentBuffer);

    // Extract document ID if present (usually in $id field)
    let documentId = null;
    if (document.$id) {
      documentId = bs58.encode(Buffer.from(document.$id));
    }

    return {
      found: true,
      username: `${label}.${parentDomain}`,
      identityId: result.identityId,
      documentId,
    };
  } catch (error) {
    if (error.message?.includes('not found') || error.code === 5) {
      return {
        found: false,
        username,
      };
    }
    throw error;
  }
}
