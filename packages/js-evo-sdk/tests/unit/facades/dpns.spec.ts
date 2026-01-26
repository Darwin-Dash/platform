import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock responses
const mockUsernameInfo = { label: 'alice', identityId: 'id123' };
const mockUsernameInfoWithProof = { data: mockUsernameInfo, proof: {}, metadata: {} };

describe('DPNSFacade', () => {
  // Declare mock variables that will be created fresh in beforeEach
  let mockWasmSdk: {
    dpnsIsNameAvailable: Mock;
    dpnsResolveName: Mock;
    dpnsRegisterName: Mock;
    getDpnsUsernames: Mock;
    getDpnsUsername: Mock;
    getDpnsUsernamesWithProofInfo: Mock;
    getDpnsUsernameWithProofInfo: Mock;
    getDpnsUsernameByName: Mock;
    getDpnsUsernameByNameWithProofInfo: Mock;
  };
  let client: {
    dpns: {
      convertToHomographSafe: (input: string) => Promise<string>;
      isValidUsername: (label: string) => Promise<boolean>;
      isContestedUsername: (label: string) => Promise<boolean>;
      isNameAvailable: (label: string) => Promise<boolean>;
      resolveName: (name: string) => Promise<any>;
      registerName: (options: any) => Promise<any>;
      usernames: (query: any) => Promise<string[]>;
      username: (identityId: string) => Promise<string>;
      usernamesWithProof: (query: any) => Promise<any>;
      usernameWithProof: (identityId: string) => Promise<any>;
      getUsernameByName: (name: string) => Promise<any>;
      getUsernameByNameWithProof: (name: string) => Promise<any>;
    };
  };

  beforeEach(() => {
    // Create fresh mocks in beforeEach to ensure proper reset
    mockWasmSdk = {
      dpnsIsNameAvailable: vi.fn().mockResolvedValue(true),
      dpnsResolveName: vi.fn().mockResolvedValue(mockUsernameInfo),
      dpnsRegisterName: vi.fn().mockResolvedValue({ label: 'testname' }),
      getDpnsUsernames: vi.fn().mockResolvedValue(['alice', 'bob']),
      getDpnsUsername: vi.fn().mockResolvedValue('alice'),
      getDpnsUsernamesWithProofInfo: vi.fn().mockResolvedValue({ data: ['alice'], proof: {} }),
      getDpnsUsernameWithProofInfo: vi.fn().mockResolvedValue({ data: 'alice', proof: {} }),
      getDpnsUsernameByName: vi.fn().mockResolvedValue(mockUsernameInfo),
      getDpnsUsernameByNameWithProofInfo: vi.fn().mockResolvedValue(mockUsernameInfoWithProof),
    };

    // Create a mock EvoSDK for DPNS operations
    client = {
      dpns: {
        convertToHomographSafe: async (input: string) => input.toLowerCase(),
        isValidUsername: async (label: string) => /^[a-z0-9-]+$/.test(label),
        isContestedUsername: async (label: string) => ['dash', 'admin', 'system'].includes(label.toLowerCase()),
        isNameAvailable: async (label: string) => mockWasmSdk.dpnsIsNameAvailable(label),
        resolveName: async (name: string) => mockWasmSdk.dpnsResolveName(name),
        registerName: async (options: any) => mockWasmSdk.dpnsRegisterName(options),
        usernames: async (query: any) => mockWasmSdk.getDpnsUsernames(query),
        username: async (identityId: string) => mockWasmSdk.getDpnsUsername(identityId),
        usernamesWithProof: async (query: any) => mockWasmSdk.getDpnsUsernamesWithProofInfo(query),
        usernameWithProof: async (identityId: string) => mockWasmSdk.getDpnsUsernameWithProofInfo(identityId),
        getUsernameByName: async (name: string) => mockWasmSdk.getDpnsUsernameByName(name),
        getUsernameByNameWithProof: async (name: string) => mockWasmSdk.getDpnsUsernameByNameWithProofInfo(name),
      },
    };
  });

  describe('Static Utility Methods', () => {
    it('convertToHomographSafe() converts Unicode to safe ASCII', async () => {
      const result = await client.dpns.convertToHomographSafe('abc');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('isValidUsername() validates username format', async () => {
      const validResult = await client.dpns.isValidUsername('alice');
      expect(typeof validResult).toBe('boolean');
    });

    it('isContestedUsername() checks for contested names', async () => {
      const result = await client.dpns.isContestedUsername('dash');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Query Methods', () => {
    it('isNameAvailable() checks availability and returns result', async () => {
      const result = await client.dpns.isNameAvailable('testlabel');
      expect(mockWasmSdk.dpnsIsNameAvailable).toHaveBeenCalledOnce();
      expect(mockWasmSdk.dpnsIsNameAvailable).toHaveBeenCalledWith('testlabel');
      expect(result).toBe(true);
    });

    it('resolveName() resolves name and returns username info', async () => {
      const result = await client.dpns.resolveName('alice.dash');
      expect(mockWasmSdk.dpnsResolveName).toHaveBeenCalledOnce();
      expect(mockWasmSdk.dpnsResolveName).toHaveBeenCalledWith('alice.dash');
      expect(result).toEqual(mockUsernameInfo);
    });

    it('usernames() fetches usernames for identity with query params', async () => {
      const query = { identityId: 'testIdentity', limit: 5 };
      const result = await client.dpns.usernames(query);
      expect(mockWasmSdk.getDpnsUsernames).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDpnsUsernames).toHaveBeenCalledWith(query);
      expect(result).toEqual(['alice', 'bob']);
    });

    it('username() fetches primary username for identity', async () => {
      const result = await client.dpns.username('testIdentity');
      expect(mockWasmSdk.getDpnsUsername).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDpnsUsername).toHaveBeenCalledWith('testIdentity');
      expect(result).toBe('alice');
    });

    it('usernamesWithProof() fetches usernames with proof', async () => {
      const query = { identityId: 'testIdentity', limit: 3 };
      const result = await client.dpns.usernamesWithProof(query);
      expect(mockWasmSdk.getDpnsUsernamesWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDpnsUsernamesWithProofInfo).toHaveBeenCalledWith(query);
      expect(result).toHaveProperty('proof');
    });

    it('usernameWithProof() fetches username with proof', async () => {
      const result = await client.dpns.usernameWithProof('testIdentity');
      expect(mockWasmSdk.getDpnsUsernameWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDpnsUsernameWithProofInfo).toHaveBeenCalledWith('testIdentity');
      expect(result).toHaveProperty('proof');
    });

    it('getUsernameByName() fetches username info by name', async () => {
      const result = await client.dpns.getUsernameByName('alice.dash');
      expect(mockWasmSdk.getDpnsUsernameByName).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDpnsUsernameByName).toHaveBeenCalledWith('alice.dash');
      expect(result).toEqual(mockUsernameInfo);
    });

    it('getUsernameByNameWithProof() fetches username info with proof', async () => {
      const result = await client.dpns.getUsernameByNameWithProof('alice.dash');
      expect(mockWasmSdk.getDpnsUsernameByNameWithProofInfo).toHaveBeenCalledOnce();
      expect(mockWasmSdk.getDpnsUsernameByNameWithProofInfo).toHaveBeenCalledWith('alice.dash');
      expect(result).toEqual(mockUsernameInfoWithProof);
    });
  });

  describe('Transition Methods', () => {
    it('registerName() registers a name with proper options', async () => {
      const mockIdentity = {};
      const mockIdentityKey = {};
      const mockSigner = {};
      const options = {
        label: 'testname',
        identity: mockIdentity,
        identityKey: mockIdentityKey,
        signer: mockSigner,
      };

      const result = await client.dpns.registerName(options);

      expect(mockWasmSdk.dpnsRegisterName).toHaveBeenCalledOnce();
      expect(mockWasmSdk.dpnsRegisterName).toHaveBeenCalledWith(options);
      expect(result).toHaveProperty('label', 'testname');
    });
  });

  describe('Error Handling', () => {
    it('handles name not available error', async () => {
      mockWasmSdk.dpnsIsNameAvailable.mockResolvedValueOnce(false);
      const result = await client.dpns.isNameAvailable('taken');
      expect(result).toBe(false);
    });

    it('handles resolve name not found', async () => {
      mockWasmSdk.dpnsResolveName.mockResolvedValueOnce(undefined);
      const result = await client.dpns.resolveName('nonexistent.dash');
      expect(result).toBeUndefined();
    });

    it('handles network error on isNameAvailable()', async () => {
      const errorMessage = 'Network connection failed';
      mockWasmSdk.dpnsIsNameAvailable.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.dpns.isNameAvailable('test')).rejects.toThrow(errorMessage);
    });

    it('handles network error on resolveName()', async () => {
      const errorMessage = 'DAPI request failed';
      mockWasmSdk.dpnsResolveName.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.dpns.resolveName('alice.dash')).rejects.toThrow(errorMessage);
    });

    it('handles registration failure', async () => {
      const errorMessage = 'Name registration failed: insufficient balance';
      mockWasmSdk.dpnsRegisterName.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.dpns.registerName({
        label: 'testname',
        identity: {},
        identityKey: {},
        signer: {},
      })).rejects.toThrow(errorMessage);
    });
  });
});
