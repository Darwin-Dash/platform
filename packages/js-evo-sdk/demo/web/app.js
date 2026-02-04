/**
 * Main Application Controller
 * Initializes and coordinates all components
 */

import { stateManager } from './state-manager.js';
import { mockIdentities, MockPlatformOperations, MNEMONIC } from './mock-data.js';
import { IdentitySelector } from './components/identity-selector.js';
import { retryOperation, isTransientError, verifyByBalanceChange } from './utils/retry-utils.js';
import { NotificationCenter } from './components/notification-center.js';
import { NetworkSwitcher } from './components/network-switcher.js';
import { NameResolver } from './components/name-resolver.js';
import { DocumentViewer } from './components/document-viewer.js';
import { ContestedNamesViewer } from './components/contested-names-viewer.js';
import { ContactsViewer } from './components/contacts-viewer.js';
import { ContactRequestsManager } from './components/contact-requests.js';
import { TokenViewer } from './components/token-viewer.js';
import { notifications } from './components/notifications.js';
import { WalletFundingFlow } from './components/wallet-funding-flow.js';
import {
  formatIdentityId,
  formatDuffs,
  formatTimestamp,
  formatPublicKey,
  formatKeyPurpose,
  formatSecurityLevel,
  formatTransactionStatus,
  dashToDuffs,
  duffsToCredits,
  escapeHtml,
  normalizeSecurityLevel,
  normalizePurpose
} from './utils/formatter.js';
import {
  validateAmount,
  validateAddress,
  validateIdentityId
} from './utils/validator.js';
import {
  formatBalance,
  transformIdentityForUI,
  transformDiscoveryResult,
  enrichIdentityForDisplay,
  isValidTransformedIdentity,
  mergeIdentityData
} from './utils/identity-transformer.js';

// Only expose MNEMONIC in mock/development mode
if (localStorage.getItem('useMockMode') === 'true') {
  window.MNEMONIC = MNEMONIC;
}

// Known platform contract IDs (testnet)
const DPNS_CONTRACT_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const DASHPAY_CONTRACT_ID = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';

// Pre-import SDK at module level so it's bundled for browser use
// Cached and reused in performRealDiscovery
let sdkPromise = null;

async function getSDK() {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      try {
        // Import SDK - webpack will bundle this with all dependencies
        // Path is relative from demo/web/ to dist/
        // Use sdk.js (TypeScript output) - webpack will bundle the evo-sdk.module.js during build
        const sdkModule = await import('../../dist/sdk.js');
        const EvoSDK = sdkModule.EvoSDK || sdkModule.default;
        if (!EvoSDK) throw new Error('EvoSDK class not found');
        return EvoSDK;
      } catch (error) {
        console.error('❌ Failed to load SDK:', error);
        throw error;
      }
    })();
  }
  return sdkPromise;
}

// Pre-import wallet-lib at module level so it's bundled for browser use
// These will be cached and reused in performRealDiscovery
let walletLibPromise = null;

async function getWalletLib() {
  if (!walletLibPromise) {
    walletLibPromise = (async () => {
      try {
        const walletLib = await import('@dashevo/wallet-lib');
        const Wallet = walletLib.Wallet || walletLib.default;
        const inMemModule = await import('@dashevo/wallet-lib/src/adapters/InMem.js');
        const InMem = inMemModule.default || inMemModule;
        return { Wallet, InMem };
      } catch (error) {
        console.error('❌ Failed to load wallet-lib:', error);
        throw error;
      }
    })();
  }
  return walletLibPromise;
}

// Cache for healthy nodes loaded from JSON
let healthyNodesCache = null;

/**
 * Load healthy nodes from pre-built JSON file
 * Falls back to full whitelist if file not found
 */
async function loadHealthyNodes() {
  if (healthyNodesCache) return healthyNodesCache;

  try {
    // Try to load pre-built healthy nodes list
    const response = await fetch('./healthy-nodes.json');
    if (response.ok) {
      const data = await response.json();
      console.log(`📡 Loaded ${data.count} healthy nodes (built: ${data.generated})`);
      healthyNodesCache = data.nodes;
      return data.nodes;
    }
  } catch (err) {
    // File not found or fetch error - fall through to whitelist
  }

  // Fallback to full whitelist
  console.log('⚠️ No healthy-nodes.json found, using full whitelist');
  try {
    const networkConfigs = await import('@dashevo/dapi-client/lib/networkConfigs.js')
      .then(m => m.default || m);
    return networkConfigs.testnet.dapiAddressesWhiteList;
  } catch (err) {
    console.warn('❌ Could not load network configs:', err.message);
    return [];
  }
}

/**
 * Get network-specific SDK options
 *
 * - Testnet: Uses pre-built healthy nodes list (or falls back to whitelist)
 * - Mainnet: Uses standard network config (proper SML discovery via seeds)
 *
 * @param {string} network - 'testnet' or 'mainnet'
 * @returns {Promise<object>} SDK initialization options
 */
async function getNetworkSdkOptions(network = 'testnet') {
  const baseOptions = { network, trusted: true };

  if (network === 'testnet') {
    try {
      const nodes = await loadHealthyNodes();
      if (nodes && nodes.length > 0) {
        // SDK expects 'https://' prefix for addresses
        const addresses = nodes.map(addr => `https://${addr}`);
        console.log(`📡 Using ${addresses.length} DAPI nodes for testnet`);
        return { ...baseOptions, addresses };
      }
    } catch (err) {
      console.warn('⚠️ Could not load nodes:', err.message);
    }
  } else {
    // Mainnet: Use proper SML discovery (has proper hostname-based SSL certs)
    console.log('🌐 Using SML discovery for mainnet');
  }

  return baseOptions;
}

