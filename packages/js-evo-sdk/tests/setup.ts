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

// Export mock helpers for use in tests
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

// Console output helper for integration tests
export const logTestConfig = () => {
  console.log(`
 js-evo-sdk Tests
   Network: ${process.env.NETWORK || 'testnet'}
   Timeout: ${process.env.TEST_TIMEOUT || '120000'}ms
   Mnemonic: ${process.env.TESTNET_MNEMONIC ? 'Provided' : 'Not provided (some tests will skip)'}
`);
};
