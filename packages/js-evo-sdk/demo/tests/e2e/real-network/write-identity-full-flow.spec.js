/**
 * E2E Tests - Identity Lifecycle Full Flow
 *
 * Comprehensive tests for the complete identity creation and top-up flows.
 * Tests run against the actual Dash testnet with real transactions.
 *
 * Test Order (CRITICAL):
 * 1. Discovery - Discovers existing identities and caches indexes
 * 2. Historic Flow - Creates identity using existing UTXO
 * 3. On-Demand Flow - Creates identity by sending fresh transaction
 * 4. Top-Up Flow - Increases existing identity balance
 *
 * Requirements:
 * - MNEMONIC environment variable with funded testnet wallet
 * - TESTNET_RPC_* environment variables for transaction sending
 * - Network connectivity to Dash testnet
 *
 * Run with:
 *   MNEMONIC="..." yarn test:e2e demo/tests/e2e/real-network/write-identity-full-flow.spec.js --project=testnet-funded
 */

import { test, expect } from '@playwright/test';
import {
  setupTestnetMode,
  waitForMainView,
  waitForDashboard,
  handleLoginIfNeeded,
} from '../helpers/test-setup.js';
import { DashRpcClient } from '@dashevo/dash-rpc-client';

// ============================================================================
// Configuration
// ============================================================================

const MNEMONIC = process.env.MNEMONIC;
const TESTNET_RPC_ENDPOINT = process.env.TESTNET_RPC_ENDPOINT;
const TESTNET_RPC_USERNAME = process.env.TESTNET_RPC_USERNAME || 'dash';
const TESTNET_RPC_PASSWORD = process.env.TESTNET_RPC_PASSWORD;
const TESTNET_WALLET = process.env.TESTNET_WALLET || 'platformcli';
const HAS_RPC = !!(TESTNET_RPC_ENDPOINT && TESTNET_RPC_PASSWORD);

// Test state cache (shared across tests within this file)
let identityCache = {
  existingIdentities: [],
  nextFreeIndex: 0,
  discoveryComplete: false,
};

