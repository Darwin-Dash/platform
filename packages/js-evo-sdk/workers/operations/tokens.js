/**
 * Token Operations for WASM Worker
 *
 * Provides token balance and info queries that run in isolated worker processes
 * to avoid WASM mutex lock issues.
 */

import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

/**
 * Token History Contract ID (system contract)
 * Base58: 3o6X4bq4UTLS6YZqDxMVTasTJ3u1dNH9B61L9HxH3wE3
 */
const TOKEN_HISTORY_CONTRACT_ID = '3o6X4bq4UTLS6YZqDxMVTasTJ3u1dNH9B61L9HxH3wE3';

/**
 * Token History document types
 */
const TOKEN_HISTORY_DOCUMENT_TYPES = {
  TRANSFER: 'transfer',
  MINT: 'mint',
  CLAIM: 'claim',
  DIRECT_PURCHASE: 'directPurchase',
};

/**
 * Get token balances for identities
 *
 * @param {object} params - Operation parameters
 * @param {string[]} params.identityIds - Array of identity IDs
 * @param {string} params.tokenId - Token ID to query
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Balances result
 */
export async function tokenBalancesOperation(params, sdk) {
  const { identityIds, tokenId } = params;

  if (!identityIds || !tokenId) {
    throw new Error('Missing required parameters: identityIds, tokenId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting balances for ${identityIds.length} identities`);
  }

  const balances = await sdk.tokens.balances(identityIds, tokenId);

  // Convert Map to plain object for serialization
  const balancesObj = {};
  if (balances instanceof Map) {
    for (const [key, value] of balances) {
      balancesObj[key] = value.toString();
    }
  }

  return {
    tokenId,
    balances: balancesObj,
  };
}

/**
 * Get identity's balances across multiple tokens
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to query
 * @param {string[]} params.tokenIds - Array of token IDs
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Identity balances result
 */
export async function tokenIdentityBalancesOperation(params, sdk) {
  const { identityId, tokenIds } = params;

  if (!identityId || !tokenIds) {
    throw new Error('Missing required parameters: identityId, tokenIds');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting ${tokenIds.length} token balances for identity`);
  }

  const balances = await sdk.tokens.identityBalances(identityId, tokenIds);

  // Convert Map to plain object for serialization
  const balancesObj = {};
  if (balances instanceof Map) {
    for (const [key, value] of balances) {
      balancesObj[key] = value.toString();
    }
  }

  return {
    identityId,
    balances: balancesObj,
  };
}

/**
 * Get token total supply
 *
 * @param {object} params - Operation parameters
 * @param {string} params.tokenId - Token ID to query
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Total supply result
 */
export async function tokenTotalSupplyOperation(params, sdk) {
  const { tokenId } = params;

  if (!tokenId) {
    throw new Error('Missing required parameter: tokenId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting total supply for token: ${tokenId}`);
  }

  const supply = await sdk.tokens.totalSupply(tokenId);

  return {
    tokenId,
    totalSupply: supply?.amount?.toString() || '0',
  };
}

/**
 * Get token statuses
 *
 * @param {object} params - Operation parameters
 * @param {string[]} params.tokenIds - Array of token IDs
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Statuses result
 */
export async function tokenStatusesOperation(params, sdk) {
  const { tokenIds } = params;

  if (!tokenIds) {
    throw new Error('Missing required parameter: tokenIds');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting statuses for ${tokenIds.length} tokens`);
  }

  const statuses = await sdk.tokens.statuses(tokenIds);

  // Convert Map to plain object for serialization
  const statusesObj = {};
  if (statuses instanceof Map) {
    for (const [key, value] of statuses) {
      statusesObj[key] = value;
    }
  }

  return {
    statuses: statusesObj,
  };
}

/**
 * Get token contract info
 *
 * @param {object} params - Operation parameters
 * @param {string} params.contractId - Contract ID to query
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Contract info result
 */
export async function tokenContractInfoOperation(params, sdk) {
  const { contractId } = params;

  if (!contractId) {
    throw new Error('Missing required parameter: contractId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting contract info for: ${contractId}`);
  }

  const contractInfo = await sdk.tokens.contractInfo(contractId);

  return {
    contractId,
    contractInfo: contractInfo || null,
  };
}

/**
 * Get direct purchase prices for tokens
 *
 * @param {object} params - Operation parameters
 * @param {string[]} params.tokenIds - Array of token IDs
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Prices result
 */