class IdentityManagerApp {
  constructor() {
    this.platformOps = new MockPlatformOperations();
    this.components = {};
    this.fundingFlow = null; // Will be initialized after useMockMode is determined
    this.mnemonic = null; // Stored from login for use in SDK operations

    // Auto-set mnemonic for testnet testing
    // Only set when in mock mode or returning session (login already validated)
    const isReturningSession = localStorage.getItem('dash-logged-in') === 'true';
    const isMockMode = localStorage.getItem('useMockMode') === 'true';
    if (isMockMode || isReturningSession) {
      this.mnemonic = MNEMONIC;
      console.log(isReturningSession ? '🔑 Restored test mnemonic for returning session' : '🔑 Auto-set test mnemonic (mock mode)');
    }

    // DIAGNOSTIC: Clear localStorage to force REAL mode for testing
    // NOTE: Disabled to allow E2E tests to control mock mode via localStorage
    const clearStorageForDiagnostics = false;
    if (clearStorageForDiagnostics) {
      const hadMockMode = localStorage.getItem('useMockMode') === 'true';
      localStorage.removeItem('useMockMode');
      if (hadMockMode) {
        console.log('🧹 DIAGNOSTIC: Cleared useMockMode from localStorage - forcing REAL SDK mode');
      }
    }

    // Initialize SDK with mock mode toggle
    // useMockMode: true = use mock discovery, false = use real SDK
    // Phase 3: Enable real mode for browser testing
    // Check localStorage, but default to real mode unless explicitly set to false
    const storedMode = localStorage.getItem('useMockMode');
    this.useMockMode = storedMode === 'true'; // Only use mock if explicitly set to 'true'
    this.sdk = null;
    this.wallet = null;
    this.dpnsNamesExpanded = false; // For overview names list pagination

    // Initialize WalletFundingFlow with correct mode
    this.fundingFlow = new WalletFundingFlow(this.platformOps, {
      useMockMode: this.useMockMode,
      network: 'testnet'
    });

    // Attempt to initialize real SDK
    try {
      // In production, would import from built SDK bundle:
      // import { EvoSDK } from '../dist/sdk.js'
      // SDK will be initialized on demand in handleLogin()
      console.log('ℹ️  SDK initialization: using mode =', this.useMockMode ? 'MOCK' : 'REAL');
      if (!this.useMockMode) {
        console.log('✅ Real SDK mode enabled - will use testnet DAPI');
      }
    } catch (error) {
      console.warn('⚠️  SDK not available in browser context, falling back to mock mode:', error.message);
      this.useMockMode = true;
      localStorage.setItem('useMockMode', 'true');
      // Re-initialize funding flow with mock mode
      this.fundingFlow = new WalletFundingFlow(this.platformOps, {
        useMockMode: true,
        network: 'testnet'
      });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Show the identity view (hide welcome and dashboard)
   */
  showIdentityView() {
    document.getElementById('welcome-state').hidden = true;
    document.getElementById('dashboard-view').hidden = true;
    document.getElementById('identity-view').hidden = false;
  }

  init() {
    console.log('🚀 Initializing Dash Identity Manager...');

    try {
      // CRITICAL: Ensure loading states are hidden on startup
      console.log('  Step 0: Resetting UI state...');
      const loadingOverlay = document.getElementById('loading-overlay');
      const createModal = document.getElementById('create-modal');
      const actionPanel = document.getElementById('action-panel');

      if (loadingOverlay) loadingOverlay.hidden = true;
      if (createModal) createModal.hidden = true;
      if (actionPanel) actionPanel.hidden = true;
      console.log('  ✅ UI state reset');

      // Check if user is logged in
      const isLoggedIn = localStorage.getItem('dash-logged-in') === 'true';
      console.log(`  Auth status: ${isLoggedIn ? 'logged in' : 'not logged in'}`);

      if (!isLoggedIn) {
        // Show login screen
        console.log('  → Showing login screen');
        this.showLoginScreen();
        console.log('✅ Login screen ready!');
        return;
      }

      // Validate session - check if we have cached identities or state
      // This detects stale sessions where user is "logged in" but has no identity data
      const hasIdentityState = localStorage.getItem('dash-identity-state');
      let hasCachedIdentities = false;

      if (hasIdentityState) {
        try {
          const parsed = JSON.parse(hasIdentityState);
          hasCachedIdentities = parsed.identities && parsed.identities.length > 0;
        } catch (e) {
          console.warn('  ⚠️ Failed to parse cached identity state');
        }
      }

      if (!hasIdentityState || !hasCachedIdentities) {
        console.warn('⚠️ Stale session detected - logged in but no cached identities');
        // Clear stale login state and show login screen
        localStorage.removeItem('dash-logged-in');
        this.showLoginScreen();
        console.log('✅ Login screen ready (stale session cleared)!');
        return;
      }

      // User is logged in - hide login view
      document.getElementById('login-view').hidden = true;

      // Step 1: Restore persisted state FIRST (before components render)
      console.log('  Step 1: Restoring persisted state...');
      let restoredIdentityId = null;
      if (stateManager.restore()) {
        restoredIdentityId = stateManager.getState().ui.selectedIdentityId;
        if (restoredIdentityId) {
          console.log(`  ✅ State restored - last selected: ${restoredIdentityId.substring(0, 8)}...`);
        } else {
          console.log('  ✅ State restored from localStorage');
        }
      } else {
        console.log('  ℹ️  No persisted state found');
      }

      console.log('  Step 2: Loading initial data...');
      if (this.useMockMode) {
        this.loadMockData();
        console.log('  ✅ Mock data loaded');
      } else {
        console.log('  ✅ Real mode - skipping mock data');
        // Initialize SDK in background for DPNS/document queries
        this.initializeSDKOnly().catch(e => {
          console.warn('  ⚠️ Background SDK init failed:', e.message);
        });
      }

      console.log('  Step 3: Initializing components...');
      this.initializeComponents();
      console.log('  ✅ Components initialized');

      console.log('  Step 4: Binding event handlers...');
      this.bindEventHandlers();
      console.log('  ✅ Event handlers bound');

      console.log('  Step 5: Subscribing to state...');
      this.subscribeToState();
      console.log('  ✅ State subscriptions complete')

      console.log('  Step 6: Smart routing - selecting initial view...');
      const identities = stateManager.getAllIdentities();
      console.log(`  Found ${identities.length} identities`);

      // Check URL hash for identity navigation
      const hashMatch = window.location.hash.match(/^#identity\/([1-9A-HJ-NP-Za-km-z]{43,44})$/);
      const hashIdentityId = hashMatch ? hashMatch[1] : null;

      // Smart routing logic
      if (identities.length === 0) {
        // No identities - show welcome screen
        console.log('  → Showing welcome screen (no identities)');
        document.getElementById('welcome-state').hidden = false;
        document.getElementById('dashboard-view').hidden = true;
        document.getElementById('identity-view').hidden = true;
      } else if (hashIdentityId && identities.some(id => id.id === hashIdentityId)) {
        // URL hash specifies an identity - show identity view
        history.replaceState({ identityId: hashIdentityId }, '', `#identity/${hashIdentityId}`);
        stateManager.selectIdentity(hashIdentityId);
        this.showIdentityView();
        console.log(`  → Showing identity view (from URL: ${hashIdentityId.substring(0, 8)}...)`);
      } else if (restoredIdentityId && identities.some(id => id.id === restoredIdentityId)) {
        // Restored identity exists - show identity view
        stateManager.selectIdentity(restoredIdentityId);
        this.showIdentityView();
        console.log(`  → Showing identity view (restored: ${restoredIdentityId.substring(0, 8)}...)`);
      } else {
        // Identities exist but none selected - show dashboard
        if (hashIdentityId) {
          console.warn(`  ⚠️ URL identity not found: ${hashIdentityId}`);
          console.warn(`  Available identities (${identities.length}): ${identities.map(i => i.id.substring(0,8)+'...').join(', ')}`);
        }
        console.log('  → Showing dashboard (default view)');
        document.getElementById('welcome-state').hidden = true;
        document.getElementById('dashboard-view').hidden = false;
        document.getElementById('identity-view').hidden = true;
      }

      // Add URL hash change listener for navigation
      window.addEventListener('hashchange', () => {
        const hashMatch = window.location.hash.match(/^#identity\/([1-9A-HJ-NP-Za-km-z]{43,44})$/);
        const hashIdentityId = hashMatch ? hashMatch[1] : null;

        if (hashIdentityId) {
          const identities = stateManager.getAllIdentities();
          if (identities.some(id => id.id === hashIdentityId)) {
            stateManager.selectIdentity(hashIdentityId);
            this.showIdentityView();
            console.log(`[App] Navigated to identity: ${hashIdentityId.substring(0, 8)}...`);
          } else {
            console.warn(`[App] Identity not found in state: ${hashIdentityId}`);
            console.warn(`[App] Available identities (${identities.length}): ${identities.map(i => i.id.substring(0,8)+'...').join(', ')}`);
          }
        }
      });

      // Note: popstate is handled in subscribeToState() to avoid duplicate listeners

      console.log('✅ Identity Manager ready!');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  loadMockData() {
    // Load mock identities into state
    for (const [id, identity] of mockIdentities) {
      stateManager.setIdentity(id, identity);
    }
  }

  /**
   * Initialize SDK only (without wallet/discovery)
   * Used when restoring from localStorage to enable DPNS/document queries
   */
  async initializeSDKOnly() {
    if (this.sdk) {
      console.log('  SDK already initialized');
      return;
    }

    console.log('  🔧 Initializing SDK (background)...');
    try {
      const EvoSDK = await getSDK();
      const sdkOptions = await getNetworkSdkOptions('testnet');
      const sdk = new EvoSDK(sdkOptions);

      // Explicitly connect SDK to enable DPNS/document queries
      await sdk.connect();

      this.sdk = sdk;
      console.log('  ✅ SDK initialized and connected (background)');

      // Propagate SDK to all components
      this.propagateSDKToComponents(sdk, this.mnemonic);

      // Reload documents/tokens for currently selected identity if identity view is active
      const selectedIdentity = stateManager.getSelectedIdentity();
      const identityViewVisible = !document.getElementById('identity-view')?.hidden;
      if (selectedIdentity && identityViewVisible) {
        if (this.components.documentViewer) {
          console.log('  📄 Reloading documents with SDK for:', selectedIdentity.id.substring(0, 8) + '...');
          this.components.documentViewer.loadDocuments(selectedIdentity.id);
        }
        if (this.components.tokenViewer) {
          this.components.tokenViewer.setIdentityId(selectedIdentity.id);
        }
      }
    } catch (error) {
      console.error('  ❌ Failed to initialize SDK:', error);
      throw error;
    }
  }

  /**
   * Propagate SDK and mnemonic to all components that need them
   */
  propagateSDKToComponents(sdk, mnemonic) {
    if (this.fundingFlow) {
      this.fundingFlow.setSDK(sdk);
      if (mnemonic) this.fundingFlow.setMnemonic(mnemonic);
    }
    if (this.components.documentViewer) {
      this.components.documentViewer.setSDK(sdk);
    }
    if (this.components.tokenViewer) {
      this.components.tokenViewer.setSDK(sdk);
    }
    if (this.components.nameResolver) {
      this.components.nameResolver.setSDK(sdk);
    }
    if (this.components.contactsViewer && mnemonic) {
      this.components.contactsViewer.setSDK(sdk, mnemonic);
    }
    if (this.components.contactRequestsManager && mnemonic) {
      this.components.contactRequestsManager.setSDK(sdk, mnemonic);
    }
    if (mnemonic) {
      this.platformOps.setRealSDK(sdk, mnemonic);
    }
  }

  showLoginScreen() {
    // Pre-fill mnemonic with test mnemonic
    const mnemonicInput = document.getElementById('login-mnemonic');
    console.log('  Setting mnemonic:', MNEMONIC ? 'available' : 'MISSING');
    console.log('  Mnemonic input element:', mnemonicInput ? 'found' : 'NOT FOUND');
    if (mnemonicInput && MNEMONIC) {
      mnemonicInput.value = MNEMONIC;
      console.log('  ✅ Mnemonic pre-filled');
    }

    // Show login view, hide all others
    document.getElementById('login-view').hidden = false;
    document.getElementById('welcome-state').hidden = true;
    document.getElementById('dashboard-view').hidden = true;
    document.getElementById('identity-view').hidden = true;

    // Hide header controls on login screen (Issue 8)
    const headerControls = document.querySelector('.header-controls');
    if (headerControls) headerControls.hidden = true;

    // Bind login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }
  }

  async handleLogin() {
    try {
      console.log('🔐 Starting login process...');

      // Extract mnemonic from login form
      const mnemonicInput = document.getElementById('login-mnemonic');
      const mnemonic = mnemonicInput?.value?.trim();

      if (!mnemonic) {
        notifications.error('Please enter a wallet mnemonic');
        return;
      }

      // Store mnemonic for use in SDK operations (createWithUTXO, topupWithUTXO)
      this.mnemonic = mnemonic;

      // Update funding flow with mnemonic for real UTXO discovery
      if (this.fundingFlow) {
        this.fundingFlow.setMnemonic(mnemonic);
      }

      // Hide login, show discovery progress
      document.getElementById('login-view').hidden = true;
      document.getElementById('discovery-progress-view').hidden = false;

      // Show header controls after login (Issue 8)
      const headerControls = document.querySelector('.header-controls');
      if (headerControls) headerControls.hidden = false;

      // Reset progress counters
      document.getElementById('discovery-count').textContent = '0';
      document.getElementById('discovery-scanned').textContent = '0';

      let foundCount = 0;
      const discoveredIdentities = [];

      if (this.useMockMode) {
        // ===== MOCK MODE: Simulated identity discovery =====
        await this.performMockDiscovery();
        foundCount = 3; // Mock always returns 3 identities

      } else {
        // ===== REAL MODE: Using actual SDK discovery =====
        console.log(`  🌐 Mode: REAL - Using EvoSDK for discovery`);

        try {
          foundCount = await this.performRealDiscovery(mnemonic);
        } catch (realModeError) {
          console.error(`  ❌ Real SDK mode encountered error:`, realModeError);
          console.error(`  📋 Error details:`, {
            message: realModeError.message,
            stack: realModeError.stack,
            name: realModeError.name
          });

          // Show detailed error notification to user
          notifications.warning(
            `Real SDK discovery failed: ${realModeError.message}. Falling back to mock mode.`,
            { duration: 10000, closeable: true }
          );

          this.useMockMode = true;
          localStorage.setItem('useMockMode', 'true');

          // Fall back to mock discovery
          await this.performMockDiscovery();
          foundCount = 3;
        }
      }

      console.log(`  ✅ Discovery complete - found ${foundCount} identities`);

      // Immediately persist state to localStorage (don't rely on debounce)
      stateManager.persist();
      console.log('  ✅ State persisted to localStorage');

      // Mark as logged in
      localStorage.setItem('dash-logged-in', 'true');

      // Hide discovery progress
      document.getElementById('discovery-progress-view').hidden = true;

      // Load mock data only in mock mode; in real mode use discovered identities
      if (this.useMockMode) {
        console.log('  Step 2: Loading mock data...');
        this.loadMockData();
        console.log('  ✅ Mock data loaded');
      } else {
        console.log(`  Step 2: Using ${foundCount} discovered identities...`);
        console.log('  ✅ Real identities ready');
      }

      // Initialize all components
      console.log('  Step 3: Initializing components...');
      this.initializeComponents();
      console.log('  ✅ Components initialized');

      console.log('  Step 4: Binding event handlers...');
      this.bindEventHandlers();
      console.log('  ✅ Event handlers bound');

      console.log('  Step 5: Subscribing to state...');
      this.subscribeToState();
      console.log('  ✅ State subscriptions complete');

      // Show dashboard by default, but check URL hash for direct identity navigation
      console.log('  → Checking URL hash for identity navigation...');
      const hashMatch = window.location.hash.match(/^#identity\/([1-9A-HJ-NP-Za-km-z]{43,44})$/);
      const hashIdentityId = hashMatch ? hashMatch[1] : null;
      const identities = stateManager.getAllIdentities();

      if (hashIdentityId && identities.some(id => id.id === hashIdentityId)) {
        // URL hash specifies a valid identity - show identity view instead
        console.log(`  → URL specifies identity: ${hashIdentityId.substring(0, 8)}...`);
        stateManager.selectIdentity(hashIdentityId);
        document.getElementById('dashboard-view').hidden = true;
        document.getElementById('identity-view').hidden = false;
        history.replaceState({ identityId: hashIdentityId }, '', `#identity/${hashIdentityId}`);
      } else {
        console.log('  → Showing dashboard');
        document.getElementById('dashboard-view').hidden = false;
      }

      const message = foundCount > 0
        ? `Wallet connected! Found ${foundCount} identities (${this.useMockMode ? 'mock mode' : 'real mode'})`
        : 'Wallet connected successfully!';
      notifications.success(message);
      console.log('✅ Identity Manager ready!');

    } catch (error) {
      console.error('❌ Login failed:', error);
      // On error, go back to login screen
      document.getElementById('discovery-progress-view').hidden = true;
      document.getElementById('login-view').hidden = false;
      const headerControls = document.querySelector('.header-controls');
      if (headerControls) headerControls.hidden = true;
      notifications.error(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Perform mock identity discovery (simulated)
   * Used for demo/testing without Platform connection
   */
  async performMockDiscovery() {
    console.log(`  📡 Mode: MOCK - Using simulated discovery`);
    const totalScans = 100;
    console.log(`  ⏳ Scanning for identities (up to ${totalScans} indices)...`);

    for (let i = 0; i < totalScans; i += 10) {
      const scanned = Math.min(i + 10, totalScans);
      document.getElementById('discovery-scanned').textContent = scanned;

      await new Promise(r => setTimeout(r, 100));

      if (i === 0) {
        const foundCount = 3;
        document.getElementById('discovery-count').textContent = foundCount;
        console.log(`  ✅ Found ${foundCount} identities`);
      }

      if (i >= 50 && parseInt(document.getElementById('discovery-count').textContent || '0') === 0) {
        console.log(`  ℹ️  No identities found in first 50 scans, stopping early`);
        break;
      }
    }
  }

  /**
   * Perform real identity discovery using SDK
   * @param {string} mnemonic - User's wallet mnemonic
   * @returns {number} Count of discovered identities
   */
  async performRealDiscovery(mnemonic) {
    console.log(`  📦 Loading EvoSDK and wallet-lib...`);
    let EvoSDK, Wallet, InMem;

    try {
      // Load SDK using cached promise (webpack bundles it with all dependencies)
      console.log(`  Loading SDK via webpack bundle...`);
      try {
        EvoSDK = await getSDK();
        console.log(`  ✅ SDK loaded successfully`);
      } catch (bundleError) {
        console.error(`  ❌ Failed to load SDK:`, bundleError);
        throw bundleError;
      }

      // Load wallet-lib using cached promise
      console.log(`  Loading wallet-lib...`);
      try {
        const walletLibModules = await getWalletLib();
        Wallet = walletLibModules.Wallet;
        InMem = walletLibModules.InMem;
        console.log(`  ✅ wallet-lib loaded successfully`);
      } catch (walletError) {
        console.error(`  ❌ Failed to load wallet-lib:`, walletError);
        throw walletError;
      }
    } catch (importError) {
      throw new Error(`Failed to load SDK or wallet-lib: ${importError.message}`);
    }

    // Initialize SDK with network-specific options
    console.log(`  🔧 Initializing SDK...`);
    try {
      const sdkOptions = await getNetworkSdkOptions('testnet');
      const sdk = new EvoSDK(sdkOptions);
      this.sdk = sdk;
      console.log(`  ✅ SDK initialized`);

      // Propagate SDK to all components
      this.propagateSDKToComponents(sdk, mnemonic);
    } catch (initError) {
      console.error(`  ❌ Failed to initialize SDK:`, initError);
      throw initError;
    }

    // Create wallet and account from mnemonic
    console.log(`  💳 Creating wallet from mnemonic...`);
    let wallet, account;
    try {
      // CRITICAL: Use offlineMode: true to disable IdentitySyncWorker
      // This is the key pattern that allows wallet-lib to work in browser
      // without requiring SDK injection during wallet creation
      wallet = new Wallet({
        mnemonic: mnemonic,
        network: 'testnet',
        adapter: new InMem(),
        offlineMode: true  // ← KEY FIX: Disables IdentitySyncWorker
      });

      // Note: Do NOT use synchronize: true here - we handle discovery separately
      // via sdk.identities.getIdentityIds() below
      account = await wallet.getAccount({ index: 0 });
      console.log(`  ✅ Wallet and account created (offlineMode: true enabled for browser)`);
    } catch (walletSetupError) {
      console.error(`  ❌ Failed to create wallet/account:`, walletSetupError);
      throw walletSetupError;
    }

    // Start identity discovery
    console.log(`  🔍 Starting identity discovery...`);
    let identityIds = [];
    let foundCount = 0;

    try {
      const discoveredResults = [];
      let lastProgress = {};

      identityIds = await this.sdk.identities.getIdentityIds(mnemonic, {
        gapLimit: 20,
        batchSize: 5,  // Small batch for granular progress updates
        onProgress: (state) => {
          // Update UI with real-time progress
          try {
            document.getElementById('discovery-scanned').textContent = state.currentIndex;
            document.getElementById('discovery-count').textContent = state.foundCount;
          } catch (e) {
            // DOM elements might not exist yet, ignore
          }

          foundCount = state.foundCount;
          lastProgress = state;

          console.log(`  📡 Batch ${state.batchNumber}: Scanned ${state.currentIndex} indices, found ${state.foundCount}`);
        }
      });

      console.log(`  ✅ Discovery found ${identityIds.length} identities`);

      // Import each discovered identity (using cached JSON from discovery)
      if (identityIds.length > 0) {
        console.log(`  📥 Importing identity details...`);

        for (let idx = 0; idx < identityIds.length; idx++) {
          const { identityId, index, identityJson } = identityIds[idx];

          try {
            console.log(`  Importing identity ${idx + 1}/${identityIds.length}: ${identityId.substring(0, 8)}...`);

            // Use cached JSON from discovery (no network call needed)
            // The identityJson already contains all the data we need
            if (!identityJson) {
              throw new Error('Identity JSON not available from discovery');
            }

            // Transform to UI format - pass identityJson directly as plain object
            // transformIdentityForUI handles both WASM objects and plain objects
            const uiIdentity = transformIdentityForUI(identityJson, index);

            // Validate transformation
            if (!isValidTransformedIdentity(uiIdentity)) {
              throw new Error(`Invalid transformed identity: missing required fields`);
            }

            // Import into state manager - preserve existing data (labels, dpnsNames)
            const existingIdentity = stateManager.getState().identities.get(identityId);
            const mergedIdentity = mergeIdentityData(existingIdentity, uiIdentity);
            stateManager.setIdentity(identityId, mergedIdentity);
            discoveredResults.push({
              identityId,
              index,
              success: true
            });

            console.log(`  ✅ Imported identity: ${identityId.substring(0, 8)}... (revision ${uiIdentity.revision})`);
          } catch (importError) {
            console.error(`  ⚠️  Failed to import identity ${identityId}:`, importError.message);
            discoveredResults.push({
              identityId,
              index,
              success: false,
              error: importError.message
            });
          }
        }
      }

      // Cleanup
      if (wallet && typeof wallet.disconnect === 'function') {
        try {
          await wallet.disconnect();
        } catch (err) {
          console.warn('Warning: Error disconnecting wallet:', err.message);
        }
      }

      return foundCount;

    } catch (error) {
      console.error(`  ❌ Discovery error:`, error);
      console.error(`  📋 Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw new Error(`Discovery failed: ${error.message}`);
    }
  }

  initializeComponents() {
    // Initialize Identity Selector
    const selectorContainer = document.getElementById('identity-selector-container');
    if (selectorContainer) {
      this.components.identitySelector = new IdentitySelector(selectorContainer);
    }

    // Initialize Network Switcher
    const networkSwitcherContainer = document.getElementById('network-switcher-container');
    if (networkSwitcherContainer) {
      this.components.networkSwitcher = new NetworkSwitcher(networkSwitcherContainer);
    }

    // Initialize Name Resolver
    const nameResolverContainer = document.getElementById('name-resolver-container');
    if (nameResolverContainer) {
      this.components.nameResolver = new NameResolver(nameResolverContainer, this.platformOps);
    }

    // Initialize Document Viewer with callback for DPNS names
    const documentsViewerContainer = document.getElementById('documents-viewer');
    if (documentsViewerContainer) {
      this.components.documentViewer = new DocumentViewer(
        documentsViewerContainer,
        this.platformOps,
        null, // SDK will be set later
        {
          onDpnsNamesFound: (identityId, names) => this.handleDpnsNamesFound(identityId, names)
        }
      );
    }

    // Initialize Contested Names Viewer
    const contestedNamesContainer = document.getElementById('contested-names-viewer');
    if (contestedNamesContainer) {
      this.components.contestedNamesViewer = new ContestedNamesViewer(contestedNamesContainer, this.platformOps);
    }

    // Initialize Token Viewer
    const tokenViewerContainer = document.getElementById('token-viewer');
    if (tokenViewerContainer) {
      this.components.tokenViewer = new TokenViewer(tokenViewerContainer, this.platformOps, null);
      this.components.tokenViewer.render();
    }

    // Initialize Contacts Viewer
    const contactsViewerContainer = document.getElementById('contacts-viewer');
    if (contactsViewerContainer) {
      this.components.contactsViewer = new ContactsViewer(contactsViewerContainer, this.platformOps);
    }

    // Initialize Contact Requests Manager
    const contactRequestsContainer = document.getElementById('contact-requests-viewer');
    if (contactRequestsContainer) {
      this.components.contactRequestsManager = new ContactRequestsManager(contactRequestsContainer, this.platformOps);
    }

    // Initialize Notification Center
    const notificationBell = document.getElementById('notification-bell');
    const notificationDropdown = document.querySelector('.notification-center-dropdown');
    if (notificationBell && notificationDropdown) {
      this.components.notificationCenter = new NotificationCenter(notificationBell, notificationDropdown);
    }

    // Initialize other components as needed
    this.initializeIdentityView();
    this.initializeDashboardView();
    this.initializeActionPanels();
    this.initializeCreateModal();

    // Listen for wallet-funded event to proceed to next step
    window.addEventListener('wallet-funded-proceed', async (e) => {
      const fundingData = e.detail;
      console.log('✅ Wallet funded event received, context:', fundingData.context);
      console.log('📋 Full funding data:', fundingData);

      // Route based on context
      if (fundingData.context === 'create') {
        // Store UTXOs from event before showing modal
        // (hide() resets state, so we need to restore UTXOs here)
        if (fundingData.utxos && fundingData.utxos.length > 0) {
          stateManager.setFundingUTXOs(fundingData.utxos);
          console.log(`🔗 Restored ${fundingData.utxos.length} UTXOs to state for identity creation`);
        }

        // Show create modal
        const modal = document.getElementById('create-modal');
        if (modal) {
          modal.hidden = false;
          stateManager.setModalOpen(true);
          console.log('✅ Create identity modal shown');
          console.log('   Funding details:', fundingData);
        } else {
          console.error('❌ Create modal not found in DOM');
        }
      } else if (fundingData.context === 'topup') {
        // Funding complete for topup - execute topup operation
        if (this._topupInProgress) return;
        this._topupInProgress = true;
        try {
          console.log('✅ Topup funding received, starting topup operation');
          console.log('   Funding details:', fundingData);

          const identity = stateManager.getSelectedIdentity();
          if (!identity) {
            notifications.error('No identity selected for top-up');
            console.error('❌ No identity selected for top-up');
            return;
          }

          // Create operation to track progress
          const operationId = stateManager.addOperation({
            type: 'topup',
            identityId: identity.id,
            amount: fundingData.balance,
            message: 'Starting identity top-up...'
          });

          console.log('📊 Created topup operation:', operationId);

          // Show progress notification
          notifications.success('Starting identity top-up...');

          // Show operation progress modal
          this.showOperationProgressModal(operationId);

          // Check if we can use the real SDK with pre-found UTXOs (modular flow)
          const utxos = fundingData.utxos || [];
          const canUseRealSDK = !this.useMockMode && this.sdk && this.mnemonic && utxos.length > 0;

          try {
            stateManager.setLoading(true, 'Topping up identity...');

            let result;

            if (canUseRealSDK) {
              // Use modular topupWithUTXO - skips redundant blockchain scanning
              console.log('🚀 Using real SDK with topupWithUTXO (modular flow)');
              console.log(`   UTXO: ${utxos[0].txId}:${utxos[0].vout} (${utxos[0].satoshis} duffs)`);
              console.log(`   Identity: ${identity.id}`);

              result = await this.sdk.identities.topupWithUTXO({
                mnemonic: this.mnemonic,
                identityId: identity.id,
                utxo: utxos[0],
                amount: fundingData.balance,
                onProgress: (event) => {
                  // Update operation progress
                  stateManager.updateOperation(operationId, {
                    progress: event.progress,
                    message: event.message
                  });
                }
              });

              console.log('✅ Topup via real SDK completed:', result);

              // Clear UTXOs from state after use
              stateManager.setFundingUTXOs([]);

            } else {
              // Fall back to mock operations
              console.log('ℹ️  Using mock platform operations for topup');
              if (!canUseRealSDK) {
                console.log('   Reason:', {
                  useMockMode: this.useMockMode,
                  hasSDK: !!this.sdk,
                  hasMnemonic: !!this.mnemonic,
                  utxoCount: utxos.length
                });
              }

              // Update operation progress
              stateManager.updateOperation(operationId, {
                progress: 25,
                message: 'Broadcasting transaction...'
              });

              // Simulate topup delay
              await new Promise(r => setTimeout(r, 2000));

              stateManager.updateOperation(operationId, {
                progress: 50,
                message: 'Waiting for confirmation...'
              });

              await new Promise(r => setTimeout(r, 2000));

              stateManager.updateOperation(operationId, {
                progress: 75,
                message: 'Updating identity balance...'
              });

              // Execute mock topup
              result = await this.platformOps.topUp(
                identity.id,
                fundingData.balance
              );
            }

            // Update identity balance
            stateManager.setIdentity(identity.id, {
              ...identity,
              balance: identity.balance + fundingData.balance
            });

            // Mark operation as completed
            stateManager.updateOperation(operationId, {
              status: 'completed',
              progress: 100,
              message: 'Top-up complete!',
              result
            });

            notifications.success(`Identity topped up with ${fundingData.balance} duffs!`);
            console.log('✅ Topup operation completed successfully');

          } catch (error) {
            // Mark operation as failed
            stateManager.updateOperation(operationId, {
              status: 'failed',
              error: error.message
            });
            notifications.error(`Top-up failed: ${error.message}`);
            console.error('❌ Topup operation failed:', error);
          } finally {
            stateManager.setLoading(false);
          }

        } catch (error) {
          console.error('❌ Failed to process topup:', error);
          notifications.error(`Failed to start top-up: ${error.message}`);
        } finally {
          this._topupInProgress = false;
        }
      } else {
        console.warn('⚠️ Unknown funding context:', fundingData.context);
      }
    });

    // Subscribe to operation updates to refresh activity list AND update progress modal
    stateManager.on('operation-progress', (operation) => {
      const identity = stateManager.getSelectedIdentity();
      if (identity) {
        this.loadTransactionHistory(identity.id);
      }
      // Update progress modal if it's showing this operation
      this.updateOperationProgressModal(operation);
    });

    stateManager.on('operation-completed', (operation) => {
      const identity = stateManager.getSelectedIdentity();
      if (identity) {
        this.loadTransactionHistory(identity.id);
      }
      this.updateOperationProgressModal(operation);
    });

    stateManager.on('operation-failed', (operation) => {
      const identity = stateManager.getSelectedIdentity();
      if (identity) {
        this.loadTransactionHistory(identity.id);
      }
      this.updateOperationProgressModal(operation);
    });
  }

  initializeIdentityView() {
    // Handle identity info display
    const infoGrid = document.getElementById('identity-info');
    const activityList = document.getElementById('activity-list');

    if (!infoGrid) return;

    // Update view when identity is selected
    stateManager.on('identity-selected', (identity) => {
      // Update actions menu to show/hide context-specific actions
      this.updateActionsMenuVisibility(!!identity);

      if (!identity) {
        // No identity selected - show dashboard or welcome
        const identities = stateManager.getAllIdentities();
        document.getElementById('welcome-state').hidden = identities.length > 0;
        document.getElementById('dashboard-view').hidden = identities.length === 0;
        document.getElementById('identity-view').hidden = true;
        return;
      }

      // Identity selected - show identity view
      document.getElementById('welcome-state').hidden = true;
      document.getElementById('dashboard-view').hidden = true;
      document.getElementById('identity-view').hidden = false;

      // Fetch DPNS names from SDK if not already loaded
      // Query domain documents directly to get names sorted by registration date (oldest first)
      if (this.sdk && (!identity.dpnsNames || identity.dpnsNames.length === 0)) {
        console.log(`[DPNS] Fetching domain documents for identity: ${identity.id}`);
        this.sdk.documents.query({
          dataContractId: DPNS_CONTRACT_ID,
          documentTypeName: 'domain',
          where: [['records.identity', '==', identity.id]],
          limit: 100
        }).then(docsMap => {
          console.log(`[DPNS] Raw document response:`, docsMap);
          // Convert Map to array (SDK returns Map<Identifier, Document>)
          const docsArray = docsMap instanceof Map ? Array.from(docsMap.values()).filter(Boolean) : (docsMap || []);
          // Sort documents by creation date (oldest first) - client-side since DPNS has no index for this
          const sortedDocs = docsArray.sort((a, b) => {
            const aTime = a.createdAt || a.getCreatedAt?.() || a.$createdAt || 0n;
            const bTime = b.createdAt || b.getCreatedAt?.() || b.$createdAt || 0n;
            // Use comparison operators instead of subtraction for BigInt compatibility
            if (aTime < bTime) return -1;
            if (aTime > bTime) return 1;
            return 0;
          });
          // Extract names from sorted documents
          // WASM documents expose properties via toJSON(), not getProperties()
          const names = sortedDocs.map(doc => {
            const jsonData = typeof doc.toJSON === 'function' ? doc.toJSON() : null;
            let label = jsonData?.label || jsonData?.normalizedLabel;
            // Fallback to getProperties() or direct properties
            if (!label) {
              const props = doc.getProperties?.();
              label = props instanceof Map
                ? (props.get('label') || props.get('normalizedLabel'))
                : (props?.label || props?.normalizedLabel);
            }
            // Final fallback to direct doc properties
            if (!label) {
              label = doc.data?.label || doc.label;
            }
            return label ? `${label}.dash` : null;
          }).filter(Boolean);
          console.log(`[DPNS] Extracted ${names.length} names for ${identity.id}`);
          if (names.length > 0) {
            identity.dpnsNames = names;
            // Update the DPNS names display
            const dpnsEl = document.querySelector('.dpns-names-compact');
            if (dpnsEl) {
              dpnsEl.innerHTML = this.renderDpnsNamesCompact(names);
              this.bindDpnsNamesShowMore(names);
              // Update the count in the label
              const namesLabel = document.querySelector('.names-section label');
              if (namesLabel) {
                namesLabel.textContent = `Registered Names (${names.length})`;
              }
            }
            // Update the display name if no custom label
            if (!identity.label) {
              const displayNameEl = document.querySelector('.identity-display-name');
              if (displayNameEl) {
                displayNameEl.textContent = names[0];  // First registered name
              }
            }
          } else {
            console.log(`[DPNS] No domain documents found for ${identity.id}`);
          }
        }).catch(e => {
          console.warn('[IdentityView] Could not fetch DPNS domain documents:', e.message);
          console.error('[IdentityView] DPNS error details:', e);
        });
      }

      // Update identity info - balance is stored in CREDITS (not duffs!)
      const balance = formatBalance(identity.balance);
      // Build keys list (simple, no table)
      const keysListHTML = identity.keys.map(key => {
        const purpose = formatKeyPurpose(key.purpose);
        const securityLevel = formatSecurityLevel(key.securityLevel);
        const purposeClass = purpose.toLowerCase().includes('auth') ? 'key-purpose-auth' : 'key-purpose-transfer';
        const securityClass = `key-security-level-${securityLevel.class.replace('level-', '')}`;
        const statusDot = key.status === 'active'
          ? '<span class="key-status-dot key-status-dot-active" aria-label="Active" role="img">●</span>'
          : '<span class="key-status-dot key-status-dot-disabled" aria-label="Disabled" role="img">●</span>';

        return `
          <div class="key-list-item">
            <span class="key-id">#${key.id}</span>
            <span class="key-purpose ${purposeClass}">${purpose}</span>
            <span class="key-security-level ${securityClass}">${securityLevel.text}</span>
            <span class="key-status">${statusDot} ${key.status === 'active' ? 'Active' : 'Disabled'}</span>
          </div>
        `;
      }).join('');

      this.dpnsNamesExpanded = false; // Reset on identity change
      const dpnsNamesHTML = this.renderDpnsNamesCompact(identity.dpnsNames);

      // Get display name for identity (custom label or first DPNS name or "Unnamed Identity")
      const displayName = identity.label ||
                         (identity.dpnsNames && identity.dpnsNames.length > 0 ? identity.dpnsNames[0] : null) ||
                         'Unnamed Identity';

      infoGrid.innerHTML = `
        <div class="info-item info-item-identity">
          <label>Identity Name</label>
          <div class="identity-name-display">
            <span class="identity-display-name">${displayName}</span>
            <button class="btn-text btn-sm identity-name-edit-btn" data-edit-identity-name="${identity.id}" title="Edit name">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Edit
            </button>
          </div>
          <label style="margin-top: var(--space-3);">Identity ID</label>
          <div class="clickable-identity-id" data-copy="${identity.id}" title="Click to copy">
            <span class="monospace" style="word-break: break-all; font-size: var(--text-xs); color: var(--dash-blue);">${identity.id}</span>
          </div>
          <div class="revision-display">
            <span class="revision-text">Revision ${identity.revision}</span>
          </div>
        </div>
        <div class="info-item info-item-balance">
          <label>Balance</label>
          <div class="balance-display">
            <span class="balance-main">${balance.displayDash}</span>
            <span class="balance-sub">${balance.displayCredits}</span>
          </div>
        </div>
        <div class="info-item info-item-full-width">
          <div class="keys-and-names-container">
            <div class="keys-section">
              <label>Keys (${identity.keys.length})</label>
              <div class="keys-list">
                ${keysListHTML}
              </div>
            </div>
            <div class="names-section">
              <label>Registered Names (${identity.dpnsNames?.length || 0})</label>
              <div class="dpns-names-compact">
                ${dpnsNamesHTML}
              </div>
            </div>
          </div>
        </div>
        <div class="info-item info-item-created">
          <label>Created</label>
          <span>${formatTimestamp(identity.createdAt)}</span>
        </div>
        <div class="info-item info-item-updated">
          <label>Last Updated</label>
          <span>${formatTimestamp(identity.updatedAt)}</span>
        </div>
      `;

      // Bind edit name button
      const editNameBtn = infoGrid.querySelector('[data-edit-identity-name]');
      if (editNameBtn) {
        editNameBtn.addEventListener('click', () => {
          this.showRenameIdentityModal(identity.id);
        });
      }

      // Bind DPNS names show more/less pagination
      this.bindDpnsNamesShowMore(identity.dpnsNames || []);

      // Load transaction history
      this.loadTransactionHistory(identity.id);

      // Load contacts for this identity
      if (this.components.contactsViewer) {
        this.components.contactsViewer.loadContacts(identity.id);
      }

      // Load contact requests for this identity
      if (this.components.contactRequestsManager) {
        this.components.contactRequestsManager.loadContactRequests(identity.id);
      }

      // Load documents for this identity
      if (this.components.documentViewer) {
        this.components.documentViewer.loadDocuments(identity.id);
      }

      // Load contested names for this identity
      if (this.components.contestedNamesViewer) {
        this.components.contestedNamesViewer.loadContests(identity.id);
      }

      // Update token viewer with selected identity (Issue 2)
      if (this.components.tokenViewer) {
        this.components.tokenViewer.setIdentityId(identity.id);
      }
    });
  }

  loadTransactionHistory(identityId) {
    const activityList = document.getElementById('activity-list');
    if (!activityList) return;

    // Get both operations and transactions for this identity
    const operations = stateManager.getIdentityOperations(identityId, 10);
    const transactions = stateManager.getIdentityTransactions(identityId, 5);

    // Combine and sort by timestamp
    const allActivity = [
      ...operations,
      ...transactions
    ].sort((a, b) => (b.startedAt || b.timestamp) - (a.startedAt || a.timestamp));

    if (allActivity.length === 0) {
      activityList.innerHTML = '<p class="empty-message">No recent activity</p>';
      return;
    }

    activityList.innerHTML = '';

    allActivity.forEach(item => {
      const activityItem = document.createElement('div');
      activityItem.className = 'activity-item';

      // Check if it's an operation or transaction
      if (item.type && item.status) {
        // It's an operation
        activityItem.dataset.operationId = item.id;
        activityItem.style.cursor = item.status === 'in-progress' ? 'pointer' : 'default';

        const statusMap = {
          'in-progress': { icon: '⏳', class: 'status-pending', text: 'In Progress' },
          'completed': { icon: '✓', class: 'status-confirmed', text: 'Completed' },
          'failed': { icon: '✕', class: 'status-failed', text: 'Failed' }
        };

        const status = statusMap[item.status] || statusMap['in-progress'];
        const typeLabel = { create: 'Create Identity', topup: 'Top Up', withdraw: 'Withdraw', transfer: 'Transfer' }[item.type] || item.type;

        activityItem.innerHTML = `
          <div class="activity-icon ${item.status === 'in-progress' ? 'in-progress-glow' : ''}">
            ${status.icon}
          </div>
          <div class="activity-details">
            <span class="activity-type">${typeLabel}</span>
            <span class="activity-time">${item.status === 'in-progress' ? 'In progress...' : formatTimestamp(item.completedAt || item.updatedAt)}</span>
          </div>
          <div class="activity-amount">
            ${item.amount ? formatDuffs(item.amount) : ''}
          </div>
          <div class="activity-status">
            <span class="${status.class}">${status.text}</span>
          </div>
        `;

        // Add click handler for in-progress operations
        if (item.status === 'in-progress') {
          activityItem.addEventListener('click', () => {
            this.showOperationProgressModal(item.id);
          });
        }
      } else {
        // It's a transaction
        const status = formatTransactionStatus(item.status);

        activityItem.innerHTML = `
          <div class="activity-icon ${item.direction}">
            ${item.direction === 'in' ? '↓' : '↑'}
          </div>
          <div class="activity-details">
            <span class="activity-type">${item.type}</span>
            <span class="activity-time">${formatTimestamp(item.timestamp)}</span>
          </div>
          <div class="activity-amount ${item.direction}">
            ${item.direction === 'in' ? '+' : '-'}${formatDuffs(item.amount)}
          </div>
          <div class="activity-status">
            <span class="${status.class}">${status.text}</span>
          </div>
        `;
      }

      activityList.appendChild(activityItem);
    });
  }

  initializeDashboardView() {
    // Update dashboard when identities change
    const updateDashboard = () => {
      const identities = stateManager.getAllIdentities();

      // Update stats
      document.getElementById('stat-identities').textContent = identities.length;

      const totalBalance = identities.reduce((sum, id) => sum + id.balance, 0);
      const totalBalanceDisplay = formatBalance(totalBalance);
      document.getElementById('stat-balance').textContent = totalBalanceDisplay.displayDash;

      // Calculate actual total DPNS names
      const totalNames = identities.reduce((sum, id) => sum + (id.dpnsNames?.length || 0), 0);
      document.getElementById('stat-names').textContent = totalNames;

      // Update identity cards
      const cardsContainer = document.getElementById('identity-cards');
      if (!cardsContainer) return;

      cardsContainer.innerHTML = '';
      identities.forEach(identity => {
        const card = document.createElement('div');
        card.className = 'identity-card';
        card.style.cursor = 'pointer';
        const balance = formatBalance(identity.balance);
        card.innerHTML = `
          <div class="identity-card-header">
            <div>
              <div class="identity-card-label">${identity.label || (identity.dpnsNames?.length > 0 ? identity.dpnsNames[0] : 'Unnamed Identity')}</div>
              <div class="identity-card-id">${formatIdentityId(identity.id)}</div>
            </div>
          </div>
          <div>
            <div class="identity-card-balance">${balance.displayDash}</div>
            <div class="identity-card-balance-sub">${balance.displayCredits}</div>
          </div>
        `;

        // Click anywhere on card to view identity
        card.addEventListener('click', () => {
          history.pushState({ identityId: identity.id }, '', `#identity/${identity.id}`);
          stateManager.selectIdentity(identity.id);
        });

        cardsContainer.appendChild(card);
      });
    };

    // Update on identity changes
    stateManager.on('identity-updated', updateDashboard);

    // Bind dashboard create button
    const dashboardCreateBtn = document.getElementById('dashboard-create-btn');
    if (dashboardCreateBtn) {
      dashboardCreateBtn.addEventListener('click', () => this.showCreateModal());
    }

    // Initial update
    updateDashboard();
  }

  initializeActionPanels() {
    // Initialize actions menu dropdown in header
    const actionsMenu = document.getElementById('actions-menu-container');
    const actionsTrigger = actionsMenu?.querySelector('.actions-menu-trigger');
    const actionsDropdown = actionsMenu?.querySelector('.actions-dropdown');

    if (actionsTrigger && actionsDropdown) {
      // Toggle dropdown
      actionsTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = actionsTrigger.getAttribute('aria-expanded') === 'true';

        if (isExpanded) {
          actionsDropdown.hidden = true;
          actionsTrigger.setAttribute('aria-expanded', 'false');
        } else {
          actionsDropdown.hidden = false;
          actionsTrigger.setAttribute('aria-expanded', 'true');
        }
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!actionsMenu.contains(e.target)) {
          actionsDropdown.hidden = true;
          actionsTrigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Bind action items
      const actionItems = actionsDropdown.querySelectorAll('.action-item[data-action]');
      actionItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const action = item.dataset.action;

          // Close dropdown
          actionsDropdown.hidden = true;
          actionsTrigger.setAttribute('aria-expanded', 'false');

          // Show action panel/modal
          this.showActionPanel(action);
        });
      });

      // Initialize visibility based on current identity state
      const identity = stateManager.getSelectedIdentity();
      this.updateActionsMenuVisibility(!!identity);
    }
  }

  showActionPanel(action) {
    const identity = stateManager.getSelectedIdentity();

    // Create identity doesn't require an identity to be selected
    if (!identity && action !== 'create-identity') return;

    // All actions now use modals instead of inline panels
    switch (action) {
      case 'create-identity':
        this.showCreateModal();
        break;
      case 'topup':
        // Show funding flow before top-up
        this.fundingFlow.show('topup');
        break;
      case 'withdraw':
        this.showWithdrawModal();
        break;
      case 'transfer':
        this.showTransferModal();
        break;
      case 'register-name':
        this.showRegisterNameModal();
        break;
      case 'manage-keys':
        this.showKeysModal();
        break;
      case 'add-contact':
        this.showSendContactRequestModal();
        break;
      case 'name-lookup':
        // Trigger name lookup component to show
        const nameLookupBtn = document.querySelector('#name-resolver-container button');
        if (nameLookupBtn) nameLookupBtn.click();
        break;
    }
  }

  /**
   * Render DPNS names list with pagination (show first 10, expand on click)
   */
  renderDpnsNamesCompact(names) {
    if (!names || names.length === 0) {
      return '<span class="text-muted">No names registered</span>';
    }

    const PAGE_SIZE = 10;
    const displayNames = this.dpnsNamesExpanded ? names : names.slice(0, PAGE_SIZE);
    const hasMore = names.length > PAGE_SIZE && !this.dpnsNamesExpanded;
    const remaining = names.length - PAGE_SIZE;

    let html = displayNames.map(name => `
      <div class="dpns-name-tag clickable-name" data-copy="${name}" title="Click to copy">
        <span>${name}</span>
      </div>
    `).join('');

    if (hasMore) {
      html += `<button class="btn btn-secondary btn-sm dpns-show-more-btn" id="dpns-names-show-more">
        Show ${remaining} more names...
      </button>`;
    } else if (names.length > PAGE_SIZE && this.dpnsNamesExpanded) {
      html += `<button class="btn btn-secondary btn-sm dpns-show-more-btn" id="dpns-names-show-less">
        Show less
      </button>`;
    }

    return html;
  }

  /**
   * Bind click handlers for DPNS names show more/less buttons
   */
  bindDpnsNamesShowMore(names) {
    const showMoreBtn = document.getElementById('dpns-names-show-more');
    const showLessBtn = document.getElementById('dpns-names-show-less');

    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', () => {
        this.dpnsNamesExpanded = true;
        const dpnsEl = document.querySelector('.dpns-names-compact');
        if (dpnsEl) {
          dpnsEl.innerHTML = this.renderDpnsNamesCompact(names);
          this.bindDpnsNamesShowMore(names);
        }
      });
    }

    if (showLessBtn) {
      showLessBtn.addEventListener('click', () => {
        this.dpnsNamesExpanded = false;
        const dpnsEl = document.querySelector('.dpns-names-compact');
        if (dpnsEl) {
          dpnsEl.innerHTML = this.renderDpnsNamesCompact(names);
          this.bindDpnsNamesShowMore(names);
          dpnsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }

  /**
   * Handle DPNS names found from document viewer
   * Updates the identity's dpnsNames and refreshes the UI
   */
  handleDpnsNamesFound(identityId, names) {
    console.log(`[App] Received ${names.length} DPNS names for identity ${identityId}`);

    // Get identity from state
    const identity = stateManager.getState().identities.get(identityId);
    if (!identity) return;

    // Update identity's DPNS names
    identity.dpnsNames = names;
    stateManager.setIdentity(identityId, identity);

    // Update UI if this is the currently selected identity
    const selectedIdentity = stateManager.getSelectedIdentity();
    if (selectedIdentity && selectedIdentity.id === identityId) {
      // Update the DPNS names display
      const dpnsEl = document.querySelector('.dpns-names-compact');
      if (dpnsEl) {
        dpnsEl.innerHTML = this.renderDpnsNamesCompact(names);
        this.bindDpnsNamesShowMore(names);
      }

      // Update the count in the label
      const namesLabel = document.querySelector('.names-section label');
      if (namesLabel) {
        namesLabel.textContent = `Registered Names (${names.length})`;
      }

      // Update the display name if no custom label
      if (!identity.label) {
        const displayNameEl = document.querySelector('.identity-display-name');
        if (displayNameEl && names.length > 0) {
          displayNameEl.textContent = names[0];
        }
      }
    }
  }

  updateActionsMenuVisibility(hasIdentity) {
    const actionsDropdown = document.querySelector('.actions-dropdown');
    if (!actionsDropdown) return;

    const actionItems = actionsDropdown.querySelectorAll('.action-item');
    const divider = actionsDropdown.querySelector('.actions-divider');

    actionItems.forEach(item => {
      const requiresIdentity = item.dataset.requiresIdentity === 'true';
      item.style.display = (requiresIdentity && !hasIdentity) ? 'none' : 'flex';
    });

    // Hide divider if no identity selected
    if (divider) {
      divider.style.display = hasIdentity ? 'block' : 'none';
    }
  }

  /**
   * Build the encryptedPublicKey field for a contact request (96 bytes)
   *
   * The encryptedPublicKey contains the sender's DIP15-derived contact public key,
   * formatted as required by the DashPay contract. In a full implementation,
   * this would be encrypted using ECDH with the recipient's encryption key.
   *
   * For now, we use a simplified format:
   * - Bytes 0-32: Sender's contact public key (33 bytes compressed, padded to 32)
   * - Bytes 33-95: Additional key material / padding
   *
   * @param {string} publicKeyHex - The sender's contact public key in hex format
   * @returns {number[]} 96-byte array for encryptedPublicKey field
   */
  buildEncryptedPublicKey(publicKeyHex) {
    // Convert hex public key to bytes
    const pubKeyBytes = [];
    const cleanHex = publicKeyHex.replace(/^0x/, '');
    for (let i = 0; i < cleanHex.length; i += 2) {
      pubKeyBytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }

    // Build 96-byte array
    // DashPay contract expects 96 bytes for encryptedPublicKey
    const result = new Uint8Array(96);

    // Copy public key bytes (typically 33 bytes for compressed key)
    for (let i = 0; i < Math.min(pubKeyBytes.length, 33); i++) {
      result[i] = pubKeyBytes[i];
    }

    // Fill remaining bytes with deterministic padding based on public key
    // This ensures the same public key always produces the same encryptedPublicKey
    for (let i = 33; i < 96; i++) {
      // Use a simple XOR pattern with the public key for padding
      result[i] = pubKeyBytes[i % pubKeyBytes.length] ^ (i & 0xFF);
    }

    return Array.from(result);
  }

  showSendContactRequestModal() {
    this.closeAllModals();
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('send-contact-request-modal');
    if (!modal) return;

    // Get form elements
    const form = document.getElementById('send-contact-request-form');
    const recipientInput = document.getElementById('contact-request-recipient');
    const validationText = document.getElementById('contact-request-validation');
    const closeButtons = modal.querySelectorAll('.modal-close');

    // Reset form
    if (form) form.reset();

    if (modal.dataset.listenersInitialized !== 'true') {
    // Real-time validation for DPNS name format
    if (recipientInput && validationText) {
      recipientInput.addEventListener('input', () => {
        const name = recipientInput.value.trim();

        if (!name) {
          validationText.textContent = 'Enter the DPNS name of the person you want to add';
          validationText.style.color = '';
          return;
        }

        // Basic DPNS name format validation
        // Names can be alphanumeric with hyphens (not at start/end), optionally ending with .dash
        const nameWithoutSuffix = name.replace(/\.dash$/i, '');
        const nameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/i;
        if (!nameRegex.test(nameWithoutSuffix)) {
          validationText.textContent = 'Invalid name format. Use letters, numbers, and hyphens.';
          validationText.style.color = 'var(--error)';
          return;
        }

        if (nameWithoutSuffix.length < 3) {
          validationText.textContent = 'Name must be at least 3 characters';
          validationText.style.color = 'var(--error)';
          return;
        }

        validationText.textContent = '✓ Valid name format';
        validationText.style.color = 'var(--success)';
      });
    }

    // Close handlers
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.hidden = true;
      });
    });

    // Form submission with DPNS name resolution
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('[ContactRequest] Form submitted!');

      let name = recipientInput.value.trim();

      // Auto-append .dash if not present
      if (!name.endsWith('.dash')) {
        name = name + '.dash';
      }
      console.log(`[ContactRequest] Looking up: ${name}`);

      try {
        stateManager.setLoading(true, 'Looking up username...');

        // Resolve DPNS name to identity ID
        let recipientId;

        // Check if real SDK mode is enabled for name resolution
        const canUseRealSDK = !this.useMockMode && this.sdk;

        if (canUseRealSDK) {
          try {
            recipientId = await this.sdk.dpns.resolveName(name);
          } catch (resolveError) {
            console.error('[ContactRequest] DPNS resolution error:', resolveError);
            const errorMsg = resolveError.message || String(resolveError);

            // Provide helpful error messages for common failure modes
            if (errorMsg.includes('contract not found') || errorMsg.includes('not found')) {
              throw new Error(`Unable to look up names. The DPNS contract may not be available. Please check your network connection and try again.`);
            } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
              throw new Error(`Network timeout while looking up "${name}". Please try again.`);
            } else if (errorMsg.includes('connection') || errorMsg.includes('ECONNREFUSED')) {
              throw new Error(`Network connection error. Please check your connection and try again.`);
            } else {
              throw new Error(`Failed to look up "${name}": ${errorMsg}`);
            }
          }
        } else {
          // Mock mode - simulate resolution
          console.log('[ContactRequest] Mock mode - simulating DPNS resolution');
          await new Promise(r => setTimeout(r, 500));
          // In mock mode, generate a fake identity ID for testing
          recipientId = 'DmockedIdentityId' + Math.random().toString(36).substring(2, 15);
        }

        if (!recipientId) {
          throw new Error(`Username "${name}" not found`);
        }

        console.log(`[ContactRequest] Resolved "${name}" to: ${recipientId.substring(0, 12)}...`);

        // Check not sending to self
        if (recipientId === identity.id) {
          console.log('[ContactRequest] Cannot send to self');
          notifications.error('Cannot send contact request to yourself');
          stateManager.setLoading(false);
          return;
        }

        stateManager.setLoading(true, 'Sending contact request...');

        // Check if real SDK mode is enabled for sending (needs mnemonic + identity index)
        const canCreateOnChain = !this.useMockMode && this.sdk && this.mnemonic && identity.index !== undefined;
        console.log(`[ContactRequest] canCreateOnChain: ${canCreateOnChain}`);
        console.log(`[ContactRequest]   useMockMode: ${this.useMockMode}`);
        console.log(`[ContactRequest]   hasSDK: ${!!this.sdk}`);
        console.log(`[ContactRequest]   hasMnemonic: ${!!this.mnemonic}`);
        console.log(`[ContactRequest]   identity.index: ${identity.index}`);

        if (canCreateOnChain) {
          // ======================================================================
          // REAL SDK PATH: Create contactRequest document on-chain
          // ======================================================================
          console.log('[ContactRequest] Using REAL SDK for contact request');
          console.log(`  From: ${identity.id.substring(0, 12)}... (index: ${identity.index})`);
          console.log(`  To: ${recipientId.substring(0, 12)}...`);

          // Get private key for signing (Key 1 = HIGH security level)
          // Same pattern as DPNS registration
          const privateKeyWif = await this.platformOps.getPrivateKeyForIdentity(identity.index, 1);
          if (!privateKeyWif) {
            throw new Error('Failed to derive private key for contact request');
          }

          // ======================================================================
          // DIP15 Contact Key Derivation
          // ======================================================================
          // Derive contact-specific keys using DIP15 (DashPay contact derivation)
          console.log('[ContactRequest] Deriving DIP15 contact key...');
          let contactKeyInfo;
          try {
            contactKeyInfo = await this.sdk.dashpay.deriveContactKey({
              mnemonic: this.mnemonic,
              senderIdentityId: identity.id,
              receiverIdentityId: recipientId,
              account: 0,
              addressIndex: 0,
              network: 'testnet'
            });
            console.log('[ContactRequest] Contact key derived successfully');
            console.log(`  Path: ${contactKeyInfo.path}`);
          } catch (keyError) {
            console.error('[ContactRequest] Failed to derive contact key:', keyError);
            throw new Error(`Failed to generate contact key: ${keyError.message}`);
          }

          // Get recipient's identity to find their encryption key
          console.log('[ContactRequest] Fetching recipient identity for encryption key...');
          let recipientIdentity;
          let recipientKeyIndex = 0;
          try {
            recipientIdentity = await this.sdk.identities.get(recipientId);
            if (!recipientIdentity) {
              throw new Error('Recipient identity not found');
            }

            // Find recipient's encryption key (security level 2 = MEDIUM, used for encryption)
            // The recipient's keys are indexed by ID, find one suitable for encryption
            const recipientKeys = recipientIdentity.publicKeys || recipientIdentity.keys || [];
            const encryptionKey = recipientKeys.find(k =>
              k.securityLevel === 2 || k.securityLevel === 'MEDIUM'
            );
            if (encryptionKey) {
              recipientKeyIndex = encryptionKey.id ?? encryptionKey.keyId ?? 0;
              console.log(`[ContactRequest] Using recipient key index: ${recipientKeyIndex}`);
            } else {
              console.log('[ContactRequest] No MEDIUM security key found, using key index 0');
            }
          } catch (recipientError) {
            console.warn('[ContactRequest] Could not fetch recipient identity:', recipientError.message);
            // Continue with default key index
          }

          // Build encryptedPublicKey (96 bytes)
          // For now, we use the sender's contact public key padded/formatted to 96 bytes
          // In a full implementation, this would be encrypted with ECDH using recipient's key
          // The contact public key from DIP15 derivation is 33 bytes (compressed)
          const senderContactPubKey = contactKeyInfo.publicKey;
          const encryptedPublicKey = this.buildEncryptedPublicKey(senderContactPubKey);
          console.log('[ContactRequest] Built encryptedPublicKey (96 bytes)');

          // Generate random entropy for document ID (32 bytes = 64 hex chars)
          const entropyHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('');

          // Create contact request document on-chain
          // Use inline constant to avoid webpack bundling issues with module-level const
          const dashpayContractId = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';
          console.log('[ContactRequest] Creating contactRequest document...');

          // Get initial balance for verification (SDK sometimes returns "Unknown error" even on success)
          let initialBalance = null;
          try {
            const initialIdentity = await this.sdk.identities.get(identity.id);
            initialBalance = initialIdentity?.balance;
            console.log('[ContactRequest] Initial balance:', initialBalance);
          } catch (balanceErr) {
            console.warn('[ContactRequest] Could not get initial balance:', balanceErr.message);
          }

          let result = null;
          let createError = null;

          // Use retry logic for transient errors (network issues, timeouts, etc)
          try {
            result = await retryOperation(
              async (attempt) => {
                console.log(`[ContactRequest] Attempt ${attempt} - creating document...`);
                return await this.sdk.documents.create({
                  dataContractId: dashpayContractId,
                  documentTypeName: 'contactRequest',
                  ownerId: identity.id,
                  data: {
                    toUserId: recipientId,
                    encryptedPublicKey: encryptedPublicKey,
                    senderKeyIndex: 0,
                    recipientKeyIndex: recipientKeyIndex,
                    accountReference: 0
                  },
                  entropyHex: entropyHex,
                  privateKeyWif: privateKeyWif
                });
              },
              {
                maxAttempts: 5,
                operationName: 'ContactRequest',
                onRetry: (attempt, maxAttempts, delay, error) => {
                  console.log(`[ContactRequest] Retry ${attempt}/${maxAttempts} in ${Math.round(delay)}ms - ${error.message}`);
                  notifications.info(`Retrying contact request (${attempt}/${maxAttempts})...`);
                }
              }
            );
            console.log('[ContactRequest] SDK result:', result?.type || result);
          } catch (err) {
            createError = err;
            console.warn('[ContactRequest] SDK threw error after retries:', err.message);
          }

          // Handle "Unknown error" - verify via balance check if SDK returned error
          if (createError && createError.message?.includes('Unknown error') && initialBalance !== null) {
            console.log('[ContactRequest] Got "Unknown error" - verifying via balance check...');
            const verification = await verifyByBalanceChange(this.sdk, identity.id, initialBalance);
            if (verification.success) {
              console.log('[ContactRequest] Balance decreased by', verification.balanceChange, 'credits - operation succeeded!');
              result = { type: 'DocumentCreated', verifiedByBalance: true };
              createError = null; // Clear the error
            }
          }

          // If we still have an error after verification, re-throw it
          if (createError) {
            throw createError;
          }

          // Verify state transition succeeded
          if (result && result.code !== undefined && result.code !== 0) {
            throw new Error(`State transition failed with code ${result.code}: ${result.message || 'Unknown error'}`);
          }

          notifications.success(`Contact request sent to ${name}!`);

          // Close modal immediately to unblock UI
          modal.hidden = true;

          // Reload contact requests list (async, non-blocking)
          if (this.components.contactRequestsManager) {
            this.components.contactRequestsManager.loadContactRequests(identity.id).catch(() => {});
          }

          // Verify document propagation asynchronously (non-blocking)
          const DASHPAY_CONTRACT_ID = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';
          const sdk = this.sdk;
          const identityId = identity.id;

          // Run verification in background - don't block the UI
          (async () => {
            console.log('[ContactRequest] Verifying document persisted (background)...');
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise(r => setTimeout(r, 5000));

              try {
                const outboundMap = await sdk.documents.query({
                  dataContractId: DASHPAY_CONTRACT_ID,
                  documentTypeName: 'contactRequest',
                  where: [['$ownerId', '==', identityId]],
                  limit: 20
                });

                // Convert Map to array (SDK returns Map<Identifier, Document>)
                const outboundDocs = outboundMap instanceof Map ? Array.from(outboundMap.values()).filter(Boolean) : [];
                const found = outboundDocs.some(doc =>
                  doc.data?.toUserId === recipientId || doc.getProperties?.()?.toUserId === recipientId
                );

                if (found) {
                  console.log('[ContactRequest] Document confirmed on chain!');
                  return; // Success, exit the async function
                }
                console.log(`[ContactRequest] Propagation check ${attempt + 1}/6 - not yet visible`);
              } catch (queryError) {
                console.warn('[ContactRequest] Query attempt failed:', queryError.message);
              }
            }
            console.warn('[ContactRequest] Document not yet visible after 30s - may need more propagation time');
          })();

          // Return early since we already closed the modal
          stateManager.setLoading(false);
          return;

        } else {
          // ======================================================================
          // MOCK PATH: Simulate contact request for testing/development
          // ======================================================================
          console.log('[ContactRequest] Using MOCK for contact request');
          await new Promise(r => setTimeout(r, 1500));
          notifications.success(`Contact request sent to ${name}! (Mock)`);
        }

        modal.hidden = true;

        // Reload contact requests to show the new outbound request
        if (this.components.contactRequestsManager) {
          this.components.contactRequestsManager.loadContactRequests(identity.id);
        }

      } catch (error) {
        console.error('[ContactRequest] Failed:', error);
        notifications.error(`Failed to send request: ${error.message}`);
      } finally {
        stateManager.setLoading(false);
      }
    });

    modal.dataset.listenersInitialized = 'true';
    } // end listenersInitialized guard

    // Show modal
    modal.hidden = false;
  }

  showOperationProgressModal(operationId) {
    const operation = stateManager.getOperation(operationId);
    if (!operation) return;

    const modal = document.getElementById('operation-progress-modal');
    const title = document.getElementById('operation-modal-title');
    const message = document.getElementById('operation-progress-message');
    const progressFill = document.getElementById('operation-progress-fill');
    const minimizeBtn = modal.querySelector('.modal-minimize');

    if (!modal) return;

    // Set modal title based on operation type
    const titles = {
      create: 'Creating Identity',
      topup: 'Topping Up Identity',
      withdraw: 'Withdrawing Credits',
      transfer: 'Transferring Credits'
    };
    title.textContent = titles[operation.type] || 'Operation in Progress';

    // Set current progress
    message.textContent = operation.message || 'Processing...';
    progressFill.style.width = `${operation.progress || 0}%`;

    // Show modal
    modal.hidden = false;

    // Bind minimize button
    const minimizeHandler = () => {
      this.hideOperationProgressModal();
      notifications.success('Progress minimized to activity list');
    };

    minimizeBtn.removeEventListener('click', this.currentMinimizeHandler);
    this.currentMinimizeHandler = minimizeHandler;
    minimizeBtn.addEventListener('click', minimizeHandler);

    // Store current operation ID for progress updates
    this.currentOperationId = operationId;
  }

  hideOperationProgressModal() {
    const modal = document.getElementById('operation-progress-modal');
    if (modal) {
      modal.hidden = true;
    }
    this.currentOperationId = null;
  }

  updateOperationProgressModal(operation) {
    // Only update if this is the currently displayed operation
    if (this.currentOperationId !== operation.id) return;

    const modal = document.getElementById('operation-progress-modal');
    if (modal.hidden) return; // Don't update if modal is hidden

    const message = document.getElementById('operation-progress-message');
    const progressFill = document.getElementById('operation-progress-fill');

    if (message) message.textContent = operation.message || 'Processing...';
    if (progressFill) progressFill.style.width = `${operation.progress || 0}%`;

    // Auto-close modal when operation completes
    if (operation.status === 'completed' || operation.status === 'failed') {
      setTimeout(() => this.hideOperationProgressModal(), 500);
    }
  }

  initializeCreateModal() {
    const createBtn = document.getElementById('create-identity-btn');
    const modal = document.getElementById('create-modal');
    const modalClose = modal?.querySelector('.modal-close');
    const modalCancel = modal?.querySelector('.modal-cancel');
    const form = document.getElementById('create-identity-form');

    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateModal());
    }

    window.addEventListener('create-identity-request', () => this.showCreateModal());

    if (modalClose) {
      modalClose.addEventListener('click', () => this.hideCreateModal());
    }

    if (modalCancel) {
      modalCancel.addEventListener('click', () => this.hideCreateModal());
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCreateIdentity();
      });
    }

    // Handle test wallet toggle
    const testWalletCheckbox = document.getElementById('use-test-wallet');
    const mnemonicGroup = document.getElementById('mnemonic-group');
    const mnemonicInput = document.getElementById('wallet-mnemonic');

    if (testWalletCheckbox && mnemonicGroup && mnemonicInput) {
      testWalletCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          mnemonicGroup.hidden = false;
          mnemonicInput.value = MNEMONIC;
        } else {
          mnemonicGroup.hidden = true;
          mnemonicInput.value = '';
        }
      });
    }
  }

  showCreateModal() {
    this.closeAllModals();
    // IMPORTANT: Show funding flow first before create modal
    // This ensures users fund their wallet before attempting to create identity
    this.fundingFlow.show();
  }

  hideCreateModal() {
    const modal = document.getElementById('create-modal');
    if (modal) {
      modal.hidden = true;
      stateManager.setModalOpen(false);

      // Reset form
      const form = document.getElementById('create-identity-form');
      if (form) form.reset();

      // Hide progress
      const progress = modal.querySelector('.modal-progress');
      if (progress) progress.hidden = true;
    }
  }

  /**
   * Refresh an identity from the network and update local state
   *
   * Used after operations that modify identity on-chain (DPNS registration,
   * credit transfer, key management) to sync local state with network state.
   *
   * @param {string} identityId - The identity ID to refresh
   * @returns {Promise<Object|null>} The updated identity or null if not found
   */
  async refreshIdentity(identityId) {
    if (!this.sdk) {
      console.warn('[refreshIdentity] SDK not initialized');
      return null;
    }

    try {
      // Fetch fresh identity from network
      const wasmIdentity = await this.sdk.identities.get(identityId);
      if (!wasmIdentity) {
        console.warn(`[refreshIdentity] Identity ${identityId} not found on network`);
        return null;
      }

      // Get existing identity from state (for index and other local data)
      const existingIdentity = stateManager.getIdentity(identityId);
      const identityIndex = existingIdentity?.index;

      // Convert to JSON and transform for UI
      const identityJson = wasmIdentity.toJSON ? wasmIdentity.toJSON() : wasmIdentity;
      const freshIdentity = transformIdentityForUI(identityJson, identityIndex);

      // Merge with existing data (preserves local fields like label, dpnsNames)
      const updated = mergeIdentityData(existingIdentity || {}, freshIdentity);

      // Update state
      stateManager.setIdentity(identityId, updated);

      console.log(`[refreshIdentity] Identity ${identityId.substring(0, 8)}... refreshed`);
      return updated;
    } catch (error) {
      console.error(`[refreshIdentity] Error refreshing ${identityId}:`, error.message);
      return null;
    }
  }

  /**
   * Ensure identity has a valid index that produces matching keys.
   * If the index is missing or wrong, attempts to find the correct index.
   *
   * This prevents cryptic WASM crashes by validating keys before operations
   * like DPNS registration, credit transfer, or withdrawals.
   *
   * @param {Object} identity - Identity to validate
   * @returns {Promise<Object>} - { valid: boolean, index?: number, error?: string, corrected?: boolean }
   */
  async ensureIdentityIndex(identity) {
    // 1. Check if index exists
    if (identity.index === null || identity.index === undefined) {
      console.warn(`[ensureIdentityIndex] Identity ${identity.id} missing index, scanning...`);
      notifications.info('Identity index missing. Scanning to find correct index...');
      return await this.scanForCorrectIndex(identity);
    }

    // 2. If identity doesn't have keys, we can't validate - assume index is correct
    if (!identity.keys || identity.keys.length === 0) {
      console.warn(`[ensureIdentityIndex] Identity ${identity.id} has no keys to validate against`);
      return { valid: true, index: identity.index };
    }

    // 3. Derive keys and validate against on-chain
    try {
      // Import wallet functions directly for key derivation
      const { wallet: walletFunctions } = await import('../../dist/wallet/functions.js');
      const mnemonic = this.mnemonic;

      if (!mnemonic) {
        return { valid: false, error: 'No mnemonic found. Please log in with your wallet first.' };
      }

      // Derive Key 0 directly using wallet functions (DIP13 path)
      const derivedKeyPath = `m/9'/1'/5'/0'/0'/${identity.index}'/0'`;
      const derivedKey = await walletFunctions.deriveKeyFromSeedWithPath(mnemonic, null, derivedKeyPath, 'testnet');
      const derivedPubKeyHex = derivedKey.public_key?.toLowerCase();

      // 4. Compare Key 0 (MASTER key - always present on valid identities)
      const onChainKey0 = identity.keys.find(k => k.id === 0);
      if (!onChainKey0) {
        console.warn(`[ensureIdentityIndex] Identity ${identity.id} missing Key 0`);
        return { valid: true, index: identity.index }; // Can't validate without Key 0
      }

      // DEBUG: Log key data for troubleshooting
      console.log(`[ensureIdentityIndex] DEBUG - Comparing keys:`);
      console.log(`  Derived pubkey: ${derivedPubKeyHex?.substring(0, 40)}...`);
      console.log(`  OnChain key0.data: ${typeof onChainKey0.data === 'string' ? onChainKey0.data.substring(0, 40) : JSON.stringify(onChainKey0.data).substring(0, 40)}...`);
      console.log(`  OnChain key0.type: ${onChainKey0.type}`);

      const matches = await this.compareKeys({ publicKeyHex: derivedPubKeyHex }, onChainKey0);

      if (matches) {
        console.log(`[ensureIdentityIndex] ✅ Index ${identity.index} is correct for ${identity.id.substring(0, 12)}...`);
        return { valid: true, index: identity.index };
      }

      // 5. Index is wrong - scan for correct one
      console.warn(`[ensureIdentityIndex] Index ${identity.index} produces wrong keys for ${identity.id.substring(0, 12)}..., scanning...`);
      notifications.info('Stored index incorrect. Scanning for correct index...');
      return await this.scanForCorrectIndex(identity);

    } catch (error) {
      console.error(`[ensureIdentityIndex] Error validating index:`, error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Scan indices 0-20 to find the correct one for an identity
   *
   * @param {Object} identity - Identity to find correct index for
   * @param {number} maxIndex - Maximum index to scan (default: 20)
   * @returns {Promise<Object>} - { valid: boolean, index?: number, error?: string, corrected?: boolean }
   */
  async scanForCorrectIndex(identity, maxIndex = 20) {
    try {
      // Import wallet functions directly for key derivation
      const { wallet: walletFunctions } = await import('../../dist/wallet/functions.js');
      const mnemonic = this.mnemonic;

      if (!mnemonic) {
        return { valid: false, error: 'No mnemonic found. Please log in with your wallet first.' };
      }

      // Get on-chain Key 0 to match against
      const onChainKey0 = identity.keys?.find(k => k.id === 0);
      if (!onChainKey0) {
        return { valid: false, error: 'Identity missing Key 0 - cannot determine correct index.' };
      }

      console.log(`[scanForCorrectIndex] Scanning indices 0-${maxIndex} for ${identity.id.substring(0, 12)}...`);

      for (let i = 0; i <= maxIndex; i++) {
        // Derive Key 0 directly using wallet functions (DIP13 path)
        const derivedKeyPath = `m/9'/1'/5'/0'/0'/${i}'/0'`;
        const derivedKey = await walletFunctions.deriveKeyFromSeedWithPath(mnemonic, null, derivedKeyPath, 'testnet');
        const derivedPubKeyHex = derivedKey.public_key?.toLowerCase();

        // Compare with on-chain key
        const matches = await this.compareKeys({ publicKeyHex: derivedPubKeyHex }, onChainKey0);

        if (matches) {
          console.log(`[scanForCorrectIndex] ✅ Found correct index: ${i}`);

          // Update stored identity with correct index
          const updatedIdentity = { ...identity, index: i };
          delete updatedIdentity.needsReDiscovery; // Clear flag
          stateManager.setIdentity(identity.id, updatedIdentity);

          notifications.success(`Found correct index: ${i}. Identity updated.`);
          return { valid: true, index: i, corrected: true };
        }
      }

      console.error(`[scanForCorrectIndex] No matching index found in range 0-${maxIndex}`);
      return {
        valid: false,
        error: `No matching index found (0-${maxIndex}). This identity may have been created with a different mnemonic.`
      };

    } catch (error) {
      console.error(`[scanForCorrectIndex] Error scanning:`, error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Compare derived key with on-chain key (handles both SECP256K1 and HASH160 types)
   *
   * @param {Object} derivedKey - Key from IdentityKeyGenerator { publicKeyHex, ... }
   * @param {Object} onChainKey - Key from identity.keys { id, data, type, ... }
   * @returns {Promise<boolean>} - True if keys match
   */
  async compareKeys(derivedKey, onChainKey) {
    try {
      const derivedPubKeyHex = (derivedKey.publicKeyHex || derivedKey.public_key || '').toLowerCase();

      // Normalize on-chain key data to hex
      let onChainKeyHex = onChainKey.data;
      if (typeof onChainKeyHex !== 'string') {
        if (onChainKeyHex?.type === 'Buffer') {
          onChainKeyHex = Buffer.from(onChainKeyHex.data).toString('hex');
        } else if (Array.isArray(onChainKeyHex)) {
          onChainKeyHex = Buffer.from(onChainKeyHex).toString('hex');
        }
      } else if (/[+/=]/.test(onChainKeyHex) || !/^[0-9a-fA-F]+$/.test(onChainKeyHex)) {
        // Base64 encoded
        onChainKeyHex = Buffer.from(onChainKeyHex, 'base64').toString('hex');
      }
      onChainKeyHex = onChainKeyHex?.toLowerCase();

      // Key type 0 = ECDSA_SECP256K1 (33-byte public key)
      // Key type 1 = ECDSA_HASH160 (20-byte hash of public key)
      if (onChainKey.type === 1) {
        // ECDSA_HASH160 - compute RIPEMD160(SHA256(pubkey))
        const { createHash } = await import('crypto');
        const sha256 = createHash('sha256').update(Buffer.from(derivedPubKeyHex, 'hex')).digest();
        const hash160 = createHash('ripemd160').update(sha256).digest('hex').toLowerCase();
        return hash160 === onChainKeyHex;
      } else {
        // ECDSA_SECP256K1 - direct comparison
        return derivedPubKeyHex === onChainKeyHex;
      }
    } catch (error) {
      console.error('[compareKeys] Error comparing keys:', error);
      return false;
    }
  }

  async handleCreateIdentity() {
    const amountInput = document.getElementById('funding-amount');
    const unitSelect = document.getElementById('unit-selector');
    const labelInput = document.getElementById('identity-label');
    const modal = document.getElementById('create-modal');
    const progress = modal?.querySelector('.modal-progress');
    const progressBar = progress?.querySelector('.progress-fill');
    const progressMessage = progress?.querySelector('.progress-message');

    const amount = parseFloat(amountInput.value);
    const unit = unitSelect.value;

    // Convert to duffs based on unit
    let duffs;
    if (unit === 'dash') {
      duffs = dashToDuffs(amount);
    } else {
      duffs = amount; // Already in duffs
    }

    const label = labelInput.value.trim();

    // Validate
    const validation = validateAmount(amount, true);
    if (!validation.valid) {
      notifications.error(validation.error);
      return;
    }

    // Create operation to track progress
    const operationId = stateManager.addOperation({
      type: 'create',
      identityId: null, // Will be set after creation
      amount: duffs,
      message: 'Starting identity creation...'
    });

    // Show progress
    if (progress) {
      progress.hidden = false;
      progressBar.style.width = '0%';
    }

    // Bind minimize button
    const minimizeBtn = progress?.querySelector('.modal-minimize');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        // Hide modal but keep operation running
        this.hideCreateModal();
        notifications.success('Operation moved to activity panel');
      });
    }

    // Listen for progress events
    const progressHandler = (e) => {
      if (progressBar) progressBar.style.width = `${e.detail.progress}%`;
      if (progressMessage) progressMessage.textContent = e.detail.message;

      // Update operation progress
      stateManager.updateOperation(operationId, {
        progress: e.detail.progress,
        message: e.detail.message
      });
    };
    window.addEventListener('identity-creation-progress', progressHandler);

    try {
      let identity;

      // Check if we can use the real SDK with pre-found UTXOs (modular flow)
      const utxos = stateManager.getState().fundingFlow?.utxos || [];

      // Initialize SDK if we have mnemonic and UTXOs but no SDK instance yet
      if (!this.useMockMode && !this.sdk && this.mnemonic && utxos.length > 0) {
        console.log('🔧 Initializing SDK for identity creation...');
        try {
          // Import SDK from dist - webpack will bundle it
          const sdkModule = await import('../../dist/sdk.js');
          const EvoSDK = sdkModule.EvoSDK || sdkModule.default;
          if (EvoSDK) {
            const sdkOptions = await getNetworkSdkOptions('testnet');
            this.sdk = new EvoSDK(sdkOptions);
            console.log('✅ SDK initialized successfully');
            // Propagate SDK to all components
            this.propagateSDKToComponents(this.sdk, this.mnemonic);
          } else {
            console.warn('⚠️ EvoSDK class not found in browser bundle');
          }
        } catch (sdkError) {
          console.warn('⚠️ Could not load SDK:', sdkError.message);
        }
      }

      const canUseRealSDK = !this.useMockMode && this.sdk && this.mnemonic && utxos.length > 0;

      if (canUseRealSDK) {
        // ========================================================================
        // REAL SDK PATH: createWithUTXO (modular flow)
        //
        // This uses the real SDK with a pre-found UTXO from TransactionFinder.
        // The flow:
        //   1. TransactionBuilder creates asset lock transaction
        //   2. TransactionFinder monitors for InstantLock/ChainLock confirmation
        //   3. Worker (identity-create.js) submits to Platform via DAPI
        //   4. Worker polls getIdentityBalance to confirm creation
        //
        // SDK returns:
        //   - identityId: string (Base58 identity ID)
        //   - balance: number (in CREDITS, not duffs - 1 duff = 1000 credits)
        //   - identityIndex: number (HD derivation index - CRITICAL for signing!)
        //   - publicKeysCount: number (count of generated keys)
        // ========================================================================
        console.log('🚀 Using real SDK with createWithUTXO (modular flow)');
        console.log(`   UTXO: ${utxos[0].txId}:${utxos[0].vout} (${utxos[0].satoshis} duffs)`);

        const result = await this.sdk.identities.createWithUTXO({
          mnemonic: this.mnemonic,
          utxo: utxos[0], // Use the first (latest) UTXO from TransactionFinder
          amount: duffs,
          onProgress: (event) => {
            // Forward progress events to UI
            window.dispatchEvent(new CustomEvent('identity-creation-progress', {
              detail: {
                progress: event.progress,
                message: event.message
              }
            }));
          }
        });

        // Transform SDK result to UI format
        // IMPORTANT: result.balance is in CREDITS (Platform unit), not duffs!
        // The formatBalance() function in identity-transformer.js expects credits.
        // identityIndex is CRITICAL - needed for signing transfer/withdraw operations.
        identity = {
          id: result.identityId,
          // SDK returns balance in CREDITS (from Platform's getIdentityBalance)
          // This is correct - formatBalance() in identity-transformer.js expects credits
          balance: result.balance,
          // SDK returns publicKeysCount (number), not the actual keys
          // For display purposes, we create placeholder key objects based on count
          keys: Array.from({ length: result.publicKeysCount || 2 }, (_, idx) => ({
            id: idx,
            keyType: 'ECDSA_SECP256K1',
            purpose: idx === 0 ? 'AUTHENTICATION' : 'TRANSFER',
            securityLevel: idx === 0 ? 'MASTER' : 'HIGH',
            status: 'active',
            data: null // Actual key data not returned from worker
          })),
          label: label || 'New Identity',
          createdAt: new Date().toISOString(),
          // CRITICAL: Store the HD derivation index for signing operations
          // This index is used to derive the correct private key for transfers/withdrawals
          index: result.identityIndex
        };

        console.log('✅ Identity created via real SDK:', identity.id);
        console.log(`   Balance: ${result.balance} credits, Index: ${result.identityIndex}`);

        // Clear UTXOs from state after use
        stateManager.setFundingUTXOs([]);

      } else {
        // Fall back to mock operations
        console.log('ℹ️  Using mock platform operations');
        if (!canUseRealSDK) {
          console.log('   Reason:', {
            useMockMode: this.useMockMode,
            hasSDK: !!this.sdk,
            hasMnemonic: !!this.mnemonic,
            utxoCount: utxos.length
          });
        }
        identity = await this.platformOps.createIdentity(duffs, label);
      }

      // Update operation with identity ID and mark as completed
      stateManager.updateOperation(operationId, {
        identityId: identity.id,
        status: 'completed',
        result: identity
      });

      // Add to state
      stateManager.setIdentity(identity.id, identity);
      stateManager.selectIdentity(identity.id);

      notifications.success('Identity created successfully!');
      this.hideCreateModal();
    } catch (error) {
      // Mark operation as failed
      stateManager.updateOperation(operationId, {
        status: 'failed',
        error: error.message
      });
      notifications.error(`Failed to create identity: ${error.message}`);
      console.error('❌ Identity creation failed:', error);
    } finally {
      window.removeEventListener('identity-creation-progress', progressHandler);
    }
  }

  initializeKeysModal() {
    const manageKeysBtn = document.getElementById('manage-keys-btn');
    const keysModal = document.getElementById('keys-modal');
    const privateKeyModal = document.getElementById('private-key-modal');
    const addKeyModal = document.getElementById('add-key-modal');

    // Manage Keys button
    if (manageKeysBtn) {
      manageKeysBtn.addEventListener('click', () => this.showKeysModal());
    }

    // Add Key button
    const addKeyBtn = document.getElementById('add-key-btn');
    if (addKeyBtn) {
      addKeyBtn.addEventListener('click', () => this.showAddKeyModal());
    }

    // Keys modal close buttons
    if (keysModal) {
      const closeButtons = keysModal.querySelectorAll('.modal-close');
      closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          keysModal.hidden = true;
        });
      });

      // Close on backdrop click
      const backdrop = keysModal.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', () => {
          keysModal.hidden = true;
        });
      }
    }

    // Private key modal close buttons
    if (privateKeyModal) {
      const closeButtons = privateKeyModal.querySelectorAll('.modal-close');
      closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          privateKeyModal.hidden = true;
        });
      });

      // Close on backdrop click
      const backdrop = privateKeyModal.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', () => {
          privateKeyModal.hidden = true;
        });
      }

      // Copy buttons for private keys
      const copyWifBtn = privateKeyModal.querySelector('[data-copy-private-wif]');
      const copyHexBtn = privateKeyModal.querySelector('[data-copy-private-hex]');

      if (copyWifBtn) {
        copyWifBtn.addEventListener('click', () => {
          const wif = document.getElementById('private-key-wif').textContent;
          navigator.clipboard.writeText(wif).then(() => {
            notifications.success('WIF private key copied to clipboard');
          }).catch(() => {
            notifications.error('Failed to copy');
          });
        });
      }

      if (copyHexBtn) {
        copyHexBtn.addEventListener('click', () => {
          const hex = document.getElementById('private-key-hex').textContent;
          navigator.clipboard.writeText(hex).then(() => {
            notifications.success('Hex private key copied to clipboard');
          }).catch(() => {
            notifications.error('Failed to copy');
          });
        });
      }
    }

    // Add Key modal close buttons
    if (addKeyModal) {
      const closeButtons = addKeyModal.querySelectorAll('.modal-close');
      closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          addKeyModal.hidden = true;
        });
      });

      // Close on backdrop click
      const backdrop = addKeyModal.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', () => {
          addKeyModal.hidden = true;
        });
      }

      // Handle form submission
      const addKeyForm = document.getElementById('add-key-form');
      if (addKeyForm) {
        addKeyForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.handleAddKey();
        });
      }
    }

    // Disable Key modal close buttons
    const disableKeyModal = document.getElementById('disable-key-modal');
    if (disableKeyModal) {
      const closeButtons = disableKeyModal.querySelectorAll('.modal-close');
      closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          disableKeyModal.hidden = true;
          this.keyToDisable = null;
        });
      });

      // Close on backdrop click
      const backdrop = disableKeyModal.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', () => {
          disableKeyModal.hidden = true;
          this.keyToDisable = null;
        });
      }

      // Handle confirm disable button
      const confirmBtn = document.getElementById('confirm-disable-key');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          await this.handleDisableKey();
        });
      }
    }
  }

  showKeysModal() {
    this.closeAllModals();
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const keysModal = document.getElementById('keys-modal');
    const keysList = document.getElementById('keys-list');

    if (!keysModal || !keysList) return;

    // Build table HTML
    const tableRows = identity.keys.map(key => {
      const purpose = formatKeyPurpose(key.purpose);
      const securityLevel = formatSecurityLevel(key.securityLevel);
      const purposeClass = purpose.toLowerCase().includes('auth') ? 'key-purpose-auth' : 'key-purpose-transfer';
      const securityClass = `key-security-${securityLevel.class}`;
      const statusDot = key.status === 'active'
        ? '<span class="key-status-dot key-status-dot-active" aria-label="Active" role="img">●</span>'
        : '<span class="key-status-dot key-status-dot-disabled" aria-label="Disabled" role="img">●</span>';

      // Determine if this key can be disabled (Fix 3.3: explain non-disableable keys)
      const canDisable = key.status === 'active' && this.canDisableKey(identity, key);
      let disableButton = '';
      if (key.status === 'active') {
        if (canDisable) {
          disableButton = `<button class="btn-text btn-danger" data-disable-key="${key.id}">Disable</button>`;
        } else {
          // Get reason why key cannot be disabled
          const reason = this.getDisableBlockReason(identity, key);
          disableButton = `
            <span class="tooltip-wrapper" title="${reason}">
              <button class="btn-text btn-disabled" disabled>Disable</button>
            </span>
          `;
        }
      }

      return `
        <tr data-key-id="${key.id}">
          <td class="keys-modal-id">#${key.id}</td>
          <td class="keys-modal-purpose ${purposeClass}">${purpose}</td>
          <td class="keys-modal-security ${securityClass}">${securityLevel.text}</td>
          <td class="keys-modal-status">${statusDot} ${key.status === 'active' ? 'Active' : 'Disabled'}</td>
          <td class="keys-modal-public-key">
            <div class="public-key-cell">
              <div class="public-key-display">
                <code class="public-key-value" title="${key.data}">${formatPublicKey(key.data, 8)}</code>
                <button class="btn-icon btn-sm copy-key-btn" data-copy="${key.data}" title="Copy full public key">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
              </div>
              <div class="key-actions">
                <button class="btn-text" data-view-private="${key.id}">View Private</button>
                ${disableButton}
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Populate keys list with table
    keysList.innerHTML = `
      <table class="keys-modal-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Purpose</th>
            <th>Security</th>
            <th>Status</th>
            <th>Public Key</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    // Show modal
    keysModal.hidden = false;

    // Bind action buttons
    const viewPrivateBtns = keysList.querySelectorAll('[data-view-private]');
    viewPrivateBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const keyId = parseInt(btn.dataset.viewPrivate);
        const key = identity.keys.find(k => k.id === keyId);
        if (key) this.showPrivateKeyModal(key);
      });
    });

    // Bind disable buttons
    const disableKeyBtns = keysList.querySelectorAll('[data-disable-key]');
    disableKeyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const keyId = parseInt(btn.dataset.disableKey);
        const key = identity.keys.find(k => k.id === keyId);
        if (key) this.showDisableKeyModal(key);
      });
    });

    // Bind copy button for public keys
    const copyKeyBtns = keysList.querySelectorAll('.copy-key-btn');
    copyKeyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          notifications.success('Public key copied to clipboard');
        }).catch(() => {
          notifications.error('Failed to copy');
        });
      });
    });

    // Initialize search functionality
    const searchInput = document.getElementById('keys-search');
    if (searchInput) {
      searchInput.value = '';
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = keysList.querySelectorAll('tbody tr');

        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(query) ? '' : 'none';
        });
      });
    }
  }

  /**
   * Show private key modal for viewing identity private keys
   *
   * This function derives the actual private key using DIP13 derivation if:
   * - A mnemonic is available (user is logged in)
   * - The identity has an index (was created from this wallet, not discovered)
   *
   * For discovered identities or when no mnemonic is available, shows an
   * unavailable message explaining why keys cannot be displayed.
   *
   * @param {Object} key - The key object from identity.keys
   */
  async showPrivateKeyModal(key) {
    this.closeAllModals();
    const modal = document.getElementById('private-key-modal');
    if (!modal) return;

    const modalBody = modal.querySelector('.modal-body');
    if (!modalBody) return;

    // Show modal immediately with loading state
    modal.hidden = false;

    // Get the selected identity to check for index
    const identity = stateManager.getSelectedIdentity();

    // Check prerequisites for deriving private key
    if (!this.mnemonic || typeof this.mnemonic !== 'string' || this.mnemonic.trim() === '') {
      console.error('[ShowPrivateKey] Mnemonic check failed:', {
        mnemonic: this.mnemonic,
        type: typeof this.mnemonic
      });
      this.showPrivateKeyUnavailable(modalBody, key, 'No wallet mnemonic available. Please log in with a mnemonic to view private keys.');
      return;
    }

    if (!identity) {
      this.showPrivateKeyUnavailable(modalBody, key, 'No identity selected.');
      return;
    }

    if (identity.index === null || identity.index === undefined) {
      this.showPrivateKeyUnavailable(modalBody, key,
        'This identity was discovered on-chain but was not created from your wallet. ' +
        'Private keys can only be shown for identities created from your current mnemonic.'
      );
      return;
    }

    // Show loading state
    this.restorePrivateKeyModalLayout(modalBody);
    const wifElement = document.getElementById('private-key-wif');
    const hexElement = document.getElementById('private-key-hex');
    if (wifElement) wifElement.textContent = 'Deriving key...';
    if (hexElement) hexElement.textContent = 'Deriving key...';

    try {
      // Import wallet functions and derive the key
      const { wallet } = await import('../../dist/wallet/functions.js');

      const keyInfo = await wallet.deriveIdentityKey(
        this.mnemonic,
        identity.index,
        key.id,
        'testnet' // TODO: Make network configurable
      );

      // Display the derived keys
      if (wifElement) wifElement.textContent = keyInfo.privateKeyWif;
      if (hexElement) hexElement.textContent = keyInfo.privateKeyHex;

      // Setup copy buttons
      this.setupPrivateKeyCopyButtons(keyInfo);

    } catch (error) {
      console.error('[ShowPrivateKey] Failed to derive key:', {
        error: error.message,
        stack: error.stack,
        hasMnemonic: !!this.mnemonic,
        identityIndex: identity.index,
        keyId: key.id
      });
      this.showPrivateKeyUnavailable(modalBody, key,
        `Failed to derive private key: ${error.message}`
      );
    }
  }

  /**
   * Show unavailable message in private key modal
   *
   * @param {HTMLElement} modalBody - The modal body element
   * @param {Object} key - The key object
   * @param {string} reason - Explanation of why key is unavailable
   */
  showPrivateKeyUnavailable(modalBody, key, reason) {
    modalBody.innerHTML = `
      <div class="private-key-unavailable">
        <div class="unavailable-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="color: var(--color-warning);">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="16" r="1" fill="currentColor"/>
          </svg>
        </div>
        <h3>Private Key Not Available</h3>
        <p class="unavailable-description">
          ${escapeHtml(reason)}
        </p>
        <div class="key-info-box">
          <strong>Key Information:</strong>
          <ul>
            <li><span class="label">Key ID:</span> ${key.id}</li>
            <li><span class="label">Purpose:</span> ${key.purpose}</li>
            <li><span class="label">Security Level:</span> ${key.securityLevel}</li>
          </ul>
        </div>
        <p class="unavailable-note">
          Private keys are derived from your HD wallet mnemonic using DIP13 derivation path:
          <code>m/9'/coin_type'/5'/0'/0'/identityIndex'/${key.id}'</code>
        </p>
      </div>
    `;
  }

  /**
   * Restore the normal private key modal layout (for displaying actual keys)
   *
   * @param {HTMLElement} modalBody - The modal body element
   */
  restorePrivateKeyModalLayout(modalBody) {
    modalBody.innerHTML = `
      <div class="private-key-warning">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;">
          <path d="M12 9v4m0 4h.01M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <strong>Never share your private keys!</strong>
        <p style="margin-top: var(--space-2); font-size: var(--text-sm);">Anyone with access to your private keys can control this identity key.</p>
      </div>

      <div class="private-key-section">
        <label>WIF Format</label>
        <div class="private-key-display">
          <code id="private-key-wif" class="private-key-value">Loading...</code>
          <button class="btn btn-secondary btn-sm" data-copy-private-wif>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
            </svg>
            Copy
          </button>
        </div>
      </div>

      <div class="private-key-section">
        <label>Hex Format</label>
        <div class="private-key-display">
          <code id="private-key-hex" class="private-key-value">Loading...</code>
          <button class="btn btn-secondary btn-sm" data-copy-private-hex>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
            </svg>
            Copy
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Setup copy button event handlers for private key modal
   *
   * @param {Object} keyInfo - The derived key info with privateKeyWif and privateKeyHex
   */
  setupPrivateKeyCopyButtons(keyInfo) {
    const copyWifBtn = document.querySelector('[data-copy-private-wif]');
    const copyHexBtn = document.querySelector('[data-copy-private-hex]');

    if (copyWifBtn) {
      // Remove any existing listeners by cloning
      const newWifBtn = copyWifBtn.cloneNode(true);
      copyWifBtn.parentNode.replaceChild(newWifBtn, copyWifBtn);

      newWifBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(keyInfo.privateKeyWif).then(() => {
          notifications.success('WIF private key copied to clipboard');
        }).catch(() => {
          notifications.error('Failed to copy');
        });
      });
    }

    if (copyHexBtn) {
      // Remove any existing listeners by cloning
      const newHexBtn = copyHexBtn.cloneNode(true);
      copyHexBtn.parentNode.replaceChild(newHexBtn, copyHexBtn);

      newHexBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(keyInfo.privateKeyHex).then(() => {
          notifications.success('Hex private key copied to clipboard');
        }).catch(() => {
          notifications.error('Failed to copy');
        });
      });
    }
  }

  canDisableKey(identity, key) {
    const securityLevel = normalizeSecurityLevel(key.securityLevel);
    const purpose = normalizePurpose(key.purpose);

    // Protection Rule 1: Cannot disable master keys (security level 0)
    if (securityLevel === 0) {
      return false;
    }

    // Protection Rule 2: Cannot disable critical authentication keys (purpose 0, security level 1)
    if (purpose === 0 && securityLevel === 1) {
      return false;
    }

    // Protection Rule 3: Cannot disable if it's the last active transfer key
    if (purpose === 2) { // Transfer key
      const activeTransferKeys = identity.keys.filter(k =>
        normalizePurpose(k.purpose) === 2 && k.status === 'active'
      );
      if (activeTransferKeys.length <= 1) {
        return false;
      }
    }

    // Protection Rule 4: Cannot disable if it's the last active authentication key
    if (purpose === 0) { // Authentication key
      const activeAuthKeys = identity.keys.filter(k =>
        normalizePurpose(k.purpose) === 0 && k.status === 'active'
      );
      if (activeAuthKeys.length <= 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get human-readable reason why a key cannot be disabled (Fix 3.3)
   */
  getDisableBlockReason(identity, key) {
    const securityLevel = normalizeSecurityLevel(key.securityLevel);
    const purpose = normalizePurpose(key.purpose);

    // Master key
    if (securityLevel === 0) {
      return 'Master keys cannot be disabled for security reasons';
    }

    // Critical authentication key
    if (purpose === 0 && securityLevel === 1) {
      return 'Critical authentication keys cannot be disabled';
    }

    // Last transfer key
    if (purpose === 2) {
      const activeTransferKeys = identity.keys.filter(k =>
        normalizePurpose(k.purpose) === 2 && k.status === 'active'
      );
      if (activeTransferKeys.length <= 1) {
        return 'Cannot disable the last active transfer key';
      }
    }

    // Last authentication key
    if (purpose === 0) {
      const activeAuthKeys = identity.keys.filter(k =>
        normalizePurpose(k.purpose) === 0 && k.status === 'active'
      );
      if (activeAuthKeys.length <= 1) {
        return 'Cannot disable the last active authentication key';
      }
    }

    return 'This key is protected and cannot be disabled';
  }

  showDisableKeyModal(key) {
    this.closeAllModals();
    const modal = document.getElementById('disable-key-modal');
    if (!modal) return;

    // Populate key details
    document.getElementById('disable-key-id').textContent = `#${key.id}`;
    document.getElementById('disable-key-purpose').textContent = formatKeyPurpose(key.purpose);
    document.getElementById('disable-key-security').textContent = formatSecurityLevel(key.securityLevel).text;

    // Store key ID for confirmation handler
    this.keyToDisable = key.id;

    // Show modal
    modal.hidden = false;
  }

  async handleDisableKey() {
    const identity = stateManager.getSelectedIdentity();
    if (!identity || this.keyToDisable === null) return;

    const key = identity.keys.find(k => k.id === this.keyToDisable);
    if (!key) return;

    // Double-check protection rules
    if (!this.canDisableKey(identity, key)) {
      notifications.error('This key cannot be disabled due to protection rules');
      return;
    }

    // ========================================================================
    // REAL SDK vs MOCK PATH DECISION
    //
    // Real SDK requirements:
    // - Not in mock mode
    // - SDK is initialized
    // - Mnemonic is available (for key derivation)
    // - Identity has an index (needed for DIP13 key derivation)
    // ========================================================================
    const canUseRealSDK = !this.useMockMode && this.sdk && this.mnemonic && identity.index !== undefined;

    try {
      stateManager.setLoading(true, 'Disabling key...');

      if (canUseRealSDK) {
        // ======================================================================
        // REAL SDK PATH: Use sdk.identities.update() to disable key on-chain
        //
        // The SDK's update() method accepts:
        // - identityId: The identity to update
        // - disablePublicKeyIds: Array of key IDs to disable
        // - privateKeyWif: MUST be the MASTER key (key 0) for identity updates
        //
        // Note: The SDK will reject attempts to disable protected keys:
        // - MASTER keys
        // - CRITICAL + AUTHENTICATION keys
        // - TRANSFER keys
        // The UI's canDisableKey() already prevents these, but SDK enforces too.
        // ======================================================================
        console.log('[DisableKey] Using REAL SDK operation');
        console.log(`  Identity: ${identity.id.substring(0, 8)}... (index: ${identity.index})`);
        console.log(`  Key to disable: #${this.keyToDisable}`);

        // Get MASTER key (key 0) private key - required for identity updates
        const masterKeyWif = await this.platformOps.getPrivateKeyForIdentity(identity.index, 0);
        if (!masterKeyWif) {
          throw new Error('Failed to derive master key for identity update');
        }

        // Execute real disable key operation
        await this.sdk.identities.update({
          identityId: identity.id,
          disablePublicKeyIds: [this.keyToDisable],
          privateKeyWif: masterKeyWif
        });

        console.log('[DisableKey] Key disabled on-chain successfully');

        // Refresh identity from network to get updated keys list
        const wasmIdentity = await this.sdk.identities.get(identity.id);
        if (wasmIdentity) {
          const identityJson = wasmIdentity.toJSON ? wasmIdentity.toJSON() : wasmIdentity;
          const freshIdentity = transformIdentityForUI(identityJson, identity.index);
          const updated = mergeIdentityData(identity, freshIdentity);
          stateManager.setIdentity(identity.id, updated);
        }

      } else {
        // ======================================================================
        // MOCK PATH: Local state update only (no network call)
        //
        // Used when:
        // - Mock mode is enabled (useMockMode = true)
        // - SDK is not initialized
        // - No mnemonic available
        // - Identity has no index (external/imported identity)
        // ======================================================================
        console.log('[DisableKey] Using MOCK operation');
        if (!canUseRealSDK) {
          console.log('   Reason:', {
            useMockMode: this.useMockMode,
            hasSDK: !!this.sdk,
            hasMnemonic: !!this.mnemonic,
            hasIndex: identity.index !== undefined
          });
        }

        // Simulate network delay
        await new Promise(r => setTimeout(r, 1500));

        // Update key status to disabled locally
        const updatedKeys = identity.keys.map(k =>
          k.id === this.keyToDisable ? { ...k, status: 'disabled' } : k
        );

        // Update identity in local state
        stateManager.setIdentity(identity.id, {
          ...identity,
          keys: updatedKeys,
          revision: identity.revision + 1
        });
      }

      // Close modals
      document.getElementById('disable-key-modal').hidden = true;

      notifications.success('Key disabled successfully');

      // Refresh keys modal if it's open
      const keysModal = document.getElementById('keys-modal');
      if (keysModal && !keysModal.hidden) {
        this.showKeysModal();
      }

    } catch (error) {
      console.error('[DisableKey] Error:', error);
      notifications.error(`Failed to disable key: ${error.message}`);
    } finally {
      stateManager.setLoading(false);
      this.keyToDisable = null;
    }
  }

  showAddKeyModal() {
    this.closeAllModals();
    const modal = document.getElementById('add-key-modal');
    if (!modal) return;

    // Reset form
    const form = document.getElementById('add-key-form');
    if (form) form.reset();

    // Show modal
    modal.hidden = false;
  }

  async handleAddKey() {
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const purposeSelect = document.getElementById('key-purpose');
    const securitySelect = document.getElementById('key-security');
    const autoGenerate = document.getElementById('auto-generate');

    const purpose = parseInt(purposeSelect.value);
    const securityLevel = parseInt(securitySelect.value);
    const shouldAutoGenerate = autoGenerate.checked;

    // Validate
    if (isNaN(purpose)) {
      notifications.error('Please select a key purpose');
      return;
    }

    if (isNaN(securityLevel)) {
      notifications.error('Please select a security level');
      return;
    }

    // ========================================================================
    // REAL SDK vs MOCK PATH DECISION
    //
    // Real SDK requirements:
    // - Not in mock mode
    // - SDK is initialized
    // - Mnemonic is available (for key derivation)
    // - Identity has an index (needed for DIP13 key derivation)
    // ========================================================================
    const canUseRealSDK = !this.useMockMode && this.sdk && this.mnemonic && identity.index !== undefined;

    // Purpose and security level mappings (numeric to string for SDK)
    const PURPOSE_MAP = {
      0: 'AUTHENTICATION',
      2: 'TRANSFER',
      3: 'ENCRYPTION',
      4: 'DECRYPTION',
      5: 'SYSTEM',
      6: 'VOTING'
    };
    const SECURITY_MAP = {
      0: 'MASTER',
      1: 'CRITICAL',
      2: 'HIGH',
      3: 'MEDIUM'
    };

    try {
      stateManager.setLoading(true, 'Adding key...');

      if (canUseRealSDK) {
        // ======================================================================
        // REAL SDK PATH: Use sdk.identities.update() to add key on-chain
        //
        // The SDK's update() method accepts:
        // - identityId: The identity to update
        // - addPublicKeys: Array of key objects with:
        //   - keyType: 'ECDSA_SECP256K1' (or other supported types)
        //   - purpose: 'AUTHENTICATION', 'TRANSFER', etc.
        //   - securityLevel: 'MASTER', 'HIGH', 'CRITICAL', 'MEDIUM'
        //   - data: Base64-encoded 33-byte compressed public key
        // - privateKeyWif: MUST be the MASTER key (key 0) for identity updates
        //
        // Key generation:
        // - We derive a new key at DIP13 path using the next available key index
        // - The identity's existing keys tell us what index to use next
        // ======================================================================
        console.log('[AddKey] Using REAL SDK operation');
        console.log(`  Identity: ${identity.id.substring(0, 8)}... (index: ${identity.index})`);
        console.log(`  Purpose: ${PURPOSE_MAP[purpose]} (${purpose})`);
        console.log(`  Security Level: ${SECURITY_MAP[securityLevel]} (${securityLevel})`);

        // Get MASTER key (key 0) private key - required for identity updates
        const masterKeyWif = await this.platformOps.getPrivateKeyForIdentity(identity.index, 0);
        if (!masterKeyWif) {
          throw new Error('Failed to derive master key for identity update');
        }

        // Generate a new key for the identity
        // Find the next available key index (highest existing key ID + 1)
        const existingKeyIds = identity.keys.map(k => k.id);
        const nextKeyIndex = existingKeyIds.length > 0 ? Math.max(...existingKeyIds) + 1 : 0;

        console.log(`  Next key index: ${nextKeyIndex}`);

        // Derive a new key at the next available index using DIP13
        // DIP13 path: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
        const { wallet: walletFunctions } = await import('../../dist/wallet/functions.js');

        const coinType = 1; // testnet (would be 5 for mainnet)
        const path = `m/9'/${coinType}'/5'/0'/0'/${identity.index}'/${nextKeyIndex}'`;

        console.log(`  Deriving key at path: ${path}`);

        const childKey = await walletFunctions.deriveKeyFromSeedWithPath(
          this.mnemonic,
          null, // no passphrase
          path,
          'testnet'
        );

        // Get the public key (33-byte compressed format) and private key hex
        const publicKeyHex = childKey.public_key;
        const privateKeyHex = childKey.private_key_hex;

        // Convert hex public key to base64 for SDK
        // The SDK expects base64-encoded public key data
        const publicKeyBytes = new Uint8Array(publicKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));

        console.log(`  Generated public key: ${publicKeyHex.substring(0, 20)}...`);
        console.log(`  Public key (base64): ${publicKeyBase64.substring(0, 20)}...`);

        // Build the key object for the SDK
        // IMPORTANT: For ECDSA_SECP256K1 keys, we must include the private key hex
        // because each key must be self-signed to prove ownership of the private key
        const newKeyForSDK = {
          keyType: 'ECDSA_SECP256K1',
          purpose: PURPOSE_MAP[purpose],
          securityLevel: SECURITY_MAP[securityLevel],
          data: publicKeyBase64,
          privateKeyHex: privateKeyHex  // Required for self-signing
        };

        console.log(`  Adding key:`, newKeyForSDK);

        // Execute real add key operation
        await this.sdk.identities.update({
          identityId: identity.id,
          addPublicKeys: [newKeyForSDK],
          privateKeyWif: masterKeyWif
        });

        console.log('[AddKey] Key added on-chain successfully');

        // Refresh identity from network to get updated keys list
        const wasmIdentity = await this.sdk.identities.get(identity.id);
        if (wasmIdentity) {
          const identityJson = wasmIdentity.toJSON ? wasmIdentity.toJSON() : wasmIdentity;
          const freshIdentity = transformIdentityForUI(identityJson, identity.index);
          const updated = mergeIdentityData(identity, freshIdentity);
          stateManager.setIdentity(identity.id, updated);
        }

      } else {
        // ======================================================================
        // MOCK PATH: Local state update only (no network call)
        //
        // Used when:
        // - Mock mode is enabled (useMockMode = true)
        // - SDK is not initialized
        // - No mnemonic available
        // - Identity has no index (external/imported identity)
        // ======================================================================
        console.log('[AddKey] Using MOCK operation');
        if (!canUseRealSDK) {
          console.log('   Reason:', {
            useMockMode: this.useMockMode,
            hasSDK: !!this.sdk,
            hasMnemonic: !!this.mnemonic,
            hasIndex: identity.index !== undefined
          });
        }

        // Simulate network delay
        await new Promise(r => setTimeout(r, 1500));

        // Generate mock key data
        const newKeyId = identity.keys.length;
        const mockPublicKey = `mock_public_key_${Date.now()}_${newKeyId}`;

        // Create new key object
        const newKey = {
          id: newKeyId,
          purpose,
          securityLevel,
          data: mockPublicKey,
          status: 'active',
          type: 0 // ECDSA_SECP256K1
        };

        // Add key to identity
        const updatedKeys = [...identity.keys, newKey];
        stateManager.setIdentity(identity.id, {
          ...identity,
          keys: updatedKeys,
          revision: identity.revision + 1
        });
      }

      // Show success notification (modal is closed in finally block)
      notifications.success('Key added successfully!');

      // Refresh keys modal if it's open
      const keysModal = document.getElementById('keys-modal');
      if (keysModal && !keysModal.hidden) {
        this.showKeysModal();
      }

    } catch (error) {
      console.error('[AddKey] Error:', error);
      console.error('[AddKey] Error message:', error.message);
      console.error('[AddKey] Error stack:', error.stack);
      if (error.cause) {
        console.error('[AddKey] Error cause:', error.cause);
      }
      notifications.error(`Failed to add key: ${error.message}`);
    } finally {
      // Always close the modal (success or error) and reset loading state
      document.getElementById('add-key-modal').hidden = true;
      stateManager.setLoading(false);
    }
  }

  showWithdrawModal() {
    this.closeAllModals();
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('withdraw-modal');
    if (!modal) return;

    // Update balance help text - balance is stored in CREDITS
    const balance = formatBalance(identity.balance);
    const balanceHelp = document.getElementById('withdraw-balance-help');
    if (balanceHelp) {
      balanceHelp.textContent = `Available: ${balance.displayDash} (${balance.displayCredits})`;
    }

    // Show modal
    modal.hidden = false;

    // Bind event handlers (only once)
    const form = document.getElementById('withdraw-form');
    const amountInput = document.getElementById('withdraw-amount');
    const conversionDisplay = document.getElementById('withdraw-conversion');
    const closeButtons = modal.querySelectorAll('.modal-close');

    if (modal.dataset.listenersInitialized !== 'true') {
    // Real-time conversion
    const updateConversion = () => {
      const dash = parseFloat(amountInput.value) || 0;
      const credits = dash * 100000000000;
      conversionDisplay.textContent = `≈ ${credits.toLocaleString()} credits`;
    };
    amountInput.addEventListener('input', updateConversion);

    // Close handlers
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.hidden = true;
      });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const addressInput = document.getElementById('withdraw-address');
      const address = addressInput.value;
      const dash = parseFloat(amountInput.value);
      const duffs = dashToDuffs(dash);
      const credits = duffsToCredits(duffs);

      // Validate
      const addressValidation = validateAddress(address);
      if (!addressValidation.valid) {
        notifications.error(addressValidation.error);
        return;
      }

      if (!dash || dash < 0.0005) {
        notifications.error('Minimum amount is 0.0005 DASH (500,000 credits)');
        return;
      }

      if (credits > identity.balance) {
        notifications.error('Insufficient balance');
        return;
      }

      // Execute withdrawal
      try {
        stateManager.setLoading(true, 'Processing withdrawal...');
        const result = await this.platformOps.withdraw(identity.id, address, duffs);

        // Update state
        stateManager.setIdentity(identity.id, {
          ...identity,
          balance: identity.balance - credits
        });
        stateManager.addTransaction(result);

        const creditsDisplay = (dash * 100000000000).toLocaleString();
        notifications.success(`Withdrawal successful! Sent ${dash} DASH (${creditsDisplay} credits)`);
      } catch (error) {
        notifications.error(`Withdrawal failed: ${error.message}`);
      } finally {
        // Always close modal (success or error) and reset loading state
        modal.hidden = true;
        stateManager.setLoading(false);
      }
    });

    modal.dataset.listenersInitialized = 'true';
    } // end listenersInitialized guard
  }

  showTransferModal() {
    this.closeAllModals();
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('transfer-modal');
    if (!modal) return;

    // Check if already initialized to prevent duplicate handlers
    if (modal.dataset.initialized === 'true') {
      // Just show the modal and refresh data
      modal.hidden = false;

      // Update recipient datalist
      const otherIdentities = stateManager.getAllIdentities()
        .filter(id => id.id !== identity.id);
      const recipientDatalist = document.getElementById('transfer-recipient-list');
      if (recipientDatalist) {
        recipientDatalist.innerHTML = otherIdentities.map(id => `
          <option value="${escapeHtml(id.id)}">${escapeHtml(id.label || formatIdentityId(id.id))}</option>
        `).join('');
      }

      // Update balance - balance is stored in CREDITS
      const balance = formatBalance(identity.balance);
      const balanceHelp = document.getElementById('transfer-balance-help');
      if (balanceHelp) {
        balanceHelp.textContent = `Available: ${balance.displayDash} (${balance.displayCredits})`;
      }

      return;
    }

    // Mark as initialized
    modal.dataset.initialized = 'true';

    // Populate recipient datalist
    const otherIdentities = stateManager.getAllIdentities()
      .filter(id => id.id !== identity.id);
    const recipientDatalist = document.getElementById('transfer-recipient-list');
    if (recipientDatalist) {
      recipientDatalist.innerHTML = otherIdentities.map(id => `
        <option value="${id.id}">${id.label || formatIdentityId(id.id)}</option>
      `).join('');
    }

    // Update balance help text - balance is stored in CREDITS
    const balance = formatBalance(identity.balance);
    const balanceHelp = document.getElementById('transfer-balance-help');
    if (balanceHelp) {
      balanceHelp.textContent = `Available: ${balance.displayDash} (${balance.displayCredits})`;
    }

    // Get elements
    const recipientInput = document.getElementById('transfer-recipient');
    const recipientValidation = document.getElementById('transfer-recipient-validation');
    const form = document.getElementById('transfer-form');
    const amountInput = document.getElementById('transfer-amount');
    const conversionDisplay = document.getElementById('transfer-conversion');
    const closeButtons = modal.querySelectorAll('.modal-close');

    // Real-time validation for recipient input
    if (recipientInput) {
      recipientInput.addEventListener('input', () => {
        const identityId = recipientInput.value.trim();

        if (!identityId) {
          recipientValidation.textContent = 'Select from your identities or enter a custom 44-character identity ID';
          recipientValidation.style.color = '';
          return;
        }

        // Check if it's a valid identity ID
        const validation = validateIdentityId(identityId);
        if (validation.valid) {
          recipientValidation.textContent = '✓ Valid identity ID format';
          recipientValidation.style.color = '#10b981';
        } else {
          recipientValidation.textContent = validation.error;
          recipientValidation.style.color = '#ef4444';
        }
      });
    }

    // Real-time conversion
    const updateConversion = () => {
      const dash = parseFloat(amountInput.value) || 0;
      const credits = dash * 100000000000;
      conversionDisplay.textContent = `≈ ${credits.toLocaleString()} credits`;
    };
    amountInput.addEventListener('input', updateConversion);

    // Close handlers
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.hidden = true;
      });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Get recipient ID from combo box input
      const recipientId = recipientInput.value.trim();

      // Validate recipient ID
      if (!recipientId) {
        notifications.error('Please select or enter a recipient identity ID');
        return;
      }

      const validation = validateIdentityId(recipientId);
      if (!validation.valid) {
        notifications.error(validation.error);
        return;
      }

      // Check if not sending to self
      if (recipientId === identity.id) {
        notifications.error('Cannot transfer to yourself');
        return;
      }

      const dash = parseFloat(amountInput.value);
      const duffs = dashToDuffs(dash);
      const credits = duffsToCredits(duffs);

      // Validate amount
      if (!dash || dash < 0.0005) {
        notifications.error('Minimum amount is 0.0005 DASH (500,000 credits)');
        return;
      }

      if (credits > identity.balance) {
        notifications.error('Insufficient balance');
        return;
      }

      // Execute transfer
      try {
        stateManager.setLoading(true, 'Processing transfer...');
        const result = await this.platformOps.transfer(identity.id, recipientId, duffs);

        // Update sender identity
        stateManager.setIdentity(identity.id, {
          ...identity,
          balance: identity.balance - credits
        });

        // Update recipient identity if it exists locally
        const recipient = stateManager.getState().identities.get(recipientId);
        if (recipient) {
          stateManager.setIdentity(recipientId, {
            ...recipient,
            balance: recipient.balance + credits
          });
        }

        stateManager.addTransaction(result);

        const creditsDisplay = (dash * 100000000000).toLocaleString();
        const recipientLabel = recipient ? (recipient.label || formatIdentityId(recipientId)) : formatIdentityId(recipientId);
        const txType = result.isRealTransaction ? '(Real TX)' : '(Mock)';
        notifications.success(`Transfer successful! Sent ${dash} DASH (${creditsDisplay} credits) to ${recipientLabel} ${txType}`);
      } catch (error) {
        notifications.error(`Transfer failed: ${error.message}`);
      } finally {
        // Always close modal (success or error) and reset loading state
        modal.hidden = true;
        stateManager.setLoading(false);
      }
    });

    // Show modal
    modal.hidden = false;
  }

  showRegisterNameModal() {
    this.closeAllModals();
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('register-name-modal');
    if (!modal) return;

    // Show modal
    modal.hidden = false;

    // Bind event handlers (only once)
    const form = document.getElementById('register-name-form');
    const nameInput = document.getElementById('dpns-name');
    const liveNameType = document.getElementById('live-name-type');
    const closeButtons = modal.querySelectorAll('.modal-close');

    if (modal.dataset.listenersInitialized !== 'true') {
    // Helper: Convert to homograph-safe (o→0, i/l→1)
    const convertToHomographSafe = (input) => {
      return input.toLowerCase()
        .replace(/o/g, '0')
        .replace(/i/g, '1')
        .replace(/l/g, '1');
    };

    // Name availability checker with debouncing
    let availabilityTimeout = null;
    let lastCheckedName = '';

    const checkNameAvailability = async (name) => {
      if (!name || name.length < 3) return;

      const fullName = `${name}.dash`;

      // Check if already taken in mock data
      const allIdentities = stateManager.getAllIdentities();
      const isTaken = allIdentities.some(id =>
        id.dpnsNames && id.dpnsNames.includes(fullName)
      );

      const availabilityDisplay = document.getElementById('name-availability-status');
      if (availabilityDisplay) {
        if (isTaken) {
          availabilityDisplay.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><strong>Taken</strong> - This name is already registered';
          availabilityDisplay.style.color = 'var(--error)';
          availabilityDisplay.style.background = 'rgba(239, 68, 68, 0.1)';
        } else {
          availabilityDisplay.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>Available</strong> - This name is available for registration';
          availabilityDisplay.style.color = 'var(--success)';
          availabilityDisplay.style.background = 'rgba(16, 185, 129, 0.1)';
        }
      }
    };

    // Fix 3.4: Get submit button to enable/disable based on input validity
    const submitBtn = document.getElementById('register-name-submit');

    // Real-time premium/regular name detection + availability checking + normalization preview
    if (nameInput && liveNameType) {
      nameInput.addEventListener('input', () => {
        const name = nameInput.value.trim();
        const normalized = convertToHomographSafe(name);

        // Fix 3.4: Enable/disable submit button based on name validity
        const isValid = name.length >= 3 && /^[a-zA-Z0-9-]+$/.test(name);
        if (submitBtn) {
          submitBtn.disabled = !isValid;
        }

        // Show normalization preview if name differs from normalized
        const normalizationPreview = document.getElementById('normalization-preview');
        if (normalizationPreview && name && name !== normalized) {
          normalizationPreview.innerHTML = `
            <span style="color: var(--text-secondary);">Normalized: </span>
            <span style="color: var(--dash-blue); font-family: var(--font-mono); font-weight: var(--font-semibold);">"${escapeHtml(name)}" → "${escapeHtml(normalized)}"</span>
            <span style="color: var(--text-muted); font-size: var(--text-xs); margin-left: var(--space-2);">(o→0, i/l→1)</span>
          `;
          normalizationPreview.style.display = 'block';
        } else if (normalizationPreview) {
          normalizationPreview.style.display = 'none';
        }

        // Contested if: 3-19 chars AND only [a-z01-]
        const isContested = normalized.length >= 3 && normalized.length <= 19 &&
          /^[a-z01-]+$/.test(normalized);

        if (name.length < 3) {
          liveNameType.innerHTML = '';
        } else if (isContested) {
          liveNameType.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/><path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><strong>Premium Name</strong> - Requires voting (~0.2 DASH, 2 weeks)';
          liveNameType.style.color = 'var(--warning)';
          liveNameType.style.background = 'rgba(245, 158, 11, 0.1)';
        } else {
          liveNameType.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>Regular Name</strong> - Instant registration (~0.002 DASH)';
          liveNameType.style.color = 'var(--success)';
          liveNameType.style.background = 'rgba(16, 185, 129, 0.1)';
        }

        // Debounced availability check
        if (availabilityTimeout) {
          clearTimeout(availabilityTimeout);
        }

        if (name.length >= 3 && name !== lastCheckedName) {
          availabilityTimeout = setTimeout(async () => {
            lastCheckedName = name;
            await checkNameAvailability(name);
          }, 500); // 500ms debounce
        }
      });
    }

    // Close handlers
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.hidden = true;
      });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = nameInput.value.trim().toLowerCase();
      const fullName = `${name}.dash`;

      // Validate name format
      if (!/^[a-z0-9-]+$/.test(name)) {
        notifications.error('Name must contain only lowercase letters, numbers, and hyphens');
        return;
      }

      if (name.length < 3 || name.length > 63) {
        notifications.error('Name must be 3-63 characters long');
        return;
      }

      // Check if name already registered to this identity
      if (identity.dpnsNames && identity.dpnsNames.includes(fullName)) {
        notifications.error('You already own this name');
        return;
      }

      // Register name
      // ========================================================================
      // DUAL-MODE PATTERN: Check if we can use the real SDK
      // Requirements:
      // - Not in mock mode
      // - SDK is initialized
      // - Mnemonic is available (for key derivation)
      // - Identity has a valid index (will be auto-recovered if missing/wrong)
      // ========================================================================
      let canUseRealSDK = !this.useMockMode && this.sdk && this.mnemonic;

      // Create operation to track progress (for real SDK operations)
      let operationId = null;
      if (canUseRealSDK) {
        operationId = stateManager.addOperation({
          type: 'dpns-register',
          identityId: identity.id,
          name: fullName,
          message: 'Starting DPNS registration...'
        });
        console.log('[DPNS] Created operation:', operationId);
        this.showOperationProgressModal(operationId);
      }

      try {
        stateManager.setLoading(true, 'Registering name...');

        if (canUseRealSDK) {
          // ======================================================================
          // REAL SDK PATH: Register name on-chain via sdk.dpns.registerName()
          // ======================================================================
          console.log('[DPNS] Using REAL SDK for name registration');

          // Get SDK instance (use the already-connected instance)
          const sdk = this.sdk;
          if (!sdk) {
            throw new Error(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `  SDK Not Ready\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `The Dash Platform SDK is still initializing.\n\n` +
              `How to Fix:\n` +
              `1. Wait for the loading indicator to complete\n` +
              `2. Check the console for connection errors\n` +
              `3. Refresh the page if it takes too long\n\n` +
              `If this persists, the testnet may be unavailable.`
            );
          }

          // ======================================================================
          // AUTO-RECOVERY: Ensure identity has valid index before proceeding
          // This prevents cryptic WASM crashes by validating/recovering the index
          // ======================================================================
          stateManager.updateOperation(operationId, {
            progress: 5,
            message: 'Validating identity index...'
          });

          const indexResult = await this.ensureIdentityIndex(identity);
          if (!indexResult.valid) {
            throw new Error(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `  Identity Index Error\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `Identity: ${identity.id.substring(0, 16)}...\n` +
              `Error: ${indexResult.error}\n\n` +
              `Could not find a valid HD derivation index for this\n` +
              `identity. Without the correct index, private keys\n` +
              `cannot be derived to sign transactions.\n\n` +
              `Possible Causes:\n` +
              `• Identity was created with a different mnemonic\n` +
              `• Wallet data became corrupted\n\n` +
              `How to Fix:\n` +
              `1. Clear localStorage and reconnect your wallet\n` +
              `2. Use a different identity that was created\n` +
              `   with this wallet's mnemonic`
            );
          }

          // If index was corrected, reload the identity from state
          if (indexResult.corrected) {
            identity = stateManager.getIdentity(identity.id);
            console.log(`[DPNS] Identity index was corrected to ${indexResult.index}`);
          }

          // Update progress: checking availability
          stateManager.updateOperation(operationId, {
            progress: 10,
            message: 'Checking name availability...'
          });

          // Check name availability on network first
          const isAvailable = await sdk.dpns.isNameAvailable(name);
          if (!isAvailable) {
            throw new Error(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `  Name Unavailable\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `The name "${name}.dash" is already registered.\n\n` +
              `Suggestions:\n` +
              `• Try a different name with numbers or underscores\n` +
              `• Check the Name Resolver to see who owns it\n` +
              `• Consider using a unique prefix/suffix`
            );
          }

          // Update progress: deriving keys
          stateManager.updateOperation(operationId, {
            progress: 20,
            message: 'Preparing transaction...'
          });

          // Derive private key from mnemonic using identity's HD index
          const { IdentityKeyGenerator } = await import('../../dist/identities/coordination/identity-key-generator.js');
          const keyGenerator = new IdentityKeyGenerator();
          const mnemonic = this.mnemonic;
          if (!mnemonic) {
            throw new Error(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `  Authentication Required\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `No wallet mnemonic found in current session.\n\n` +
              `DPNS registration requires your wallet's private keys\n` +
              `to sign the transaction.\n\n` +
              `How to Fix:\n` +
              `1. Click "Connect Wallet" in the sidebar\n` +
              `2. Enter your 12-word recovery phrase\n` +
              `3. Wait for identity discovery to complete\n` +
              `4. Then try registering again`
            );
          }

          const keys = await keyGenerator.generateFromMnemonic(mnemonic, identity.index, 'testnet');
          // Use Key 1 (AUTHENTICATION/HIGH) - DPNS requires CRITICAL or HIGH security level, not MASTER
          const privateKeyWif = keys[1].privateKeyWif;

          // ========================================================================
          // KEY VALIDATION: Verify derived key matches on-chain key before signing
          //
          // This prevents cryptic WASM crashes ("RuntimeError: unreachable") when
          // the private key doesn't match the identity's public key.
          // ========================================================================
          console.log('[DPNS] Validating derived key matches on-chain key...');
          console.log(`  Identity index: ${identity.index}`);
          console.log(`  Using key ID: 1 (HIGH security)`);

          // Get on-chain public key for Key 1
          const onChainKey1 = identity.keys?.find(k => k.id === 1);
          if (!onChainKey1) {
            throw new Error(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `  Missing Key Error\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `Identity: ${identity.id.substring(0, 16)}...\n` +
              `Missing: Key 1 (HIGH security level)\n\n` +
              `DPNS registration requires Key 1, but this identity\n` +
              `only has ${identity.keys?.length || 0} key(s).\n\n` +
              `How to Fix:\n` +
              `1. Add a key to this identity via the Keys panel\n` +
              `2. Or use an identity with at least 2 keys\n\n` +
              `Note: Standard identities have 4 keys (0-3).`
            );
          }

          // Derive public key from the WIF to compare with on-chain key
          // This uses the same wallet functions as IdentityKeyGenerator
          const { wallet: walletFunctions } = await import('../../dist/wallet/functions.js');
          const derivedKeyPath = `m/9'/1'/5'/0'/0'/${identity.index}'/1'`;
          const derivedKey = await walletFunctions.deriveKeyFromSeedWithPath(mnemonic, null, derivedKeyPath, 'testnet');
          const derivedPublicKeyHex = derivedKey.public_key.toLowerCase();

          // Compare derived key with on-chain key using shared compareKeys()
          const keysMatch = await this.compareKeys({ publicKeyHex: derivedPublicKeyHex }, onChainKey1);

          if (!keysMatch) {
            console.error('[DPNS] KEY MISMATCH DETECTED!');
            console.error(`  Derived public key: ${derivedPublicKeyHex?.substring(0, 40)}...`);
            console.error(`  On-chain key type:  ${onChainKey1.type} (${onChainKey1.type === 0 ? 'SECP256K1' : 'HASH160'})`);
            console.error(`  Identity index:     ${identity.index}`);

            // Enhanced error message with actionable guidance
            const keyTypeLabel = onChainKey1.type === 0 ? 'SECP256K1 (33-byte)' : 'HASH160 (20-byte)';
            throw new Error(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `  Key Mismatch Error\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `Identity: ${identity.id.substring(0, 16)}...\n` +
              `Stored Index: ${identity.index ?? 'MISSING'}\n` +
              `Key Type: ${keyTypeLabel}\n\n` +
              `The private key derived from your mnemonic does not\n` +
              `match the public key stored on-chain for this identity.\n\n` +
              `Possible Causes:\n` +
              `• Identity was created with a different mnemonic\n` +
              `• Identity index was incorrectly stored\n` +
              `• localStorage data became corrupted\n\n` +
              `How to Fix:\n` +
              `1. Clear localStorage and reconnect your wallet\n` +
              `2. Let identity discovery find the correct index\n` +
              `3. If issue persists, verify your mnemonic phrase\n\n` +
              `Run diagnostic: node scripts/diagnose-identity-index.mjs ${identity.id}`
            );
          }
          console.log('[DPNS] ✅ Key validation passed - derived key matches on-chain key');

          // Update progress: submitting preorder
          stateManager.updateOperation(operationId, {
            progress: 30,
            message: 'Submitting preorder transaction...'
          });

          // Register name on-chain (requires 2 transactions: preorder + registration)
          console.log('[DPNS] Calling sdk.dpns.registerName with 300s timeout');
          const result = await sdk.dpns.registerName({
            label: name,
            identityId: identity.id,
            publicKeyId: 1, // Key 1 = HIGH security level (required for DPNS registration)
            privateKeyWif: privateKeyWif,
            timeoutSeconds: 300, // 5 minute timeout for 2 transactions (preorder + registration)
            onPreorder: () => {
              console.log('[DPNS] Preorder callback triggered');
              stateManager.updateOperation(operationId, {
                progress: 60,
                message: 'Preorder confirmed, submitting registration...'
              });
            }
          });
          console.log('[DPNS] Registration completed:', result);

          // Update progress: finalizing
          stateManager.updateOperation(operationId, {
            progress: 90,
            message: 'Updating local state...'
          });

          // Update local state with confirmed registration
          const updatedNames = [...(identity.dpnsNames || []), result.fullDomainName];
          stateManager.setIdentity(identity.id, {
            ...identity,
            dpnsNames: updatedNames
          });

          // Refresh identity to update balance (registration costs credits)
          await this.refreshIdentity(identity.id);

          // Mark operation as completed
          stateManager.updateOperation(operationId, {
            status: 'completed',
            progress: 100,
            message: 'Name registered successfully!',
            result
          });

          notifications.success(`Name registered: ${result.fullDomainName}`);

        } else {
          // ======================================================================
          // MOCK FALLBACK PATH: Use mock platform operations
          //
          // This path is used when:
          // - Mock mode is enabled (useMockMode = true)
          // - SDK is not initialized
          // - No mnemonic available
          // - Identity has no index (external/imported identity)
          // ======================================================================
          console.log('[DPNS] Using MOCK mode for name registration');
          if (!canUseRealSDK) {
            console.log('   Reason:', {
              useMockMode: this.useMockMode,
              hasSDK: !!this.sdk,
              hasMnemonic: !!this.mnemonic,
              hasIdentityIndex: identity.index !== undefined
            });
          }

          // Simple availability check against local state
          const allIdentities = stateManager.getAllIdentities();
          const nameTaken = allIdentities.some(id =>
            id.dpnsNames && id.dpnsNames.some(n => n.toLowerCase() === fullName.toLowerCase())
          );
          if (nameTaken) {
            throw new Error(`Name "${fullName}" is already taken`);
          }

          // Use mock registration
          const result = await this.platformOps.registerName(identity.id, name);

          // Note: Mock registerName already updates stateManager, so we just notify
          notifications.success(`Registered ${result.fullDomainName} (Mock)`);
        }

      } catch (error) {
        // Mark operation as failed (for real SDK operations)
        if (operationId) {
          stateManager.updateOperation(operationId, {
            status: 'failed',
            error: error.message
          });
          console.error('[DPNS] Operation failed:', error);
        }
        notifications.error(`Registration failed: ${error.message}`);
      } finally {
        // Always close modal (success or error) and reset loading state
        modal.hidden = true;
        stateManager.setLoading(false);
      }
    });

    modal.dataset.listenersInitialized = 'true';
    } // end listenersInitialized guard
  }

  showRenameIdentityModal(identityId) {
    this.closeAllModals();
    const identity = stateManager.getState().identities.get(identityId);
    if (!identity) return;

    const modal = document.getElementById('rename-identity-modal');
    if (!modal) return;

    // Store the identity ID being renamed
    this.identityBeingRenamed = identityId;
    this.selectedDpnsName = null; // Track selected DPNS name
    this.dpnsSearchTerm = ''; // For filtering DPNS names
    this.dpnsShowAll = false; // For pagination
    this.DPNS_PAGE_SIZE = 10; // Number of names to show initially

    // Get modal elements
    const customLabelInput = document.getElementById('custom-identity-label');
    const dpnsNamesSection = document.getElementById('dpns-names-section');
    const dpnsNameOptions = document.getElementById('dpns-name-options');
    const form = document.getElementById('rename-identity-form');
    const closeButtons = modal.querySelectorAll('.modal-close');

    // Fix 2.5: Pre-fill with custom label, or first DPNS name if no custom label
    if (identity.label) {
      customLabelInput.value = identity.label;
    } else if (identity.dpnsNames && identity.dpnsNames.length > 0) {
      customLabelInput.value = identity.dpnsNames[0];
    } else {
      customLabelInput.value = '';
    }

    // Populate DPNS names section with search and pagination
    if (identity.dpnsNames && identity.dpnsNames.length > 0) {
      dpnsNamesSection.hidden = false;
      this.renderDpnsNameOptions(identity.dpnsNames, customLabelInput);
    } else {
      dpnsNamesSection.hidden = true;
    }

    // Update preview with current value
    this.updateRenamePreview();

    // Real-time preview updates on input change
    const inputHandler = () => this.updateRenamePreview();
    customLabelInput.removeEventListener('input', this.currentRenameInputHandler);
    this.currentRenameInputHandler = inputHandler;
    customLabelInput.addEventListener('input', inputHandler);

    // Close handlers
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.hidden = true;
        this.identityBeingRenamed = null;
        this.selectedDpnsName = null;
      });
    });

    // Form submission
    const submitHandler = async (e) => {
      e.preventDefault();
      await this.handleRenameIdentity();
    };

    // Remove old listener if exists, add new one
    form.removeEventListener('submit', this.currentRenameSubmitHandler);
    this.currentRenameSubmitHandler = submitHandler;
    form.addEventListener('submit', submitHandler);

    // Show modal
    modal.hidden = false;
  }

  updateRenamePreview() {
    const customLabelInput = document.getElementById('custom-identity-label');
    const previewName = document.getElementById('rename-preview-name');

    if (!previewName) return;

    let displayName;
    const customLabel = customLabelInput.value.trim();

    if (customLabel) {
      // Custom label has priority
      displayName = customLabel;
    } else if (this.selectedDpnsName) {
      // DPNS name selected
      displayName = this.selectedDpnsName;
    } else {
      // Nothing selected
      const identity = stateManager.getState().identities.get(this.identityBeingRenamed);
      if (identity && identity.dpnsNames && identity.dpnsNames.length > 0) {
        displayName = identity.dpnsNames[0];
      } else {
        displayName = 'Unnamed Identity';
      }
    }

    previewName.textContent = displayName;
  }

  async handleRenameIdentity() {
    const identity = stateManager.getState().identities.get(this.identityBeingRenamed);
    if (!identity) return;

    const customLabelInput = document.getElementById('custom-identity-label');
    const modal = document.getElementById('rename-identity-modal');

    // Determine the new label
    let newLabel = null;
    const customLabel = customLabelInput.value.trim();

    if (customLabel) {
      // Custom label takes priority
      newLabel = customLabel;
    } else if (this.selectedDpnsName) {
      // DPNS name selected
      newLabel = this.selectedDpnsName;
    }

    // Validate custom label if provided
    if (customLabel && customLabel.length > 50) {
      notifications.error('Custom label must be 50 characters or less');
      return;
    }

    // Update the identity label in state
    stateManager.updateIdentityLabel(this.identityBeingRenamed, newLabel);

    // Close modal
    modal.hidden = true;
    this.identityBeingRenamed = null;
    this.selectedDpnsName = null;

    // Show success notification
    const labelText = newLabel || 'default name';
    notifications.success(`Identity name updated to: ${labelText}`);
  }

  /**
   * Render DPNS name options with search and pagination
   * Fix 2.4: Add search/pagination for large DPNS name lists
   */
  renderDpnsNameOptions(dpnsNames, customLabelInput) {
    const dpnsNameOptions = document.getElementById('dpns-name-options');
    if (!dpnsNameOptions) return;

    // Filter names by search term
    let filtered = dpnsNames;
    if (this.dpnsSearchTerm) {
      filtered = dpnsNames.filter(name =>
        name.toLowerCase().includes(this.dpnsSearchTerm.toLowerCase())
      );
    }

    // Determine which names to display (pagination)
    const displayNames = this.dpnsShowAll
      ? filtered
      : filtered.slice(0, this.DPNS_PAGE_SIZE);
    const hasMore = filtered.length > this.DPNS_PAGE_SIZE && !this.dpnsShowAll;
    const remainingCount = filtered.length - this.DPNS_PAGE_SIZE;

    // Build HTML with search input and paginated buttons
    const searchHtml = dpnsNames.length > 5 ? `
      <div class="dpns-search-container">
        <input type="text"
               class="dpns-search-input"
               id="dpns-search-input"
               placeholder="Search ${dpnsNames.length} names..."
               value="${this.dpnsSearchTerm}">
      </div>
    ` : '';

    const buttonsHtml = displayNames.length > 0
      ? displayNames.map((name) => `
          <button type="button" class="btn btn-secondary dpns-name-button ${this.selectedDpnsName === name ? 'active' : ''}" data-dpns-name="${name}">
            ${this.highlightMatch(name, this.dpnsSearchTerm)}
          </button>
        `).join('')
      : `<p class="no-dpns-results">No names match "${this.dpnsSearchTerm}"</p>`;

    const showMoreHtml = hasMore ? `
      <button type="button" class="btn btn-ghost dpns-show-more-btn">
        Show ${remainingCount} more names...
      </button>
    ` : '';

    const countHtml = filtered.length !== dpnsNames.length
      ? `<p class="dpns-filter-count">${filtered.length} of ${dpnsNames.length} names</p>`
      : '';

    dpnsNameOptions.innerHTML = `
      ${searchHtml}
      <div class="dpns-buttons-list">
        ${buttonsHtml}
      </div>
      ${countHtml}
      ${showMoreHtml}
    `;

    // Bind search input handler
    const searchInput = dpnsNameOptions.querySelector('#dpns-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.dpnsSearchTerm = e.target.value;
        this.dpnsShowAll = false; // Reset pagination when searching
        this.renderDpnsNameOptions(dpnsNames, customLabelInput);
      });
      // Keep focus on search input after re-render
      if (document.activeElement && document.activeElement.id === 'dpns-search-input') {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }

    // Bind show more button
    const showMoreBtn = dpnsNameOptions.querySelector('.dpns-show-more-btn');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.dpnsShowAll = true;
        this.renderDpnsNameOptions(dpnsNames, customLabelInput);
      });
    }

    // Bind click handlers to DPNS name buttons
    const dpnsButtons = dpnsNameOptions.querySelectorAll('.dpns-name-button');
    dpnsButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();

        // Remove active state from all buttons
        dpnsButtons.forEach(btn => btn.classList.remove('active'));

        // Add active state to clicked button
        button.classList.add('active');

        // Set the selected DPNS name
        this.selectedDpnsName = button.dataset.dpnsName;

        // Clear custom label input when DPNS name is selected
        customLabelInput.value = '';

        // Update preview
        this.updateRenamePreview();
      });
    });
  }

  /**
   * Highlight search matches in DPNS names
   */
  highlightMatch(text, searchTerm) {
    if (!searchTerm) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  bindEventHandlers() {
    // Initialize keys modal
    this.initializeKeysModal();

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        // Clear all cached data so next login fetches fresh from testnet
        localStorage.removeItem('dash-logged-in');
        localStorage.removeItem('dash-identity-state');
        localStorage.removeItem('useMockMode');  // Force real mode on next login
        location.reload();
      });
    }

    // Logo section - return to dashboard
    const logoSection = document.querySelector('.logo-section');
    if (logoSection) {
      logoSection.addEventListener('click', () => {
        // Clear selected identity to show dashboard
        history.pushState(null, '', '#');
        stateManager.selectIdentity(null);
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        const identity = stateManager.getSelectedIdentity();
        if (!identity) return;

        // Prevent multiple clicks while refreshing
        if (refreshBtn.classList.contains('refreshing')) return;

        try {
          // Add spinning animation
          refreshBtn.classList.add('refreshing');
          refreshBtn.disabled = true;

          stateManager.setLoading(true, 'Refreshing...');

          let updated;
          if (this.useMockMode) {
            // Mock mode - use mock platform operations
            updated = await this.platformOps.fetchIdentity(identity.id);
          } else {
            // Real mode - fetch fresh data from SDK
            if (!this.sdk) {
              throw new Error('SDK not initialized');
            }
            const wasmIdentity = await this.sdk.identities.get(identity.id);
            if (wasmIdentity) {
              // Convert WASM object to plain JSON for transformer
              const identityJson = wasmIdentity.toJSON ? wasmIdentity.toJSON() : wasmIdentity;
              const freshIdentity = transformIdentityForUI(identityJson, identity.index);
              // Preserve local metadata (label, dpnsNames, etc)
              updated = mergeIdentityData(identity, freshIdentity);
            } else {
              throw new Error('Identity not found on network');
            }
          }

          stateManager.setIdentity(identity.id, updated);
          notifications.success('Identity refreshed');
        } catch (error) {
          console.error('[App] Refresh error:', error);
          notifications.error('Failed to refresh identity: ' + (error.message || 'Unknown error'));
        } finally {
          stateManager.setLoading(false);
          // Remove spinning animation after 500ms for smooth completion
          setTimeout(() => {
            refreshBtn.classList.remove('refreshing');
            refreshBtn.disabled = false;
          }, 500);
        }
      });
    }

    // Show operation progress event (from notification center clicks)
    window.addEventListener('show-operation-progress', (e) => {
      this.showOperationProgressModal(e.detail.operationId);
    });

    // Open transfer modal event (from contact card "Send Credits" button)
    window.addEventListener('open-transfer-modal', (e) => {
      const { recipientId } = e.detail;
      this.showTransferModal();

      // Pre-fill recipient field after modal opens
      setTimeout(() => {
        const recipientInput = document.getElementById('transfer-recipient');
        if (recipientInput && recipientId) {
          recipientInput.value = recipientId;
          // Trigger input event to validate
          recipientInput.dispatchEvent(new Event('input'));
        }
      }, 100);
    });

    // Copy buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-copy]')) {
        const text = e.target.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          notifications.success('Copied to clipboard');
        }).catch(() => {
          notifications.error('Failed to copy');
        });
      }
    });

    // Backdrop click closes modals (Issue 5: uniform backdrop handling)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        const modal = e.target.closest('.modal');
        if (modal) modal.hidden = true;
      }
    });

  }

  /**
   * Close all open modals (Issue 4: prevent multiple simultaneous modals)
   */
  closeAllModals() {
    document.querySelectorAll('.modal:not([hidden])').forEach(modal => {
      modal.hidden = true;
    });
    // Also close the actions dropdown
    const actionsDropdown = document.querySelector('.actions-dropdown');
    const actionsTrigger = document.querySelector('.actions-menu-trigger');
    if (actionsDropdown) actionsDropdown.hidden = true;
    if (actionsTrigger) actionsTrigger.setAttribute('aria-expanded', 'false');
  }

  subscribeToState() {
    // Loading state
    stateManager.on('loading-state', ({ isLoading, message }) => {
      const overlay = document.getElementById('loading-overlay');
      const loadingMessage = overlay?.querySelector('.loading-message');

      if (overlay) {
        overlay.hidden = !isLoading;
        if (loadingMessage) {
          loadingMessage.textContent = message || 'Loading...';
        }
      }
    });

    // Browser back/forward navigation
    window.addEventListener('popstate', (event) => {
      if (event.state?.identityId) {
        stateManager.selectIdentity(event.state.identityId);
      } else {
        stateManager.selectIdentity(null);
      }
    });
  }
}

// Initialize app with error handling
try {
  console.log('Starting Dash Identity Manager...');
  const app = new IdentityManagerApp();

  // Debug access only
  if (localStorage.getItem('debugMode') === 'true') {
    window.app = app;
    window.stateManager = stateManager;
  }
  console.log('✅ Dash Identity Manager initialized successfully');

  // Ensure mnemonic is set - try immediately and on load
  const setMnemonic = () => {
    const mnemonicInput = document.getElementById('login-mnemonic');
    if (mnemonicInput && !mnemonicInput.value && MNEMONIC) {
      mnemonicInput.value = MNEMONIC;
      console.log('✅ Test mnemonic pre-filled');
    }
  };
  setMnemonic(); // Try immediately
  window.addEventListener('load', setMnemonic); // Also try on load
  setTimeout(setMnemonic, 100); // And after a short delay
} catch (error) {
  console.error('❌ Failed to initialize app:', error);
  console.error('Stack:', error.stack);
  notifications.error(`Failed to load application: ${error.message}`);
}