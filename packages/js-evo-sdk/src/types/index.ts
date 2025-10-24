/**
 * Type definitions for EvoSDK return values
 * These interfaces provide type safety for SDK method return values
 */

// Re-export WASM types that are already well-typed
export type { IdentityWasm, DataContract } from '@dashevo/wasm-sdk/compressed';

/**
 * System Status response from platform
 */
export interface SystemStatus {
  version?: {
    software?: {
      dapi?: string;
      drive?: string;
      tenderdash?: string;
    };
    protocol?: {
      tenderdash?: {
        p2p?: number;
        block?: number;
      };
      drive?: {
        current?: number;
        latest?: number;
      };
    };
  };
  chain?: {
    latestBlockHeight?: number;
    latestBlockHash?: string;
    maxPeerBlockHeight?: number;
    catchingUp?: boolean;
    coreChainLockedHeight?: number;
  };
  network?: {
    peersCount?: number;
    listening?: boolean;
    chainId?: string;
  };
  node?: {
    id?: string;
  };
  [key: string]: any;
}

/**
 * Quorum information for consensus
 */
export interface QuorumInfo {
  id?: number;
  type?: string;
  members?: string[];
  [key: string]: any;
}

/**
 * Proof information returned with data queries
 */
export interface ProofInfo {
  proof?: any;
  merkleProof?: any;
  rootHash?: string;
  [key: string]: any;
}

/**
 * Document representation
 */
export interface Document {
  id?: string;
  ownerId?: string;
  dataContractId?: string;
  documentType?: string;
  revision?: number;
  createdAt?: number;
  updatedAt?: number;
  data?: Record<string, any>;
  [key: string]: any;
}

/**
 * Document query response
 */
export interface DocumentQueryResult {
  documents?: Document[];
  hasMore?: boolean;
  [key: string]: any;
}

/**
 * Balance information
 */
export interface Balance {
  amount?: bigint | number | string;
  [key: string]: any;
}

/**
 * Balance and revision information
 */
export interface BalanceAndRevision {
  balance?: bigint | number | string;
  revision?: number;
  [key: string]: any;
}

/**
 * Identity nonce (for state transitions)
 */
export interface Nonce {
  nonce?: number;
  [key: string]: any;
}

/**
 * Contract nonce
 */
export interface ContractNonce {
  nonce?: number;
  contractId?: string;
  [key: string]: any;
}

/**
 * Public key information
 */
export interface PublicKeyInfo {
  id?: number;
  type?: string;
  purpose?: number;
  securityLevel?: number;
  data?: string;
  disabledAt?: number;
  [key: string]: any;
}

/**
 * Identity keys response
 */
export interface IdentityKeys {
  keys?: PublicKeyInfo[];
  [key: string]: any;
}

/**
 * Token balance information
 */
export interface TokenBalance {
  token?: string;
  amount?: bigint | number | string;
  [key: string]: any;
}

/**
 * Token balances response
 */
export interface TokenBalances {
  balances?: TokenBalance[];
  [key: string]: any;
}

/**
 * State transition result
 */
export interface StateTransitionResult {
  code?: number;
  message?: string;
  proof?: any;
  [key: string]: any;
}

/**
 * Path elements response
 */
export interface PathElements {
  path?: string[];
  elements?: any[];
  [key: string]: any;
}

/**
 * Generic response wrapper for operations with proof
 */
export interface WithProof<T> {
  data?: T;
  proof?: ProofInfo;
  [key: string]: any;
}
