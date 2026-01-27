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