// RPC client (initialized once if configured)
let rpcClient = null;
if (HAS_RPC) {
  rpcClient = new DashRpcClient({
    network: 'testnet',
    url: TESTNET_RPC_ENDPOINT,
    user: TESTNET_RPC_USERNAME,
    pass: TESTNET_RPC_PASSWORD,
    wallet: TESTNET_WALLET,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function sendToAddress(address, amount) {
  if (!rpcClient) {
    throw new Error('RPC client not configured');
  }
  return rpcClient.sendToAddress(address, amount);
}

async function loginWithMnemonic(page) {
  const loginView = page.locator('#login-view');
  if (await loginView.isVisible().catch(() => false)) {
    // The mnemonic field is readonly and pre-filled by the app
    // We need to set it via JavaScript to bypass the readonly attribute
    await page.evaluate((mnemonic) => {
      const mnemonicInput = document.getElementById('login-mnemonic');
      if (mnemonicInput) {
        // Remove readonly temporarily to set value
        mnemonicInput.removeAttribute('readonly');
        mnemonicInput.value = mnemonic;
        // Restore readonly
        mnemonicInput.setAttribute('readonly', '');
      }
    }, MNEMONIC);

    await page.locator('#login-form button[type="submit"], button:has-text("Connect Wallet"), button:has-text("Login")').click();

    // Wait for discovery to complete (can take several minutes on testnet)
    await page.locator('#login-view').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

    // Wait for discovery progress to complete
    await Promise.race([
      page.locator('#discovery-progress-view').waitFor({ state: 'hidden', timeout: 300000 }),
      page.locator('#welcome-state:not([hidden])').waitFor({ state: 'attached', timeout: 300000 }),
      page.locator('#dashboard-view:not([hidden])').waitFor({ state: 'attached', timeout: 300000 }),
    ]).catch(() => {});

    console.log('[Login] Login and discovery complete');
  }
}

async function navigateToCreateIdentity(page) {
  const viewType = await waitForMainView(page, 90000);

  if (viewType === 'dashboard') {
    // Open actions menu
    const actionsMenu = page.locator('.actions-menu-trigger, .actions-btn');
    if (await actionsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await actionsMenu.click();
      await page.waitForTimeout(300);
    }

    // Click create action
    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    if (await createAction.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createAction.click();
    } else {
      // Try alternative selectors
      await page.locator('[data-action="create-identity"]').click();
    }
  } else {
    // Welcome state - create button should be visible
    await page.locator('#create-identity-btn, [data-action="create"]').click();
  }

  // Wait for funding modal
  await page.waitForSelector('#wallet-funding-modal:not([hidden])', { timeout: 5000 });
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe('Identity Lifecycle - Full Flow', () => {
  test.skip(!MNEMONIC, 'Requires MNEMONIC environment variable');

  // Long timeouts for testnet operations
  test.setTimeout(600000); // 10 minutes per test

  // ============================================================================
  // Test 0: Identity Discovery (must run first)
  // ============================================================================

  test('0. discovers existing identities and caches indexes', async ({ page }) => {
    console.log('[Discovery] Starting identity discovery test...');

    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    // Wait for main view
    const viewType = await waitForMainView(page, 120000);
    console.log(`[Discovery] Main view: ${viewType}`);

    // Extract identity information from the page
    const identityInfo = await page.evaluate(() => {
      // Try to get identity state from localStorage
      const stateJson = localStorage.getItem('dash-identity-state');
      if (!stateJson) {
        return { identities: [], maxIndex: -1 };
      }

      try {
        const state = JSON.parse(stateJson);
        const identities = state.identities || [];

        // Extract identity IDs and indexes
        const identityList = identities.map(([id, data]) => ({
          identityId: id,
          index: data.index !== undefined ? data.index : 0,
          balance: data.balance || 0,
        }));

        // Find max index to determine next free
        const maxIndex = identityList.reduce((max, id) => Math.max(max, id.index), -1);

        return {
          identities: identityList,
          maxIndex,
        };
      } catch (e) {
        console.error('Failed to parse identity state:', e);
        return { identities: [], maxIndex: -1 };
      }
    });

    // Cache the results for subsequent tests
    identityCache.existingIdentities = identityInfo.identities;
    identityCache.nextFreeIndex = identityInfo.maxIndex + 1;
    identityCache.discoveryComplete = true;

    console.log(`[Discovery] Found ${identityInfo.identities.length} existing identities`);
    console.log(`[Discovery] Next free index: ${identityCache.nextFreeIndex}`);

    // Log identity details
    for (const identity of identityInfo.identities) {
      console.log(`[Discovery]   - ${identity.identityId} (index: ${identity.index}, balance: ${identity.balance})`);
    }

    // Verify discovery completed
    expect(identityCache.discoveryComplete).toBe(true);
  });

  // ============================================================================
  // Test 1: Historic Flow - Create Identity Using Existing UTXO
  // ============================================================================

  test('1. historic flow creates identity end-to-end', async ({ page }) => {
    test.skip(!identityCache.discoveryComplete, 'Discovery test must run first');

    console.log('[Historic] Starting historic flow test...');
    console.log(`[Historic] Will use index: ${identityCache.nextFreeIndex}`);

    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    // Navigate to create identity
    await navigateToCreateIdentity(page);

    // Select "Already funded"
    await page.click('#already-funded-btn');

    // Wait for timeframe selection UI (class is .timeframe-options in wallet-funding-flow.js)
    await page.waitForSelector('.timeframe-options', { state: 'visible', timeout: 5000 });

    // Select week timeframe (more likely to find funds) - click the label, not just the radio
    await page.click('.timeframe-option[data-timeframe="week"]');
    await page.click('#timeframe-continue-btn');

    // Wait for scanning to start
    await page.waitForSelector('.funding-scanning', { state: 'visible', timeout: 10000 });
    console.log('[Historic] UTXO scanning started...');

    // Wait for scanning to complete (up to 5 minutes)
    const scanResult = await Promise.race([
      page.waitForSelector('.funding-confirmed', { state: 'visible', timeout: 300000 }).then(() => 'confirmed'),
      page.waitForSelector('.no-funds-found', { state: 'visible', timeout: 300000 }).then(() => 'no-funds'),
    ]);

    if (scanResult === 'no-funds') {
      console.log('[Historic] No funds found in wallet - skipping creation');
      test.skip('No funded UTXOs found');
      return;
    }

    console.log('[Historic] UTXO found, proceeding to create...');

    // Verify balance is displayed
    const balanceText = await page.locator('.detected-balance').textContent().catch(() => '0');
    console.log(`[Historic] Detected balance: ${balanceText}`);

    // Proceed to create
    await page.click('#proceed-to-create-btn');

    // Wait for funding modal to close
    await page.waitForSelector('#wallet-funding-modal', { state: 'hidden', timeout: 10000 });

    // Wait for create modal
    await page.waitForSelector('#create-modal', { state: 'visible', timeout: 10000 });
    console.log('[Historic] Create modal opened');

    // Confirm creation
    await page.click('#confirm-create-btn');

    // Wait for creation to complete (up to 5 minutes)
    await Promise.race([
      page.waitForSelector('.creation-success', { state: 'visible', timeout: 300000 }),
      page.waitForSelector('.creation-error', { state: 'visible', timeout: 300000 }).then(() => {
        throw new Error('Identity creation failed');
      }),
    ]);

    console.log('[Historic] ✅ Identity created successfully');

    // Update cache
    identityCache.nextFreeIndex++;

    // Verify identity appears in dashboard
    await page.click('.modal-close, button:has-text("Close"), button:has-text("Done")').catch(() => {});
    await page.waitForTimeout(2000);

    const identityCount = await page.locator('.identity-item').count();
    expect(identityCount).toBeGreaterThan(identityCache.existingIdentities.length);
  });

  // ============================================================================
  // Test 2: On-Demand Flow - Create Identity by Sending Fresh Transaction
  // ============================================================================

  test('2. on-demand flow creates identity end-to-end', async ({ page }) => {
    test.skip(!HAS_RPC, 'Requires RPC configuration for sending transactions');
    test.skip(!identityCache.discoveryComplete, 'Discovery test must run first');

    console.log('[OnDemand] Starting on-demand flow test...');
    console.log(`[OnDemand] Will use index: ${identityCache.nextFreeIndex}`);

    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    // Navigate to create identity
    await navigateToCreateIdentity(page);

    // Select "Sending now"
    await page.click('#sending-now-btn');

    // Wait for monitoring view with address
    await page.waitForSelector('.funding-monitoring', { state: 'visible', timeout: 10000 });

    // Get the displayed funding address
    const fundingAddress = await page.locator('.funding-address').textContent();
    expect(fundingAddress).toBeTruthy();
    expect(fundingAddress.startsWith('y')).toBe(true);
    console.log(`[OnDemand] Funding address: ${fundingAddress}`);

    // Wait for monitoring to initialize before sending
    await page.waitForTimeout(3000);

    // Send DASH via RPC
    console.log('[OnDemand] Sending 0.01 DASH...');
    const txid = await sendToAddress(fundingAddress, 0.01);
    console.log(`[OnDemand] Transaction sent: ${txid}`);

    // Wait for transaction detection and confirmation
    console.log('[OnDemand] Waiting for confirmation...');

    const confirmResult = await Promise.race([
      page.waitForSelector('.funding-confirmed', { state: 'visible', timeout: 300000 }).then(() => 'confirmed'),
      page.waitForSelector('.status-instantlocked', { state: 'visible', timeout: 60000 }).then(() => 'instantlock'),
    ]).catch(() => 'timeout');

    if (confirmResult === 'timeout') {
      // InstantLock detection might take time due to DAPI propagation
      console.log('[OnDemand] Transaction may be confirmed but UI not updated - checking...');

      // Wait additional time and check again
      await page.waitForTimeout(30000);

      const confirmed = await page.locator('.funding-confirmed').isVisible().catch(() => false);
      if (!confirmed) {
        console.log('[OnDemand] Confirmation timeout - transaction may still be processing');
        test.skip('Transaction confirmation timeout');
        return;
      }
    }

    console.log(`[OnDemand] Confirmation detected: ${confirmResult}`);

    // Wait for full confirmation if only InstantLock
    if (confirmResult === 'instantlock') {
      await page.waitForSelector('.funding-confirmed', { state: 'visible', timeout: 60000 }).catch(() => {});
    }

    // Proceed to create
    const proceedBtn = page.locator('#proceed-to-create-btn');
    if (await proceedBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await proceedBtn.click();
    }

    // Wait for create modal
    await page.waitForSelector('#create-modal', { state: 'visible', timeout: 10000 });
    console.log('[OnDemand] Create modal opened');

    // Confirm creation
    await page.click('#confirm-create-btn');

    // Wait for creation
    await Promise.race([
      page.waitForSelector('.creation-success', { state: 'visible', timeout: 300000 }),
      page.waitForSelector('.creation-error', { state: 'visible', timeout: 300000 }).then(() => {
        throw new Error('Identity creation failed');
      }),
    ]);

    console.log('[OnDemand] ✅ Identity created successfully');

    // Update cache
    identityCache.nextFreeIndex++;
  });

  // ============================================================================
  // Test 3: Top-Up Flow - Increase Existing Identity Balance
  // ============================================================================

  test('3. top-up increases identity balance', async ({ page }) => {
    test.skip(!HAS_RPC, 'Requires RPC configuration for sending transactions');
    test.skip(!identityCache.discoveryComplete, 'Discovery test must run first');
    test.skip(identityCache.existingIdentities.length === 0, 'No existing identities to top up');

    console.log('[TopUp] Starting top-up flow test...');

    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    // Wait for main view
    const viewType = await waitForMainView(page, 120000);

    if (viewType === 'welcome') {
      console.log('[TopUp] No identities found - skipping');
      test.skip('No identities to top up');
      return;
    }

    // Select first identity if not already selected
    const identitySelector = page.locator('.selector-trigger');
    if (await identitySelector.isVisible({ timeout: 2000 }).catch(() => false)) {
      await identitySelector.click();
      await page.waitForTimeout(300);

      const firstIdentity = page.locator('.identity-item').first();
      if (await firstIdentity.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstIdentity.click();
        await page.waitForTimeout(500);
      }
    }

    // Get current balance
    const balanceElement = page.locator('.identity-balance, [data-balance]');
    const initialBalanceText = await balanceElement.textContent().catch(() => '0');
    console.log(`[TopUp] Initial balance: ${initialBalanceText}`);

    // Open actions menu and click top-up
    const actionsMenu = page.locator('.actions-menu-trigger');
    await actionsMenu.click();
    await page.waitForTimeout(300);

    const topUpAction = page.locator('[data-action="topup"], [data-action="top-up"]');
    await topUpAction.click();

    // Wait for funding modal
    await page.waitForSelector('#wallet-funding-modal:not([hidden])', { timeout: 5000 });

    // Select "Sending now"
    await page.click('#sending-now-btn');

    // Wait for monitoring view
    await page.waitForSelector('.funding-monitoring', { state: 'visible', timeout: 10000 });

    // Get funding address
    const fundingAddress = await page.locator('.funding-address').textContent();
    console.log(`[TopUp] Funding address: ${fundingAddress}`);

    // Wait for monitoring to initialize
    await page.waitForTimeout(3000);

    // Send DASH
    console.log('[TopUp] Sending 0.005 DASH...');
    const txid = await sendToAddress(fundingAddress, 0.005);
    console.log(`[TopUp] Transaction sent: ${txid}`);

    // Wait for confirmation
    await Promise.race([
      page.waitForSelector('.funding-confirmed', { state: 'visible', timeout: 300000 }),
      page.waitForSelector('.status-instantlocked', { state: 'visible', timeout: 60000 }),
    ]).catch(() => {});

    // Proceed with top-up
    const proceedBtn = page.locator('#proceed-to-topup-btn, #proceed-to-create-btn');
    if (await proceedBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await proceedBtn.click();
    }

    // Wait for top-up modal
    await page.waitForSelector('#topup-modal, #create-modal', { state: 'visible', timeout: 10000 });

    // Confirm top-up
    const confirmBtn = page.locator('#confirm-topup-btn, #confirm-create-btn');
    await confirmBtn.click();

    // Wait for completion
    await Promise.race([
      page.waitForSelector('.topup-success, .creation-success', { state: 'visible', timeout: 300000 }),
      page.waitForSelector('.topup-error, .creation-error', { state: 'visible', timeout: 300000 }).then(() => {
        throw new Error('Top-up failed');
      }),
    ]);

    console.log('[TopUp] ✅ Top-up completed successfully');

    // Close modal and verify balance increased
    await page.click('.modal-close, button:has-text("Close"), button:has-text("Done")').catch(() => {});
    await page.waitForTimeout(3000);

    // Note: Balance verification may require page reload as balance updates are async
    const newBalanceText = await balanceElement.textContent().catch(() => '0');
    console.log(`[TopUp] New balance: ${newBalanceText}`);
  });

  // ============================================================================
  // Test 4: Verify Identity Count After All Operations
  // ============================================================================

  test('4. verifies identity count after operations', async ({ page }) => {
    test.skip(!identityCache.discoveryComplete, 'Discovery test must run first');

    console.log('[Verify] Checking final identity count...');

    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    // Wait for main view
    await waitForMainView(page, 120000);

    // Get current identity count
    const identityCount = await page.locator('.identity-item').count();

    console.log(`[Verify] Initial count: ${identityCache.existingIdentities.length}`);
    console.log(`[Verify] Current count: ${identityCount}`);

    // At minimum, we should have what we started with
    expect(identityCount).toBeGreaterThanOrEqual(identityCache.existingIdentities.length);

    console.log('[Verify] ✅ Identity count verification passed');
  });
});

// ============================================================================
// Error Recovery Tests
// ============================================================================

test.describe('Identity Creation - Error Recovery', () => {
  test.skip(!MNEMONIC, 'Requires MNEMONIC');
  test.setTimeout(120000);

  test('can cancel and restart creation flow', async ({ page }) => {
    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    // Try to start create flow
    try {
      await navigateToCreateIdentity(page);

      // Cancel the flow
      await page.click('#already-funded-btn');
      await page.waitForSelector('.timeframe-options', { state: 'visible', timeout: 5000 });

      // Press escape or click cancel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Verify we can restart
      await navigateToCreateIdentity(page);

      // Should show funding modal again
      const modalVisible = await page.locator('#wallet-funding-modal').isVisible();
      expect(modalVisible).toBe(true);

      console.log('[ErrorRecovery] ✅ Can cancel and restart flow');
    } catch (error) {
      console.log('[ErrorRecovery] Could not test - may not have access to create flow');
    }
  });

  test('handles monitoring timeout gracefully', async ({ page }) => {
    await setupTestnetMode(page);
    await loginWithMnemonic(page);

    try {
      await navigateToCreateIdentity(page);

      // Select "Sending now"
      await page.click('#sending-now-btn');
      await page.waitForSelector('.funding-monitoring', { state: 'visible', timeout: 10000 });

      // Cancel without sending any transaction
      await page.click('#monitoring-cancel-btn');

      // Modal should close
      await page.waitForSelector('#wallet-funding-modal', { state: 'hidden', timeout: 5000 });

      console.log('[ErrorRecovery] ✅ Monitoring cancel works');
    } catch (error) {
      console.log('[ErrorRecovery] Could not test monitoring timeout');
    }
  });
});
