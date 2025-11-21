/**
 * Facade Contracts - Interface definitions for identity operations
 *
 * Defines the contracts that the IdentitiesFacade depends on.
 * These abstractions enable:
 * - Swappable implementations (e.g., hardware wallets instead of ResilientDAPIClient)
 * - Easy testing with mock implementations
 * - Clear separation of concerns
 * - Future extensibility without facade changes
 */

/**
 * Wallet provider interface
 * Abstracts wallet setup, key derivation, and UTXO discovery
 */
export interface WalletProvider {
  /**
   * Setup wallet with key derivation and UTXO discovery
   * @param mnemonic 12-word BIP39 mnemonic
   * @param network 'mainnet' or 'testnet'
   * @param startHeight Blockchain height to start sync from
   * @returns Wallet setup result with addresses, UTXOs, and private keys
   */
  setupWallet(options: {
    mnemonic: string;
    network: string;
    startHeight: number;
  }): Promise<WalletSetupResult>;

  /**
   * Discover identities by public key hashes
   * Used for identity discovery during wallet sync
   * @param publicKeyHashes Array of 20-byte public key hashes (40 hex chars each)
   * @returns Array of discovered identities with their indices and IDs
   */
  discoverIdentities(publicKeyHashes: string[]): Promise<DiscoveredIdentity[]>;
}

/**
 * Wallet setup result returned by WalletProvider
 */
export interface WalletSetupResult {
  /** Addresses derived from mnemonic (both external and internal) */
  addresses: {
    external: DerivedAddress[];
    internal: DerivedAddress[];
  };
  /** UTXOs available in wallet */
  utxos: UTXO[];
  /** Latest UTXO (for quick access) */
  latestUTXO: UTXO | null;
  /** HD private key for signing */
  hdPrivateKey: any; // dashcore-lib HDPrivateKey
}

/**
 * Derived address with private key
 */
export interface DerivedAddress {
  address: string;
  privateKey: any; // dashcore-lib PrivateKey
  publicKey: string;
  path: string;
  index: number;
}

/**
 * UTXO - Unspent Transaction Output
 */
export interface UTXO {
  txid: string;
  vout: number;
  satoshis: number;
  address: string;
  scriptPubKey?: string;
}

/**
 * Discovered identity
 */
export interface DiscoveredIdentity {
  index: number;
  identityId: string;
}

/**
 * Transaction coordinator interface
 * Abstracts transaction creation and broadcasting
 */
export interface TransactionCoordinator {
  /**
   * Create an asset lock transaction
   * @param amount Amount in duffs
   * @param utxo UTXO to spend
   * @param sourceAddress Address that owns the UTXO
   * @param changeAddress Where to send change
   * @param network 'mainnet' or 'testnet'
   * @returns Transaction result with signed transaction and asset lock key
   */
  createAssetLockTransaction(options: {
    amount: number;
    utxo: UTXO;
    sourceAddress: DerivedAddress;
    changeAddress: string;
    network: string;
  }): Promise<TransactionResult>;

  /**
   * Broadcast transaction to network
   * @param transactionHex Signed transaction in hex format
   * @param dapiClient DAPI client for broadcasting
   * @returns Transaction ID
   */
  broadcastTransaction(transactionHex: string, dapiClient: any): Promise<string>;
}

/**
 * Transaction result after creation and signing
 */
export interface TransactionResult {
  transaction: any; // dashcore-lib Transaction
  transactionHex: string;
  assetLockPrivateKeyWif: string;
  assetLockAddress: string;
}

/**
 * Confirmation waiter interface
 * Abstracts waiting for transaction confirmation (InstantLock/ChainLock)
 */
export interface ConfirmationWaiter {
  /**
   * Wait for transaction confirmation
   * @param transactionId Transaction ID to wait for
   * @param transactionHex Transaction hex for proof
   * @param addresses Addresses involved in transaction
   * @returns Confirmation result with proof data
   */
  waitForConfirmation(options: {
    transactionId: string;
    transactionHex: string;
    addresses: string[];
    monitor: any; // InstantSendChainLockMonitor
  }): Promise<ConfirmationResult>;
}

/**
 * Confirmation result after waiting for InstantLock or ChainLock
 */
export interface ConfirmationResult {
  transactionId: string;
  transactionHex: string;
  instantLockHex: string | null;
  coreChainLockedHeight: number | null;
  proofType: 'instant' | 'chain';
}

/**
 * Identity operations coordinator
 * High-level interface for identity creation and updates
 */
export interface IdentityOperations {
  /**
   * Create new identity with wallet coordination
   * @param walletProvider Source of wallet and addresses
   * @param amount Amount to fund identity with
   * @param options Advanced options
   * @returns Identity creation result
   */
  createIdentity(options: {
    walletProvider: WalletProvider;
    transactionCoordinator: TransactionCoordinator;
    confirmationWaiter: ConfirmationWaiter;
    amount: number;
    mnemonic: string;
    network: string;
    startHeight: number;
    useSourceAsChangeAddress?: boolean;
    onProgress?: (event: OperationEvent) => void;
  }): Promise<IdentityCreationResult>;

  /**
   * Top up existing identity
   * @param identityId Identity to top up
   * @param amount Amount to add
   * @returns Top-up result
   */
  topUpIdentity(options: {
    identityId: string;
    amount: number;
    mnemonic: string;
    network: string;
    startHeight: number;
    useSourceAsChangeAddress?: boolean;
    onProgress?: (event: OperationEvent) => void;
  }): Promise<IdentityTopUpResult>;
}

/**
 * Identity creation result
 */
export interface IdentityCreationResult {
  status: 'success' | 'failure';
  identityId: string;
  balance: number;
  publicKeysCount: number;
  transactionHash: string;
  message: string;
}

/**
 * Identity top-up result
 */
export interface IdentityTopUpResult {
  status: 'success' | 'failure';
  identityId: string;
  newBalance: number;
  addedAmount: number;
  transactionHash: string;
  message: string;
}

/**
 * Operation event for progress tracking
 * Used by callers to display progress UI
 */
export interface OperationEvent {
  /** Current phase of operation */
  phase:
    | 'wallet_setup'
    | 'utxo_discovery'
    | 'identity_discovery'
    | 'transaction_creation'
    | 'transaction_broadcast'
    | 'confirmation_wait'
    | 'identity_creation'
    | 'finalization';

  /** Progress percentage (0-100) */
  progress: number;

  /** Human-readable message */
  message: string;

  /** Optional detailed information */
  details?: Record<string, any>;

  /** Optional error information */
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}
