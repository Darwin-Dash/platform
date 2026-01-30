/**
 * Token Operations for WASM Worker
 *
 * Provides token balance and info queries that run in isolated worker processes
 * to avoid WASM mutex lock issues.
 */

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
