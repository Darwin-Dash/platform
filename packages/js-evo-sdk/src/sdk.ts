import * as wasm from './wasm.js';
import { ensureInitialized as initWasm } from './wasm.js';
import { DocumentsFacade } from './documents/facade.js';
import { IdentitiesFacade } from './identities/facade.js';
import { ContractsFacade } from './contracts/facade.js';
import { TokensFacade } from './tokens/facade.js';
import { DpnsFacade } from './dpns/facade.js';
import { EpochFacade } from './epoch/facade.js';
import { ProtocolFacade } from './protocol/facade.js';
import { SystemFacade } from './system/facade.js';
import { GroupFacade } from './group/facade.js';
import { VotingFacade } from './voting/facade.js';
import { wasmOperationQueue } from './utils/wasm-operation-queue.js';
import { dapiClientWrapper } from './utils/dapi-client-wrapper.js';

export interface ConnectionOptions {
  version?: number;
  proofs?: boolean;
  // Configure tracing/logging emitted from the underlying Wasm SDK.
  // Accepts simple levels: 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  // or a full EnvFilter string like: 'wasm_sdk=debug,rs_dapi_client=warn'
  logs?: string;
  settings?: {
    connectTimeoutMs?: number;
    timeoutMs?: number;
    retries?: number;
    banFailedAddress?: boolean;
  };
}

export interface EvoSDKOptions extends ConnectionOptions {
  network?: 'testnet' | 'mainnet';
  trusted?: boolean;
  // Custom masternode addresses. When provided, network and trusted options are ignored.
  // Example: ['https://127.0.0.1:1443', 'https://192.168.1.100:1443']
  addresses?: string[];
}

export class EvoSDK {
  private wasmSdk?: wasm.WasmSdk;
  private options: Required<Pick<EvoSDKOptions, 'network' | 'trusted'>> & ConnectionOptions & { addresses?: string[] };

  // Guard to prevent multiple prefetchTrustedQuorums calls which create conflicting WASM locks
  // This is a process-level flag because prefetch creates global Rust mutex locks
  public static prefetchDone = false;

  public documents!: DocumentsFacade;
  public identities!: IdentitiesFacade;
  public contracts!: ContractsFacade;
  public tokens!: TokensFacade;
  public dpns!: DpnsFacade;
  public epoch!: EpochFacade;
  public protocol!: ProtocolFacade;
  public system!: SystemFacade;
  public group!: GroupFacade;
  public voting!: VotingFacade;
  constructor(options: EvoSDKOptions = {}) {
    // Apply defaults while preserving any future connection options
    const { network = 'testnet', trusted = false, addresses, ...connection } = options;
    this.options = { network, trusted, addresses, ...connection };

    this.documents = new DocumentsFacade(this);
    this.identities = new IdentitiesFacade(this);
    this.contracts = new ContractsFacade(this);
    this.tokens = new TokensFacade(this);
    this.dpns = new DpnsFacade(this);
    this.epoch = new EpochFacade(this);
    this.protocol = new ProtocolFacade(this);
    this.system = new SystemFacade(this);
    this.group = new GroupFacade(this);
    this.voting = new VotingFacade(this);
  }

  get wasm(): wasm.WasmSdk {
    if (!this.wasmSdk) throw new Error('SDK is not connected. Call EvoSDK#connect() first.');
    return this.wasmSdk;
  }

  get isConnected(): boolean { return !!this.wasmSdk; }

  get networkConfig(): { network: 'testnet' | 'mainnet' } {
    return { network: this.options.network };
  }

  async getWasmSdkConnected(): Promise<wasm.WasmSdk> {
    if (!this.wasmSdk) {
      await this.connect();
    }
    return this.wasmSdk as wasm.WasmSdk;
  }

