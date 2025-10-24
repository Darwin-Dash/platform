import * as wasm from '../wasm.js';
import { asJsonString } from '../util.js';
import type { EvoSDK } from '../sdk.js';
import type {
  IdentityWasm,
  IdentityKeys,
  Nonce,
  ContractNonce,
  Balance,
  BalanceAndRevision,
  TokenBalances,
  WithProof,
  StateTransitionResult,
} from '../types/index.js';
import { withErrorHandling } from '../errors.js';

export class IdentitiesFacade {
  private sdk: EvoSDK;

  constructor(sdk: EvoSDK) {
    this.sdk = sdk;
  }

  async get(identityId: string): Promise<IdentityWasm> {
    return withErrorHandling('fetch identity', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentity(identityId);
    }, identityId);
  }

  async getWithProof(identityId: string): Promise<WithProof<IdentityWasm>> {
    return withErrorHandling('fetch identity with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityWithProofInfo(identityId);
    }, identityId);
  }

  async fetchUnproved(identityId: string): Promise<IdentityWasm> {
    return withErrorHandling('fetch unproved identity', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityUnproved(identityId);
    }, identityId);
  }

  async getKeys(args: { identityId: string; keyRequestType: 'all' | 'specific' | 'search'; specificKeyIds?: number[]; searchPurposeMap?: unknown; limit?: number; offset?: number }): Promise<IdentityKeys> {
    return withErrorHandling('fetch identity keys', async () => {
      const { identityId, keyRequestType, specificKeyIds, searchPurposeMap, limit, offset } = args;
      const mapJson = asJsonString(searchPurposeMap);
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityKeys(
        identityId,
        keyRequestType,
        specificKeyIds ? Uint32Array.from(specificKeyIds) : null,
        mapJson ?? null,
        limit ?? null,
        offset ?? null,
      );
    }, args.identityId);
  }

  async getKeysWithProof(args: { identityId: string; keyRequestType: 'all' | 'specific' | 'search'; specificKeyIds?: number[]; limit?: number; offset?: number }): Promise<WithProof<IdentityKeys>> {
    return withErrorHandling('fetch identity keys with proof', async () => {
      const { identityId, keyRequestType, specificKeyIds, limit, offset } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityKeysWithProofInfo(
        identityId,
        keyRequestType,
        specificKeyIds ? Uint32Array.from(specificKeyIds) : null,
        limit ?? null,
        offset ?? null,
      );
    }, args.identityId);
  }

  async nonce(identityId: string): Promise<Nonce> {
    return withErrorHandling('fetch identity nonce', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityNonce(identityId);
    }, identityId);
  }

  async nonceWithProof(identityId: string): Promise<WithProof<Nonce>> {
    return withErrorHandling('fetch identity nonce with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityNonceWithProofInfo(identityId);
    }, identityId);
  }

  async contractNonce(identityId: string, contractId: string): Promise<ContractNonce> {
    return withErrorHandling('fetch contract nonce', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityContractNonce(identityId, contractId);
    }, `${identityId}/${contractId}`);
  }

  async contractNonceWithProof(identityId: string, contractId: string): Promise<WithProof<ContractNonce>> {
    return withErrorHandling('fetch contract nonce with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityContractNonceWithProofInfo(identityId, contractId);
    }, `${identityId}/${contractId}`);
  }

  async balance(identityId: string): Promise<Balance> {
    return withErrorHandling('fetch balance', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityBalance(identityId);
    }, identityId);
  }

  async balanceWithProof(identityId: string): Promise<WithProof<Balance>> {
    return withErrorHandling('fetch balance with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityBalanceWithProofInfo(identityId);
    }, identityId);
  }

  async balances(identityIds: string[]): Promise<Balance[]> {
    return withErrorHandling('fetch balances', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesBalances(identityIds);
    }, `${identityIds.length} identities`);
  }

  async balancesWithProof(identityIds: string[]): Promise<WithProof<Balance[]>> {
    return withErrorHandling('fetch balances with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesBalancesWithProofInfo(identityIds);
    }, `${identityIds.length} identities`);
  }

  async balanceAndRevision(identityId: string): Promise<BalanceAndRevision> {
    return withErrorHandling('fetch balance and revision', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityBalanceAndRevision(identityId);
    }, identityId);
  }

  async balanceAndRevisionWithProof(identityId: string): Promise<WithProof<BalanceAndRevision>> {
    return withErrorHandling('fetch balance and revision with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityBalanceAndRevisionWithProofInfo(identityId);
    }, identityId);
  }

  async byPublicKeyHash(publicKeyHash: string): Promise<IdentityWasm> {
    return withErrorHandling('fetch identity by public key hash', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityByPublicKeyHash(publicKeyHash);
    }, publicKeyHash);
  }

  async byPublicKeyHashWithProof(publicKeyHash: string): Promise<WithProof<IdentityWasm>> {
    return withErrorHandling('fetch identity by public key hash with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityByPublicKeyHashWithProofInfo(publicKeyHash);
    }, publicKeyHash);
  }

  async byNonUniquePublicKeyHash(publicKeyHash: string, opts: { startAfter?: string } = {}): Promise<IdentityWasm[]> {
    return withErrorHandling('fetch identities by non-unique public key hash', async () => {
      const { startAfter } = opts;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityByNonUniquePublicKeyHash(publicKeyHash, startAfter ?? null);
    }, publicKeyHash);
  }

  async byNonUniquePublicKeyHashWithProof(publicKeyHash: string, opts: { startAfter?: string } = {}): Promise<WithProof<IdentityWasm[]>> {
    return withErrorHandling('fetch identities by non-unique public key hash with proof', async () => {
      const { startAfter } = opts;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityByNonUniquePublicKeyHashWithProofInfo(publicKeyHash, startAfter ?? null);
    }, publicKeyHash);
  }

  async contractKeys(args: { identityIds: string[]; contractId: string; purposes?: number[] }): Promise<any> {
    return withErrorHandling('fetch contract keys', async () => {
      const { identityIds, contractId, purposes } = args;
      const purposesArray = purposes && purposes.length > 0 ? Uint32Array.from(purposes) : null;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesContractKeys(identityIds, contractId, purposesArray);
    }, contractId);
  }

  async contractKeysWithProof(args: { identityIds: string[]; contractId: string; purposes?: number[] }): Promise<any> {
    return withErrorHandling('fetch contract keys with proof', async () => {
      const { identityIds, contractId, purposes } = args;
      const purposesArray = purposes && purposes.length > 0 ? Uint32Array.from(purposes) : null;
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentitiesContractKeysWithProofInfo(identityIds, contractId, purposesArray);
    }, contractId);
  }

  async tokenBalances(identityId: string, tokenIds: string[]): Promise<TokenBalances> {
    return withErrorHandling('fetch token balances', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityTokenBalances(identityId, tokenIds);
    }, identityId);
  }

  async tokenBalancesWithProof(identityId: string, tokenIds: string[]): Promise<WithProof<TokenBalances>> {
    return withErrorHandling('fetch token balances with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getIdentityTokenBalancesWithProofInfo(identityId, tokenIds);
    }, identityId);
  }

  async create(args: { assetLockProof: unknown; assetLockPrivateKeyWif: string; publicKeys: unknown[] }): Promise<StateTransitionResult> {
    return withErrorHandling('create identity', async () => {
      const { assetLockProof, assetLockPrivateKeyWif, publicKeys } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.identityCreate(asJsonString(assetLockProof)!, assetLockPrivateKeyWif, asJsonString(publicKeys)!);
    }, 'identity creation');
  }

  async topUp(args: { identityId: string; assetLockProof: unknown; assetLockPrivateKeyWif: string }): Promise<StateTransitionResult> {
    return withErrorHandling('top up identity', async () => {
      const { identityId, assetLockProof, assetLockPrivateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.identityTopUp(identityId, asJsonString(assetLockProof)!, assetLockPrivateKeyWif);
    }, args.identityId);
  }

  async creditTransfer(args: { senderId: string; recipientId: string; amount: number | bigint | string; privateKeyWif: string; keyId?: number }): Promise<StateTransitionResult> {
    return withErrorHandling('transfer credits', async () => {
      const { senderId, recipientId, amount, privateKeyWif, keyId } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.identityCreditTransfer(senderId, recipientId, BigInt(amount), privateKeyWif, keyId ?? null);
    }, `${senderId} → ${recipientId}`);
  }

  async creditWithdrawal(args: { identityId: string; toAddress: string; amount: number | bigint | string; coreFeePerByte?: number; privateKeyWif: string; keyId?: number }): Promise<StateTransitionResult> {
    return withErrorHandling('withdraw credits', async () => {
      const { identityId, toAddress, amount, coreFeePerByte = 1, privateKeyWif, keyId } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.identityCreditWithdrawal(identityId, toAddress, BigInt(amount), coreFeePerByte ?? null, privateKeyWif, keyId ?? null);
    }, `${identityId} → ${toAddress}`);
  }

  async update(args: { identityId: string; addPublicKeys?: unknown[]; disablePublicKeyIds?: number[]; privateKeyWif: string }): Promise<StateTransitionResult> {
    return withErrorHandling('update identity', async () => {
      const { identityId, addPublicKeys, disablePublicKeyIds, privateKeyWif } = args;
      const w = await this.sdk.getWasmSdkConnected();
      return w.identityUpdate(
        identityId,
        addPublicKeys ? asJsonString(addPublicKeys)! : null,
        disablePublicKeyIds ? Uint32Array.from(disablePublicKeyIds) : null,
        privateKeyWif,
      );
    }, args.identityId);
  }
}
