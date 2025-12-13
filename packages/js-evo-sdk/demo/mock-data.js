/**
 * Mock data for development and testing
 * Provides realistic identity and transaction data
 */

// Test mnemonic for development - from packages/js-evo-sdk/.env
// WARNING: Never use this in production!
export const TEST_MNEMONIC = 'lamp truck drip furnace now swing income victory leisure popular jeans vehicle';

export const mockIdentities = new Map([
  ['GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', {
    id: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    balance: 10250000000, // 10.25 DASH
    revision: 3,
    publicKeysCount: 4,
    label: 'Personal Wallet',
    dpnsNames: ['alice.dash', 'alice-personal.dash'],
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-10-01T14:22:00Z',
    keys: [
      {
        id: 0,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'MASTER',
        status: 'active',
        data: '0x2d3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d',
        disabledAt: null
      },
      {
        id: 1,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        status: 'active',
        data: '0x3d4c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
        disabledAt: null
      },
      {
        id: 2,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'TRANSFER',
        securityLevel: 'CRITICAL',
        status: 'disabled',
        data: '0x4d5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d',
        disabledAt: '2024-09-15T08:00:00Z'
      },
      {
        id: 3,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'CRITICAL',
        status: 'active',
        data: '0x5d6c7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
        disabledAt: null
      }
    ]
  }],
  ['H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX', {
    id: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    balance: 5500000000, // 5.50 DASH
    revision: 1,
    publicKeysCount: 2,
    label: 'Business Account',
    dpnsNames: ['acme-corp.dash', 'business.dash', 'company.dash'],
    createdAt: '2024-03-20T15:45:00Z',
    updatedAt: '2024-09-28T09:15:00Z',
    keys: [
      {
        id: 0,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'MASTER',
        status: 'active',
        data: '0x6d7c8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d',
        disabledAt: null
      },
      {
        id: 1,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        status: 'active',
        data: '0x7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d',
        disabledAt: null
      }
    ]
  }],
  ['J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX', {
    id: 'J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX',
    balance: 750000000, // 0.75 DASH
    revision: 5,
    publicKeysCount: 3,
    label: 'Gaming Identity',
    dpnsNames: ['gamer123.dash', 'progamer.dash'],
    createdAt: '2024-06-10T20:00:00Z',
    updatedAt: '2024-10-05T18:30:00Z',
    keys: [
      {
        id: 0,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'MASTER',
        status: 'active',
        data: '0x8d9c0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
        disabledAt: null
      },
      {
        id: 1,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        status: 'active',
        data: '0x9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f',
        disabledAt: null
      },
      {
        id: 2,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'TRANSFER',
        securityLevel: 'MEDIUM',
        status: 'active',
        data: '0xa0f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
        disabledAt: null
      }
    ]
  }]
]);

export const mockTransactions = [
  {
    id: 'tx_1696168920000',
    type: 'topup',
    identityId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    amount: 1000000000, // 1 DASH
    status: 'confirmed',
    timestamp: 1696168920000,
    confirmations: 6,
    hash: '7f3e2a1b9c8d5e4f0a2b3c4d6e7f8a9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
    fee: 226,
    fromAddress: 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd',
    direction: 'in'
  },
  {
    id: 'tx_1696082520000',
    type: 'transfer',
    identityId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    amount: 250000000, // 0.25 DASH
    status: 'confirmed',
    timestamp: 1696082520000,
    confirmations: 24,
    hash: '8a4f3b2c1d9e8f7a0b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a',
    fee: 189,
    recipientId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    direction: 'out'
  },
  {
    id: 'tx_1695996120000',
    type: 'withdraw',
    identityId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    amount: 500000000, // 0.5 DASH
    status: 'confirmed',
    timestamp: 1695996120000,
    confirmations: 144,
    hash: '9b5a4c3d2e1f9a8b7c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    fee: 302,
    toAddress: 'yYVrPomVktmhJNLJqtaBDqwUcr1PS6pvPw',
    direction: 'out'
  },
  {
    id: 'tx_pending_' + Date.now(),
    type: 'topup',
    identityId: 'J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX',
    amount: 100000000, // 0.1 DASH
    status: 'pending',
    timestamp: Date.now(),
    confirmations: 0,
    hash: null,
    fee: 200,
    fromAddress: 'yNPcb7TVyh45ZTcJZBg8MHJB48tZrJBrFJ',
    direction: 'in'
  }
];

