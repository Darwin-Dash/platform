/**
 * DashPay Operations for WASM Worker
 *
 * Provides DashPay profile and contact query operations.
 *
 * CRITICAL: Uses JavaScript DAPI client directly to avoid WASM RwLock issues.
 */

import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

// DashPay Contract ID on testnet (same as mainnet)
const DASHPAY_CONTRACT_ID = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';

/**
 * Get DashPay profile for an identity
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch profile for
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Profile result
 */
export async function dashpayProfileOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId } = params;

  if (!identityId) {
    throw new Error('Missing required parameter: identityId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DashPay] Getting profile for: ${identityId}`);
    console.log(`[DashPay] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });

  // Convert IDs to buffers
  const contractIdBuffer = Buffer.from(bs58.decode(DASHPAY_CONTRACT_ID));
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  try {
    // Query for profile document where $ownerId == identityId
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'profile',
      {
        where: [
          ['$ownerId', '==', identityIdBuffer],
        ],
        limit: 1,
      }
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        found: false,
        profile: null,
      };
    }

    // Parse the profile from platform versioned bincode format
    const profileBuffer = documentsResponse.documents[0];
    const parsedProfile = parseProfileFromBytes(profileBuffer, identityId);

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Profile found for: ${identityId}`);
    }

    return {
      found: true,
      profile: parsedProfile,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Get profile error: ${error.message}`);
    }

    if (error.message?.includes('not found') || error.code === 5) {
      return {
        found: false,
        profile: null,
      };
    }

    throw error;
  }
}

/**
 * Get sent contact requests for an identity
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch contacts for
 * @param {number} params.limit - Maximum number of results
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Contact requests result
 */
export async function dashpayContactsSentOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId, limit = 50 } = params;

  if (!identityId) {
    throw new Error('Missing required parameter: identityId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DashPay] Getting sent contacts for: ${identityId}`);
    console.log(`[DashPay] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });

  // Convert IDs to buffers
  const contractIdBuffer = Buffer.from(bs58.decode(DASHPAY_CONTRACT_ID));
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  try {
    // Query for contactRequest documents where $ownerId == identityId (sent requests)
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'contactRequest',
      {
        where: [
          ['$ownerId', '==', identityIdBuffer],
        ],
        limit,
      }
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        requests: [],
        count: 0,
      };
    }

    // Parse all contact requests
    const requests = documentsResponse.documents.map((docBuffer, index) => {
      return parseContactRequestFromBytes(docBuffer, index);
    });

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Found ${requests.length} sent contact requests`);
    }

    return {
      requests,
      count: requests.length,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Get sent contacts error: ${error.message}`);
    }

    if (error.message?.includes('not found') || error.code === 5) {
      return {
        requests: [],
        count: 0,
      };
    }

    throw error;
  }
}

/**
 * Get received contact requests for an identity
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to fetch contacts for
 * @param {number} params.limit - Maximum number of results
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Contact requests result
 */
export async function dashpayContactsReceivedOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId, limit = 50 } = params;

  if (!identityId) {
    throw new Error('Missing required parameter: identityId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DashPay] Getting received contacts for: ${identityId}`);
    console.log(`[DashPay] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });

  // Convert IDs to buffers
  const contractIdBuffer = Buffer.from(bs58.decode(DASHPAY_CONTRACT_ID));
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  try {
    // Query for contactRequest documents where toUserId == identityId (received requests)
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      'contactRequest',
      {
        where: [
          ['toUserId', '==', identityIdBuffer],
        ],
        limit,
      }
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        requests: [],
        count: 0,
      };
    }

    // Parse all contact requests
    const requests = documentsResponse.documents.map((docBuffer, index) => {
      return parseContactRequestFromBytes(docBuffer, index);
    });

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Found ${requests.length} received contact requests`);
    }

    return {
      requests,
      count: requests.length,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Get received contacts error: ${error.message}`);
    }

    if (error.message?.includes('not found') || error.code === 5) {
      return {
        requests: [],
        count: 0,
      };
    }

    throw error;
  }
}

/**
 * Parse a profile document from platform versioned bincode format
 * Extracts basic info from raw bytes since full deserialization requires WASM
 *
 * @param {Buffer} docBuffer - Raw document buffer from DAPI
 * @param {string} identityId - Owner identity ID for fallback
 * @returns {object} Parsed profile with extracted fields
 */
function parseProfileFromBytes(docBuffer, identityId) {
  const bytes = Buffer.from(docBuffer);

  let documentId = null;
  let ownerId = null;

  try {
    // Skip version byte if present
    let offset = bytes[0] === 0x00 ? 1 : 0;

    // Try to extract 32-byte identifiers
    const identifiersFound = [];

    for (let i = offset; i < Math.min(bytes.length - 32, 200); i++) {
      const potentialId = bytes.slice(i, i + 32);
      const allZeros = potentialId.every(b => b === 0);
      const allOnes = potentialId.every(b => b === 255);

      if (!allZeros && !allOnes) {
        identifiersFound.push({
          offset: i,
          id: bs58.encode(potentialId)
        });
        i += 31;
        if (identifiersFound.length >= 2) break;
      }
    }

    if (identifiersFound.length >= 1) {
      documentId = identifiersFound[0].id;
    }
    if (identifiersFound.length >= 2) {
      ownerId = identifiersFound[1].id;
    }

    // Try to extract string fields (displayName, publicMessage)
    // Strings in bincode are length-prefixed
    // This is a best-effort extraction
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Profile parse error: ${error.message}`);
    }
  }

  return {
    $id: documentId || 'unknown',
    $ownerId: ownerId || identityId,
    $revision: null,
    $createdAt: null,
    $updatedAt: null,
    data: {
      displayName: null,
      publicMessage: null,
      avatarUrl: null,
      avatarHash: null,
    },
    _rawBytesLength: bytes.length,
    _note: 'Partial extraction - full profile requires WASM deserialization',
  };
}

