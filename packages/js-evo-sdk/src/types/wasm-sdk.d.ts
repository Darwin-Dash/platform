/**
 * Stub type declarations for @dashevo/wasm-sdk
 *
 * This file provides minimal type stubs to allow TypeScript to compile
 * without the full wasm-sdk build. The actual types come from the wasm-sdk
 * once it's built.
 *
 * TODO: Remove this file once wasm-sdk is properly built and types are available.
 */

declare module '@dashevo/wasm-sdk' {
  export function init(): Promise<void>;

  export class WasmSdk {
    static generateMnemonic(params: any): string;
    static validateMnemonic(mnemonic: string, languageCode: string | null): boolean;
    static mnemonicToSeed(mnemonic: string, passphrase: string | null): Uint8Array;
    static deriveKeyFromSeedPhrase(params: any): any;
    static deriveKeyFromSeedWithPath(params: any): any;
    static deriveKeyFromSeedWithExtendedPath(params: any): any;
    static deriveDashpayContactKey(params: any): any;
    static derivationPathBip44Mainnet(account: number, change: number, index: number): any;
    static derivationPathBip44Testnet(account: number, change: number, index: number): any;
    static derivationPathDip9Mainnet(featureType: number, account: number, index: number): any;
    static derivationPathDip9Testnet(featureType: number, account: number, index: number): any;
    static derivationPathDip13Mainnet(account: number): any;
    static derivationPathDip13Testnet(account: number): any;
    static deriveChildPublicKey(xpub: string, index: number, hardened: boolean): string;
    static xprvToXpub(xprv: string): string;
    static generateKeyPair(network: any): any;
    static generateKeyPairs(network: any, count: number): any[];
    static keyPairFromWif(privateKeyWif: string): any;
    static keyPairFromHex(privateKeyHex: string, network: any): any;
    static pubkeyToAddress(pubkeyHex: string, network: any): string;
    static validateAddress(address: string, network: any): boolean;
    static signMessage(message: string, privateKeyWif: string): string;
    static calculateTokenIdFromContract(contractId: string, tokenIndex: number): string;
    static fromMnemonic(mnemonic: string, params: any): any;
    static dpnsConvertToHomographSafe(name: string): string;
    static dpnsIsValidUsername(name: string): boolean;
    static dpnsIsContestedUsername(name: string): boolean;
    static prefetchTrustedQuorumsMainnet(): Promise<void>;
    static prefetchTrustedQuorumsTestnet(): Promise<void>;
    static prefetchTrustedQuorumsLocal(): Promise<void>;
    static setLogLevel(levelOrFilter: string): void;

    connect(network: string, options: any): Promise<void>;
    disconnect(): void;
    isConnected(): boolean;

    // Platform operations
    getIdentity(id: any): Promise<any>;
    getIdentityByPublicKeyHash(hash: any): Promise<any>;
    createIdentity(params: any): Promise<any>;
    topUpIdentity(params: any): Promise<any>;
    getDocument(contractId: any, type: string, documentId: any): Promise<any>;
    getDocumentWithProofInfo(contractId: any, type: string, documentId: any): Promise<any>;
    getDocuments(params: any): Promise<any>;
    publishDocument(params: any): Promise<any>;
    getDataContract(id: any): Promise<any>;
    publishDataContract(params: any): Promise<any>;

    // Any additional methods
    [key: string]: any;
  }

  export class WasmSdkBuilder {
    constructor();

    // Static factory methods
    static withAddresses(addresses: string[], network?: string): WasmSdkBuilder;
    static mainnetTrusted(): WasmSdkBuilder;
    static mainnet(): WasmSdkBuilder;
    static testnetTrusted(): WasmSdkBuilder;
    static testnet(): WasmSdkBuilder;
    static localTrusted(): WasmSdkBuilder;
    static local(): WasmSdkBuilder;
    static getLatestVersionNumber(): number;

