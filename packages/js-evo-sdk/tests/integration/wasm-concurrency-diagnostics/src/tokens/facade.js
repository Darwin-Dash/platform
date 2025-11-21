import * as wasm from '../wasm.js';
import { asJsonString } from '../util.js';
import { withErrorHandling } from '../errors.js';
export class TokensFacade {
    sdk;
    constructor(sdk) {
        this.sdk = sdk;
    }
    async calculateId(contractId, tokenPosition) {
        return withErrorHandling('calculate token ID', async () => {
            await wasm.ensureInitialized();
            return wasm.WasmSdk.calculateTokenIdFromContract(contractId, tokenPosition);
        }, contractId);
    }
    // Queries
    async priceByContract(contractId, tokenPosition) {
        return withErrorHandling('fetch token price by contract', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenPriceByContract(contractId, tokenPosition);
        }, contractId);
    }
    async totalSupply(tokenId) {
        return withErrorHandling('fetch token total supply', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenTotalSupply(tokenId);
        }, tokenId);
    }
    async totalSupplyWithProof(tokenId) {
        return withErrorHandling('fetch token total supply with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenTotalSupplyWithProofInfo(tokenId);
        }, tokenId);
    }
    async statuses(tokenIds) {
        return withErrorHandling('fetch token statuses', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenStatuses(tokenIds);
        }, `${tokenIds.length} tokens`);
    }
    async statusesWithProof(tokenIds) {
        return withErrorHandling('fetch token statuses with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenStatusesWithProofInfo(tokenIds);
        }, `${tokenIds.length} tokens`);
    }
    async balances(identityIds, tokenId) {
        return withErrorHandling('fetch token balances', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentitiesTokenBalances(identityIds, tokenId);
        }, `${identityIds.length} identities`);
    }
    async balancesWithProof(identityIds, tokenId) {
        return withErrorHandling('fetch token balances with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentitiesTokenBalancesWithProofInfo(identityIds, tokenId);
        }, `${identityIds.length} identities`);
    }
    async identityBalances(identityId, tokenIds) {
        return withErrorHandling('fetch identity token balances', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentityTokenBalances(identityId, tokenIds);
        }, identityId);
    }
    async identityBalancesWithProof(identityId, tokenIds) {
        return withErrorHandling('fetch identity token balances with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentityTokenBalancesWithProofInfo(identityId, tokenIds);
        }, identityId);
    }
    async identityTokenInfos(identityId, tokenIds, _opts = {}) {
        return withErrorHandling('fetch identity token infos', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentityTokenInfos(identityId, tokenIds);
        }, identityId);
    }
    async identitiesTokenInfos(identityIds, tokenId) {
        return withErrorHandling('fetch identities token infos', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentitiesTokenInfos(identityIds, tokenId);
        }, tokenId);
    }
    async identityTokenInfosWithProof(identityId, tokenIds) {
        return withErrorHandling('fetch identity token infos with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentityTokenInfosWithProofInfo(identityId, tokenIds);
        }, identityId);
    }
    async identitiesTokenInfosWithProof(identityIds, tokenId) {
        return withErrorHandling('fetch identities token infos with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getIdentitiesTokenInfosWithProofInfo(identityIds, tokenId);
        }, tokenId);
    }
    async directPurchasePrices(tokenIds) {
        return withErrorHandling('fetch direct purchase prices', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenDirectPurchasePrices(tokenIds);
        }, `${tokenIds.length} tokens`);
    }
    async directPurchasePricesWithProof(tokenIds) {
        return withErrorHandling('fetch direct purchase prices with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenDirectPurchasePricesWithProofInfo(tokenIds);
        }, `${tokenIds.length} tokens`);
    }
    async contractInfo(contractId) {
        return withErrorHandling('fetch token contract info', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenContractInfo(contractId);
        }, contractId);
    }
    async contractInfoWithProof(contractId) {
        return withErrorHandling('fetch token contract info with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenContractInfoWithProofInfo(contractId);
        }, contractId);
    }
    async perpetualDistributionLastClaim(identityId, tokenId) {
        return withErrorHandling('fetch perpetual distribution last claim', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenPerpetualDistributionLastClaim(identityId, tokenId);
        }, `${identityId}/${tokenId}`);
    }
    async perpetualDistributionLastClaimWithProof(identityId, tokenId) {
        return withErrorHandling('fetch perpetual distribution last claim with proof', async () => {
            const w = await this.sdk.getWasmSdkConnected();
            return w.getTokenPerpetualDistributionLastClaimWithProofInfo(identityId, tokenId);
        }, `${identityId}/${tokenId}`);
    }
    // Transitions
    async mint(args) {
        return withErrorHandling('mint token', async () => {
            const { contractId, tokenPosition, amount, identityId, privateKeyWif, recipientId, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenMint(contractId, tokenPosition, String(amount), identityId, privateKeyWif, recipientId ?? null, publicNote ?? null);
        }, args.contractId);
    }
    async burn(args) {
        return withErrorHandling('burn token', async () => {
            const { contractId, tokenPosition, amount, identityId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenBurn(contractId, tokenPosition, String(amount), identityId, privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
    async transfer(args) {
        return withErrorHandling('transfer token', async () => {
            const { contractId, tokenPosition, amount, senderId, recipientId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenTransfer(contractId, tokenPosition, String(amount), senderId, recipientId, privateKeyWif, publicNote ?? null);
        }, `${args.senderId} → ${args.recipientId}`);
    }
    async freeze(args) {
        return withErrorHandling('freeze token', async () => {
            const { contractId, tokenPosition, identityToFreeze, freezerId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenFreeze(contractId, tokenPosition, identityToFreeze, freezerId, privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
    async unfreeze(args) {
        return withErrorHandling('unfreeze token', async () => {
            const { contractId, tokenPosition, identityToUnfreeze, unfreezerId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenUnfreeze(contractId, tokenPosition, identityToUnfreeze, unfreezerId, privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
    async destroyFrozen(args) {
        return withErrorHandling('destroy frozen token', async () => {
            const { contractId, tokenPosition, identityId, destroyerId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenDestroyFrozen(contractId, tokenPosition, identityId, destroyerId, privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
    async setPriceForDirectPurchase(args) {
        return withErrorHandling('set price for direct purchase', async () => {
            const { contractId, tokenPosition, identityId, priceType, priceData, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenSetPriceForDirectPurchase(contractId, tokenPosition, identityId, priceType, asJsonString(priceData), privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
    async directPurchase(args) {
        return withErrorHandling('direct purchase token', async () => {
            const { contractId, tokenPosition, amount, identityId, totalAgreedPrice, privateKeyWif } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenDirectPurchase(contractId, tokenPosition, String(amount), identityId, totalAgreedPrice != null ? String(totalAgreedPrice) : null, privateKeyWif);
        }, args.contractId);
    }
    async claim(args) {
        return withErrorHandling('claim token distribution', async () => {
            const { contractId, tokenPosition, distributionType, identityId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenClaim(contractId, tokenPosition, distributionType, identityId, privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
    async configUpdate(args) {
        return withErrorHandling('update token config', async () => {
            const { contractId, tokenPosition, configItemType, configValue, identityId, privateKeyWif, publicNote } = args;
            const w = await this.sdk.getWasmSdkConnected();
            return w.tokenConfigUpdate(contractId, tokenPosition, configItemType, asJsonString(configValue), identityId, privateKeyWif, publicNote ?? null);
        }, args.contractId);
    }
}