  async connect(): Promise<void> {
    if (this.wasmSdk) return; // idempotent
    await initWasm();

    const { network, trusted, version, proofs, settings, logs, addresses } = this.options;

    let builder: wasm.WasmSdkBuilder;

    // CRITICAL: Guard prefetch with static flag to prevent "already locked to a reader" errors
    // Prefetch creates process-level Rust mutex locks that conflict if called multiple times
    // See: MIGRATE/packages/js-evo-sdk/src/sdk.ts (lines 154-179)
    //
    // WORKER CONTEXT: Skip prefetch in isolated worker processes (WASM_WORKER_CONTEXT=true)
    // Workers inherit parent's SDK locks, so they must NOT call prefetch again
    const isWorkerContext = process.env.WASM_WORKER_CONTEXT === 'true';
    if (process.env.LOG_LEVEL === 'debug' || isWorkerContext) {
      console.log(`[SDK] Worker context: ${isWorkerContext}, prefetchDone: ${EvoSDK.prefetchDone}`);
    }

    if (addresses && addresses.length > 0) {
      // Guard prefetch for custom addresses
      if (!EvoSDK.prefetchDone && !isWorkerContext) {
        if (network === 'mainnet') {
          await wasm.WasmSdk.prefetchTrustedQuorumsMainnet();
        } else if (network === 'testnet') {
          await wasm.WasmSdk.prefetchTrustedQuorumsTestnet();
        }
        EvoSDK.prefetchDone = true;
      }
      builder = wasm.WasmSdkBuilder.withAddresses(addresses, network);
    } else if (network === 'mainnet') {
      if (!EvoSDK.prefetchDone && !isWorkerContext) {
        await wasm.WasmSdk.prefetchTrustedQuorumsMainnet();
        EvoSDK.prefetchDone = true;
      }
      builder = trusted ? wasm.WasmSdkBuilder.mainnetTrusted() : wasm.WasmSdkBuilder.mainnet();
    } else if (network === 'testnet') {
      if (!EvoSDK.prefetchDone && !isWorkerContext) {
        await wasm.WasmSdk.prefetchTrustedQuorumsTestnet();
        EvoSDK.prefetchDone = true;
      }
      // In worker context, use non-trusted builder to avoid lock issues
      // Trusted builder may try to reuse quorum caches from prefetch
      builder = isWorkerContext && trusted ? wasm.WasmSdkBuilder.testnet() : (trusted ? wasm.WasmSdkBuilder.testnetTrusted() : wasm.WasmSdkBuilder.testnet());
    } else {
      throw new Error(`Unknown network: ${network}`);
    }

    if (version) builder = builder.withVersion(version);
    if (typeof proofs === 'boolean') builder = builder.withProofs(proofs);
    if (logs) builder = builder.withLogs(logs);
    if (settings) {
      const { connectTimeoutMs, timeoutMs, retries, banFailedAddress } = settings;
      builder = builder.withSettings(connectTimeoutMs ?? null, timeoutMs ?? null, retries ?? null, banFailedAddress ?? null);
    }

    if (process.env.LOG_LEVEL === 'debug' || isWorkerContext) {
      console.log(`[SDK] Calling builder.build() in worker context: ${isWorkerContext}`);
    }

    try {
      this.wasmSdk = builder.build();
      if (process.env.LOG_LEVEL === 'debug' || isWorkerContext) {
        console.log(`[SDK] builder.build() succeeded`);
      }
    } catch (error) {
      console.error(`[SDK] builder.build() failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset and cleanup WASM SDK resources
   *
   * Clears the internal WASM SDK instance and releases associated resources.
   * Useful for worker processes that need to cleanup after completing operations.
   *
   * After calling this, you must call connect() again before using the SDK.
   *
   * @returns Promise that resolves when cleanup is complete
   */
  async resetWasmSdk(): Promise<void> {
    if (this.wasmSdk) {
      this.wasmSdk = undefined;
    }
  }

  static fromWasm(wasmSdk: wasm.WasmSdk): EvoSDK {
    const sdk = new EvoSDK();
    (sdk as any).wasmSdk = wasmSdk;
    return sdk;
  }

  version(): number {
    return this.wasm.version();
  }

  // ============================================================================
  // Queue + DAPI POC Methods (for concurrent operation testing)
  // ============================================================================

  /**
   * Create an identity with WASM operation queuing
   *
   * Enqueues the identity creation to prevent WASM mutex conflicts
   * when multiple creates are called concurrently.
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @param amount Amount in duffs
   * @param options Advanced options
   * @returns Identity creation result
   */
  async identityCreate(
    mnemonic: string,
    amount: number,
    options?: any
  ): Promise<any> {
    return wasmOperationQueue.enqueue(async () =>
      this.identities.createWithWallet(mnemonic, amount, options)
    );
  }

  /**
   * Top up an identity with WASM operation queuing
   *
   * Enqueues the top-up to prevent WASM mutex conflicts
   * when multiple top-ups are called concurrently.
   *
   * @param identityId Identity to top up (Base58)
   * @param amount Amount in duffs
   * @param mnemonic 12-word BIP39 mnemonic for funding
   * @param options Advanced options
   * @returns Top-up result
   */
  async identityTopUp(
    identityId: string,
    amount: number,
    mnemonic: string,
    options?: any
  ): Promise<any> {
    return wasmOperationQueue.enqueue(async () =>
      this.identities.topUpWithWallet(identityId, amount, mnemonic, options)
    );
  }

  /**
   * Retrieve identities for a mnemonic using DAPI (bypasses WASM)
   *
   * Queries identities via gRPC without using WASM, allowing concurrent
   * reads while WASM operations are being serialized.
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @returns Array of discovered identities with public key info
   */
  async getIdentitiesForMnemonic(mnemonic: string): Promise<
    Array<{ identityId: string; publicKeyHash: string; keyIndex: number }>
  > {
    await dapiClientWrapper.initialize(this.options.network);
    return dapiClientWrapper.getIdentitiesForMnemonic(mnemonic);
  }

  static async setLogLevel(levelOrFilter: string): Promise<void> {
    await initWasm();
    wasm.WasmSdk.setLogLevel(levelOrFilter);
  }

  static async getLatestVersionNumber(): Promise<number> {
    await initWasm();
    return wasm.WasmSdkBuilder.getLatestVersionNumber();
  }

  // Factory helpers that return configured instances (not connected)
  static testnet(options: ConnectionOptions = {}): EvoSDK { return new EvoSDK({ network: 'testnet', ...options }); }
  static mainnet(options: ConnectionOptions = {}): EvoSDK { return new EvoSDK({ network: 'mainnet', ...options }); }
  static testnetTrusted(options: ConnectionOptions = {}): EvoSDK { return new EvoSDK({ network: 'testnet', trusted: true, ...options }); }
  static mainnetTrusted(options: ConnectionOptions = {}): EvoSDK { return new EvoSDK({ network: 'mainnet', trusted: true, ...options }); }

  /**
   * Create an EvoSDK instance configured with specific masternode addresses.
   *
   * @param addresses - Array of HTTPS URLs to masternodes (e.g., ['https://127.0.0.1:1443'])
   * @param network - Network identifier: 'mainnet', 'testnet' (default: 'testnet')
   * @param options - Additional connection options
   * @returns A configured EvoSDK instance (not yet connected - call .connect() to establish connection)
   *
   * @example
   * ```typescript
   * const sdk = EvoSDK.withAddresses(['https://52.12.176.90:1443'], 'testnet');
   * await sdk.connect();
   * ```
   */
  static withAddresses(addresses: string[], network: 'mainnet' | 'testnet' = 'testnet', options: ConnectionOptions = {}): EvoSDK {
    return new EvoSDK({ addresses, network, ...options });
  }
}

export { DocumentsFacade } from './documents/facade.js';
export { IdentitiesFacade } from './identities/facade.js';
export { ContractsFacade } from './contracts/facade.js';
export { TokensFacade } from './tokens/facade.js';
export { DpnsFacade } from './dpns/facade.js';
export { EpochFacade } from './epoch/facade.js';
export { ProtocolFacade } from './protocol/facade.js';
export { SystemFacade } from './system/facade.js';
export { GroupFacade } from './group/facade.js';
export { VotingFacade } from './voting/facade.js';
export { wallet } from './wallet/functions.js';
export * from './wasm.js';
export * from './types/index.js';
export * from './errors.js';
