import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockPlatformOperations, mockIdentities } from '../../mock-data.js';

describe('Mock Platform Operations', () => {
  let mockOps;

  beforeEach(() => {
    mockOps = new MockPlatformOperations();

    // Reset mock identities to initial state
    for (const [id, identity] of mockIdentities) {
      identity.balance = identity.id === 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec' ? 10250000000 :
                        identity.id === 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX' ? 5500000000 :
                        750000000;
    }
  });

  describe('topUp', () => {
    it('increases identity balance', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const identity = mockIdentities.get(identityId);
      const initialBalance = identity.balance;
      const amount = 100000000; // 1 DASH

      await mockOps.topUp(identityId, amount);

      expect(identity.balance).toBe(initialBalance + amount);
    });

    it('increments revision number', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const identity = mockIdentities.get(identityId);
      const initialRevision = identity.revision;

      await mockOps.topUp(identityId, 100000000);

      expect(identity.revision).toBe(initialRevision + 1);
    });

    it('updates timestamp', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const identity = mockIdentities.get(identityId);
      const initialTimestamp = identity.updatedAt;

      await mockOps.topUp(identityId, 100000000);

      expect(identity.updatedAt).not.toBe(initialTimestamp);
    });

    it('returns transaction object', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const transaction = await mockOps.topUp(identityId, 100000000);

      expect(transaction).toBeDefined();
      expect(transaction.id).toBeTruthy();
      expect(transaction.type).toBe('topup');
      expect(transaction.amount).toBe(100000000);
      expect(transaction.status).toBe('pending');
    });

    it('throws error for non-existent identity', async () => {
      await expect(mockOps.topUp('nonexistent', 100000000))
        .rejects.toThrow('not found');
    });

    it('simulates network delay', async () => {
      const start = Date.now();
      await mockOps.topUp('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', 100000000);
      const duration = Date.now() - start;

      // Should take at least 2 seconds (mock delay)
      expect(duration).toBeGreaterThanOrEqual(1900);
    });
  });

  describe('withdraw', () => {
    it('decreases identity balance', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const identity = mockIdentities.get(identityId);
      const initialBalance = identity.balance;
      const amount = 100000000;

      await mockOps.withdraw(identityId, 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd', amount);

      expect(identity.balance).toBe(initialBalance - amount);
    });

    it('throws error for insufficient balance', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const identity = mockIdentities.get(identityId);

      await expect(mockOps.withdraw(identityId, 'yAddress', identity.balance + 1000000000))
        .rejects.toThrow('Insufficient balance');
    });

    it('increments revision number', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const identity = mockIdentities.get(identityId);
      const initialRevision = identity.revision;

      await mockOps.withdraw(identityId, 'yAddress', 100000000);

      expect(identity.revision).toBe(initialRevision + 1);
    });

    it('returns transaction object', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const transaction = await mockOps.withdraw(identityId, 'yAddress', 100000000);

      expect(transaction.type).toBe('withdraw');
      expect(transaction.toAddress).toBe('yAddress');
      expect(transaction.direction).toBe('out');
    });
  });

  describe('transfer', () => {
    it('decreases sender balance', async () => {
      const senderId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const recipientId = 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX';
      const sender = mockIdentities.get(senderId);
      const initialBalance = sender.balance;
      const amount = 100000000;

      await mockOps.transfer(senderId, recipientId, amount);

      expect(sender.balance).toBe(initialBalance - amount);
    });

    it('increases recipient balance', async () => {
      const senderId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const recipientId = 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX';
      const recipient = mockIdentities.get(recipientId);
      const initialBalance = recipient.balance;
      const amount = 100000000;

      await mockOps.transfer(senderId, recipientId, amount);

      expect(recipient.balance).toBe(initialBalance + amount);
    });

    it('increments both revisions', async () => {
      const senderId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const recipientId = 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX';
      const sender = mockIdentities.get(senderId);
      const recipient = mockIdentities.get(recipientId);
      const senderRev = sender.revision;
      const recipientRev = recipient.revision;

      await mockOps.transfer(senderId, recipientId, 100000000);

      expect(sender.revision).toBe(senderRev + 1);
      expect(recipient.revision).toBe(recipientRev + 1);
    });

    it('throws error for insufficient balance', async () => {
      const senderId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
      const recipientId = 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX';
      const sender = mockIdentities.get(senderId);

      await expect(mockOps.transfer(senderId, recipientId, sender.balance + 1000000000))
        .rejects.toThrow('Insufficient balance');
    });

    it('throws error for non-existent sender', async () => {
      await expect(mockOps.transfer('nonexistent', 'H3KTBYNQkBYZVpXmGAonVGwJqxDKkr5NRXAuthXXXXXX', 100000000))
        .rejects.toThrow('not found');
    });

    it('throws error for non-existent recipient', async () => {
      await expect(mockOps.transfer('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec', 'nonexistent', 100000000))
        .rejects.toThrow('not found');
    });
  });

  describe('createIdentity', () => {
    it('creates new identity with funding', async () => {
      const fundingAmount = 150000000; // 1.5 DASH
      const label = 'Test Identity';

      const identity = await mockOps.createIdentity(fundingAmount, label);

      expect(identity).toBeDefined();
      expect(identity.id).toBeTruthy();
      expect(identity.balance).toBe(fundingAmount);
      expect(identity.label).toBe(label);
      expect(identity.revision).toBe(0);
    }, 15000); // Increase timeout for createIdentity delays

    it('generates identity keys', async () => {
      const identity = await mockOps.createIdentity(100000000, 'Test');

      expect(identity.keys).toBeDefined();
      expect(identity.keys.length).toBeGreaterThanOrEqual(3);
      expect(identity.publicKeysCount).toBe(identity.keys.length);
    }, 15000);

    it('adds identity to mock identities map', async () => {
      const initialSize = mockIdentities.size;

      const identity = await mockOps.createIdentity(100000000, 'Test');

      expect(mockIdentities.has(identity.id)).toBe(true);
      expect(mockIdentities.size).toBe(initialSize + 1);
    }, 15000);

    it('dispatches progress events', async () => {
      const progressEvents = [];

      window.addEventListener('identity-creation-progress', (e) => {
        progressEvents.push(e.detail);
      });

      await mockOps.createIdentity(100000000, 'Test');

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.progress === 100)).toBe(true);
    }, 15000);

    it('generates unique identity ID', async () => {
      const identity1 = await mockOps.createIdentity(100000000, 'Test1');
      const identity2 = await mockOps.createIdentity(100000000, 'Test2');

      expect(identity1.id).not.toBe(identity2.id);
      expect(identity1.id.length).toBe(44); // Base58 length
      expect(identity2.id.length).toBe(44);
    }, 20000); // Extra time for two creations

    it('sets creation timestamp', async () => {
      const before = new Date().toISOString();
      const identity = await mockOps.createIdentity(100000000, 'Test');
      const after = new Date().toISOString();

      expect(identity.createdAt).toBeDefined();
      expect(identity.createdAt >= before).toBe(true);
      expect(identity.createdAt <= after).toBe(true);
    }, 15000);
  });

  describe('fetchIdentity', () => {
    it('returns identity data', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const identity = await mockOps.fetchIdentity(identityId);

      expect(identity.id).toBe(identityId);
      expect(identity.balance).toBeDefined();
      expect(identity.keys).toBeDefined();
    });

    it('throws error for non-existent identity', async () => {
      await expect(mockOps.fetchIdentity('nonexistent'))
        .rejects.toThrow('not found');
    });

    it('simulates network delay', async () => {
      const start = Date.now();
      await mockOps.fetchIdentity('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec');
      const duration = Date.now() - start;

      // Should take at least 500ms
      expect(duration).toBeGreaterThanOrEqual(450);
    });

    it('returns copy of identity (not reference)', async () => {
      const original = mockIdentities.get('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec');
      const fetched = await mockOps.fetchIdentity('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec');

      fetched.balance = 999999999;

      // Original should not be affected
      expect(original.balance).not.toBe(999999999);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns transactions for identity', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const transactions = await mockOps.getTransactionHistory(identityId);

      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThan(0);
    });

    it('limits results', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const transactions = await mockOps.getTransactionHistory(identityId, 2);

      expect(transactions.length).toBeLessThanOrEqual(2);
    });

    it('sorts by timestamp descending', async () => {
      const identityId = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

      const transactions = await mockOps.getTransactionHistory(identityId);

      for (let i = 1; i < transactions.length; i++) {
        expect(transactions[i - 1].timestamp).toBeGreaterThanOrEqual(transactions[i].timestamp);
      }
    });
  });

  describe('helper methods', () => {
    it('generateMockIdentityId creates valid Base58', () => {
      const id = mockOps.generateMockIdentityId();

      expect(id.length).toBe(44);
      expect(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(id)).toBe(true);
    });

    it('generateMockKeys creates valid key structure', () => {
      const keys = mockOps.generateMockKeys();

      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThanOrEqual(3);

      keys.forEach(key => {
        expect(key.id).toBeDefined();
        expect(key.keyType).toBe('ECDSA_SECP256K1');
        expect(key.purpose).toBeTruthy();
        expect(key.securityLevel).toBeTruthy();
        expect(key.status).toBe('active');
        expect(key.data).toBeTruthy();
      });
    });

    it('delay helper works correctly', async () => {
      const start = Date.now();
      await mockOps.delay(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(95);
      expect(duration).toBeLessThan(150);
    });
  });
});