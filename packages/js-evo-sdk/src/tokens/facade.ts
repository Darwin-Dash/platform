import * as wasm from '../wasm.js';
import { asJsonString } from '../util.js';
import type { EvoSDK } from '../sdk.js';
import { withErrorHandling } from '../errors.js';

export class TokensFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  async calculateId(contractId: string, tokenPosition: number): Promise<string> {
    return withErrorHandling('calculate token ID', async () => {
      await wasm.ensureInitialized();
      return wasm.WasmSdk.calculateTokenIdFromContract(contractId, tokenPosition);
    }, contractId);
  }

  // Queries
  async priceByContract(contractId: string, tokenPosition: number): Promise<any> {
    return withErrorHandling('fetch token price by contract', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenPriceByContract(contractId, tokenPosition);
    }, contractId);
  }

  async totalSupply(tokenId: string): Promise<any> {
    return withErrorHandling('fetch token total supply', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenTotalSupply(tokenId);
    }, tokenId);
  }

  async totalSupplyWithProof(tokenId: string): Promise<any> {
    return withErrorHandling('fetch token total supply with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenTotalSupplyWithProofInfo(tokenId);
    }, tokenId);
  }

  async statuses(tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch token statuses', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenStatuses(tokenIds);
    }, `${tokenIds.length} tokens`);
  }

  async statusesWithProof(tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch token statuses with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenStatusesWithProofInfo(tokenIds);
    }, `${tokenIds.length} tokens`);
  }

  async balances(identityIds: string[], tokenId: string): Promise<any> {
    return withErrorHandling('fetch token balances', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesTokenBalances(identityIds, tokenId);
    }, `${identityIds.length} identities`);
  }

  async balancesWithProof(identityIds: string[], tokenId: string): Promise<any> {
    return withErrorHandling('fetch token balances with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesTokenBalancesWithProofInfo(identityIds, tokenId);
    }, `${identityIds.length} identities`);
  }

  async identityBalances(identityId: string, tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch identity token balances', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityTokenBalances(identityId, tokenIds);
    }, identityId);
  }

  async identityBalancesWithProof(identityId: string, tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch identity token balances with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityTokenBalancesWithProofInfo(identityId, tokenIds);
    }, identityId);
  }

  async identityTokenInfos(identityId: string, tokenIds: string[], _opts: { limit?: number; offset?: number } = {}): Promise<any> {
    return withErrorHandling('fetch identity token infos', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityTokenInfos(identityId, tokenIds);
    }, identityId);
  }

  async identitiesTokenInfos(identityIds: string[], tokenId: string): Promise<any> {
    return withErrorHandling('fetch identities token infos', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesTokenInfos(identityIds, tokenId);
    }, tokenId);
  }

  async identityTokenInfosWithProof(identityId: string, tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch identity token infos with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityTokenInfosWithProofInfo(identityId, tokenIds);
    }, identityId);
  }

  async identitiesTokenInfosWithProof(identityIds: string[], tokenId: string): Promise<any> {
    return withErrorHandling('fetch identities token infos with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesTokenInfosWithProofInfo(identityIds, tokenId);
    }, tokenId);
  }

  async directPurchasePrices(tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch direct purchase prices', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenDirectPurchasePrices(tokenIds);
    }, `${tokenIds.length} tokens`);
  }

  async directPurchasePricesWithProof(tokenIds: string[]): Promise<any> {
    return withErrorHandling('fetch direct purchase prices with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenDirectPurchasePricesWithProofInfo(tokenIds);
    }, `${tokenIds.length} tokens`);
  }

  async contractInfo(contractId: string): Promise<any> {
    return withErrorHandling('fetch token contract info', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenContractInfo(contractId);
    }, contractId);
  }

  async contractInfoWithProof(contractId: string): Promise<any> {
    return withErrorHandling('fetch token contract info with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenContractInfoWithProofInfo(contractId);
    }, contractId);
  }

  async perpetualDistributionLastClaim(identityId: string, tokenId: string): Promise<any> {
    return withErrorHandling('fetch perpetual distribution last claim', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenPerpetualDistributionLastClaim(identityId, tokenId);
    }, `${identityId}/${tokenId}`);
  }

  async perpetualDistributionLastClaimWithProof(identityId: string, tokenId: string): Promise<any> {
    return withErrorHandling('fetch perpetual distribution last claim with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getTokenPerpetualDistributionLastClaimWithProofInfo(identityId, tokenId);
    }, `${identityId}/${tokenId}`);
  }

  // Transitions
  async mint(args: { contractId: string; tokenPosition: number; amount: number | string | bigint; identityId: string; privateKeyWif: string; recipientId?: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('mint token', async () => {
      const { contractId, tokenPosition, amount, identityId, privateKeyWif, recipientId, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenMint(contractId, tokenPosition, String(amount), identityId, privateKeyWif, recipientId ?? null, publicNote ?? null);
    }, args.contractId);
  }

  async burn(args: { contractId: string; tokenPosition: number; amount: number | string | bigint; identityId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('burn token', async () => {
      const { contractId, tokenPosition, amount, identityId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenBurn(contractId, tokenPosition, String(amount), identityId, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }

  async transfer(args: { contractId: string; tokenPosition: number; amount: number | string | bigint; senderId: string; recipientId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('transfer token', async () => {
      const { contractId, tokenPosition, amount, senderId, recipientId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenTransfer(contractId, tokenPosition, String(amount), senderId, recipientId, privateKeyWif, publicNote ?? null);
    }, `${args.senderId} → ${args.recipientId}`);
  }

  async freeze(args: { contractId: string; tokenPosition: number; identityToFreeze: string; freezerId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('freeze token', async () => {
      const { contractId, tokenPosition, identityToFreeze, freezerId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenFreeze(contractId, tokenPosition, identityToFreeze, freezerId, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }

  async unfreeze(args: { contractId: string; tokenPosition: number; identityToUnfreeze: string; unfreezerId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('unfreeze token', async () => {
      const { contractId, tokenPosition, identityToUnfreeze, unfreezerId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenUnfreeze(contractId, tokenPosition, identityToUnfreeze, unfreezerId, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }

  async destroyFrozen(args: { contractId: string; tokenPosition: number; identityId: string; destroyerId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('destroy frozen token', async () => {
      const { contractId, tokenPosition, identityId, destroyerId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenDestroyFrozen(contractId, tokenPosition, identityId, destroyerId, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }

  async setPriceForDirectPurchase(args: { contractId: string; tokenPosition: number; identityId: string; priceType: string; priceData: unknown; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('set price for direct purchase', async () => {
      const { contractId, tokenPosition, identityId, priceType, priceData, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenSetPriceForDirectPurchase(contractId, tokenPosition, identityId, priceType, asJsonString(priceData)!, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }

  async directPurchase(args: { contractId: string; tokenPosition: number; amount: number | string | bigint; identityId: string; totalAgreedPrice?: number | string | bigint | null; privateKeyWif: string }): Promise<any> {
    return withErrorHandling('direct purchase token', async () => {
      const { contractId, tokenPosition, amount, identityId, totalAgreedPrice, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenDirectPurchase(contractId, tokenPosition, String(amount), identityId, totalAgreedPrice != null ? String(totalAgreedPrice) : null, privateKeyWif);
    }, args.contractId);
  }

  async claim(args: { contractId: string; tokenPosition: number; distributionType: string; identityId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('claim token distribution', async () => {
      const { contractId, tokenPosition, distributionType, identityId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenClaim(contractId, tokenPosition, distributionType, identityId, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }

  async configUpdate(args: { contractId: string; tokenPosition: number; configItemType: string; configValue: unknown; identityId: string; privateKeyWif: string; publicNote?: string }): Promise<any> {
    return withErrorHandling('update token config', async () => {
      const { contractId, tokenPosition, configItemType, configValue, identityId, privateKeyWif, publicNote } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.tokenConfigUpdate(contractId, tokenPosition, configItemType, asJsonString(configValue)!, identityId, privateKeyWif, publicNote ?? null);
    }, args.contractId);
  }
}
