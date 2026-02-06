/**
 * Test fixtures for E2E tests
 *
 * Provides test mode configuration and mock data
 */

import { test as base, expect } from '@playwright/test';

/**
 * Extended test with fixtures
 */
export const test = base.extend({
  /**
   * Set up mock mode before each test
   */
  mockMode: async ({ page }, use) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'true');
    });
    await page.reload();
    await use(true);
  },

  /**
   * Set up testnet mode
   */
  testnetMode: async ({ page }, use) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'false');
      localStorage.setItem('network', 'testnet');
    });
    await page.reload();
    await use(true);
  },

  /**
   * Pre-configured test identity
   */
  testIdentity: async ({ page }, use) => {
    const identity = {
      id: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',
      balance: 100000000n,
      keys: [
        { id: 0, type: 'ECDSA_SECP256K1', purpose: 'AUTHENTICATION' },
        { id: 1, type: 'BLS12_381', purpose: 'VOTING' },
      ],
    };
    await use(identity);
  },

  /**
   * Test mnemonic (DO NOT USE WITH REAL FUNDS)
   */
  testMnemonic: async ({}, use) => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    await use(mnemonic);
  },
});

export { expect };

/**
 * Known testnet identities for testing
 */
export const TESTNET_FIXTURES = {
  identityId: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',
  dpnsContractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  dashPayContractId: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7',
  existingUsername: 'alice',
};

/**
 * Test amounts in duffs
 */
export const TEST_AMOUNTS = {
  minIdentityCreate: 200000,
  minTopUp: 50000,
  minTransfer: 10000,
};

/**
 * Test timeouts
 */
export const TEST_TIMEOUTS = {
  pageLoad: 10000,
  operation: 30000,
  testnetOperation: 120000,
};
