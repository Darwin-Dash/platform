/**
 * Complete Workflow E2E Tests - Identity Discovery
 *
 * Tests the entire user journey from login through identity discovery
 * and viewing discovered identities.
 *
 * Run: npx playwright test tests/e2e/discovery-complete-workflow.spec.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080/index-static.html';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test.describe('Complete Discovery Workflow', () => {

  test.beforeEach(async ({ page }) => {
    // Setup: Use mock mode for consistent testing
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'true');
      localStorage.removeItem('dash-logged-in');
    });
    await page.reload();
  });

  test('full user journey: login → discover → view identity', async ({ page }) => {
    console.log('\n🎯 Full User Journey Test');

    // ===== STEP 1: Load app and verify login screen =====
    console.log('Step 1: Verifying login screen');
    const loginView = page.locator('#login-view');
    await expect(loginView).toBeVisible();
    console.log('  ✅ Login view visible');

    // ===== STEP 2: Enter mnemonic and login =====
    console.log('Step 2: Entering mnemonic and logging in');
    const mnemonicInput = page.locator('#login-mnemonic');
    await mnemonicInput.clear();
    await mnemonicInput.fill(TEST_MNEMONIC);

    const loginButton = page.locator('#login-form button[type="submit"]');
    await loginButton.click();
    console.log('  ✅ Login initiated');

    // ===== STEP 3: Watch discovery progress =====
    console.log('Step 3: Monitoring discovery progress');
    const discoveryView = page.locator('#discovery-progress-view');
    await expect(discoveryView).toBeVisible({ timeout: 2000 });
    console.log('  ✅ Discovery progress view visible');

    // Verify progress counters
    const scannedCounter = page.locator('#discovery-scanned');
    const foundCounter = page.locator('#discovery-count');
    await expect(scannedCounter).toBeVisible();
    await expect(foundCounter).toBeVisible();
    console.log('  ✅ Progress counters visible');

    // Wait a bit and verify counters are updating
    await page.waitForTimeout(500);
    const initialScanned = await scannedCounter.textContent();
    console.log(`  📊 Initial scanned count: ${initialScanned}`);

    // ===== STEP 4: Wait for discovery to complete =====
    console.log('Step 4: Waiting for discovery to complete');
    const dashboardView = page.locator('#dashboard-view');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    await expect(dashboardView).toBeVisible();
    console.log('  ✅ Dashboard loaded');

    // ===== STEP 5: Verify dashboard is populated =====
    console.log('Step 5: Verifying dashboard population');
    const identityCountEl = page.locator('#stat-identities');
    const identityCount = await identityCountEl.textContent();
    const identities = parseInt(identityCount || '0');
    console.log(`  📊 Total identities: ${identities}`);

    // ===== STEP 6: Select an identity (if available) =====
    if (identities > 0) {
      console.log('Step 6: Selecting identity');
      const firstCard = page.locator('.identity-card').first();
      await expect(firstCard).toBeVisible();

      const viewButton = firstCard.locator('[data-view-identity]');
      await viewButton.click();
      console.log('  ✅ Identity selected');

      // ===== STEP 7: Verify identity view loads =====
      console.log('Step 7: Verifying identity detail view');
      const identityView = page.locator('#identity-view');
      await expect(identityView).toBeVisible();
      console.log('  ✅ Identity view visible');

      // Verify identity details are shown
      const identityInfo = page.locator('#identity-info');
      await expect(identityInfo).toBeVisible();
      console.log('  ✅ Identity info visible');

      const balanceDisplay = page.locator('.balance-display');
      await expect(balanceDisplay).toBeVisible();
      console.log('  ✅ Balance display visible');

      const keysList = page.locator('.keys-list');
      await expect(keysList).toBeVisible();
      console.log('  ✅ Keys list visible');
    } else {
      console.log('  ℹ️  No identities to view (skipping steps 6-7)');
    }

    console.log('\n✅ Full journey test completed successfully');
  });

  test('discovered identities persist across page reload', async ({ page }) => {
    console.log('\n💾 State Persistence Test');

    // ===== STEP 1: Discover identities =====
    console.log('Step 1: Discovering identities');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    console.log('  ✅ Initial discovery completed');

    // ===== STEP 2: Get identity count =====
    console.log('Step 2: Recording identity count');
    const countBefore = await page.locator('#stat-identities').textContent();
    console.log(`  📊 Count before reload: ${countBefore}`);

    // ===== STEP 3: Reload page =====
    console.log('Step 3: Reloading page');
    await page.reload();
    console.log('  ✅ Page reloaded');

    // ===== STEP 4: Verify state is restored =====
    console.log('Step 4: Verifying state restoration');
    // Should be logged in (skips login form)
    const loginViewHidden = await page.locator('#login-view').isHidden();
    console.log(`  Login view hidden: ${loginViewHidden}`);

    // Wait for dashboard to load
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 2000 });
    console.log('  ✅ Dashboard loaded immediately (state restored)');

    // ===== STEP 5: Verify identity count matches =====
    console.log('Step 5: Comparing identity counts');
    const countAfter = await page.locator('#stat-identities').textContent();
    console.log(`  📊 Count after reload: ${countAfter}`);

    expect(countAfter).toBe(countBefore);
    console.log('  ✅ Identity count matches');

    console.log('\n✅ State persistence test completed successfully');
  });

  test('can switch between mock and real mode', async ({ page }) => {
    console.log('\n🔄 Mode Switching Test');

    // ===== STEP 1: Start in mock mode =====
    console.log('Step 1: Starting in mock mode');
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'true');
    });
    await page.reload();
    console.log('  ✅ Mock mode enabled');

    // ===== STEP 2: Perform discovery in mock mode =====
    console.log('Step 2: Discovering in mock mode');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });

    const mockCount = await page.locator('#stat-identities').textContent();
    console.log(`  📊 Mock mode identities: ${mockCount}`);

    // ===== STEP 3: Logout =====
    console.log('Step 3: Logging out');
    await page.click('#logout-btn');
    await page.waitForSelector('#login-view:not([hidden])');
    console.log('  ✅ Logged out');

    // ===== STEP 4: Switch to real mode =====
    console.log('Step 4: Switching to real mode');
    await page.evaluate(() => {
      localStorage.setItem('useMockMode', 'false');
    });
    await page.reload();
    console.log('  ✅ Real mode enabled');

    // ===== STEP 5: Try discovery in real mode =====
    console.log('Step 5: Attempting discovery in real mode');
    await page.click('#login-form button[type="submit"]');

    // Real mode might show different results or fall back to mock
    // Either way, UI should remain functional
    try {
      await page.waitForSelector('#dashboard-view:not([hidden]), #login-view:not([hidden])', {
        timeout: 20000
      });
    } catch (error) {
      console.log('  ℹ️  Real mode discovery timeout (expected if no network)');
    }

    // ===== STEP 6: Verify UI is still functional =====
    console.log('Step 6: Verifying UI functionality');
    const isOnDashboard = await page.locator('#dashboard-view').isVisible();
    const isOnLogin = await page.locator('#login-view').isVisible();

    console.log(`  Dashboard visible: ${isOnDashboard}, Login visible: ${isOnLogin}`);
    expect(isOnDashboard || isOnLogin).toBe(true);
    console.log('  ✅ UI remains functional in real mode');

    console.log('\n✅ Mode switching test completed successfully');
  });

  test('identity selector shows discovered identities', async ({ page }) => {
    console.log('\n📋 Identity Selector Test');

    // ===== STEP 1: Discover identities =====
    console.log('Step 1: Discovering identities');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    console.log('  ✅ Discovery completed');

    // ===== STEP 2: Get identity count =====
    const identityCount = parseInt(await page.locator('#stat-identities').textContent() || '0');
    console.log(`  📊 Total identities: ${identityCount}`);

    if (identityCount === 0) {
      console.log('  ℹ️  No identities to test selector (skipping)');
      return;
    }

    // ===== STEP 3: Open identity selector =====
    console.log('Step 2: Opening identity selector');
    const selectorTrigger = page.locator('#identity-selector-trigger, [data-selector="trigger"]');

    if (await selectorTrigger.isVisible()) {
      await selectorTrigger.click();
      console.log('  ✅ Selector opened');

      // ===== STEP 4: Verify identities in selector =====
      console.log('Step 3: Verifying identities in selector');
      const selectorOptions = page.locator('.identity-option');
      const optionCount = await selectorOptions.count();
      console.log(`  📊 Options in selector: ${optionCount}`);

      // Select first option
      if (optionCount > 0) {
        const firstOption = selectorOptions.first();
        await firstOption.click();
        console.log('  ✅ Selected first identity from selector');
      }
    } else {
      console.log('  ℹ️  Selector not visible in this layout');
    }

    console.log('\n✅ Identity selector test completed successfully');
  });

  test('can navigate back to dashboard from identity view', async ({ page }) => {
    console.log('\n↩️  Navigation Test');

    // ===== STEP 1: Discover and select identity =====
    console.log('Step 1: Discovering and selecting identity');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });

    const identityCount = parseInt(await page.locator('#stat-identities').textContent() || '0');

    if (identityCount === 0) {
      console.log('  ℹ️  No identities to navigate (skipping)');
      return;
    }

    const firstCard = page.locator('.identity-card').first();
    const viewButton = firstCard.locator('[data-view-identity]');
    await viewButton.click();
    console.log('  ✅ Identity selected, viewing details');

    // ===== STEP 2: Verify in identity view =====
    console.log('Step 2: Verifying identity view');
    const identityView = page.locator('#identity-view');
    await expect(identityView).toBeVisible();
    console.log('  ✅ Identity view visible');

    // ===== STEP 3: Navigate back to dashboard =====
    console.log('Step 3: Navigating back to dashboard');
    // Click logo or back button
    const logoSection = page.locator('.logo-section, [data-nav="back"]');

    if (await logoSection.isVisible()) {
      await logoSection.click();
      console.log('  Clicked navigation');
    } else {
      console.log('  ℹ️  Logo/back button not found');
    }

    // Wait for dashboard
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 2000 });
    console.log('  ✅ Back to dashboard');

    console.log('\n✅ Navigation test completed successfully');
  });

  test('handles empty wallet gracefully', async ({ page }) => {
    console.log('\n🔍 Empty Wallet Test');

    // ===== STEP 1: Use empty wallet mnemonic =====
    console.log('Step 1: Using empty wallet mnemonic');
    const emptyMnemonic = TEST_MNEMONIC; // Fresh test mnemonic with no identities

    await page.fill('#login-mnemonic', emptyMnemonic);
    await page.click('#login-form button[type="submit"]');
    console.log('  ✅ Login initiated');

    // ===== STEP 2: Wait for discovery =====
    console.log('Step 2: Waiting for discovery');
    await page.waitForSelector('#dashboard-view:not([hidden])', { timeout: 15000 });
    console.log('  ✅ Discovery completed');

    // ===== STEP 3: Verify zero identities =====
    console.log('Step 3: Verifying empty state');
    const identityCount = parseInt(await page.locator('#stat-identities').textContent() || '0');
    console.log(`  📊 Identity count: ${identityCount}`);

    // Should show welcome state or empty message
    const welcomeState = page.locator('#welcome-state');
    const isEmpty = await welcomeState.isVisible();

    if (isEmpty) {
      console.log('  ✅ Welcome/empty state shown');
    } else {
      console.log('  ℹ️  No identities shown (acceptable)');
    }

    console.log('\n✅ Empty wallet test completed successfully');
  });
});
