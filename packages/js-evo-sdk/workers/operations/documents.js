/**
 * Document Operations for WASM Worker
 *
 * Provides document query operations that run in isolated worker processes.
 *
 * CRITICAL: Uses JavaScript DAPI client directly to avoid WASM RwLock issues.
 * The WASM SDK's async methods acquire reader locks that conflict with the SDK
 * connection lock. By using DAPI directly, we bypass WASM entirely.
 */

import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

/**
 * Get a document by ID using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.contractId - Data contract ID
 * @param {string} params.documentType - Document type name
 * @param {string} params.documentId - Document ID to fetch
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Document result
 */
export async function documentGetOperation(params, sdk, wasmModule, network = 'testnet') {
  const { contractId, documentType, documentId } = params;

  if (!contractId || !documentType || !documentId) {
    throw new Error('Missing required parameters: contractId, documentType, documentId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Documents] Getting document: ${documentId}`);
    console.log(`[Documents] Contract: ${contractId}, Type: ${documentType}`);
    console.log(`[Documents] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });

  // Convert IDs to buffers
  const contractIdBuffer = Buffer.from(bs58.decode(contractId));
  const documentIdBuffer = Buffer.from(bs58.decode(documentId));

  try {
    // Query for the specific document by ID
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      documentType,
      {
        where: [
          ['$id', '==', documentIdBuffer],
        ],
        limit: 1,
      }
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        found: false,
        document: null,
      };
    }

    // Parse the document from platform versioned bincode format
    const documentBuffer = documentsResponse.documents[0];
    const parsedDoc = parseDocumentFromBytes(documentBuffer, 0);

    return {
      found: true,
      document: parsedDoc,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Documents] Get error: ${error.message}`);
    }

    if (error.message?.includes('not found') || error.code === 5) {
      return {
        found: false,
        document: null,
      };
    }

    throw error;
  }
}

/**
 * Query documents using direct DAPI calls
 *
 * @param {object} params - Operation parameters
 * @param {string} params.contractId - Data contract ID
 * @param {string} params.documentType - Document type name
 * @param {object} params.query - Query options (where, orderBy, limit, startAt, startAfter)
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Query result with documents array
 */
export async function documentQueryOperation(params, sdk, wasmModule, network = 'testnet') {
  const { contractId, documentType, query = {} } = params;

  if (!contractId || !documentType) {
    throw new Error('Missing required parameters: contractId, documentType');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Documents] Querying: ${documentType} from ${contractId}`);
    console.log(`[Documents] Query:`, JSON.stringify(query));
    console.log(`[Documents] Using JavaScript DAPI client (bypassing WASM)`);
  }

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });
  const contractIdBuffer = Buffer.from(bs58.decode(contractId));

  // Build query options for DAPI
  const queryOptions = {};

  if (query.where && Array.isArray(query.where)) {
    // Convert any base58 IDs in where clauses to buffers
    queryOptions.where = query.where.map(clause => {
      if (Array.isArray(clause) && clause.length === 3) {
        const [field, operator, value] = clause;
        // If value looks like a base58 ID, convert it
        if (typeof value === 'string' && value.length >= 32 && value.length <= 48) {
          try {
            const buffer = Buffer.from(bs58.decode(value));
            if (buffer.length === 32) {
              return [field, operator, buffer];
            }
          } catch (e) {
            // Not a valid base58, use as-is
          }
        }
        return clause;
      }
      return clause;
    });
  }

  if (query.orderBy) {
    queryOptions.orderBy = query.orderBy;
  }

  if (query.limit) {
    queryOptions.limit = query.limit;
  }

  if (query.startAt) {
    queryOptions.startAt = query.startAt;
  }

  if (query.startAfter) {
    queryOptions.startAfter = query.startAfter;
  }

  try {
    const documentsResponse = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      documentType,
      queryOptions
    );

    if (!documentsResponse.documents || documentsResponse.documents.length === 0) {
      return {
        documents: [],
        count: 0,
      };
    }

    // Parse all documents
    // Note: Documents are in platform versioned bincode format, not CBOR
    // We extract basic info from raw bytes since full deserialization requires WASM
    const documents = documentsResponse.documents.map((docBuffer, index) => {
      return parseDocumentFromBytes(docBuffer, index);
    });

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Documents] Found ${documents.length} documents`);
    }

    return {
      documents,
      count: documents.length,
    };
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Documents] Query error: ${error.message}`);
    }

    if (error.message?.includes('not found') || error.code === 5) {
      return {
        documents: [],
        count: 0,
      };
    }

    throw error;
  }
}

/**
 * Parse a document from platform versioned bincode format
 * Extracts basic info from raw bytes since full deserialization requires WASM
 *
 * @param {Buffer} docBuffer - Raw document buffer from DAPI
 * @param {number} index - Document index for ID generation
 * @returns {object} Parsed document with extracted fields
 */
function parseDocumentFromBytes(docBuffer, index) {
  const bytes = Buffer.from(docBuffer);

  // Platform document format: version byte (0x00) + bincode data
  // Without WASM we can't fully deserialize, but we extract what we can

  let documentId = null;
  let ownerId = null;

  try {
    // Skip version byte if present
    let offset = bytes[0] === 0x00 ? 1 : 0;

    // Try to extract 32-byte identifiers from the document
    // Typically document ID and owner ID are early in the structure
    const identifiersFound = [];

    for (let i = offset; i < Math.min(bytes.length - 32, 200); i++) {
      const potentialId = bytes.slice(i, i + 32);
      // Check if this looks like an identifier (not all zeros/ones/random)
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

    // First identifier is typically document ID, second is owner ID
    if (identifiersFound.length >= 1) {
      documentId = identifiersFound[0].id;
    }
    if (identifiersFound.length >= 2) {
      ownerId = identifiersFound[1].id;
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Documents] Parse error: ${error.message}`);
    }
  }

  return {
    $id: documentId || `unknown-${index}`,
    $ownerId: ownerId || 'unknown',
    $revision: null,
    $createdAt: null,
    $updatedAt: null,
    _rawBytesLength: bytes.length,
    _note: 'Partial extraction - full document requires WASM deserialization',
  };
}