/**
 * Parse a contact request document from platform versioned bincode format
 *
 * @param {Buffer} docBuffer - Raw document buffer from DAPI
 * @param {number} index - Document index for ID generation
 * @returns {object} Parsed contact request with extracted fields
 */
function parseContactRequestFromBytes(docBuffer, index) {
  const bytes = Buffer.from(docBuffer);

  let documentId = null;
  let ownerId = null;
  let toUserId = null;

  try {
    // Skip version byte if present
    let offset = bytes[0] === 0x00 ? 1 : 0;

    // Try to extract 32-byte identifiers
    const identifiersFound = [];

    for (let i = offset; i < Math.min(bytes.length - 32, 300); i++) {
      const potentialId = bytes.slice(i, i + 32);
      const allZeros = potentialId.every(b => b === 0);
      const allOnes = potentialId.every(b => b === 255);

      if (!allZeros && !allOnes) {
        identifiersFound.push({
          offset: i,
          id: bs58.encode(potentialId)
        });
        i += 31;
        if (identifiersFound.length >= 3) break;
      }
    }

    // Contact request typically has: documentId, ownerId, toUserId
    if (identifiersFound.length >= 1) {
      documentId = identifiersFound[0].id;
    }
    if (identifiersFound.length >= 2) {
      ownerId = identifiersFound[1].id;
    }
    if (identifiersFound.length >= 3) {
      toUserId = identifiersFound[2].id;
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DashPay] Contact request parse error: ${error.message}`);
    }
  }

  return {
    $id: documentId || `unknown-${index}`,
    $ownerId: ownerId || 'unknown',
    data: {
      toUserId: toUserId || 'unknown',
    },
    _rawBytesLength: bytes.length,
    _note: 'Partial extraction - full contact request requires WASM deserialization',
  };
}
