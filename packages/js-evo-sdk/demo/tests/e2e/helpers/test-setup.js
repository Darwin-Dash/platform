/**
 * Shared test setup helpers for E2E tests
 */

/**
 * Clear all localStorage and set up mock mode
 * Should be called at the start of beforeEach
 */
export async function setupMockMode(page) {
  // Navigate first to be able to access localStorage
  await page.goto('/');

  // Clear all relevant localStorage and set mock mode
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('useMockMode', 'true');
  });

  // Reload to apply settings
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/**
 * Set up test environment for testnet (real network)
 */
export async function setupTestnetMode(page) {
  await page.goto('/');

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('useMockMode', 'false');
    localStorage.setItem('network', 'testnet');
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
}

/**
 * Handle login flow if login screen is visible
 * @returns {Promise<boolean>} true if login was performed
 */
export async function handleLoginIfNeeded(page, options = {}) {
  const { waitForDashboard = true, timeout = 30000 } = options;

  const loginVisible = await page.locator('#login-view').isVisible().catch(() => false);

  if (!loginVisible) {
    return false;
  }

  // Click login button (mnemonic is pre-filled in mock mode)
  await page.locator('#login-form button[type="submit"]').click();

  if (waitForDashboard) {
    // Wait for mock discovery to complete
    // First wait for login view to be hidden (discovery started)
    await page.locator('#login-view').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // Wait for discovery progress view to be hidden (discovery complete)
    await page.locator('#discovery-progress-view').waitFor({ state: 'hidden', timeout }).catch(() => {});

    // Now wait for either dashboard or welcome to become visible
    // Use Promise.race since only one will become visible
    await Promise.race([
      page.locator('#dashboard-view:visible').waitFor({ state: 'attached', timeout: 5000 }),
      page.locator('#welcome-state:visible').waitFor({ state: 'attached', timeout: 5000 }),
    ]).catch(async () => {
      // Fallback: check if either is not hidden
      const dashboardHidden = await page.locator('#dashboard-view').getAttribute('hidden');
      const welcomeHidden = await page.locator('#welcome-state').getAttribute('hidden');
      if (dashboardHidden !== null && welcomeHidden !== null) {
        // Both still hidden - wait a bit more
        await page.waitForTimeout(2000);
      }
    });
  }

  return true;
}

/**
 * Navigate to welcome screen by clearing identity state
 */
export async function navigateToWelcomeScreen(page) {
  await page.evaluate(() => {
    localStorage.removeItem('dash-identity-state');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await handleLoginIfNeeded(page);

  // After login with no identities, welcome screen should show
  await page.waitForSelector('#welcome-state', { state: 'visible', timeout: 5000 });
}

/**
 * Wait for dashboard to be visible (not hidden)
 * Uses waitForFunction to check hidden attribute directly
 */
export async function waitForDashboard(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const dashboard = document.getElementById('dashboard-view');
      return dashboard && !dashboard.hasAttribute('hidden');
    },
    { timeout }
  );
}

/**
 * Wait for welcome screen to be visible (not hidden)
 */
export async function waitForWelcome(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const welcome = document.getElementById('welcome-state');
      return welcome && !welcome.hasAttribute('hidden');
    },
    { timeout }
  );
}

/**
 * Wait for either dashboard or welcome to be visible
 * Returns 'dashboard' or 'welcome' based on which is visible
 */
export async function waitForMainView(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const dashboard = document.getElementById('dashboard-view');
      const welcome = document.getElementById('welcome-state');
      return (dashboard && !dashboard.hasAttribute('hidden')) ||
             (welcome && !welcome.hasAttribute('hidden'));
    },
    { timeout }
  );

  const dashboardVisible = await page.evaluate(() => {
    const dashboard = document.getElementById('dashboard-view');
    return dashboard && !dashboard.hasAttribute('hidden');
  });

  return dashboardVisible ? 'dashboard' : 'welcome';
}

/**
 * Navigate to dashboard with identities loaded
 * @deprecated Use waitForDashboard instead
 */
export async function navigateToDashboard(page) {
  await waitForDashboard(page, 5000);
}

