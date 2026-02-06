import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock responses (module-level constants are fine)
const mockDataContract = { id: 'contract123', schema: {} };
const mockContractWithProof = { data: mockDataContract, proof: {}, metadata: {} };

describe('ContractsFacade', () => {
  // Declare mocks that will be created fresh in beforeEach
  let mockWasmSdk: {
    getDataContract: Mock;
    getDataContractWithProofInfo: Mock;
    getDataContractHistory: Mock;
    getDataContractHistoryWithProofInfo: Mock;
    getDataContracts: Mock;
    getDataContractsWithProofInfo: Mock;
    contractPublish: Mock;
    contractUpdate: Mock;
  };
  let client: {
    contracts: {
      fetch: (contractId: string) => Promise<any>;
      fetchWithProof: (contractId: string) => Promise<any>;
      getHistory: (query: any) => Promise<Map<string, any>>;
      getHistoryWithProof: (query: any) => Promise<any>;
      getMany: (contractIds: string[]) => Promise<Map<string, any>>;
      getManyWithProof: (contractIds: string[]) => Promise<any>;
      publish: (options: any) => Promise<any>;
      update: (options: any) => Promise<void>;
    };
  };
  const mockIdentityKey = { id: 1 };
  const mockSigner = { sign: vi.fn() };

  beforeEach(() => {
    // Create mock history and contracts maps fresh each time
    const mockContractHistory = new Map([['v1', mockDataContract]]);
    const mockHistoryWithProof = { data: mockContractHistory, proof: {}, metadata: {} };
    const mockContractsMap = new Map([['contract123', mockDataContract]]);
    const mockContractsWithProof = { data: mockContractsMap, proof: {}, metadata: {} };

    // Create fresh mocks in beforeEach
    mockWasmSdk = {
      getDataContract: vi.fn().mockResolvedValue(mockDataContract),
      getDataContractWithProofInfo: vi.fn().mockResolvedValue(mockContractWithProof),
      getDataContractHistory: vi.fn().mockResolvedValue(mockContractHistory),
      getDataContractHistoryWithProofInfo: vi.fn().mockResolvedValue(mockHistoryWithProof),
      getDataContracts: vi.fn().mockResolvedValue(mockContractsMap),
      getDataContractsWithProofInfo: vi.fn().mockResolvedValue(mockContractsWithProof),
      contractPublish: vi.fn().mockResolvedValue(mockDataContract),
      contractUpdate: vi.fn().mockResolvedValue(undefined),
    };

    // Create a mock EvoSDK for contracts operations
    client = {
      contracts: {
        fetch: async (contractId: string) => mockWasmSdk.getDataContract(contractId),
        fetchWithProof: async (contractId: string) => mockWasmSdk.getDataContractWithProofInfo(contractId),
        getHistory: async (query: any) => mockWasmSdk.getDataContractHistory(query),
        getHistoryWithProof: async (query: any) => mockWasmSdk.getDataContractHistoryWithProofInfo(query),
        getMany: async (contractIds: string[]) => mockWasmSdk.getDataContracts(contractIds),
        getManyWithProof: async (contractIds: string[]) => mockWasmSdk.getDataContractsWithProofInfo(contractIds),
        publish: async (options: any) => mockWasmSdk.contractPublish(options),
        update: async (options: any) => mockWasmSdk.contractUpdate(options),
      },
    };
  });

  describe('Query Methods', () => {
    it('fetch() returns a DataContract for valid ID', async () => {
      const contractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const result = await client.contracts.fetch(contractId);

      expect(mockWasmSdk.getDataContract).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDataContract).toHaveBeenCalledWith(contractId);
      expect(result).toEqual(mockDataContract);
    });

    it('fetchWithProof() returns DataContract with proof metadata', async () => {
      const contractId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const result = await client.contracts.fetchWithProof(contractId);

      expect(mockWasmSdk.getDataContractWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDataContractWithProofInfo).toHaveBeenCalledWith(contractId);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('proof');
      expect(result).toHaveProperty('metadata');
    });

    it('getHistory() fetches contract version history', async () => {
      const query = {
        dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
        limit: 10,
        startAtMs: 1700000000000,
      };

      const result = await client.contracts.getHistory(query);

      expect(mockWasmSdk.getDataContractHistory).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDataContractHistory).toHaveBeenCalledWith(query);
      expect(result).toBeInstanceOf(Map);
    });

    it('getHistoryWithProof() fetches contract version history with proof', async () => {
      const query = {
        dataContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
      };

      const result = await client.contracts.getHistoryWithProof(query);

      expect(mockWasmSdk.getDataContractHistoryWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDataContractHistoryWithProofInfo).toHaveBeenCalledWith(query);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('proof');
    });

    it('getMany() fetches multiple contracts by IDs', async () => {
      const contractIds = [
        'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
        '5mjGWa9mruHnLBht3ntBi8CZ6sNk3hZZsQMgTvgQobjS',
      ];

      const result = await client.contracts.getMany(contractIds);

      expect(mockWasmSdk.getDataContracts).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDataContracts).toHaveBeenCalledWith(contractIds);
      expect(result).toBeInstanceOf(Map);
    });

    it('getManyWithProof() fetches multiple contracts with proof', async () => {
      const contractIds = ['GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'];

      const result = await client.contracts.getManyWithProof(contractIds);

      expect(mockWasmSdk.getDataContractsWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDataContractsWithProofInfo).toHaveBeenCalledWith(contractIds);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('proof');
    });
  });

  describe('Transition Methods', () => {
    it('publish() publishes a new data contract', async () => {
      const options = {
        dataContract: mockDataContract,
        identityKey: mockIdentityKey,
        signer: mockSigner,
        settings: { retries: 3 },
      };

      const result = await client.contracts.publish(options);

      expect(mockWasmSdk.contractPublish).toHaveBeenCalledOnce();
      expect(mockWasmSdk.contractPublish).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockDataContract);
    });

    it('update() updates an existing data contract', async () => {
      const options = {
        dataContract: mockDataContract,
        identityKey: mockIdentityKey,
        signer: mockSigner,
      };

      await client.contracts.update(options);

      expect(mockWasmSdk.contractUpdate).toHaveBeenCalledOnce();
      expect(mockWasmSdk.contractUpdate).toHaveBeenCalledWith(options);
    });
  });

  describe('Error Handling', () => {
    it('handles contract not found error on fetch()', async () => {
      const errorMessage = 'DataContract not found';
      mockWasmSdk.getDataContract.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.contracts.fetch('nonexistent-id')).rejects.toThrow(errorMessage);
    });

    it('handles network error on fetchWithProof()', async () => {
      const errorMessage = 'Network connection failed';
      mockWasmSdk.getDataContractWithProofInfo.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.contracts.fetchWithProof('test-id')).rejects.toThrow(errorMessage);
    });

    it('handles invalid contract ID on getHistory()', async () => {
      const errorMessage = 'Invalid contract ID format';
      mockWasmSdk.getDataContractHistory.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.contracts.getHistory({
        dataContractId: 'invalid!!id',
      })).rejects.toThrow(errorMessage);
    });

    it('handles publish failure', async () => {
      const errorMessage = 'Failed to publish contract: insufficient balance';
      mockWasmSdk.contractPublish.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.contracts.publish({
        dataContract: mockDataContract,
        identityKey: mockIdentityKey,
        signer: mockSigner,
      })).rejects.toThrow(errorMessage);
    });

    it('handles update failure', async () => {
      const errorMessage = 'Failed to update contract: invalid schema';
      mockWasmSdk.contractUpdate.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.contracts.update({
        dataContract: mockDataContract,
        identityKey: mockIdentityKey,
        signer: mockSigner,
      })).rejects.toThrow(errorMessage);
    });

    it('handles getMany with empty results', async () => {
      mockWasmSdk.getDataContracts.mockResolvedValueOnce(new Map());
      const result = await client.contracts.getMany(['nonexistent1', 'nonexistent2']);
      expect(result.size).toBe(0);
    });
  });
});