export async function tokenDirectPurchasePricesOperation(params, sdk) {
  const { tokenIds } = params;

  if (!tokenIds) {
    throw new Error('Missing required parameter: tokenIds');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting direct purchase prices for ${tokenIds.length} tokens`);
  }

  const prices = await sdk.tokens.directPurchasePrices(tokenIds);

  // Convert Map to plain object for serialization
  const pricesObj = {};
  if (prices instanceof Map) {
    for (const [key, value] of prices) {
      pricesObj[key] = value;
    }
  }

  return {
    prices: pricesObj,
  };
}

/**
 * Get identity token infos
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to query
 * @param {string[]} params.tokenIds - Array of token IDs
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Token infos result
 */
export async function tokenIdentityTokenInfosOperation(params, sdk) {
  const { identityId, tokenIds } = params;

  if (!identityId || !tokenIds) {
    throw new Error('Missing required parameters: identityId, tokenIds');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting token infos for identity with ${tokenIds.length} tokens`);
  }

  const tokenInfos = await sdk.tokens.identityTokenInfos(identityId, tokenIds);

  // Convert Map to plain object for serialization
  const infosObj = {};
  if (tokenInfos instanceof Map) {
    for (const [key, value] of tokenInfos) {
      infosObj[key] = value;
    }
  }

  return {
    identityId,
    tokenInfos: infosObj,
  };
}

/**
 * Get token price by contract
 *
 * @param {object} params - Operation parameters
 * @param {string} params.contractId - Contract ID
 * @param {number} params.tokenPosition - Token position within contract
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Price info result
 */
export async function tokenPriceByContractOperation(params, sdk) {
  const { contractId, tokenPosition } = params;

  if (!contractId || tokenPosition === undefined) {
    throw new Error('Missing required parameters: contractId, tokenPosition');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Getting price for contract ${contractId} position ${tokenPosition}`);
  }

  const priceInfo = await sdk.tokens.priceByContract(contractId, tokenPosition);

  return {
    contractId,
    tokenPosition,
    priceInfo: priceInfo || null,
  };
}

/**
 * Calculate token ID from contract ID and position
 *
 * @param {object} params - Operation parameters
 * @param {string} params.contractId - Contract ID
 * @param {number} params.tokenPosition - Token position within contract
 * @param {EvoSDK} sdk - Connected SDK instance
 * @returns {Promise<object>} Calculated token ID
 */
export async function tokenCalculateIdOperation(params, sdk) {
  const { contractId, tokenPosition } = params;

  if (!contractId || tokenPosition === undefined) {
    throw new Error('Missing required parameters: contractId, tokenPosition');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Calculating token ID for contract ${contractId} position ${tokenPosition}`);
  }

  const tokenId = await sdk.tokens.calculateId(contractId, tokenPosition);

  return {
    contractId,
    tokenPosition,
    tokenId,
  };
}

/**
 * Discover tokens for an identity by querying Token History Contract
 *
 * Uses direct DAPI calls to bypass WASM RwLock issues.
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to discover tokens for
 * @param {number} [params.limit=100] - Max documents to query per type
 * @param {EvoSDK} sdk - SDK instance (used for network config only)
 * @param {object} wasmModule - WASM module (not used)
 * @param {string} network - Network name
 * @returns {Promise<object>} Discovery result with tokenIds array
 */
export async function tokenDiscoverOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId, limit = 100 } = params;

  if (!identityId) {
    throw new Error('Missing required parameter: identityId');
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Discovering tokens for identity: ${identityId}`);
    console.log(`[Tokens] Using JavaScript DAPI client (bypassing WASM)`);
  }

  const tokenIds = new Set();

  // Create JavaScript DAPI client
  const dapiClient = new DAPIClient({ network });
  const contractIdBuffer = Buffer.from(bs58.decode(TOKEN_HISTORY_CONTRACT_ID));
  const identityIdBuffer = Buffer.from(bs58.decode(identityId));

  // Query transfers where this identity received tokens
  try {
    const transfers = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      TOKEN_HISTORY_DOCUMENT_TYPES.TRANSFER,
      {
        where: [['toIdentityId', '==', identityIdBuffer]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      }
    );

    if (transfers?.documents) {
      for (const docBuffer of transfers.documents) {
        const tokenId = extractTokenIdFromDocument(docBuffer);
        if (tokenId) tokenIds.add(tokenId);
      }
    }

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Found ${transfers?.documents?.length || 0} transfer documents`);
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Transfer query failed: ${error.message}`);
    }
  }

  // Query mints where this identity received tokens
  try {
    const mints = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      TOKEN_HISTORY_DOCUMENT_TYPES.MINT,
      {
        where: [['recipientId', '==', identityIdBuffer]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      }
    );

    if (mints?.documents) {
      for (const docBuffer of mints.documents) {
        const tokenId = extractTokenIdFromDocument(docBuffer);
        if (tokenId) tokenIds.add(tokenId);
      }
    }

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Found ${mints?.documents?.length || 0} mint documents`);
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Mint query failed: ${error.message}`);
    }
  }

  // Query claims by this identity
  try {
    const claims = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      TOKEN_HISTORY_DOCUMENT_TYPES.CLAIM,
      {
        where: [['recipientId', '==', identityIdBuffer]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      }
    );

    if (claims?.documents) {
      for (const docBuffer of claims.documents) {
        const tokenId = extractTokenIdFromDocument(docBuffer);
        if (tokenId) tokenIds.add(tokenId);
      }
    }

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Found ${claims?.documents?.length || 0} claim documents`);
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Claim query failed: ${error.message}`);
    }
  }

  // Query direct purchases by this identity
  try {
    const purchases = await dapiClient.platform.getDocuments(
      contractIdBuffer,
      TOKEN_HISTORY_DOCUMENT_TYPES.DIRECT_PURCHASE,
      {
        where: [['$ownerId', '==', identityIdBuffer]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      }
    );

    if (purchases?.documents) {
      for (const docBuffer of purchases.documents) {
        const tokenId = extractTokenIdFromDocument(docBuffer);
        if (tokenId) tokenIds.add(tokenId);
      }
    }

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Found ${purchases?.documents?.length || 0} direct purchase documents`);
    }
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Direct purchase query failed: ${error.message}`);
    }
  }

  const result = Array.from(tokenIds);

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Discovered ${result.length} unique tokens`);
  }

  return {
    identityId,
    tokenIds: result,
    count: result.length,
  };
}

