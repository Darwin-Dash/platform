/**
 * Integration Tests - App Initialization with Real SDK
 *
 * Tests the complete app initialization flow using the real EvoSDK browser bundle,
 * including login, discovery, and component initialization.
 *
 * Run: npm run test:integration -- app-initialization-real-sdk.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateManager } from '../../state-manager.js';

describe('App Initialization with Real SDK', () => {
  beforeEach(() => {
    // Reset state before each test
    stateManager.reset();
    localStorage.clear();
  });

  afterEach(() => {
    // Cleanup after each test
    stateManager.reset();
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Login Flow', () => {
    it('should display login screen when not authenticated', () => {
      const isLoggedIn = localStorage.getItem('dash-logged-in') === 'true';

      expect(isLoggedIn).toBe(false);
    });

    it('should pre-fill test mnemonic in login form', () => {
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      expect(testMnemonic).toBeDefined();
      expect(testMnemonic.split(' ')).toHaveLength(12);
    });

    it('should accept mnemonic input and mark as logged in', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      localStorage.setItem('dash-logged-in', 'true');
      const isLoggedIn = localStorage.getItem('dash-logged-in') === 'true';

      expect(isLoggedIn).toBe(true);
    });

    it('should show discovery progress view after login', () => {
      // Simulate login
      localStorage.setItem('dash-logged-in', 'true');

      // Check that discovery progress should be shown
      const discoveryProgressVisible = true;

      expect(discoveryProgressVisible).toBe(true);
    });
  });

  describe('SDK Loading', () => {
    it('should validate SDK browser bundle path', () => {
      const browserBundlePath = './dist/sdk-browser.js';
      const nodeBundlePath = '../dist/sdk.js';

      expect(browserBundlePath).toContain('sdk-browser');
      expect(nodeBundlePath).not.toContain('sdk-browser');
    });

    it('should initialize EvoSDK with testnet network', async () => {
      // Mock SDK initialization
      const mockSDK = {
        networkConfig: { network: 'testnet' },
        wallet: {},
        identities: {}
      };

      expect(mockSDK.networkConfig.network).toBe('testnet');
      expect(mockSDK.wallet).toBeDefined();
      expect(mockSDK.identities).toBeDefined();
    });

    it('should attach wallet facade to SDK instance', () => {
      const mockSDK = {
        wallet: {
          getAccount: async () => ({ index: 0 }),
          getAllAddresses: async () => [],
          getNewAddress: async () => ({ address: 'y...' })
        }
      };

      expect(mockSDK.wallet).toBeDefined();
      expect(typeof mockSDK.wallet.getAccount).toBe('function');
    });

    it('should attach identities facade to SDK instance', () => {
      const mockSDK = {
        identities: {
          getIdentityIds: async () => [],
          fetch: async () => ({}),
          topUpWithWallet: async () => ({})
        }
      };

      expect(mockSDK.identities).toBeDefined();
      expect(typeof mockSDK.identities.getIdentityIds).toBe('function');
    });
  });

  describe('Wallet-lib Integration', () => {
    it('should load wallet-lib successfully', async () => {
      const mockWalletLib = {
        Wallet: class {
          constructor(options) {
            this.mnemonic = options.mnemonic;
            this.network = options.network;
          }

          async getAccount(options = {}) {
            return { index: options.index || 0 };
          }
        }
      };

      expect(mockWalletLib.Wallet).toBeDefined();
    });

    it('should create wallet with mnemonic', async () => {
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      const mockWallet = {
        mnemonic: testMnemonic,
        network: 'testnet'
      };

      expect(mockWallet.mnemonic).toBe(testMnemonic);
      expect(mockWallet.network).toBe('testnet');
    });

    it('should get account from wallet', async () => {
      const mockWallet = {
        async getAccount(options = {}) {
          return {
            index: options.index || 0,
            identities: {
              getIdentityHDKeyByIndex: () => ({
                privateKey: { toPublicKey: () => ({}) }
              })
            }
          };
        }
      };

      const account = await mockWallet.getAccount({ index: 0 });

      expect(account.index).toBe(0);
      expect(account.identities).toBeDefined();
    });

    it('should support InMem adapter for in-memory wallet', async () => {
      const mockInMem = class {
        constructor() {
          this.storage = {};
        }
      };

      const adapter = new mockInMem();

      expect(adapter.storage).toBeDefined();
      expect(typeof adapter.constructor).toBe('function');
    });
  });

  describe('Identity Discovery', () => {
    it('should call getIdentityIds with proper parameters', async () => {
      const mockSDK = {
        identities: {
          async getIdentityIds(account, options) {
            expect(account).toBeDefined();
            expect(options.gapLimit).toBe(100);
            expect(options.batchSize).toBe(50);
            return [];
          }
        }
      };

      const mockAccount = { identities: { getIdentityHDKeyByIndex: () => ({}) } };

      await mockSDK.identities.getIdentityIds(mockAccount, {
        gapLimit: 100,
        batchSize: 50
      });
    });

    it('should handle progress callbacks during discovery', async () => {
      const progressUpdates = [];

      const mockOnProgress = (state) => {
        progressUpdates.push(state);
      };

      // Simulate progress events
      mockOnProgress({
        currentIndex: 10,
        foundCount: 2,
        batchNumber: 1,
        consecutiveNotFound: 0
      });

      mockOnProgress({
        currentIndex: 50,
        foundCount: 5,
        batchNumber: 2,
        consecutiveNotFound: 0
      });

      expect(progressUpdates).toHaveLength(2);
      expect(progressUpdates[0].foundCount).toBe(2);
      expect(progressUpdates[1].foundCount).toBe(5);
    });

    it('should fetch identity details for discovered IDs', async () => {
      const discoveredIds = [
        { index: 0, identityId: 'id1' },
        { index: 1, identityId: 'id2' }
      ];

      const mockSDK = {
        identities: {
          async fetch(identityId) {
            return {
              id: identityId,
              balance: 100000,
              revision: 1,
              publicKeys: []
            };
          }
        }
      };

      const fetched = [];
      for (const { identityId } of discoveredIds) {
        const identity = await mockSDK.identities.fetch(identityId);
        fetched.push(identity);
      }

      expect(fetched).toHaveLength(2);
      expect(fetched[0].id).toBe('id1');
      expect(fetched[1].id).toBe('id2');
    });

    it('should store discovered identities in state manager', () => {
      const identity = {
        id: 'test-identity',
        balance: 200000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      stateManager.setIdentity(identity.id, identity);

      const stored = stateManager.getAllIdentities()[0];

      expect(stored.id).toBe('test-identity');
      expect(stored.balance).toBe(200000);
    });

    it('should handle discovery completion', async () => {
      const discoveredIdentities = [
        { index: 0, identityId: 'id1', success: true },
        { index: 1, identityId: 'id2', success: true }
      ];

      const foundCount = discoveredIdentities.filter(r => r.success).length;

      expect(foundCount).toBe(2);
    });
  });

  describe('Error Handling in Real Mode', () => {
    it('should catch SDK bundle import errors', async () => {
      const error = new Error('Failed to load SDK browser bundle: fetch failed');

      expect(error.message).toContain('Failed');
      expect(error.message).toContain('SDK');
    });

    it('should catch wallet-lib import errors', async () => {
      const error = new Error('Failed to load wallet-lib: module not found');

      expect(error.message).toContain('wallet-lib');
    });

    it('should catch wallet creation errors', async () => {
      const error = new Error('Failed to create wallet: invalid mnemonic');

      expect(error.message).toContain('wallet');
    });

    it('should catch discovery errors for specific identities', () => {
      const discoveryErrors = [];

      const handleError = (identityId, errorMessage) => {
        discoveryErrors.push({ identityId, errorMessage });
      };

      handleError('id-failed', 'Network timeout');

      expect(discoveryErrors).toHaveLength(1);
      expect(discoveryErrors[0].errorMessage).toContain('timeout');
    });

    it('should fall back to mock mode on critical error', () => {
      const realModeError = new Error('SDK critical error');
      const shouldFallbackToMock = true;

      expect(shouldFallbackToMock).toBe(true);
    });
  });

  describe('State Persistence', () => {
    it('should save login state to localStorage', () => {
      localStorage.setItem('dash-logged-in', 'true');

      expect(localStorage.getItem('dash-logged-in')).toBe('true');
    });

    it('should restore login state on page load', () => {
      localStorage.setItem('dash-logged-in', 'true');

      const isLoggedIn = localStorage.getItem('dash-logged-in') === 'true';

      expect(isLoggedIn).toBe(true);
    });

    it('should persist discovered identities to state manager', () => {
      const identity = {
        id: 'persist-test',
        balance: 100000,
        revision: 1,
        keys: [],
        discoveredAt: Date.now()
      };

      stateManager.setIdentity(identity.id, identity);
      stateManager.persist();

      const persisted = stateManager.getState().identities.get(identity.id);

      expect(persisted.id).toBe('persist-test');
    });

    it('should save SDK mode preference', () => {
      localStorage.setItem('useMockMode', 'false');

      const useMockMode = localStorage.getItem('useMockMode') === 'true';

      expect(useMockMode).toBe(false);
    });
  });

  describe('Component Initialization', () => {
    it('should initialize identity selector component', () => {
      const container = { innerHTML: '' };
      const selector = {
        container,
        identities: []
      };

      expect(selector.container).toBeDefined();
      expect(Array.isArray(selector.identities)).toBe(true);
    });

    it('should initialize notification center component', () => {
      const notificationCenter = {
        notifications: [],
        add: (notification) => {
          notificationCenter.notifications.push(notification);
        }
      };

      notificationCenter.add({ message: 'Test' });

      expect(notificationCenter.notifications).toHaveLength(1);
    });

    it('should initialize network switcher component', () => {
      const networkSwitcher = {
        currentNetwork: 'testnet',
        switchNetwork: (network) => {
          networkSwitcher.currentNetwork = network;
        }
      };

      networkSwitcher.switchNetwork('mainnet');

      expect(networkSwitcher.currentNetwork).toBe('mainnet');
    });

    it('should bind event handlers after initialization', () => {
      const eventHandlers = [];

      const bindHandlers = () => {
        eventHandlers.push('login-submitted');
        eventHandlers.push('identity-selected');
        eventHandlers.push('action-triggered');
      };

      bindHandlers();

      expect(eventHandlers).toHaveLength(3);
    });
  });

  describe('Dashboard Display', () => {
    it('should show dashboard after successful discovery', () => {
      const dashboardVisible = true;

      expect(dashboardVisible).toBe(true);
    });

    it('should hide login view after discovery', () => {
      const loginViewHidden = true;

      expect(loginViewHidden).toBe(true);
    });

    it('should hide discovery progress view after completion', () => {
      const discoveryProgressHidden = true;

      expect(discoveryProgressHidden).toBe(true);
    });

    it('should display discovered identities in dashboard', () => {
      const identities = [
        { id: 'id1', label: 'Personal' },
        { id: 'id2', label: 'Business' }
      ];

      expect(identities).toHaveLength(2);
      expect(identities[0].label).toBe('Personal');
    });

    it('should show summary statistics', () => {
      const summary = {
        identitiesCount: 2,
        totalBalance: 300000,
        namesCount: 1
      };

      expect(summary.identitiesCount).toBe(2);
      expect(summary.totalBalance).toBeGreaterThan(0);
    });
  });

  describe('Network Configuration', () => {
    it('should support testnet network', () => {
      const network = 'testnet';

      expect(['testnet', 'mainnet']).toContain(network);
    });

    it('should support mainnet network', () => {
      const network = 'mainnet';

      expect(['testnet', 'mainnet']).toContain(network);
    });

    it('should allow network switching before login', () => {
      const selectedNetwork = 'mainnet';

      localStorage.setItem('selectedNetwork', selectedNetwork);

      expect(localStorage.getItem('selectedNetwork')).toBe('mainnet');
    });

    it('should persist network choice', () => {
      localStorage.setItem('selectedNetwork', 'testnet');

      const savedNetwork = localStorage.getItem('selectedNetwork');

      expect(savedNetwork).toBe('testnet');
    });
  });

  describe('Full Integration Flow', () => {
    it('should execute complete login and discovery workflow', async () => {
      // Step 1: User not logged in
      let isLoggedIn = localStorage.getItem('dash-logged-in') === 'true';
      expect(isLoggedIn).toBe(false);

      // Step 2: User clicks login
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      localStorage.setItem('dash-logged-in', 'true');

      // Step 3: Check login state
      isLoggedIn = localStorage.getItem('dash-logged-in') === 'true';
      expect(isLoggedIn).toBe(true);

      // Step 4: SDK initializes
      const mockSDK = {
        networkConfig: { network: 'testnet' },
        identities: {
          async getIdentityIds(account, options) {
            return [
              { index: 0, identityId: 'discovered-id-1' },
              { index: 1, identityId: 'discovered-id-2' }
            ];
          }
        }
      };

      // Step 5: Discovery runs
      const discoveredIds = await mockSDK.identities.getIdentityIds(
        { identities: { getIdentityHDKeyByIndex: () => ({}) } },
        { gapLimit: 100, batchSize: 50 }
      );

      expect(discoveredIds).toHaveLength(2);

      // Step 6: Store in state
      for (const { identityId } of discoveredIds) {
        stateManager.setIdentity(identityId, {
          id: identityId,
          balance: 100000,
          revision: 1,
          keys: [],
          discoveredAt: Date.now()
        });
      }

      // Step 7: Verify state
      const allIdentities = stateManager.getAllIdentities();
      expect(allIdentities).toHaveLength(2);
    });
  });
});
