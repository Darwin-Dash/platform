import * as wasm from '../wasm.js';
import type { EvoSDK } from '../sdk.js';

/**
 * Token History Contract ID (system contract)
 * This contract records all token operations as queryable documents.
 * Bytes: [45, 67, 89, 21, 34, 216, 145, 78, 156, 243, 17, 58, 202, 190, 13, 92,
 *         61, 40, 122, 201, 84, 99, 187, 110, 233, 128, 63, 48, 172, 29, 210, 108]
 * Base58: 3o6X4bq4UTLS6YZqDxMVTasTJ3u1dNH9B61L9HxH3wE3
 */
export const TOKEN_HISTORY_CONTRACT_ID = '3o6X4bq4UTLS6YZqDxMVTasTJ3u1dNH9B61L9HxH3wE3';

/**
 * Token History document types for discovery queries
 */
export const TOKEN_HISTORY_DOCUMENT_TYPES = {
  TRANSFER: 'transfer',
  MINT: 'mint',
  CLAIM: 'claim',
  DIRECT_PURCHASE: 'directPurchase',
} as const;

export interface DiscoveredToken {
  tokenId: string;
  balance: bigint;
}

export class TokensFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  async calculateId(contractId: wasm.IdentifierLike, tokenPosition: number): Promise<string> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.calculateTokenIdFromContract(contractId, tokenPosition);
  }

  // Queries
  async priceByContract(contractId: wasm.IdentifierLike, tokenPosition: number): Promise<wasm.TokenPriceInfo> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenPriceByContract(contractId, tokenPosition);
  }

  async totalSupply(tokenId: wasm.IdentifierLike): Promise<wasm.TokenTotalSupply | undefined> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenTotalSupply(tokenId);
  }

  async totalSupplyWithProof(tokenId: wasm.IdentifierLike): Promise<wasm.ProofMetadataResponseTyped<wasm.TokenTotalSupply | null>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenTotalSupplyWithProofInfo(tokenId);
  }

  async statuses(tokenIds: wasm.IdentifierLike[]): Promise<Map<wasm.Identifier, wasm.TokenStatus>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenStatuses(tokenIds);
  }

  async statusesWithProof(tokenIds: wasm.IdentifierLike[]): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, wasm.TokenStatus>>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenStatusesWithProofInfo(tokenIds);
  }

  async balances(identityIds: wasm.IdentifierLike[], tokenId: wasm.IdentifierLike): Promise<Map<wasm.Identifier, bigint>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentitiesTokenBalances(identityIds, tokenId);
  }

  async balancesWithProof(identityIds: wasm.IdentifierLike[], tokenId: wasm.IdentifierLike): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, bigint>>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentitiesTokenBalancesWithProofInfo(identityIds, tokenId);
  }

  async identityBalances(identityId: wasm.IdentifierLike, tokenIds: wasm.IdentifierLike[]): Promise<Map<wasm.Identifier, bigint>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityTokenBalances(identityId, tokenIds);
  }

  async identityBalancesWithProof(identityId: wasm.IdentifierLike, tokenIds: wasm.IdentifierLike[]): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, bigint>>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityTokenBalancesWithProofInfo(identityId, tokenIds);
  }

  async identityTokenInfos(identityId: wasm.IdentifierLike, tokenIds: wasm.IdentifierLike[]): Promise<Map<wasm.Identifier, wasm.IdentityTokenInfo>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityTokenInfos(identityId, tokenIds);
  }

  async identitiesTokenInfos(identityIds: wasm.IdentifierLike[], tokenId: wasm.IdentifierLike): Promise<Map<wasm.Identifier, wasm.IdentityTokenInfo>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentitiesTokenInfos(identityIds, tokenId);
  }

  async identityTokenInfosWithProof(identityId: wasm.IdentifierLike, tokenIds: wasm.IdentifierLike[]): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, wasm.IdentityTokenInfo>>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentityTokenInfosWithProofInfo(identityId, tokenIds);
  }

  async identitiesTokenInfosWithProof(identityIds: wasm.IdentifierLike[], tokenId: wasm.IdentifierLike): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, wasm.IdentityTokenInfo>>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getIdentitiesTokenInfosWithProofInfo(identityIds, tokenId);
  }

  async directPurchasePrices(tokenIds: wasm.IdentifierLike[]): Promise<Map<wasm.Identifier, wasm.TokenPriceInfo>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenDirectPurchasePrices(tokenIds);
  }

  async directPurchasePricesWithProof(tokenIds: wasm.IdentifierLike[]): Promise<wasm.ProofMetadataResponseTyped<Map<wasm.Identifier, wasm.TokenPriceInfo>>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenDirectPurchasePricesWithProofInfo(tokenIds);
  }

  async contractInfo(contractId: wasm.IdentifierLike): Promise<wasm.TokenContractInfo | undefined> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenContractInfo(contractId);
  }

  async contractInfoWithProof(contractId: wasm.IdentifierLike): Promise<wasm.ProofMetadataResponseTyped<wasm.TokenContractInfo | undefined>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenContractInfoWithProofInfo(contractId);
  }

  async perpetualDistributionLastClaim(identityId: wasm.IdentifierLike, tokenId: wasm.IdentifierLike): Promise<wasm.RewardDistributionMoment | undefined> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenPerpetualDistributionLastClaim(identityId, tokenId);
  }

  async perpetualDistributionLastClaimWithProof(identityId: wasm.IdentifierLike, tokenId: wasm.IdentifierLike): Promise<wasm.ProofMetadataResponseTyped<wasm.RewardDistributionMoment | undefined>> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.getTokenPerpetualDistributionLastClaimWithProofInfo(identityId, tokenId);
  }

  // Transitions
  async mint(options: wasm.TokenMintOptions): Promise<wasm.TokenMintResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenMint(options);
  }

  async burn(options: wasm.TokenBurnOptions): Promise<wasm.TokenBurnResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenBurn(options);
  }

  async transfer(options: wasm.TokenTransferOptions): Promise<wasm.TokenTransferResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenTransfer(options);
  }

  async freeze(options: wasm.TokenFreezeOptions): Promise<wasm.TokenFreezeResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenFreeze(options);
  }

  async unfreeze(options: wasm.TokenUnfreezeOptions): Promise<wasm.TokenUnfreezeResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenUnfreeze(options);
  }

  async destroyFrozen(options: wasm.TokenDestroyFrozenOptions): Promise<wasm.TokenDestroyFrozenResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenDestroyFrozen(options);
  }

  async emergencyAction(options: wasm.TokenEmergencyActionOptions): Promise<wasm.TokenEmergencyActionResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenEmergencyAction(options);
  }

  async setPrice(options: wasm.TokenSetPriceOptions): Promise<wasm.TokenSetPriceResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenSetPrice(options);
  }

  async directPurchase(options: wasm.TokenDirectPurchaseOptions): Promise<wasm.TokenDirectPurchaseResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenDirectPurchase(options);
  }

  async claim(options: wasm.TokenClaimOptions): Promise<wasm.TokenClaimResult> {
    const w = await this.sdk.getWasmSdkConnected();
    return w.tokenClaim(options);
  }

  // Discovery Methods

  /**
   * Discover tokens for an identity by querying the Token History Contract.
   * This queries multiple document types (transfer, mint, claim, directPurchase)
   * to find all tokens the identity has interacted with.
   *
   * @param identityId - The identity to discover tokens for
   * @param limit - Maximum number of history documents to query per type (default: 100)
   * @returns Array of unique token IDs discovered
   *
   * @example
   * ```typescript
   * const tokenIds = await sdk.tokens.discoverTokens('4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi');
   * console.log('Found tokens:', tokenIds);
   * // ['Hqyu8WcRw...', '9XkM2aPq1...']
   * ```
   */
  async discoverTokens(identityId: wasm.IdentifierLike, limit: number = 100): Promise<string[]> {
    const w = await this.sdk.getWasmSdkConnected();
    const tokenIds = new Set<string>();

    // Query transfers where this identity received tokens
    try {
      const transfers = await w.getDocuments({
        dataContractId: TOKEN_HISTORY_CONTRACT_ID,
        documentTypeName: TOKEN_HISTORY_DOCUMENT_TYPES.TRANSFER,
        where: [['toIdentityId', '==', identityId]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      });
      this.extractTokenIdsFromDocuments(transfers, tokenIds);
    } catch (error) {
      // Contract may not exist or query may fail - continue with other types
      console.warn('[TokensFacade] Transfer query failed:', error);
    }

    // Query mints where this identity received tokens
    try {
      const mints = await w.getDocuments({
        dataContractId: TOKEN_HISTORY_CONTRACT_ID,
        documentTypeName: TOKEN_HISTORY_DOCUMENT_TYPES.MINT,
        where: [['recipientId', '==', identityId]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      });
      this.extractTokenIdsFromDocuments(mints, tokenIds);
    } catch (error) {
      console.warn('[TokensFacade] Mint query failed:', error);
    }

    // Query claims by this identity
    try {
      const claims = await w.getDocuments({
        dataContractId: TOKEN_HISTORY_CONTRACT_ID,
        documentTypeName: TOKEN_HISTORY_DOCUMENT_TYPES.CLAIM,
        where: [['recipientId', '==', identityId]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      });
      this.extractTokenIdsFromDocuments(claims, tokenIds);
    } catch (error) {
      console.warn('[TokensFacade] Claim query failed:', error);
    }

    // Query direct purchases by this identity (uses $ownerId)
    try {
      const purchases = await w.getDocuments({
        dataContractId: TOKEN_HISTORY_CONTRACT_ID,
        documentTypeName: TOKEN_HISTORY_DOCUMENT_TYPES.DIRECT_PURCHASE,
        where: [['$ownerId', '==', identityId]],
        orderBy: [['$createdAt', 'desc']],
        limit,
      });
      this.extractTokenIdsFromDocuments(purchases, tokenIds);
    } catch (error) {
      console.warn('[TokensFacade] Direct purchase query failed:', error);
    }

    return Array.from(tokenIds);
  }

  /**
   * Discover tokens and fetch their balances for an identity.
   *
   * @param identityId - The identity to discover tokens for
   * @param limit - Maximum number of history documents to query per type (default: 100)
   * @returns Map of token IDs to balances
   *
   * @example
   * ```typescript
   * const tokens = await sdk.tokens.discoverTokensWithBalances('4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi');
   * for (const [tokenId, balance] of tokens) {
   *   console.log(`${tokenId}: ${balance}`);
   * }
   * ```
   */
  async discoverTokensWithBalances(identityId: wasm.IdentifierLike, limit: number = 100): Promise<Map<string, bigint>> {
    const tokenIds = await this.discoverTokens(identityId, limit);

    if (tokenIds.length === 0) {
      return new Map();
    }

    // Fetch balances for all discovered tokens
    const balances = await this.identityBalances(identityId, tokenIds);

    // Convert from Map<Identifier, bigint> to Map<string, bigint>
    const result = new Map<string, bigint>();
    for (const [id, balance] of balances) {
      const idStr = typeof id === 'string' ? id : id.toString();
      result.set(idStr, balance);
    }

    return result;
  }

  /**
   * Extract token IDs from a map of documents
   * @private
   */
  private extractTokenIdsFromDocuments(
    documents: Map<wasm.Identifier, wasm.Document | undefined>,
    tokenIds: Set<string>
  ): void {
    for (const [_, doc] of documents) {
      if (doc) {
        try {
          const props = doc.getProperties();
          // tokenId may be stored as bytes or as an Identifier
          const tokenId = props.get('tokenId');
          if (tokenId) {
            // Convert to string if needed
            const tokenIdStr = this.identifierToString(tokenId);
            if (tokenIdStr) {
              tokenIds.add(tokenIdStr);
            }
          }
        } catch (error) {
          // Skip documents that fail to parse
          console.warn('[TokensFacade] Failed to extract tokenId from document:', error);
        }
      }
    }
  }

  /**
   * Convert various identifier formats to string
   * @private
   */
  private identifierToString(id: unknown): string | null {
    if (typeof id === 'string') {
      return id;
    }
    if (id && typeof id === 'object') {
      // Check for Identifier-like object with toString or toBase58
      if (typeof (id as { toString?: () => string }).toString === 'function') {
        return (id as { toString: () => string }).toString();
      }
      if (typeof (id as { toBase58?: () => string }).toBase58 === 'function') {
        return (id as { toBase58: () => string }).toBase58();
      }
      // Check for byte array (Uint8Array or Array)
      if (id instanceof Uint8Array || Array.isArray(id)) {
        // Convert bytes to base58
        return this.bytesToBase58(id as Uint8Array | number[]);
      }
    }
    return null;
  }

  /**
   * Convert bytes to base58 string
   * @private
   */
  private bytesToBase58(bytes: Uint8Array | number[]): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    // Count leading zeros
    let zeros = 0;
    for (const byte of arr) {
      if (byte === 0) zeros++;
      else break;
    }

    // Convert to base58
    const digits: number[] = [];
    for (const byte of arr) {
      let carry = byte;
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = Math.floor(carry / 58);
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = Math.floor(carry / 58);
      }
    }

    // Build result
    let result = '';
    for (let i = 0; i < zeros; i++) result += ALPHABET[0];
    for (let i = digits.length - 1; i >= 0; i--) result += ALPHABET[digits[i]];

    return result;
  }
}
