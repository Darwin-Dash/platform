/**
 * Vitest global setup file
 * Provides mock utilities and test helpers
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Restore all mocks after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Global test utilities
declare global {
  // Add any global test helpers here
}

// ============================================================================
// Mock Identity
// ============================================================================

/**
 * Creates a realistic mock identity structure
 */
export const createMockIdentity = (overrides: Partial<MockIdentity> = {}): MockIdentity => ({
  id: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  balance: 1000000000, // 10 DASH in credits
  revision: 1,
  publicKeys: [
    {
      id: 0,
      type: 0, // ECDSA_SECP256K1
      purpose: 0, // AUTHENTICATION
      securityLevel: 0, // MASTER
      readOnly: false,
      data: '02a8b4e934d1a17f41e9d0f8a67e8b36b7c7c28d9c2e5f6a8b9c0d1e2f3a4b5c6d7',
    },
  ],
  createdAt: Date.now(),
  ...overrides,
});

export interface MockIdentity {
  id: string;
  balance: number;
  revision: number;
  publicKeys: MockPublicKey[];
  createdAt: number;
}

export interface MockPublicKey {
  id: number;
  type: number;
  purpose: number;
  securityLevel: number;
  readOnly: boolean;
  data: string;
}

// ============================================================================
// Mock UTXO
// ============================================================================

/**
 * Creates a realistic mock UTXO
 */
export const createMockUTXO = (overrides: Partial<MockUTXO> = {}): MockUTXO => ({
  txid: generateMockTxId(),
  vout: 0,
  address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr',
  satoshis: 5000000, // 0.05 DASH
  script: '76a9142a6d1d75b58a3e88e3e2f4c0d8e9f5b8a2c6d3e488ac',
  confirmations: 6,
  height: 920000,
  isChainLocked: true,
  isInstantLocked: true,
  ...overrides,
});

export interface MockUTXO {
  txid: string;
  vout: number;
  address: string;
  satoshis: number;
  script: string;
  confirmations: number;
  height: number;
  isChainLocked: boolean;
  isInstantLocked?: boolean;
}

// ============================================================================
// Mock Transaction
// ============================================================================

/**
 * Creates a realistic mock transaction
 */
export const createMockTransaction = (overrides: Partial<MockTransaction> = {}): MockTransaction => ({
  txid: generateMockTxId(),
  version: 3,
  type: 0,
  locktime: 0,
  inputs: [
    {
      prevTxId: generateMockTxId(),
      outputIndex: 0,
      sequence: 0xffffffff,
      script: '',
    },
  ],
  outputs: [
    {
      satoshis: 4990000,
      script: '76a9142a6d1d75b58a3e88e3e2f4c0d8e9f5b8a2c6d3e488ac',
      address: 'yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr',
    },
  ],
  fee: 10000,
  confirmations: 1,
  blockHeight: 920001,
  blockHash: generateMockBlockHash(),
  timestamp: Date.now(),
  instantLock: {
    txid: '', // Will be set to match transaction txid
    signature: generateMockSignature(),
    confirmed: true,
  },
  chainLock: {
    blockHeight: 920001,
    blockHash: '', // Will be set to match
    signature: generateMockSignature(),
  },
  ...overrides,
});

export interface MockTransaction {
  txid: string;
  version: number;
  type: number;
  locktime: number;
  inputs: MockTxInput[];
  outputs: MockTxOutput[];
  fee: number;
  confirmations: number;
  blockHeight: number;
  blockHash: string;
  timestamp: number;
  instantLock?: MockInstantLock;
  chainLock?: MockChainLock;
}

export interface MockTxInput {
  prevTxId: string;
  outputIndex: number;
  sequence: number;
  script: string;
}

export interface MockTxOutput {
  satoshis: number;
  script: string;
  address?: string;
}

export interface MockInstantLock {
  txid: string;
  signature: string;
  confirmed: boolean;
}

export interface MockChainLock {
  blockHeight: number;
  blockHash: string;
  signature: string;
}

// ============================================================================
// Mock Asset Lock Proof
// ============================================================================

