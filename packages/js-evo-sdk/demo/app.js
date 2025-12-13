/**
 * Main Application Controller
 * Initializes and coordinates all components
 */

import { stateManager } from './state-manager.js';
import { mockIdentities, MockPlatformOperations, TEST_MNEMONIC } from './mock-data.js';
import { IdentitySelector } from './components/identity-selector.js';

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
import { NotificationCenter } from './components/notification-center.js';
import { NetworkSwitcher } from './components/network-switcher.js';
import { NameResolver } from './components/name-resolver.js';
import { DocumentViewer } from './components/document-viewer.js';
import { ContestedNamesViewer } from './components/contested-names-viewer.js';
import { ContactsViewer } from './components/contacts-viewer.js';
import { ContactRequestsManager } from './components/contact-requests.js';
import { notifications } from './components/notifications.js';
import { WalletFundingFlow } from './components/wallet-funding-flow.js';
import { ActivityPanel } from './components/activity-panel.js';
import {
  formatIdentityId,
  formatDuffs,
  formatBalance,
  formatTimestamp,
  formatPublicKey,
  formatKeyPurpose,
  formatSecurityLevel,
  formatTransactionStatus,
  dashToDuffs
} from './utils/formatter.js';
import {
  validateAmount,
  validateAddress,
  validateIdentityId
} from './utils/validator.js';
import {
  transformIdentityForUI,
  transformDiscoveryResult,
  enrichIdentityForDisplay,
  isValidTransformedIdentity
} from './utils/identity-transformer.js';