// Mock Data Contracts
export const mockDataContracts = new Map([
  ['dpns', {
    id: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    name: 'DPNS',
    description: 'Dash Platform Name Service',
    owner: 'system',
    version: 1,
    documentTypes: ['domain', 'preorder']
  }],
  ['dashpay', {
    id: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    name: 'DashPay',
    description: 'DashPay social features',
    owner: 'system',
    version: 1,
    documentTypes: ['contactRequest', 'profile']
  }],
  ['note-contract', {
    id: 'K9MNPQrTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaB',
    name: 'Notes',
    description: 'Simple note-taking application',
    owner: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    version: 1,
    documentTypes: ['note']
  }]
]);

// Mock Documents
export const mockDocuments = [
  {
    id: 'doc_dpns_alice_1',
    contractId: 'dpns',
    documentType: 'domain',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      label: 'alice',
      normalizedLabel: 'alice',
      normalizedParentDomainName: 'dash',
      records: {
        dashUniqueIdentityId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
      }
    },
    createdAt: '2024-01-15T11:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z'
  },
  {
    id: 'doc_dpns_alice_personal_2',
    contractId: 'dpns',
    documentType: 'domain',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      label: 'alice-personal',
      normalizedLabel: 'alice-personal',
      normalizedParentDomainName: 'dash',
      records: {
        dashUniqueIdentityId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
      }
    },
    createdAt: '2024-03-10T14:30:00Z',
    updatedAt: '2024-03-10T14:30:00Z'
  },
  {
    id: 'doc_dashpay_profile_1',
    contractId: 'dashpay',
    documentType: 'profile',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      publicMessage: 'Blockchain enthusiast and developer',
      avatarUrl: '',
      displayName: 'Alice'
    },
    createdAt: '2024-02-01T09:15:00Z',
    updatedAt: '2024-08-20T16:45:00Z'
  },
  {
    id: 'doc_note_1',
    contractId: 'note-contract',
    documentType: 'note',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      title: 'My First Note',
      content: 'This is a test note stored on Dash Platform',
      tags: ['test', 'demo']
    },
    createdAt: '2024-05-15T10:00:00Z',
    updatedAt: '2024-05-15T10:00:00Z'
  },
  {
    id: 'doc_note_2',
    contractId: 'note-contract',
    documentType: 'note',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      title: 'Platform Ideas',
      content: 'Ideas for Platform applications: social network, marketplace, voting system',
      tags: ['ideas', 'platform']
    },
    createdAt: '2024-09-01T15:30:00Z',
    updatedAt: '2024-09-05T11:20:00Z'
  },
  {
    id: 'doc_dpns_business_1',
    contractId: 'dpns',
    documentType: 'domain',
    ownerId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    data: {
      label: 'acme-corp',
      normalizedLabel: 'acme-corp',
      normalizedParentDomainName: 'dash',
      records: {
        dashUniqueIdentityId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX'
      }
    },
    createdAt: '2024-03-20T16:00:00Z',
    updatedAt: '2024-03-20T16:00:00Z'
  },
  {
    id: 'doc_dashpay_contact_req_1',
    contractId: 'dashpay',
    documentType: 'contactRequest',
    ownerId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    data: {
      toUserId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
      encryptedPublicKey: '0xabc123...',
      encryptedAccountReference: '0xdef456...'
    },
    createdAt: '2024-09-15T12:00:00Z',
    updatedAt: '2024-09-15T12:00:00Z'
  },
  {
    id: 'doc_dpns_gamer_1',
    contractId: 'dpns',
    documentType: 'domain',
    ownerId: 'J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX',
    data: {
      label: 'gamer123',
      normalizedLabel: 'gamer123',
      normalizedParentDomainName: 'dash',
      records: {
        dashUniqueIdentityId: 'J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX'
      }
    },
    createdAt: '2024-06-10T20:30:00Z',
    updatedAt: '2024-06-10T20:30:00Z'
  },
  // Additional DashPay Profiles
  {
    id: 'doc_dashpay_profile_2',
    contractId: 'dashpay',
    documentType: 'profile',
    ownerId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    data: {
      publicMessage: 'Building the decentralized future',
      avatarUrl: '',
      displayName: 'ACME Corp'
    },
    createdAt: '2024-03-21T10:00:00Z',
    updatedAt: '2024-09-10T12:30:00Z'
  },
  {
    id: 'doc_dashpay_profile_3',
    contractId: 'dashpay',
    documentType: 'profile',
    ownerId: 'J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX',
    data: {
      publicMessage: 'Gaming on Dash Platform',
      avatarUrl: '',
      displayName: 'ProGamer'
    },
    createdAt: '2024-06-11T08:15:00Z',
    updatedAt: '2024-10-01T19:45:00Z'
  },
  // Contact Requests - Inbound (to Alice from Business)
  {
    id: 'doc_dashpay_contact_req_inbound_1',
    contractId: 'dashpay',
    documentType: 'contactRequest',
    ownerId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    data: {
      toUserId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
      encryptedPublicKey: '0xabc123def456789abcdef0123456789abcdef012',
      encryptedAccountReference: '0xdef456abc789012def345678901234567890abcd',
      coreHeightCreatedAt: 918500
    },
    createdAt: '2024-09-15T12:00:00Z',
    updatedAt: '2024-09-15T12:00:00Z'
  },
  // Contact Requests - Inbound (to Alice from Gamer)
  {
    id: 'doc_dashpay_contact_req_inbound_2',
    contractId: 'dashpay',
    documentType: 'contactRequest',
    ownerId: 'J8FKQNMrtPq2UzLnGAonVGwJqxDKkr5NRXGameXXXXXX',
    data: {
      toUserId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
      encryptedPublicKey: '0x789abc012def345678901234567890abcdef0123',
      encryptedAccountReference: '0x012def345678abc901234567890abcdef0123456',
      coreHeightCreatedAt: 919200
    },
    createdAt: '2024-10-02T15:30:00Z',
    updatedAt: '2024-10-02T15:30:00Z'
  },
  // Contact Requests - Outbound (from Alice to external user)
  {
    id: 'doc_dashpay_contact_req_outbound_1',
    contractId: 'dashpay',
    documentType: 'contactRequest',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      toUserId: 'X9YZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJk',
      encryptedPublicKey: '0x345abc678def901234567890abcdef0123456789',
      encryptedAccountReference: '0x678def901234abc567890123def456789abcdef0',
      coreHeightCreatedAt: 919500
    },
    createdAt: '2024-10-05T09:00:00Z',
    updatedAt: '2024-10-05T09:00:00Z'
  },
  // Accepted Contacts (from contactInfo document)
  {
    id: 'doc_dashpay_contact_info_1',
    contractId: 'dashpay',
    documentType: 'contactInfo',
    ownerId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    data: {
      encryptedPublicKey: '0xabc123def456789abcdef0123456789abcdef012',
      encryptedAccountReference: '0xdef456abc789012def345678901234567890abcd',
      rootEncryptionKeyIndex: 0,
      derivationEncryptionKeyIndex: 0
    },
    createdAt: '2024-08-10T14:20:00Z',
    updatedAt: '2024-08-10T14:20:00Z'
  },
  {
    id: 'doc_dashpay_contact_info_2',
    contractId: 'dashpay',
    documentType: 'contactInfo',
    ownerId: 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX',
    data: {
      encryptedPublicKey: '0x456def789abc012345678901def234567890abcd',
      encryptedAccountReference: '0x789abc012def345678901234567def89abcdef01',
      rootEncryptionKeyIndex: 0,
      derivationEncryptionKeyIndex: 0
    },
    createdAt: '2024-07-25T11:00:00Z',
    updatedAt: '2024-07-25T11:00:00Z'
  }
];