/**
 * Creates a realistic mock asset lock proof for identity creation/top-up
 */
export const createMockAssetLockProof = (overrides: Partial<MockAssetLockProof> = {}): MockAssetLockProof => ({
  type: 1, // InstantSend
  instantLock: {
    txid: generateMockTxId(),
    signature: generateMockSignature(),
  },
  transaction: createMockTransaction().txid, // Raw transaction hex or ID
  outputIndex: 0,
  coreChainLockedHeight: 920000,
  ...overrides,
});

export interface MockAssetLockProof {
  type: number;
  instantLock?: {
    txid: string;
    signature: string;
  };
  chainLock?: {
    blockHeight: number;
    blockHash: string;
    signature: string;
  };
  transaction: string;
  outputIndex: number;
  coreChainLockedHeight: number;
}

// ============================================================================
// Mock DAPI Client
// ============================================================================

/**
 * Creates a mock DAPI client for testing network interactions
 */
export const createMockDAPIClient = () => ({
  core: {
    getStatus: vi.fn().mockResolvedValue({
      chain: {
        name: 'testnet',
        headerCount: 920100,
        blockCount: 920100,
        bestBlockHash: generateMockBlockHash(),
      },
      network: {
        connected: true,
        peersCount: 8,
      },
      syncProgress: 1.0,
    }),
    getBlock: vi.fn().mockResolvedValue({
      hash: generateMockBlockHash(),
      height: 920000,
      time: Date.now(),
      transactions: [],
    }),
    getBlockByHeight: vi.fn().mockResolvedValue({
      hash: generateMockBlockHash(),
      height: 920000,
      time: Date.now(),
      transactions: [],
    }),
    getBestBlockHeight: vi.fn().mockResolvedValue(920100),
    getBestBlockHash: vi.fn().mockResolvedValue(generateMockBlockHash()),
    subscribeToTransactionsWithProofs: vi.fn().mockReturnValue({
      on: vi.fn(),
      cancel: vi.fn(),
    }),
    subscribeToBlockHeadersWithChainLocks: vi.fn().mockReturnValue({
      on: vi.fn(),
      cancel: vi.fn(),
    }),
    broadcastTransaction: vi.fn().mockResolvedValue(generateMockTxId()),
    getTransaction: vi.fn().mockResolvedValue(createMockTransaction()),
  },
  platform: {
    getIdentity: vi.fn().mockResolvedValue(createMockIdentity()),
    getIdentityBalance: vi.fn().mockResolvedValue(1000000000),
    getDataContract: vi.fn().mockResolvedValue(null),
    getDocuments: vi.fn().mockResolvedValue([]),
    broadcastStateTransition: vi.fn().mockResolvedValue({ code: 0 }),
    waitForStateTransitionResult: vi.fn().mockResolvedValue({ code: 0 }),
  },
});

export type MockDAPIClient = ReturnType<typeof createMockDAPIClient>;

// ============================================================================
// Mock Transaction Finder
// ============================================================================

/**
 * Creates a mock transaction finder for testing UTXO discovery
 */
export const createMockTransactionFinder = () => {
  const mockUTXOs = [createMockUTXO()];

  return {
    findUTXOs: vi.fn().mockResolvedValue(mockUTXOs),
    findInstantSendLock: vi.fn().mockResolvedValue({
      txid: generateMockTxId(),
      signature: generateMockSignature(),
      confirmed: true,
    }),
    findChainLock: vi.fn().mockResolvedValue({
      blockHeight: 920000,
      blockHash: generateMockBlockHash(),
      signature: generateMockSignature(),
    }),
    monitorAddress: vi.fn().mockResolvedValue(() => {}), // Returns cleanup function
    calculateBalance: vi.fn().mockImplementation((utxos: MockUTXO[]) =>
      utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)
    ),
    stop: vi.fn(),
    // Event emitter methods
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
  };
};

export type MockTransactionFinder = ReturnType<typeof createMockTransactionFinder>;

// ============================================================================
// Mock Wallet
// ============================================================================

/**
 * Creates a mock wallet for testing HD key derivation
 */