class IdentityManagerApp {
  constructor() {
    this.platformOps = new MockPlatformOperations();
    this.components = {};
    this.fundingFlow = null; // Will be initialized after useMockMode is determined
    this.mnemonic = null; // Stored from login for use in SDK operations

    // Auto-set mnemonic for testnet testing (when not in mock mode)
    // This allows the real SDK to be used without manual login
    this.mnemonic = TEST_MNEMONIC;
    console.log('🔑 Auto-set test mnemonic for SDK operations');

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

      // User is logged in - hide login view
      document.getElementById('login-view').hidden = true;

      console.log('  Step 1: Loading mock data...');
      this.loadMockData();
      console.log('  ✅ Mock data loaded');

      console.log('  Step 2: Initializing components...');
      this.initializeComponents();
      console.log('  ✅ Components initialized');

      console.log('  Step 3: Binding event handlers...');
      this.bindEventHandlers();
      console.log('  ✅ Event handlers bound');

      console.log('  Step 4: Subscribing to state...');
      this.subscribeToState();
      console.log('  ✅ State subscriptions complete');

      console.log('  Step 5: Restoring persisted state...');
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

      console.log('  Step 6: Smart routing - selecting initial view...');
      const identities = stateManager.getAllIdentities();
      console.log(`  Found ${identities.length} identities`);

      // Smart routing logic
      if (identities.length === 0) {
        // No identities - show welcome screen
        console.log('  → Showing welcome screen (no identities)');
        document.getElementById('welcome-state').hidden = false;
        document.getElementById('dashboard-view').hidden = true;
        document.getElementById('identity-view').hidden = true;
      } else if (restoredIdentityId && identities.some(id => id.id === restoredIdentityId)) {
        // Restored identity exists - show identity view
        stateManager.selectIdentity(restoredIdentityId);
        console.log(`  → Showing identity view (restored: ${restoredIdentityId.substring(0, 8)}...)`);
      } else {
        // Identities exist but none selected - show dashboard
        console.log('  → Showing dashboard (default view)');
        document.getElementById('welcome-state').hidden = true;
        document.getElementById('dashboard-view').hidden = false;
        document.getElementById('identity-view').hidden = true;
      }

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

  showLoginScreen() {
    // Pre-fill mnemonic with test mnemonic
    const mnemonicInput = document.getElementById('login-mnemonic');
    if (mnemonicInput) {
      mnemonicInput.value = TEST_MNEMONIC;
    }

    // Show login view, hide all others
    document.getElementById('login-view').hidden = false;
    document.getElementById('welcome-state').hidden = true;
    document.getElementById('dashboard-view').hidden = true;
    document.getElementById('identity-view').hidden = true;

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

      // Hide login, show discovery progress
      document.getElementById('login-view').hidden = true;
      document.getElementById('discovery-progress-view').hidden = false;

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

      // Mark as logged in
      localStorage.setItem('dash-logged-in', 'true');

      // Hide discovery progress
      document.getElementById('discovery-progress-view').hidden = true;

      // Load mock data or discovered identities
      if (!this.useMockMode && foundCount > 0) {
        console.log('  Step 2: Using discovered identities...');
        // Real identities should have been imported during discovery
      } else {
        console.log('  Step 2: Loading mock data...');
        this.loadMockData();
      }
      console.log('  ✅ Data loaded');

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

      // Show dashboard by default
      console.log('  → Showing dashboard');
      document.getElementById('dashboard-view').hidden = false;

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
      // Dynamic import of webpack-bundled SDK for browser
      // webpackIgnore tells webpack to skip bundling this - it's loaded at runtime from dist/
      console.log(`  Loading SDK from browser bundle (./dist/sdk-browser.js)...`);
      try {
        const sdkModule = await import(/* webpackIgnore: true */ './dist/sdk-browser.js');
        EvoSDK = sdkModule.EvoSDK || sdkModule.default;

        if (!EvoSDK) {
          throw new Error('EvoSDK class not found in browser bundle');
        }

        console.log(`  ✅ SDK bundle loaded successfully`);
      } catch (bundleError) {
        console.error(`  ❌ Failed to load SDK bundle:`, bundleError);
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

    // Initialize SDK
    console.log(`  🔧 Initializing SDK...`);
    try {
      const sdk = new EvoSDK({ network: 'testnet', trusted: true });
      this.sdk = sdk;
      console.log(`  ✅ SDK initialized`);
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
        gapLimit: 100,
        batchSize: 50,
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

            // Import into state manager
            stateManager.setIdentity(identityId, uiIdentity);
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

    // Initialize Document Viewer
    const documentsViewerContainer = document.getElementById('documents-viewer');
    if (documentsViewerContainer) {
      this.components.documentViewer = new DocumentViewer(documentsViewerContainer, this.platformOps);
    }

    // Initialize Contested Names Viewer
    const contestedNamesContainer = document.getElementById('contested-names-viewer');
    if (contestedNamesContainer) {
      this.components.contestedNamesViewer = new ContestedNamesViewer(contestedNamesContainer, this.platformOps);
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

    // Initialize Activity Panel for operation tracking
    const activityPanelContainer = document.getElementById('activity-panel');
    if (activityPanelContainer) {
      this.components.activityPanel = new ActivityPanel(activityPanelContainer);
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

      // Update identity info
      const balance = formatBalance(identity.balance);
      // Build keys list (simple, no table)
      const keysListHTML = identity.keys.map(key => {
        const purpose = formatKeyPurpose(key.purpose);
        const purposeClass = purpose.toLowerCase().includes('auth') ? 'key-purpose-auth' : 'key-purpose-transfer';
        const statusDot = key.status === 'active'
          ? '<span class="key-status-dot key-status-dot-active">●</span>'
          : '<span class="key-status-dot key-status-dot-disabled">●</span>';

        return `
          <div class="key-list-item">
            <span class="key-id">#${key.id}</span>
            <span class="key-purpose ${purposeClass}">${purpose}</span>
            <span class="key-status">${statusDot} ${key.status === 'active' ? 'Active' : 'Disabled'}</span>
          </div>
        `;
      }).join('');

      const dpnsNamesHTML = identity.dpnsNames && identity.dpnsNames.length > 0
        ? identity.dpnsNames.map(name => `
            <div class="dpns-name-tag clickable-name" data-copy="${name}" title="Click to copy">
              <span>${name}</span>
            </div>
          `).join('')
        : '<span class="text-muted">No names registered</span>';

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
            <span class="balance-main">${balance.dash}</span>
            <span class="balance-sub">${balance.credits}</span>
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
      document.getElementById('stat-balance').textContent = totalBalanceDisplay.dash;

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
        const balance = formatBalance(identity.balance);
        card.innerHTML = `
          <div class="identity-card-header">
            <div>
              <div class="identity-card-label">${identity.label || 'Unnamed Identity'}</div>
              <div class="identity-card-id">${formatIdentityId(identity.id)}</div>
            </div>
          </div>
          <div>
            <div class="identity-card-balance">${balance.dash}</div>
            <div class="identity-card-balance-sub">${balance.credits}</div>
          </div>
          <div class="identity-card-actions">
            <button class="btn btn-primary" data-view-identity="${identity.id}">View</button>
            <button class="btn btn-secondary" data-topup-identity="${identity.id}">Top Up</button>
          </div>
        `;

        // Bind card click
        card.querySelector('[data-view-identity]').addEventListener('click', (e) => {
          e.stopPropagation();
          stateManager.selectIdentity(identity.id);
        });

        card.querySelector('[data-topup-identity]').addEventListener('click', (e) => {
          e.stopPropagation();
          stateManager.selectIdentity(identity.id);
          // Small delay to let identity view load
          setTimeout(() => this.showActionPanel('topup'), 100);
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

  showSendContactRequestModal() {
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('send-contact-request-modal');
    if (!modal) return;

    // Get form elements
    const form = document.getElementById('send-contact-request-form');
    const recipientInput = document.getElementById('contact-request-recipient');
    const messageInput = document.getElementById('contact-request-message');
    const validationText = document.getElementById('contact-request-validation');
    const closeButtons = modal.querySelectorAll('.modal-close');

    // Reset form
    if (form) form.reset();

    // Real-time validation
    if (recipientInput && validationText) {
      recipientInput.addEventListener('input', () => {
        const identityId = recipientInput.value.trim();

        if (!identityId) {
          validationText.textContent = 'Enter the identity ID of the person you want to add';
          validationText.style.color = '';
          return;
        }

        const validation = validateIdentityId(identityId);
        if (validation.valid) {
          validationText.textContent = '✓ Valid identity ID format';
          validationText.style.color = 'var(--success)';
        } else {
          validationText.textContent = validation.error;
          validationText.style.color = 'var(--error)';
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

      const recipientId = recipientInput.value.trim();
      const message = messageInput.value.trim();

      // Validate
      const validation = validateIdentityId(recipientId);
      if (!validation.valid) {
        notifications.error(validation.error);
        return;
      }

      // Check not sending to self
      if (recipientId === identity.id) {
        notifications.error('Cannot send contact request to yourself');
        return;
      }

      try {
        stateManager.setLoading(true, 'Sending contact request...');

        // Mock: Send contact request
        await new Promise(r => setTimeout(r, 1500));

        notifications.success('Contact request sent!');
        modal.hidden = true;

        // Reload contact requests
        if (this.components.contactRequestsManager) {
          this.components.contactRequestsManager.loadContactRequests(identity.id);
        }

      } catch (error) {
        notifications.error(`Failed to send request: ${error.message}`);
      } finally {
        stateManager.setLoading(false);
      }
    });

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
          mnemonicInput.value = TEST_MNEMONIC;
        } else {
          mnemonicGroup.hidden = true;
          mnemonicInput.value = '';
        }
      });
    }
  }

  showCreateModal() {
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
          const sdkModule = await import('../dist/sdk.js');
          const EvoSDK = sdkModule.EvoSDK || sdkModule.default;
          if (EvoSDK) {
            this.sdk = new EvoSDK({ network: 'testnet', trusted: true });
            console.log('✅ SDK initialized successfully');
          } else {
            console.warn('⚠️ EvoSDK class not found in browser bundle');
          }
        } catch (sdkError) {
          console.warn('⚠️ Could not load SDK:', sdkError.message);
        }
      }

      const canUseRealSDK = !this.useMockMode && this.sdk && this.mnemonic && utxos.length > 0;

      if (canUseRealSDK) {
        // Use modular createWithUTXO - skips redundant blockchain scanning
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
        identity = {
          id: result.identityId,
          balance: result.assetLockProofSummary?.amount || duffs,
          keys: result.identityKeys?.map((key, idx) => ({
            id: idx,
            keyType: 'ECDSA_SECP256K1',
            purpose: key.purpose || 'AUTHENTICATION',
            securityLevel: key.securityLevel || (idx === 0 ? 'MASTER' : 'HIGH'),
            status: 'active',
            data: key.publicKey
          })) || [],
          label: label || 'New Identity',
          createdAt: new Date().toISOString()
        };

        console.log('✅ Identity created via real SDK:', identity.id);

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
        ? '<span class="key-status-dot key-status-dot-active">●</span>'
        : '<span class="key-status-dot key-status-dot-disabled">●</span>';

      // Determine if this key can be disabled
      const canDisable = key.status === 'active' && this.canDisableKey(identity, key);
      const disableButton = canDisable
        ? `<button class="btn-text btn-danger" data-disable-key="${key.id}">Disable</button>`
        : '';

      return `
        <tr data-key-id="${key.id}">
          <td class="keys-modal-id">#${key.id}</td>
          <td class="keys-modal-purpose ${purposeClass}">${purpose}</td>
          <td class="keys-modal-security ${securityClass}">${securityLevel.text}</td>
          <td class="keys-modal-status">${statusDot} ${key.status === 'active' ? 'Active' : 'Disabled'}</td>
          <td class="keys-modal-public-key">
            <div class="public-key-cell">
              <code class="public-key-value" data-copy="${key.data}" title="Click to copy">${key.data.startsWith('0x') ? key.data.substring(2) : key.data}</code>
              <button class="btn-text" data-view-private="${key.id}">View Private</button>
              ${disableButton}
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

    // Bind copy on public key click
    const publicKeyValues = keysList.querySelectorAll('.public-key-value');
    publicKeyValues.forEach(keyEl => {
      keyEl.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent global copy handler from firing
        const text = keyEl.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          notifications.success('Public key copied to clipboard');
        }).catch(() => {
          notifications.error('Failed to copy');
        });
      });
      // Add cursor pointer style
      keyEl.style.cursor = 'pointer';
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

  showPrivateKeyModal(key) {
    const modal = document.getElementById('private-key-modal');
    if (!modal) return;

    // Generate mock private keys (in real app, would derive from mnemonic)
    const mockPrivateKeys = this.generateMockPrivateKey(key.id);

    // Populate modal
    document.getElementById('private-key-wif').textContent = mockPrivateKeys.wif;
    document.getElementById('private-key-hex').textContent = mockPrivateKeys.hex;

    // Show modal
    modal.hidden = false;
  }

  generateMockPrivateKey(keyId) {
    // Mock: Generate deterministic "private keys" for demo purposes
    // In real app, would derive from mnemonic using BIP44 path:
    // m/9'/5'/identity_index'/key_purpose/key_id
    const mockHex = `${'0'.repeat(64 - keyId.toString().length)}${keyId}`;
    const mockWif = `cMockPrivateKeyWIF${keyId}${'x'.repeat(40 - keyId.toString().length)}`;

    return {
      wif: mockWif,
      hex: mockHex
    };
  }

  canDisableKey(identity, key) {
    // Normalize values to handle both string and numeric formats
    const normalizeSecurityLevel = (level) => {
      if (typeof level === 'string') {
        const map = { 'MASTER': 0, 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3 };
        return map[level.toUpperCase()] ?? level;
      }
      return level;
    };

    const normalizePurpose = (purpose) => {
      if (typeof purpose === 'string') {
        const map = { 'AUTHENTICATION': 0, 'ENCRYPTION': 1, 'TRANSFER': 2, 'DECRYPTION': 3, 'WITHDRAW': 4 };
        return map[purpose.toUpperCase()] ?? purpose;
      }
      return purpose;
    };

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

  showDisableKeyModal(key) {
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

    try {
      stateManager.setLoading(true, 'Disabling key...');

      // Mock: Simulate network delay
      await new Promise(r => setTimeout(r, 1500));

      // Update key status to disabled
      const updatedKeys = identity.keys.map(k =>
        k.id === this.keyToDisable ? { ...k, status: 'disabled' } : k
      );

      // Update identity
      stateManager.setIdentity(identity.id, {
        ...identity,
        keys: updatedKeys,
        revision: identity.revision + 1 // Increment revision
      });

      // Close modals
      document.getElementById('disable-key-modal').hidden = true;

      notifications.success('Key disabled successfully');

      // Refresh keys modal if it's open
      const keysModal = document.getElementById('keys-modal');
      if (keysModal && !keysModal.hidden) {
        this.showKeysModal();
      }

    } catch (error) {
      notifications.error(`Failed to disable key: ${error.message}`);
    } finally {
      stateManager.setLoading(false);
      this.keyToDisable = null;
    }
  }

  showAddKeyModal() {
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

    try {
      stateManager.setLoading(true, 'Adding key...');

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
        keys: updatedKeys
      });

      // Close modal
      document.getElementById('add-key-modal').hidden = true;

      // Show success notification
      notifications.success('Key added successfully!');

      // Refresh keys modal if it's open
      const keysModal = document.getElementById('keys-modal');
      if (keysModal && !keysModal.hidden) {
        this.showKeysModal();
      }

    } catch (error) {
      notifications.error(`Failed to add key: ${error.message}`);
    } finally {
      stateManager.setLoading(false);
    }
  }

  showWithdrawModal() {
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('withdraw-modal');
    if (!modal) return;

    // Update balance help text
    const balance = formatBalance(identity.balance);
    const balanceHelp = document.getElementById('withdraw-balance-help');
    if (balanceHelp) {
      balanceHelp.textContent = `Available: ${balance.dash} (${balance.credits})`;
    }

    // Show modal
    modal.hidden = false;

    // Bind event handlers
    const form = document.getElementById('withdraw-form');
    const amountInput = document.getElementById('withdraw-amount');
    const conversionDisplay = document.getElementById('withdraw-conversion');
    const closeButtons = modal.querySelectorAll('.modal-close');

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

      if (duffs > identity.balance) {
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
          balance: identity.balance - duffs
        });
        stateManager.addTransaction(result);

        const credits = (dash * 100000000000).toLocaleString();
        notifications.success(`Withdrawal successful! Sent ${dash} DASH (${credits} credits)`);
        modal.hidden = true;
      } catch (error) {
        notifications.error(`Withdrawal failed: ${error.message}`);
      } finally {
        stateManager.setLoading(false);
      }
    });
  }

  showTransferModal() {
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
          <option value="${id.id}">${id.label || formatIdentityId(id.id)}</option>
        `).join('');
      }

      // Update balance
      const balance = formatBalance(identity.balance);
      const balanceHelp = document.getElementById('transfer-balance-help');
      if (balanceHelp) {
        balanceHelp.textContent = `Available: ${balance.dash} (${balance.credits})`;
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

    // Update balance help text
    const balance = formatBalance(identity.balance);
    const balanceHelp = document.getElementById('transfer-balance-help');
    if (balanceHelp) {
      balanceHelp.textContent = `Available: ${balance.dash} (${balance.credits})`;
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

      // Validate amount
      if (!dash || dash < 0.0005) {
        notifications.error('Minimum amount is 0.0005 DASH (500,000 credits)');
        return;
      }

      if (duffs > identity.balance) {
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
          balance: identity.balance - duffs
        });

        // Update recipient identity if it exists locally
        const recipient = stateManager.getState().identities.get(recipientId);
        if (recipient) {
          stateManager.setIdentity(recipientId, {
            ...recipient,
            balance: recipient.balance + duffs
          });
        }

        stateManager.addTransaction(result);

        const credits = (dash * 100000000000).toLocaleString();
        const recipientLabel = recipient ? (recipient.label || formatIdentityId(recipientId)) : formatIdentityId(recipientId);
        notifications.success(`Transfer successful! Sent ${dash} DASH (${credits} credits) to ${recipientLabel}`);
        modal.hidden = true;
      } catch (error) {
        notifications.error(`Transfer failed: ${error.message}`);
      } finally {
        stateManager.setLoading(false);
      }
    });

    // Show modal
    modal.hidden = false;
  }

  showRegisterNameModal() {
    const identity = stateManager.getSelectedIdentity();
    if (!identity) return;

    const modal = document.getElementById('register-name-modal');
    if (!modal) return;

    // Show modal
    modal.hidden = false;

    // Bind event handlers
    const form = document.getElementById('register-name-form');
    const nameInput = document.getElementById('dpns-name');
    const liveNameType = document.getElementById('live-name-type');
    const closeButtons = modal.querySelectorAll('.modal-close');

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
          availabilityDisplay.innerHTML = '❌ <strong>Taken</strong> - This name is already registered';
          availabilityDisplay.style.color = 'var(--error)';
          availabilityDisplay.style.background = 'rgba(239, 68, 68, 0.1)';
        } else {
          availabilityDisplay.innerHTML = '✅ <strong>Available</strong> - This name is available for registration';
          availabilityDisplay.style.color = 'var(--success)';
          availabilityDisplay.style.background = 'rgba(16, 185, 129, 0.1)';
        }
      }
    };

    // Real-time premium/regular name detection + availability checking + normalization preview
    if (nameInput && liveNameType) {
      nameInput.addEventListener('input', () => {
        const name = nameInput.value.trim();
        const normalized = convertToHomographSafe(name);

        // Show normalization preview if name differs from normalized
        const normalizationPreview = document.getElementById('normalization-preview');
        if (normalizationPreview && name && name !== normalized) {
          normalizationPreview.innerHTML = `
            <span style="color: var(--text-secondary);">Normalized: </span>
            <span style="color: var(--dash-blue); font-family: var(--font-mono); font-weight: var(--font-semibold);">"${name}" → "${normalized}"</span>
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
          liveNameType.innerHTML = '⚠️ <strong>Premium Name</strong> - Requires voting (~0.2 DASH, 2 weeks)';
          liveNameType.style.color = 'var(--warning)';
          liveNameType.style.background = 'rgba(245, 158, 11, 0.1)';
        } else {
          liveNameType.innerHTML = '✅ <strong>Regular Name</strong> - Instant registration (~0.002 DASH)';
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
      try {
        stateManager.setLoading(true, 'Registering name...');

        // Mock: Simulate registration delay
        await new Promise(r => setTimeout(r, 2000));

        // Add name to identity
        const updatedNames = [...(identity.dpnsNames || []), fullName];
        stateManager.setIdentity(identity.id, {
          ...identity,
          dpnsNames: updatedNames
        });

        notifications.success(`Name registered: ${fullName}`);
        modal.hidden = true;

      } catch (error) {
        notifications.error(`Registration failed: ${error.message}`);
      } finally {
        stateManager.setLoading(false);
      }
    });
  }

  showRenameIdentityModal(identityId) {
    const identity = stateManager.getState().identities.get(identityId);
    if (!identity) return;

    const modal = document.getElementById('rename-identity-modal');
    if (!modal) return;

    // Store the identity ID being renamed
    this.identityBeingRenamed = identityId;
    this.selectedDpnsName = null; // Track selected DPNS name

    // Get modal elements
    const customLabelInput = document.getElementById('custom-identity-label');
    const dpnsNamesSection = document.getElementById('dpns-names-section');
    const dpnsNameOptions = document.getElementById('dpns-name-options');
    const form = document.getElementById('rename-identity-form');
    const closeButtons = modal.querySelectorAll('.modal-close');

    // Pre-fill custom label if exists
    customLabelInput.value = identity.label || '';

    // Populate DPNS names section with buttons
    if (identity.dpnsNames && identity.dpnsNames.length > 0) {
      dpnsNamesSection.hidden = false;

      // Build button list for DPNS names
      const buttons = identity.dpnsNames.map((name) => `
        <button type="button" class="btn btn-secondary dpns-name-button" data-dpns-name="${name}">
          ${name}
        </button>
      `).join('');

      dpnsNameOptions.innerHTML = buttons;

      // Add click handlers to buttons
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

  bindEventHandlers() {
    // Initialize keys modal
    this.initializeKeysModal();

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        // Clear login state and reload
        localStorage.removeItem('dash-logged-in');
        location.reload();
      });
    }

    // Logo section - return to dashboard
    const logoSection = document.querySelector('.logo-section');
    if (logoSection) {
      logoSection.addEventListener('click', () => {
        // Clear selected identity to show dashboard
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
          const updated = await this.platformOps.fetchIdentity(identity.id);
          stateManager.setIdentity(identity.id, updated);
          notifications.success('Identity refreshed');
        } catch (error) {
          notifications.error('Failed to refresh identity');
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
  }
}

// Initialize app with error handling
try {
  console.log('Starting Dash Identity Manager...');
  const app = new IdentityManagerApp();

  // Export for debugging
  window.app = app;
  window.stateManager = stateManager;
  console.log('✅ Dash Identity Manager initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize app:', error);
  console.error('Stack:', error.stack);
  alert(`Failed to load application: ${error.message}`);
}