    // Instance methods
    withNetwork(network: string): WasmSdkBuilder;
    withOptions(options: any): WasmSdkBuilder;
    withAddresses(addresses: string[]): WasmSdkBuilder;
    withTrusted(trusted: boolean): WasmSdkBuilder;
    withSettings(connectTimeoutMs: number | null, timeoutMs: number | null, retries: number | null, banFailedAddress: boolean | null): WasmSdkBuilder;
    withProofs(proofs: boolean): WasmSdkBuilder;
    withVersion(version: number): WasmSdkBuilder;
    withLogs(logs: string): WasmSdkBuilder;
    withConnectTimeoutMs(timeout: number): WasmSdkBuilder;
    withTimeoutMs(timeout: number): WasmSdkBuilder;
    withRetries(retries: number): WasmSdkBuilder;
    withBanFailedAddress(ban: boolean): WasmSdkBuilder;
    build(): WasmSdk;
  }

  // IdentityWasm as a class with static and instance methods
  // Note: The wasm-sdk actually exports this as "Identity" not "IdentityWasm"
  export class IdentityWasm {
    constructor(data: any);
    static fromBuffer(buffer: Uint8Array): IdentityWasm;
    getId(): { toBuffer(): Uint8Array; toString(): string };
    getBalance(): number;
    getPublicKeys(): any[];
    getRevision(): number;
    toJSON(): any;
    [key: string]: any;
  }

  // Identity class - actual export from wasm-sdk (with fromBytes method)
  export class Identity {
    constructor(data: any);
    static fromBytes(buffer: Uint8Array): Identity;
    static fromBase64(base64: string): Identity;
    static fromHex(hex: string): Identity;
    static fromJSON(json: any): Identity;
    static fromObject(obj: any): Identity;
    id(): any;
    balance(): number;
    revision(): number;
    getPublicKeys(): any[];
    getPublicKeyById(id: number): any;
    addPublicKey(key: any): void;
    toJSON(): any;
    toBytes(): Uint8Array;
    toBase64(): string;
    toHex(): string;
    toObject(): any;
    free(): void;
    [key: string]: any;
  }

  // Export all commonly used types as any for now
  export type Identifier = any;
  export type IdentifierLike = any;
  export type Document = any;
  export type DataContract = any;
  export type PlatformAddressLike = any;
  export type PlatformAddress = any;
  export type PlatformAddressInfo = any;
  export type ProofMetadataResponseTyped<T = any> = { data: T; proof?: any };
  export type NetworkLike = any;
  export type Group = any;

  // Options types
  export type AddressFundsTransferOptions = any;
  export type AddressFundsWithdrawOptions = any;
  export type AddressFundingFromAssetLockOptions = any;
  export type IdentityTopUpFromAddressesOptions = any;
  export type IdentityTopUpFromAddressesResult = any;
  export type IdentityTransferToAddressesOptions = any;
  export type IdentityTransferToAddressesResult = any;
  export type IdentityCreateFromAddressesOptions = any;
  export type IdentityCreateFromAddressesResult = any;
  export type ContractPublishOptions = any;
  export type ContractUpdateOptions = any;
  export type DocumentsQuery = any;
  export type DataContractHistoryQuery = any;

  // Key derivation types
  export type GenerateMnemonicParams = any;
  export type DeriveKeyFromSeedPhraseParams = any;
  export type DeriveKeyFromSeedWithPathParams = any;
  export type DeriveKeyFromSeedWithExtendedPathParams = any;
  export type DeriveDashpayContactKeyParams = any;
  export type SeedPhraseKeyInfo = any;
  export type PathDerivedKeyInfo = any;
  export type DerivedKeyInfo = any;
  export type DashpayContactKeyInfo = any;
  export type DerivationPathInfo = any;
  export type Dip13DerivationPathInfo = any;
  export type KeyPair = any;

  // Document types
  export type DocumentCreateOptions = any;
  export type DocumentReplaceOptions = any;
  export type DocumentDeleteOptions = any;
  export type DocumentTransferOptions = any;
  export type DocumentPurchaseOptions = any;
  export type DocumentSetPriceOptions = any;