/**
 * Mock Platform operations
 */
export class MockPlatformOperations {
  constructor() {
    this.pendingTransactions = new Map();
  }

  // Helper to simulate network delay
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate a mock identity ID
  generateMockIdentityId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let id = '';
    for (let i = 0; i < 44; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  // Generate mock keys
  generateMockKeys() {
    return [
      {
        id: 0,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'MASTER',
        status: 'active',
        data: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        disabledAt: null
      },
      {
        id: 1,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'AUTHENTICATION',
        securityLevel: 'HIGH',
        status: 'active',
        data: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        disabledAt: null
      },
      {
        id: 2,
        keyType: 'ECDSA_SECP256K1',
        purpose: 'TRANSFER',
        securityLevel: 'MEDIUM',
        status: 'active',
        data: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        disabledAt: null
      }
    ];
  }

  // Top up an identity
  async topUp(identityId, amount, operationId = null) {
    let identity = mockIdentities.get(identityId);

    // If identity not in mock storage (e.g., discovered from real testnet),
    // create a synthetic entry for simulation purposes
    if (!identity) {
      identity = {
        id: identityId,
        balance: 1000000000, // 1 DASH default
        label: 'Discovered Identity',
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        keys: []
      };
      mockIdentities.set(identityId, identity);
    }

    // Emit progress events for top-up operation
    const steps = [
      { message: 'Initializing wallet...', progress: 20, duration: 1000 },
      { message: 'Creating asset lock transaction...', progress: 40, duration: 1500 },
      { message: 'Broadcasting to network...', progress: 60, duration: 1500 },
      { message: 'Waiting for confirmation...', progress: 80, duration: 2000 },
      { message: 'Updating identity balance...', progress: 100, duration: 1000 }
    ];

    for (const step of steps) {
      window.dispatchEvent(new CustomEvent('identity-topup-progress', {
        detail: {
          operationId,
          message: step.message,
          progress: step.progress
        }
      }));
      await this.delay(step.duration);
    }

    identity.balance += amount;
    identity.updatedAt = new Date().toISOString();
    identity.revision += 1;

    const transaction = {
      id: 'tx_' + Date.now(),
      type: 'topup',
      identityId,
      amount,
      status: 'pending',
      timestamp: Date.now(),
      confirmations: 0,
      hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      fee: Math.floor(amount * 0.0001),
      fromAddress: 'y' + Array(33).fill(0).map(() => Math.floor(Math.random() * 36).toString(36)).join(''),
      direction: 'in'
    };

    mockTransactions.push(transaction);
    this.pendingTransactions.set(transaction.id, transaction);

    // Simulate confirmation after 5 seconds
    setTimeout(() => {
      transaction.status = 'confirmed';
      transaction.confirmations = 6;
      this.pendingTransactions.delete(transaction.id);
    }, 5000);

    return transaction;
  }

  // Withdraw credits
  async withdraw(identityId, toAddress, amount) {
    await this.delay(3000);

    const identity = mockIdentities.get(identityId);
    if (!identity) {
      throw new Error(`Identity ${identityId} not found`);
    }

    if (identity.balance < amount) {
      throw new Error('Insufficient balance');
    }

    identity.balance -= amount;
    identity.updatedAt = new Date().toISOString();
    identity.revision += 1;

    const transaction = {
      id: 'tx_' + Date.now(),
      type: 'withdraw',
      identityId,
      amount,
      status: 'pending',
      timestamp: Date.now(),
      confirmations: 0,
      hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      fee: Math.floor(amount * 0.0001),
      toAddress,
      direction: 'out'
    };

    mockTransactions.push(transaction);
    this.pendingTransactions.set(transaction.id, transaction);

    // Simulate confirmation
    setTimeout(() => {
      transaction.status = 'confirmed';
      transaction.confirmations = 6;
      this.pendingTransactions.delete(transaction.id);
    }, 6000);

    return transaction;
  }

  // Transfer credits between identities
  async transfer(senderId, recipientId, amount) {
    await this.delay(2500);

    const sender = mockIdentities.get(senderId);
    const recipient = mockIdentities.get(recipientId);

    if (!sender) {
      throw new Error(`Sender identity ${senderId} not found`);
    }
    if (!recipient) {
      throw new Error(`Recipient identity ${recipientId} not found`);
    }
    if (sender.balance < amount) {
      throw new Error('Insufficient balance');
    }

    sender.balance -= amount;
    recipient.balance += amount;
    sender.updatedAt = new Date().toISOString();
    recipient.updatedAt = new Date().toISOString();
    sender.revision += 1;
    recipient.revision += 1;

    const transaction = {
      id: 'tx_' + Date.now(),
      type: 'transfer',
      identityId: senderId,
      amount,
      status: 'pending',
      timestamp: Date.now(),
      confirmations: 0,
      hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      fee: Math.floor(amount * 0.0001),
      recipientId,
      direction: 'out'
    };

    mockTransactions.push(transaction);
    this.pendingTransactions.set(transaction.id, transaction);

    // Simulate confirmation
    setTimeout(() => {
      transaction.status = 'confirmed';
      transaction.confirmations = 6;
      this.pendingTransactions.delete(transaction.id);
    }, 4500);

    return transaction;
  }

  // Create a new identity
  async createIdentity(fundingAmount, label) {
    const steps = [
      { message: 'Initializing...', progress: 20, duration: 1000 },
      { message: 'Generating keys...', progress: 40, duration: 1500 },
      { message: 'Creating transaction...', progress: 60, duration: 1500 },
      { message: 'Submitting to network...', progress: 80, duration: 2000 },
      { message: 'Confirming...', progress: 100, duration: 1000 }
    ];

    for (const step of steps) {
      window.dispatchEvent(new CustomEvent('identity-creation-progress', {
        detail: { message: step.message, progress: step.progress }
      }));
      await this.delay(step.duration);
    }

    const newIdentity = {
      id: this.generateMockIdentityId(),
      balance: fundingAmount,
      revision: 0,
      publicKeysCount: 3,
      label: label || 'New Identity',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      keys: this.generateMockKeys()
    };

    mockIdentities.set(newIdentity.id, newIdentity);

    const transaction = {
      id: 'tx_' + Date.now(),
      type: 'create',
      identityId: newIdentity.id,
      amount: fundingAmount,
      status: 'confirmed',
      timestamp: Date.now(),
      confirmations: 6,
      hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      fee: 10000,
      direction: 'out'
    };

    mockTransactions.push(transaction);

    return newIdentity;
  }

  // Fetch identity details
  async fetchIdentity(identityId) {
    await this.delay(500);
    const identity = mockIdentities.get(identityId);
    if (!identity) {
      throw new Error(`Identity ${identityId} not found`);
    }
    return { ...identity };
  }

  // Get transaction history
  async getTransactionHistory(identityId, limit = 10) {
    await this.delay(300);
    return mockTransactions
      .filter(tx => tx.identityId === identityId || tx.recipientId === identityId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Generate a funding address
  // In real SDK mode, returns the known test address for the test mnemonic
  // In mock mode, generates a realistic-looking address
  async generateFundingAddress() {
    await this.delay(500);

    // Use the real testnet address derived from TEST_MNEMONIC
    // This address is derived from: lamp truck drip furnace now swing income victory leisure popular jeans vehicle
    // Using BIP44 path m/44'/1'/0'/0/0
    const realTestAddress = 'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy';

    return realTestAddress;
  }

  // Check balance for a given address (mock)
  async checkAddressBalance(address) {
    await this.delay(800);

    // Mock: Return a random balance between 0.01 and 0.1 DASH
    const mockBalance = Math.floor(Math.random() * 9000000000) + 1000000000;

    return {
      address,
      balance: mockBalance,
      txid: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
      confirmations: 1
    };
  }

  // Simulate InstantSend transaction arrival
  async simulateInstantSendTransaction(address, callback) {
    // Wait 5-10 seconds to simulate transaction propagation
    const delay = 5000 + Math.floor(Math.random() * 5000);

    await this.delay(delay);

    // Generate mock transaction data
    const mockBalance = 5000000000; // 0.05 DASH
    const transaction = {
      address,
      balance: mockBalance,
      amount: mockBalance,
      txid: 'mock_instant_' + Date.now(),
      confirmations: 1,
      isInstantSend: true,
      timestamp: Date.now()
    };

    // Trigger callback with transaction data
    if (callback) {
      callback(transaction);
    }

    // Also emit a global event for UI updates
    window.dispatchEvent(new CustomEvent('instantsend-received', {
      detail: transaction
    }));

    return transaction;
  }

  // Get current blockchain height (mock)
  async getCurrentBlockHeight() {
    await this.delay(200);
    // Mock testnet height
    return 920000;
  }

  // Calculate optimized sync height based on timeframe
  calculateSyncHeight(timeframe, currentHeight) {
    const blocksToScan = {
      'hour': 60,
      'day': 576,
      'week': 4032
    };

    const blocksBack = blocksToScan[timeframe] || 60;
    return Math.max(0, currentHeight - blocksBack);
  }

  // Get documents for an identity
  async getDocumentsByOwner(ownerId) {
    await this.delay(500);
    return mockDocuments.filter(doc => doc.ownerId === ownerId);
  }

  // Get contract info
  async getContract(contractId) {
    await this.delay(200);
    return mockDataContracts.get(contractId);
  }

  // Get contested names for an identity
  async getContestedNamesForIdentity(identityId) {
    await this.delay(300);
    return mockContestedNames.filter(contest =>
      contest.contenders.some(c => c.identityId === identityId)
    );
  }

  // Get all active contests
  async getAllActiveContests() {
    await this.delay(400);
    return mockContestedNames.filter(contest => contest.status === 'active');
  }
}

// Mock Contested Names (Voting)
export const mockContestedNames = [
  {
    id: 'contest_alice_1',
    name: 'alice.dash',
    normalizedName: 'a11ce',
    status: 'active',
    voteEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
    startDate: '2024-10-01T10:00:00Z',
    contenders: [
      {
        identityId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
        votes: 245,
        lockedAmount: 20000000000 // 20 DASH
      },
      {
        identityId: 'X9YZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJk',
        votes: 198,
        lockedAmount: 20000000000
      }
    ],
    totalVotes: 443
  },
  {
    id: 'contest_bob_1',
    name: 'bob.dash',
    normalizedName: 'b0b',
    status: 'completed',
    winner: 'M8NoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ',
    voteEndDate: '2024-09-20T15:00:00Z',
    startDate: '2024-09-06T15:00:00Z',
    contenders: [
      {
        identityId: 'M8NoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ',
        votes: 512,
        lockedAmount: 20000000000
      },
      {
        identityId: 'N9PqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZa',
        votes: 301,
        lockedAmount: 20000000000
      }
    ],
    totalVotes: 813
  }
];