/**
 * Discover tokens and fetch their balances for an identity
 *
 * @param {object} params - Operation parameters
 * @param {string} params.identityId - Identity ID to discover tokens for
 * @param {number} [params.limit=100] - Max documents to query per type
 * @param {EvoSDK} sdk - Connected SDK instance
 * @param {object} wasmModule - WASM module
 * @param {string} network - Network name
 * @returns {Promise<object>} Discovery result with tokens array (id + balance)
 */
export async function tokenDiscoverWithBalancesOperation(params, sdk, wasmModule, network = 'testnet') {
  const { identityId, limit = 100 } = params;

  if (!identityId) {
    throw new Error('Missing required parameter: identityId');
  }

  // First discover tokens
  const discovery = await tokenDiscoverOperation(params, sdk, wasmModule, network);
  const tokenIds = discovery.tokenIds;

  if (tokenIds.length === 0) {
    return {
      identityId,
      tokens: [],
      count: 0,
    };
  }

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Tokens] Fetching balances for ${tokenIds.length} discovered tokens`);
  }

  // Fetch balances for all discovered tokens
  const balances = await sdk.tokens.identityBalances(identityId, tokenIds);

  // Convert Map to array of objects
  const tokens = [];
  if (balances instanceof Map) {
    for (const [tokenId, balance] of balances) {
      const id = tokenId.toString ? tokenId.toString() : tokenId;
      tokens.push({
        tokenId: id,
        balance: balance.toString(),
      });
    }
  }

  return {
    identityId,
    tokens,
    count: tokens.length,
  };
}

/**
 * Extract token ID from a document buffer
 * Documents are in platform versioned bincode format
 *
 * @param {Buffer} docBuffer - Raw document buffer from DAPI
 * @returns {string|null} Token ID as base58 string, or null if not found
 */
function extractTokenIdFromDocument(docBuffer) {
  const bytes = Buffer.from(docBuffer);

  try {
    // Skip version byte if present
    let offset = bytes[0] === 0x00 ? 1 : 0;

    // Search for 32-byte identifiers that could be tokenId
    // Token history documents typically have tokenId early in the structure
    // after the standard document fields (id, ownerId)

    // Look for potential 32-byte identifiers
    const identifiersFound = [];

    for (let i = offset; i < Math.min(bytes.length - 32, 300); i++) {
      const potentialId = bytes.slice(i, i + 32);

      // Skip if all zeros or all 0xFF
      const allZeros = potentialId.every((b) => b === 0);
      const allOnes = potentialId.every((b) => b === 255);

      if (!allZeros && !allOnes) {
        identifiersFound.push({
          offset: i,
          id: bs58.encode(potentialId),
        });

        // Skip past this identifier
        i += 31;

        // We need at most 4 identifiers (doc ID, owner ID, contract ID, token ID)
        if (identifiersFound.length >= 4) break;
      }
    }

    // Token ID is typically the 4th identifier in token history documents
    // after: document ID, owner ID, data contract ID
    // This is a heuristic - actual position may vary by document type
    if (identifiersFound.length >= 4) {
      return identifiersFound[3].id;
    }

    // Fallback: if we found at least 3 identifiers, try the 3rd
    if (identifiersFound.length >= 3) {
      return identifiersFound[2].id;
    }

    return null;
  } catch (error) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Tokens] Failed to extract tokenId: ${error.message}`);
    }
    return null;
  }
}
