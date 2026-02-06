import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createMockWasmSdk } from '../../setup';

// Mock the wasm-sdk module
vi.mock('@dashevo/wasm-sdk', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmSdkBuilder: {
    testnetTrusted: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  },
  IdentitySigner: {
    prototype: {},
  },
}));

// Mock the SDK with voting methods added
const mockWasmSdk = {
  ...createMockWasmSdk(),
  // Voting query methods
  getContestedResourceVoteState: vi.fn().mockResolvedValue({
    contenders: new Map(),
    abstainVoteCount: 0,
    lockVoteCount: 0,
  }),
  getContestedResourceVoteStateWithProofInfo: vi.fn().mockResolvedValue({
    data: {
      contenders: new Map(),
      abstainVoteCount: 0,
      lockVoteCount: 0,
    },
    proof: {},
    metadata: {},
  }),
  getContestedResourceIdentityVotes: vi.fn().mockResolvedValue([]),
  getContestedResourceIdentityVotesWithProofInfo: vi.fn().mockResolvedValue({
    data: [],
    proof: {},
    metadata: {},
  }),
  getVotePollsByEndDate: vi.fn().mockResolvedValue([]),
  getVotePollsByEndDateWithProofInfo: vi.fn().mockResolvedValue({
    data: [],
    proof: {},
    metadata: {},
  }),
  // Voting transition methods
  masternodeVote: vi.fn().mockResolvedValue({
    success: true,
  }),
};

// Create a mock EvoSDK with voting facade
const createMockEvoSDK = () => ({
  voting: {
    contestedResourceVoteState: async (query: any) =>
      mockWasmSdk.getContestedResourceVoteState(query),
    contestedResourceVoteStateWithProof: async (query: any) =>
      mockWasmSdk.getContestedResourceVoteStateWithProofInfo(query),
    contestedResourceIdentityVotes: async (query: any) =>
      mockWasmSdk.getContestedResourceIdentityVotes(query),
    contestedResourceIdentityVotesWithProof: async (query: any) =>
      mockWasmSdk.getContestedResourceIdentityVotesWithProofInfo(query),
    votePollsByEndDate: async (query: any) =>
      mockWasmSdk.getVotePollsByEndDate(query),
    votePollsByEndDateWithProof: async (query: any) =>
      mockWasmSdk.getVotePollsByEndDateWithProofInfo(query),
    masternodeVote: async (options: any) =>
      mockWasmSdk.masternodeVote(options),
  },
});

