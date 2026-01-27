/**
 * Test Fixtures for js-evo-sdk Integration Tests
 *
 * Provides reusable test data and configuration adapted from platform-test-suite.
 */

import crypto from 'crypto';

// Known testnet identities for testing read operations
export const TESTNET_IDENTITIES = {
  // A real identity on testnet that can be used for read-only tests
  SAMPLE: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',

  // DPNS contract owner (system identity)
  DPNS_CONTRACT: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
};

// Known testnet contracts
export const TESTNET_CONTRACTS = {
  DPNS: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  DASHPAY: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7',
};

// Known testnet names
export const TESTNET_NAMES = {
  SAMPLE: 'alice.dash',
};

/**
 * Generate a random 32-byte identifier
 */
export function generateRandomIdentifier(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random Base58 identifier (mock format)
 */
export function generateRandomBase58Id(): string {
  const bytes = crypto.randomBytes(32);
  // Simple base58 encoding approximation for testing
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += ALPHABET[bytes[i % 32] % 58];
  }
  return result;
}

/**
 * Data contract document schema fixture
 */
export const DOCUMENT_SCHEMAS = {
  // Simple document type
  simpleDocument: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        maxLength: 256,
        position: 0,
      },
    },
    required: ['$createdAt'],
    additionalProperties: false,
  },

  // Indexed document type
  indexedDocument: {
    type: 'object',
    indices: [
      {
        name: 'ownerIndex',
        properties: [
          { $ownerId: 'asc' },
          { firstName: 'asc' },
        ],
        unique: true,
      },
      {
        name: 'nameIndex',
        properties: [
          { lastName: 'asc' },
        ],
      },
      {
        name: 'createdAtIndex',
        properties: [
          { $createdAt: 'asc' },
        ],
      },
    ],
    properties: {
      firstName: {
        type: 'string',
        maxLength: 63,
        position: 0,
      },
      lastName: {
        type: 'string',
        maxLength: 63,
        position: 1,
      },
    },
    required: ['firstName', 'lastName', '$createdAt', '$updatedAt'],
    additionalProperties: false,
  },

  // Document with byte arrays
  binaryDocument: {
    type: 'object',
    properties: {
      data: {
        type: 'array',
        byteArray: true,
        maxItems: 1024,
        position: 0,
      },
    },
    required: ['data'],
    additionalProperties: false,
  },
};

/**
 * Test data contract configuration
 */
export const DATA_CONTRACT_CONFIG = {
  canBeDeleted: false,
  readonly: false,
  keepsHistory: true,
  documentsKeepHistoryContractDefault: false,
  documentsMutableContractDefault: true,
};

/**
 * DPNS domain document fixture
 */
export function getDpnsDocumentFixture(label: string, identityId: string) {
  return {
    label,
    normalizedLabel: label.toLowerCase(),
    normalizedParentDomainName: 'dash',
    preorderSalt: crypto.randomBytes(32).toString('hex'),
    records: {
      dashUniqueIdentityId: identityId,
    },
    subdomainRules: {
      allowSubdomains: false,
    },
  };
}

/**
 * DashPay profile document fixture
 */
export function getDashPayProfileFixture(displayName: string) {
  return {
    displayName,
    publicMessage: `Hello, I'm ${displayName}!`,
    avatarUrl: '',
    avatarHash: '',
    avatarFingerprint: '',
  };
}

/**
 * DashPay contact request fixture
 */
export function getContactRequestFixture(toUserId: string) {
  return {
    toUserId,
    encryptedPublicKey: crypto.randomBytes(96).toString('hex'),
    senderKeyIndex: 0,
    recipientKeyIndex: 0,
    accountReference: 0,
  };
}

/**
 * Test amounts in duffs
 */
export const TEST_AMOUNTS = {
  IDENTITY_CREATE: 200000,     // 0.002 DASH - minimum for identity creation
  IDENTITY_TOPUP: 50000,       // 0.0005 DASH
  CREDIT_TRANSFER: 10000,      // 0.0001 DASH
  DPNS_REGISTRATION: 50000,    // Typical DPNS registration cost
};

/**
 * Default test timeout values in milliseconds
 */
export const TEST_TIMEOUTS = {
  SDK_CONNECT: 30000,
  IDENTITY_FETCH: 30000,        // Increased for testnet latency
  IDENTITY_CREATE: 120000,      // Identity creation is slow
  IDENTITY_TOPUP: 90000,
  STATE_TRANSITION: 60000,
  DOCUMENT_QUERY: 30000,        // Increased for testnet latency
  DPNS_RESOLVE: 30000,          // Increased for testnet latency
};

/**
 * Network configuration for tests
 */
export const NETWORK_CONFIG = {
  testnet: {
    network: 'testnet' as const,
    logs: 'error',
  },
  mainnet: {
    network: 'mainnet' as const,
    logs: 'error',
  },
  local: {
    network: 'local' as const,
    logs: 'debug',
  },
};

/**
 * Get a test mnemonic from environment or use a default for read-only tests
 */
export function getTestMnemonic(): string | undefined {
  return process.env.TESTNET_MNEMONIC || process.env.TEST_MNEMONIC;
}

/**
 * Check if write tests should be skipped (no funded wallet)
 */
export function shouldSkipWriteTests(): boolean {
  return !getTestMnemonic();
}

/**
 * Get test network from environment
 */
export function getTestNetwork(): 'testnet' | 'mainnet' | 'local' {
  const network = process.env.TEST_NETWORK || 'testnet';
  if (network !== 'testnet' && network !== 'mainnet' && network !== 'local') {
    return 'testnet';
  }
  return network;
}