export const createMockWallet = () => ({
  mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  network: 'testnet',
  getExternalAddress: vi.fn().mockReturnValue('yP8A3cbdxRtLRduy5mXDsBnJtMzHWs6ZXr'),
  getInternalAddress: vi.fn().mockReturnValue('yQ9B4eceyStMRdvz6nYf5d0cBpJtMaHXt7r'),
  getNextExternalAddress: vi.fn().mockReturnValue('yR0C5fdgzTuNRdw7oZg6e1dCqKtNbIYu8s'),
  getPrivateKey: vi.fn().mockReturnValue('cVLwRLTvz3BxDAWkvS3yzT9pUcTCup7kQnfT2smRjvmmm1wAP6QT'),
  signTransaction: vi.fn().mockImplementation((tx) => tx),
  deriveKey: vi.fn().mockReturnValue({
    publicKey: '02a8b4e934d1a17f41e9d0f8a67e8b36b7c7c28d9c2e5f6a8b9c0d1e2f3a4b5c6d7',
    privateKey: 'cVLwRLTvz3BxDAWkvS3yzT9pUcTCup7kQnfT2smRjvmmm1wAP6QT',
    wif: 'cVLwRLTvz3BxDAWkvS3yzT9pUcTCup7kQnfT2smRjvmmm1wAP6QT',
  }),
});

export type MockWallet = ReturnType<typeof createMockWallet>;

// ============================================================================
// Mock WASM SDK
// ============================================================================

/**
 * Creates a comprehensive mock WASM SDK for testing
 * Note: Returns 'ok' for backward compatibility with existing tests
 */