  // DPNS types
  export type DpnsName = any;
  export type DpnsQuery = any;
  export type DpnsContestedName = any;
  export type VoteQuery = any;
  export type ContestedResourceVoteState = any;
  export type DpnsRegisterNameOptions = any;
  export type RegisterDpnsNameResult = any;
  export type DpnsUsernamesQuery = any;
  export type DpnsUsernameInfo = any;

  // Token types
  export type TokenBalance = any;
  export type TokenBalanceQuery = any;
  export type TokenMintOptions = any;
  export type TokenBurnOptions = any;
  export type TokenTransferOptions = any;
  export type TokenFreezeOptions = any;
  export type TokenUnfreezeOptions = any;
  export type TokenClaimOptions = any;
  export type TokenDestroyFrozenFundsOptions = any;
  export type TokenEmergencyActionOptions = any;
  export type TokenInfoQuery = any;
  export type TokenInfo = any;
  export type TokenHistoryQuery = any;
  export type TokenStatus = any;
  export type TokenMintResult = any;
  export type TokenBurnResult = any;
  export type TokenTransferResult = any;

  // Group types
  export type GroupInfo = any;
  export type GroupInfoQuery = any;
  export type GroupInfosQuery = any;
  export type GroupAction = any;
  export type GroupActionQuery = any;
  export type GroupActionsQuery = any;
  export type GroupActionSignersQuery = any;
  export type GroupMembersQuery = any;
  export type GroupMember = any;
  export type GroupMembersWithActionStatusQuery = any;
  export type GroupMemberWithActionStatus = any;
  export type GroupActiveProposalQuery = any;
  export type GroupActiveProposal = any;
  export type IdentityGroupsQuery = any;
  export type IdentityGroupInfo = any;
  export type VotePollsByDocumentTypeQuery = any;
  export type ContestedResourceVotersForIdentityQuery = any;

  // Voting types
  export type Vote = any;
  export type VoteChoice = any;
  export type ResourceVoteChoice = any;
  export type VotesByIdentityQuery = any;

  // Protocol types
  export type ProtocolVersionQuery = any;
  export type ProtocolVersionInfo = any;
  export type ProtocolVersionUpgradeState = any;
  export type ProtocolVersionUpgradeVoteStatus = any;

  // Epoch types
  export type EpochQuery = any;
  export type EpochInfo = any;
  export type CurrentEpochQuery = any;
  export type EpochsInfoQuery = any;
  export type EpochsQuery = any;
  export type FinalizedEpochsQuery = any;
  export type EvonodeProposedBlocksRangeQuery = any;
  export type ExtendedEpochInfo = any;
  export type FinalizedEpochInfo = any;

  // System types
  export type SystemStatus = any;
  export type TotalCreditsQuery = any;
  export type StatusResponse = any;
  export type CurrentQuorumsInfo = any;
  export type ContestedResourceVoteStateQuery = any;
  export type PrefundedSpecializedBalance = any;
  export type StateTransitionResult = any;
  export type PathElement = any;

  // Additional Token types
  export type TokenPriceInfo = any;
  export type TokenTotalSupply = any;
  export type IdentityTokenInfo = any;
  export type TokenContractInfo = any;
  export type RewardDistributionMoment = any;
  export type TokenFreezeResult = any;
  export type TokenUnfreezeResult = any;
  export type TokenDestroyFrozenOptions = any;
  export type TokenDestroyFrozenResult = any;
  export type TokenEmergencyActionResult = any;
  export type TokenSetPriceOptions = any;
  export type TokenSetPriceResult = any;
  export type TokenDirectPurchaseOptions = any;
  export type TokenDirectPurchaseResult = any;
  export type TokenClaimResult = any;

  // Additional Voting types
  export type ContestedResourceIdentityVotesQuery = any;
  export type ResourceVote = any;
  export type VotePollsByEndDateQuery = any;
  export type VotePollsByEndDateEntry = any;
  export type MasternodeVoteOptions = any;

  // Default export
  export default function init(): Promise<typeof WasmSdk>;
}

declare module '@dashevo/wasm-sdk/compressed' {
  export * from '@dashevo/wasm-sdk';
  export { default } from '@dashevo/wasm-sdk';
}