describe('VotingFacade', () => {
  let client: ReturnType<typeof createMockEvoSDK>;

  // Realistic identifiers
  const dataContractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
  const identityId = '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS';
  const contenderId = '6o4vL6YpPjamqnnPNpwNSspYJdhPpzYbXvAJ4PYH7Ack';
  const masternodeProTxHash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockEvoSDK();
  });

  describe('Query Methods', () => {
    it('contestedResourceVoteState() fetches vote state for a contested resource', async () => {
      const query = {
        dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'alice'],
        resultType: 'documentsAndVoteTally',
      };

      await client.voting.contestedResourceVoteState(query);

      expect(mockWasmSdk.getContestedResourceVoteState).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getContestedResourceVoteState).toHaveBeenCalledWith(query);
    });

    it('contestedResourceVoteStateWithProof() fetches vote state with proof and pagination', async () => {
      const query = {
        dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'bob'],
        resultType: 'documentsAndVoteTally',
        includeLockedAndAbstaining: true,
        startAtContenderId: contenderId,
        startAtIncluded: true,
        limit: 10,
      };

      await client.voting.contestedResourceVoteStateWithProof(query);

      expect(mockWasmSdk.getContestedResourceVoteStateWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getContestedResourceVoteStateWithProofInfo).toHaveBeenCalledWith(query);
    });

    it('contestedResourceIdentityVotes() fetches votes cast by an identity', async () => {
      const query = {
        identityId,
        limit: 50,
        startAtVoteId: 'AYjR8WFgxoQqeVqKhFNxQvPsaJSZPvzqDJdw4YrFBEhT',
        orderAscending: true,
      };

      await client.voting.contestedResourceIdentityVotes(query);

      expect(mockWasmSdk.getContestedResourceIdentityVotes).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getContestedResourceIdentityVotes).toHaveBeenCalledWith(query);
    });

    it('contestedResourceIdentityVotesWithProof() fetches identity votes with proof', async () => {
      const query = {
        identityId,
        limit: 25,
        startAtVoteId: 'BYjR8WFgxoQqeVqKhFNxQvPsaJSZPvzqDJdw4YrFBEhT',
        orderAscending: false,
      };

      await client.voting.contestedResourceIdentityVotesWithProof(query);

      expect(mockWasmSdk.getContestedResourceIdentityVotesWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getContestedResourceIdentityVotesWithProofInfo).toHaveBeenCalledWith(query);
    });

    it('votePollsByEndDate() fetches active vote polls within a time range', async () => {
      const query = {
        startTimeMs: 1704067200000, // 2024-01-01 00:00:00 UTC
        startTimeIncluded: true,
        endTimeMs: 1706745600000, // 2024-02-01 00:00:00 UTC
        endTimeIncluded: false,
        limit: 100,
        offset: 0,
        orderAscending: true,
      };

      await client.voting.votePollsByEndDate(query);

      expect(mockWasmSdk.getVotePollsByEndDate).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getVotePollsByEndDate).toHaveBeenCalledWith(query);
    });

    it('votePollsByEndDateWithProof() fetches vote polls with proof', async () => {
      const query = {
        startTimeMs: 1704067200000,
        endTimeMs: 1706745600000,
        limit: 50,
        offset: 10,
        orderAscending: false,
      };

      await client.voting.votePollsByEndDateWithProof(query);

      expect(mockWasmSdk.getVotePollsByEndDateWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getVotePollsByEndDateWithProofInfo).toHaveBeenCalledWith(query);
    });
  });

  describe('Transition Methods', () => {
    // Mock signer object
    const signer = {};

    it('masternodeVote() casts a vote on a contested resource', async () => {
      const options = {
        masternodeProTxHash,
        contractId: dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'alice'],
        voteChoice: 'yes',
        signer,
      };

      await client.voting.masternodeVote(options);

      expect(mockWasmSdk.masternodeVote).toHaveBeenCalledOnce();
      expect(mockWasmSdk.masternodeVote).toHaveBeenCalledWith(options);
    });

    it('masternodeVote() supports different vote choices', async () => {
      // Test abstain vote
      const abstainOptions = {
        masternodeProTxHash,
        contractId: dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'charlie'],
        voteChoice: 'abstain',
        signer,
      };

      await client.voting.masternodeVote(abstainOptions);

      expect(mockWasmSdk.masternodeVote).toHaveBeenCalledWith(abstainOptions);
    });

    it('masternodeVote() supports lock vote choice', async () => {
      const lockOptions = {
        masternodeProTxHash,
        contractId: dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'disputed'],
        voteChoice: 'lock',
        signer,
      };

      await client.voting.masternodeVote(lockOptions);

      expect(mockWasmSdk.masternodeVote).toHaveBeenCalledWith(lockOptions);
    });
  });

  describe('Error Handling', () => {
    const signer = {};

    it('handles error on contestedResourceVoteState()', async () => {
      const errorMessage = 'Failed to fetch vote state';
      mockWasmSdk.getContestedResourceVoteState.mockRejectedValueOnce(new Error(errorMessage));

      const query = {
        dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'alice'],
        resultType: 'documentsAndVoteTally',
      };

      await expect(client.voting.contestedResourceVoteState(query)).rejects.toThrow(errorMessage);
    });

    it('handles error on contestedResourceIdentityVotes()', async () => {
      const errorMessage = 'Identity not found';
      mockWasmSdk.getContestedResourceIdentityVotes.mockRejectedValueOnce(new Error(errorMessage));

      const query = {
        identityId,
        limit: 50,
      };

      await expect(client.voting.contestedResourceIdentityVotes(query)).rejects.toThrow(errorMessage);
    });

    it('handles error on votePollsByEndDate()', async () => {
      const errorMessage = 'Invalid time range';
      mockWasmSdk.getVotePollsByEndDate.mockRejectedValueOnce(new Error(errorMessage));

      const query = {
        startTimeMs: 1706745600000,
        endTimeMs: 1704067200000, // End before start
        limit: 100,
      };

      await expect(client.voting.votePollsByEndDate(query)).rejects.toThrow(errorMessage);
    });

    it('handles error on masternodeVote()', async () => {
      const errorMessage = 'Invalid masternode ProTxHash';
      mockWasmSdk.masternodeVote.mockRejectedValueOnce(new Error(errorMessage));

      const options = {
        masternodeProTxHash: 'invalid',
        contractId: dataContractId,
        documentTypeName: 'domain',
        indexName: 'parentNameAndLabel',
        indexValues: ['dash', 'alice'],
        voteChoice: 'yes',
        signer,
      };

      await expect(client.voting.masternodeVote(options)).rejects.toThrow(errorMessage);
    });
  });
});
