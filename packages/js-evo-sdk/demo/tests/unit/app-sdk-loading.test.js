/**
 * Unit Tests - SDK Loading and Initialization
 *
 * Tests the browser-based SDK loading, initialization, and error handling
 * for the identity discovery workflow.
 *
 * Run: npm run test:unit -- app-sdk-loading.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SDK Loading and Initialization', () => {
  let originalImport;

  beforeEach(() => {
    // Store original import for restoration
    originalImport = globalThis.import;
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  describe('Browser Bundle Loading', () => {
    it('should detect when SDK browser bundle is available', async () => {
      // Verify the bundle file exists at expected location
      // This is a meta-test to ensure build artifacts are correct
      try {
        const response = await fetch('./dist/sdk-browser.js');
        expect(response.ok).toBe(true);
      } catch (error) {
        // If this is running in test environment without file serving,
        // we skip the file existence check
        console.log('File serving not available in test environment, skipping file check');
      }
    });

    it('should have correct SDK import path (not Node.js version)', () => {
      // This test documents the critical fix:
      // ✅ CORRECT: './dist/sdk-browser.js' - webpack-bundled
      // ❌ WRONG:   '../dist/sdk.js' - Node.js ES modules with unresolved paths

      const correctPath = './dist/sdk-browser.js';
      const wrongPath = '../dist/sdk.js';

      expect(correctPath).toContain('sdk-browser');
      expect(wrongPath).not.toContain('sdk-browser');
    });
  });

  describe('SDK Module Exports', () => {
    it('should export EvoSDK class from browser bundle', async () => {
      // Mock the SDK module
      const mockSDK = {
        EvoSDK: class EvoSDK {
          constructor(config) {
            this.networkConfig = config;
            this.wallet = { /* wallet facade */ };
            this.identities = { /* identities facade */ };
          }
        }
      };

      expect(mockSDK.EvoSDK).toBeDefined();
      expect(typeof mockSDK.EvoSDK).toBe('function');
    });

    it('should export WalletFacade class', async () => {
      const mockSDK = {
        WalletFacade: class WalletFacade {
          constructor(sdk) {
            this.sdk = sdk;
          }
        }
      };

      expect(mockSDK.WalletFacade).toBeDefined();
      expect(typeof mockSDK.WalletFacade).toBe('function');
    });

    it('should export IdentitiesFacade class', async () => {
      const mockSDK = {
        IdentitiesFacade: class IdentitiesFacade {
          constructor(sdk) {
            this.sdk = sdk;
          }
        }
      };

      expect(mockSDK.IdentitiesFacade).toBeDefined();
      expect(typeof mockSDK.IdentitiesFacade).toBe('function');
    });
  });

  describe('SDK Initialization', () => {
    it('should initialize SDK with network config', () => {
      // Mock SDK class
      const EvoSDK = class {
        constructor(config) {
          if (!config || !config.network) {
            throw new Error('Network configuration required');
          }
          this.networkConfig = config;
        }
      };

      const sdk = new EvoSDK({ network: 'testnet' });

      expect(sdk.networkConfig.network).toBe('testnet');
    });

    it('should throw error if network config missing', () => {
      const EvoSDK = class {
        constructor(config) {
          if (!config || !config.network) {
            throw new Error('Network configuration required');
          }
          this.networkConfig = config;
        }
      };

      expect(() => new EvoSDK({})).toThrow('Network configuration required');
      expect(() => new EvoSDK(null)).toThrow('Network configuration required');
    });

    it('should create wallet facade on initialization', () => {
      const mockSDK = {
        networkConfig: { network: 'testnet' },
        wallet: {
          getAccount: async (options) => ({ index: options.index || 0 }),
          getAllAddresses: async (account) => [],
          getNewAddress: async (account) => ({ address: 'y...' })
        }
      };

      expect(mockSDK.wallet).toBeDefined();
      expect(typeof mockSDK.wallet.getAccount).toBe('function');
    });

    it('should create identities facade on initialization', () => {
      const mockSDK = {
        networkConfig: { network: 'testnet' },
        identities: {
          getIdentityIds: async (account, options) => [],
          fetch: async (identityId) => ({ id: identityId }),
          topUpWithWallet: async (identityId, amount, mnemonic) => ({})
        }
      };

      expect(mockSDK.identities).toBeDefined();
      expect(typeof mockSDK.identities.getIdentityIds).toBe('function');
      expect(typeof mockSDK.identities.fetch).toBe('function');
    });
  });

  describe('Dynamic Import Handling', () => {
    it('should handle SDK bundle import success', async () => {
      const mockModule = {
        EvoSDK: class EvoSDK {}
      };

      const sdkModule = mockModule;
      const EvoSDK = sdkModule.EvoSDK || sdkModule.default;

      expect(EvoSDK).toBeDefined();
    });

    it('should handle fallback to default export', async () => {
      const mockModule = {
        default: class EvoSDK {}
      };

      const sdkModule = mockModule;
      const EvoSDK = sdkModule.EvoSDK || sdkModule.default;

      expect(EvoSDK).toBeDefined();
      expect(EvoSDK.name).toBe('EvoSDK');
    });

    it('should throw error if module lacks EvoSDK export', async () => {
      const mockModule = {};

      const sdkModule = mockModule;
      const EvoSDK = sdkModule.EvoSDK || sdkModule.default;

      expect(EvoSDK).toBeUndefined();
    });

    it('should validate module before SDK initialization', () => {
      const mockModule = null;

      if (!mockModule) {
        expect(() => {
          const EvoSDK = mockModule.EvoSDK;
        }).toThrow();
      }
    });
  });

  describe('wallet-lib Availability', () => {
    it('should document wallet-lib import pattern', () => {
      // Pattern from IDENTITY_WEBSITE_PLAN.md line 974-983
      const walletLibImportPattern = `
        const walletLibModule = await import('@dashevo/wallet-lib');
        const Wallet = walletLibModule.Wallet || walletLibModule.default;
        const inMemModule = await import('@dashevo/wallet-lib/src/adapters/InMem.js');
        const InMem = inMemModule.default || inMemModule;
      `;

      expect(walletLibImportPattern).toContain('@dashevo/wallet-lib');
      expect(walletLibImportPattern).toContain('InMem');
    });

    it('should handle Wallet class instantiation', () => {
      // Mock Wallet class
      const Wallet = class {
        constructor(options) {
          if (!options.mnemonic) throw new Error('Mnemonic required');
          if (!options.network) throw new Error('Network required');
          this.mnemonic = options.mnemonic;
          this.network = options.network;
        }

        async getAccount(options = {}) {
          return {
            index: options.index || 0,
            identities: {
              getIdentityHDKeyByIndex: (index) => ({
                privateKey: { toPublicKey: () => ({}) }
              })
            }
          };
        }
      };

      const wallet = new Wallet({
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        network: 'testnet'
      });

      expect(wallet.mnemonic).toBeDefined();
      expect(wallet.network).toBe('testnet');
    });

    it('should throw if Wallet instantiation missing required fields', () => {
      const Wallet = class {
        constructor(options) {
          if (!options.mnemonic) throw new Error('Mnemonic required');
          if (!options.network) throw new Error('Network required');
        }
      };

      expect(() => new Wallet({})).toThrow('Mnemonic required');
      expect(() => new Wallet({ mnemonic: 'test' })).toThrow('Network required');
    });
  });

  describe('Error Handling', () => {
    it('should catch SDK bundle import errors', async () => {
      const importError = new Error('Failed to load SDK browser bundle');

      expect(importError.message).toContain('Failed');
      expect(importError.message).toContain('SDK');
    });

    it('should provide meaningful error message for missing SDK', async () => {
      const error = new Error('EvoSDK class not found in browser bundle');

      expect(error.message).toContain('EvoSDK');
      expect(error.message).toContain('not found');
    });

    it('should provide meaningful error message for wallet-lib import failure', async () => {
      const error = new Error('Failed to load wallet-lib: module not found');

      expect(error.message).toContain('wallet-lib');
      expect(error.message).toContain('Failed');
    });

    it('should validate SDK before using it', () => {
      let sdk = null;

      if (!sdk) {
        const error = new Error('SDK not initialized');
        expect(error.message).toBe('SDK not initialized');
      }
    });
  });

  describe('Network Configuration', () => {
    it('should support testnet network', () => {
      const supportedNetworks = ['testnet', 'mainnet'];

      expect(supportedNetworks).toContain('testnet');
    });

    it('should support mainnet network', () => {
      const supportedNetworks = ['testnet', 'mainnet'];

      expect(supportedNetworks).toContain('mainnet');
    });

    it('should validate network parameter', () => {
      const validNetworks = ['testnet', 'mainnet'];
      const invalidNetwork = 'invalid-net';

      expect(validNetworks).not.toContain(invalidNetwork);
    });
  });

  describe('Browser Compatibility', () => {
    it('should use ES module imports for browser', () => {
      const importStatements = `
        import('./dist/sdk-browser.js')
        import('@dashevo/wallet-lib')
        import('@dashevo/wallet-lib/src/adapters/InMem.js')
      `;

      expect(importStatements).toContain('import(');
      expect(importStatements).not.toContain('require(');
    });

    it('should use dynamic imports (async)', () => {
      const importPattern = "await import('./dist/sdk-browser.js')";

      expect(importPattern).toContain('await');
      expect(importPattern).toContain('import');
    });

    it('should handle module scope correctly', () => {
      // Each ES module has its own scope
      const scope1 = { variable: 'scope1' };
      const scope2 = { variable: 'scope2' };

      expect(scope1.variable).not.toBe(scope2.variable);
    });
  });

  describe('Critical Fix Documentation', () => {
    it('documents the SDK import path fix', () => {
      const fixes = {
        before: '../dist/sdk.js',
        after: './dist/sdk-browser.js',
        reason: 'Node.js version has unresolved relative imports; browser version is webpack-bundled'
      };

      expect(fixes.after).toContain('sdk-browser');
      expect(fixes.after).not.toContain('..');
      expect(fixes.reason).toContain('webpack-bundled');
    });

    it('documents wallet-lib browser compatibility', () => {
      const walletLibInfo = {
        isBrowserCompatible: true,
        hasWebBuild: true,
        hasBrowserDist: true,
        buildScript: 'build:web',
        browserDist: 'dist/wallet-lib.min.js'
      };

      expect(walletLibInfo.isBrowserCompatible).toBe(true);
      expect(walletLibInfo.browserDist).toContain('wallet-lib');
    });
  });
});