export const createMockWasmSdk = () => {
  return {
    // Identity methods
    getIdentity: vi.fn().mockResolvedValue('ok'),
    getIdentityWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityUnproved: vi.fn().mockResolvedValue('ok'),
    getIdentityKeys: vi.fn().mockResolvedValue('ok'),
    getIdentityKeysWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityNonce: vi.fn().mockResolvedValue('ok'),
    getIdentityNonceWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityContractNonce: vi.fn().mockResolvedValue('ok'),
    getIdentityContractNonceWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityBalance: vi.fn().mockResolvedValue('ok'),
    getIdentityBalanceWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentitiesBalances: vi.fn().mockResolvedValue('ok'),
    getIdentitiesBalancesWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityBalanceAndRevision: vi.fn().mockResolvedValue('ok'),
    getIdentityBalanceAndRevisionWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityByPublicKeyHash: vi.fn().mockResolvedValue('ok'),
    getIdentityByPublicKeyHashWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityByNonUniquePublicKeyHash: vi.fn().mockResolvedValue('ok'),
    getIdentityByNonUniquePublicKeyHashWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentitiesContractKeys: vi.fn().mockResolvedValue('ok'),
    getIdentitiesContractKeysWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityTokenBalances: vi.fn().mockResolvedValue('ok'),
    getIdentityTokenBalancesWithProofInfo: vi.fn().mockResolvedValue('ok'),
    identityCreate: vi.fn().mockResolvedValue('ok'),
    identityTopUp: vi.fn().mockResolvedValue('ok'),
    identityCreditTransfer: vi.fn().mockResolvedValue('ok'),
    identityCreditWithdrawal: vi.fn().mockResolvedValue('ok'),
    identityUpdate: vi.fn().mockResolvedValue('ok'),

    // DPNS methods
    getDpnsName: vi.fn().mockResolvedValue('ok'),
    getDpnsNameWithProofInfo: vi.fn().mockResolvedValue('ok'),
    searchDpnsNames: vi.fn().mockResolvedValue('ok'),
    registerDpnsName: vi.fn().mockResolvedValue('ok'),

    // Document methods
    getDocument: vi.fn().mockResolvedValue('ok'),
    getDocumentWithProofInfo: vi.fn().mockResolvedValue('ok'),
    queryDocuments: vi.fn().mockResolvedValue('ok'),
    queryDocumentsWithProofInfo: vi.fn().mockResolvedValue('ok'),
    createDocument: vi.fn().mockResolvedValue('ok'),
    updateDocument: vi.fn().mockResolvedValue('ok'),
    deleteDocument: vi.fn().mockResolvedValue('ok'),

    // Token methods
    getTokenBalance: vi.fn().mockResolvedValue('ok'),
    getTokenBalanceWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getTokenSupply: vi.fn().mockResolvedValue('ok'),
    getTokenSupplyWithProofInfo: vi.fn().mockResolvedValue('ok'),
    transferToken: vi.fn().mockResolvedValue('ok'),

    // Contract methods
    getDataContract: vi.fn().mockResolvedValue('ok'),
    getDataContractWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getDataContractHistory: vi.fn().mockResolvedValue(new Map()),
    getDataContractHistoryWithProofInfo: vi.fn().mockResolvedValue({ data: new Map(), proof: {}, metadata: {} }),
    getDataContracts: vi.fn().mockResolvedValue(new Map()),
    getDataContractsWithProofInfo: vi.fn().mockResolvedValue({ data: new Map(), proof: {}, metadata: {} }),
    contractPublish: vi.fn().mockResolvedValue('ok'),
    contractUpdate: vi.fn().mockResolvedValue(undefined),

    // System methods
    getEpochInfo: vi.fn().mockResolvedValue('ok'),
    getProtocolVersion: vi.fn().mockResolvedValue('ok'),
    getStatus: vi.fn().mockResolvedValue('ok'),

    // Group methods
    getGroupInfo: vi.fn().mockResolvedValue('ok'),
    getGroupInfoWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getGroupInfos: vi.fn().mockResolvedValue('ok'),
    getGroupInfosWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getGroupMembers: vi.fn().mockResolvedValue('ok'),
    getGroupMembersWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getIdentityGroups: vi.fn().mockResolvedValue('ok'),
    getIdentityGroupsWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getGroupActions: vi.fn().mockResolvedValue('ok'),
    getGroupActionsWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getGroupActionSigners: vi.fn().mockResolvedValue('ok'),
    getGroupActionSignersWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getGroupsDataContracts: vi.fn().mockResolvedValue('ok'),
    getGroupsDataContractsWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getContestedResources: vi.fn().mockResolvedValue('ok'),
    getContestedResourcesWithProofInfo: vi.fn().mockResolvedValue('ok'),
    getContestedResourceVotersForIdentity: vi.fn().mockResolvedValue('ok'),
    getContestedResourceVotersForIdentityWithProofInfo: vi.fn().mockResolvedValue('ok'),
  };
};

export type MockWasmSdk = ReturnType<typeof createMockWasmSdk>;

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Generate a mock transaction ID (64-character hex string)
 */
export function generateMockTxId(): string {
  const chars = '0123456789abcdef';
  let txid = '';
  for (let i = 0; i < 64; i++) {
    txid += chars[Math.floor(Math.random() * chars.length)];
  }
  return txid;
}

/**
 * Generate a mock block hash (64-character hex string with leading zeros)
 */
export function generateMockBlockHash(): string {
  return '00000000' + generateMockTxId().substring(8);
}

/**
 * Generate a mock BLS signature (96-character hex string)
 */
export function generateMockSignature(): string {
  const chars = '0123456789abcdef';
  let sig = '';
  for (let i = 0; i < 96; i++) {
    sig += chars[Math.floor(Math.random() * chars.length)];
  }
  return sig;
}

/**
 * Generate a mock testnet address
 */
export function generateMockAddress(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789';
  let address = 'y';
  for (let i = 0; i < 33; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

// ============================================================================
// Console output helper
// ============================================================================

/**
 * Log test configuration for debugging
 */
export const logTestConfig = () => {
  console.log(`
 js-evo-sdk Tests
   Network: ${process.env.NETWORK || 'testnet'}
   Timeout: ${process.env.TEST_TIMEOUT || '120000'}ms
   Mnemonic: ${process.env.TESTNET_MNEMONIC ? 'Provided' : 'Not provided (some tests will skip)'}
`);
};
