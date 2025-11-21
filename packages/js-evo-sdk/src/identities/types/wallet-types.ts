/**
 * TypeScript interfaces for wallet-lib types
 *
 * Provides type safety for wallet-lib objects used in identity operations.
 * Created as part of Phase 3.4 refactoring to replace ~20 `any` types.
 *
 * Note: wallet-lib doesn't export TypeScript definitions, so these interfaces
 * are based on runtime observations and wallet-lib source code.
 */

/**
 * Address object from wallet-lib
 * Can be either a string or an Address object with toString() method
 */
export interface WalletAddress {
  address?: string;
  toString(): string;
}

/**
 * UTXO (Unspent Transaction Output) from wallet-lib
 * Handles both txid/txId and vout/outputIndex variants
 */
export interface UTXO {
  /** Transaction ID (alternative: txId) */
  txid?: string;
  /** Transaction ID (alternative: txid) */
  txId?: string;
  /** Output index (alternative: outputIndex) */
  vout?: number;
  /** Output index (alternative: vout) */
  outputIndex?: number;
  /** Amount in satoshis */
  satoshis: number;
  /** Address (can be string or Address object) */
  address: string | WalletAddress;
  /** ScriptPubKey (alternative: script) */
  scriptPubKey?: string | any;
  /** Script (alternative: scriptPubKey) */
  script?: string | any;
}

/**
 * HD Private Key from wallet-lib
 */
export interface HDPrivateKey {
  /** Private key for signing */
  privateKey: {
    /** Convert to WIF format */
    toWIF(): string;
    /** Convert to public key */
    toPublicKey(): any;
  };
}

/**
 * Wallet storage interface
 */
export interface WalletStorage {
  /** Get wallet store for a specific wallet ID */
  getWalletStore(walletId: string): WalletStore;
  /** Clear all wallet storage */
  clear(): Promise<void>;
}

/**
 * Wallet store interface for identity management
 */
export interface WalletStore {
  /** Get identity ID at specific index */
  getIdentityIdByIndex(index: number): string | null;
  /** Insert identity ID at specific index */
  insertIdentityIdAtIndex(identityId: string, index: number): void;
  /** Get all indexed identity IDs */
  getIndexedIdentityIds(): (string | null)[];
}

/**
 * Worker plugins for background processing
 */
export interface WorkerPlugins {
  /** Map of worker name to worker instance */
  workers: {
    [workerName: string]: {
      /** Whether worker is currently running */
      isWorkerRunning?: boolean;
    };
  };
}

/**
 * Cancellable promise wrapper (from wallet-lib)
 */
export interface CancellablePromise<T> {
  promise: Promise<T>;
  cancel: () => void;
}

/**
 * Wallet-lib Account interface
 * Core account object used throughout identity operations
 */
export interface WalletAccount {
  /** Wallet ID this account belongs to */
  walletId: string;
  /** Account index (usually 0) */
  index: number;
  /** Storage for wallet data */
  storage: WalletStorage;
  /** Identities management */
  identities?: {
    /** Get identity HD key by index */
    getIdentityHDKeyByIndex(identityIndex: number, keyIndex: number): HDPrivateKey;
  };
  /** Background worker plugins */
  plugins?: WorkerPlugins;
  /** Coin selection strategy */
  strategy?: CoinSelectionStrategy;

  // Methods
  /** Get all UTXOs for this account */
  getUTXOS(): UTXO[];
  /** Get unused address */
  getUnusedAddress(type: 'external' | 'internal'): string | WalletAddress;
  /** Get private keys for specific addresses */
  getPrivateKeys(addresses: string[]): HDPrivateKey[];
  /** Sync wallet to current blockchain state */
  sync(): Promise<void>;
  /** Get next unused identity index */
  getUnusedIdentityIndex(): Promise<number>;
  /** Create transaction */
  createTransaction(options: TransactionOptions): Transaction;
  /** Broadcast transaction */
  broadcastTransaction(transaction: Transaction): Promise<string>;
  /** Wait for InstantLock confirmation */
  waitForInstantLock(transactionId: string): CancellablePromise<any>;
  /** Wait for TxMetadata confirmation */
  waitForTxMetadata(transactionId: string): CancellablePromise<any>;
}

/**
 * Wallet instance from wallet-lib
 */
export interface Wallet {
  /** Disconnect wallet and cleanup resources */
  disconnect(): Promise<void>;
  /** Get account by options */
  getAccount(options: { index: number; synchronize: boolean; disableIdentitySync?: boolean }): Promise<WalletAccount>;
  /** Create account */
  createAccount(options: { disableIdentitySync?: boolean }): Promise<WalletAccount>;
  /** Transport for DAPI communication */
  transport?: any;
  /** Event emitter methods */
  on(event: string, callback: (...args: any[]) => void): void;
}

/**
 * Transaction options for createTransaction
 */
export interface TransactionOptions {
  /** Amount in satoshis */
  satoshis: number;
  /** Recipient address */
  recipient: string;
  /** Change address (optional) */
  change?: string;
  /** Specific UTXOs to use (optional) */
  utxos?: UTXO[];
  /** Coin selection strategy (optional) */
  strategy?: CoinSelectionStrategy;
}

/**
 * Transaction from dashcore-lib
 */
export interface Transaction {
  /** Transaction ID */
  id?: string;
  /** Transaction hash (alternative to id) */
  hash?: string;
  /** Transaction type (e.g., 8 for ASSET_LOCK) */
  type: number;
  /** Transaction version */
  version: number;
  /** Transaction inputs */
  inputs: any[];
  /** Transaction outputs */
  outputs: any[];

  // Methods
  /** Get transaction fee */
  getFee(): number;
  /** Convert to hex string */
  toString(): string;
  /** Serialize transaction */
  serialize?(): string;
  /** Sign transaction with private keys */
  sign(privateKeys: any[]): void;
}

/**
 * Coin selection strategy function type
 * Used by wallet-lib for UTXO selection
 */
export type CoinSelectionStrategy = (
  utxos: UTXO[],
  outputs: { address: string; satoshis: number }[],
  feeRate: number
) => UTXO[];

/**
 * DAPI Client for blockchain communication
 */
export interface DAPIClient {
  /** Core blockchain operations */
  core: {
    /** Get blockchain status */
    getBlockchainStatus(): Promise<any>;
    /** Broadcast transaction */
    broadcastTransaction(txBytes: Uint8Array): Promise<string>;
  };
}

/**
 * Type guard to check if value is a WalletAddress object
 */
export function isWalletAddress(value: any): value is WalletAddress {
  return value !== null &&
         typeof value === 'object' &&
         typeof value.toString === 'function';
}

/**
 * Extract address string from wallet-lib address (string or object)
 */
export function extractAddressString(address: string | WalletAddress): string {
  return typeof address === 'string' ? address : address.toString();
}