/**
 * Select an identity from the dropdown
 * @param {number} index - 0-based index of identity to select
 */
export async function selectIdentity(page, index = 0) {
  // Open selector
  await page.click('.selector-trigger');
  await page.waitForTimeout(300);

  // Click identity at index
  const identities = await page.$$('.identity-item');
  if (identities.length > index) {
    await identities[index].click();
    await page.waitForTimeout(300);
  }
}

/**
 * Open actions menu
 */
export async function openActionsMenu(page) {
  await page.click('.actions-menu-trigger');
  await page.waitForTimeout(200);
}

/**
 * Click an action from the actions menu
 * @param {string} action - The data-action value
 */
export async function clickAction(page, action) {
  await openActionsMenu(page);
  await page.click(`[data-action="${action}"]`);
  await page.waitForTimeout(300);
}

/**
 * Wait for and handle wallet funding modal
 * @param {string} choice - 'already-funded' or 'sending-now'
 */
export async function handleFundingModal(page, choice = 'already-funded') {
  // Wait for funding modal to appear
  await page.waitForSelector('#wallet-funding-modal:not([hidden])', { timeout: 5000 });

  if (choice === 'already-funded') {
    await page.click('#already-funded-btn');
  } else {
    await page.click('#sending-now-btn');
  }

  await page.waitForTimeout(300);
}

/**
 * Complete the full funding flow using "Sending now" and proceed to create modal
 * This uses the realtime flow: funding modal → monitoring → TX detected → IS → CL → confirmed → create modal
 * The "Sending now" flow works reliably in mock mode because it simulates transaction detection
 */
export async function completeFundingFlowToCreateModal(page) {
  // Wait for funding modal
  await page.waitForSelector('#wallet-funding-modal:not([hidden])', { timeout: 5000 });

  // Click "Sending now" (more reliable in mock mode than "Already funded")
  await page.click('#sending-now-btn');

  // Wait for monitoring step with QR code
  await page.waitForSelector('.funding-monitoring', { state: 'visible', timeout: 5000 });

  // Wait for mock transaction detection, InstantLock, ChainLock, and confirmation
  // Mock mode simulates these stages automatically
  await page.waitForSelector('.funding-confirmed', { state: 'visible', timeout: 30000 });

  // Click proceed to create
  await page.click('#proceed-to-create-btn');

  // Wait for funding modal to close
  await page.waitForSelector('#wallet-funding-modal', { state: 'hidden', timeout: 5000 });

  // Wait for create modal to appear
  await page.waitForSelector('#create-modal', { state: 'visible', timeout: 5000 });
}

/**
 * Close any open modal by pressing Escape or clicking close button
 */
export async function closeModal(page) {
  // Try Escape first
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // If modal still visible, try clicking close button
  const modalVisible = await page.locator('.modal:not([hidden])').isVisible().catch(() => false);
  if (modalVisible) {
    const closeBtn = await page.$('.modal:not([hidden]) .modal-close, .modal:not([hidden]) button:has-text("Cancel")');
    if (closeBtn) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(200);
    }
  }
}

/**
 * Wait for page to be fully loaded and stable
 */
export async function waitForPageReady(page, timeout = 10000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Fill in a form field with proper waiting
 */
export async function fillFormField(page, selector, value) {
  const field = page.locator(selector);
  await field.waitFor({ state: 'visible' });
  await field.clear();
  await field.fill(value);
}

/**
 * Wait for notification to appear and optionally dismiss it
 */
export async function waitForNotification(page, { text = null, dismiss = false, timeout = 5000 } = {}) {
  const notificationSelector = '.notification, .toast, [role="alert"]';

  if (text) {
    await page.waitForSelector(`${notificationSelector}:has-text("${text}")`, { timeout });
  } else {
    await page.waitForSelector(notificationSelector, { timeout });
  }

  if (dismiss) {
    const dismissBtn = await page.$(`${notificationSelector} .dismiss, ${notificationSelector} .close`);
    if (dismissBtn) {
      await dismissBtn.click();
    }
  }
}

/**
 * Take screenshot with meaningful name
 */
export async function takeScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `test-results/screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}
