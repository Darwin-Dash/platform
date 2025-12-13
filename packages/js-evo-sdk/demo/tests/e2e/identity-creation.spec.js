import { test, expect } from '@playwright/test';

test.describe('Identity Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage for fresh state each test
    await page.context().clearCookies();

    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if login is needed
    const loginVisible = await page.locator('#login-view').isVisible().catch(() => false);

    if (loginVisible) {
      // Submit login form (mnemonic is pre-filled)
      await page.locator('#login-form button[type="submit"]').click();

      // Wait for discovery to finish and welcome screen to show
      await page.waitForSelector('#welcome-state, #dashboard-view', { state: 'visible', timeout: 15000 });
    }

    // If on dashboard, clear identities to show welcome screen
    const dashboardVisible = await page.locator('#dashboard-view').isVisible().catch(() => false);
    if (dashboardVisible) {
      await page.evaluate(() => {
        localStorage.removeItem('dash-identity-state');
        location.reload();
      });
      await page.waitForLoadState('networkidle');
      // Re-login after reload
      const loginStillVisible = await page.locator('#login-view').isVisible().catch(() => false);
      if (loginStillVisible) {
        await page.locator('#login-form button[type="submit"]').click();
        await page.waitForSelector('#welcome-state', { state: 'visible', timeout: 15000 });
      }
    }
  });

  test('displays welcome state on initial load', async ({ page }) => {
    // Verify welcome state is visible
    await expect(page.locator('.welcome-card')).toBeVisible();
    await expect(page.locator('.welcome-card h2')).toContainText('Welcome to Dash Identity Manager');

    // Verify create button is present
    await expect(page.locator('#create-identity-btn')).toBeVisible();
  });

  test('opens create identity modal when clicking create button', async ({ page }) => {
    // Click create identity button
    await page.click('#create-identity-btn');

    // Verify modal is visible
    await expect(page.locator('#create-modal')).toBeVisible();
    await expect(page.locator('.modal-header h2')).toContainText('Create New Identity');

    // Verify form fields are present
    await expect(page.locator('#funding-amount')).toBeVisible();
    await expect(page.locator('#unit-selector')).toBeVisible();
    await expect(page.locator('#identity-label')).toBeVisible();
  });

  test('validates minimum funding amount', async ({ page }) => {
    // Open modal
    await page.click('#create-identity-btn');

    // Enter amount below minimum
    await page.fill('#funding-amount', '0.0001');
    await page.selectOption('#unit-selector', 'dash');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify error notification appears
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.notification-error')).toContainText('0.001 DASH');
  });

  test('creates new identity with valid input', async ({ page }) => {
    // Open modal
    await page.click('#create-identity-btn');

    // Fill form with valid data
    await page.fill('#funding-amount', '1.5');
    await page.selectOption('#unit-selector', 'dash');
    await page.fill('#identity-label', 'Test Identity E2E');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify progress indicator appears
    await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 2000 });

    // Wait for success notification (mock takes ~7 seconds)
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.notification-success')).toContainText('created successfully');

    // Verify modal closes
    await expect(page.locator('#create-modal')).toBeHidden();

    // Verify identity view is now visible
    await expect(page.locator('#identity-view')).toBeVisible();
    await expect(page.locator('.welcome-state')).toBeHidden();

    // Verify balance is correct
    const balanceText = await page.locator('.balance-main').textContent();
    expect(balanceText).toContain('1.5 DASH');
  });

  test('displays progress messages during creation', async ({ page }) => {
    // Open modal and submit
    await page.click('#create-identity-btn');
    await page.fill('#funding-amount', '1');
    await page.click('button[type="submit"]');

    // Wait for progress to appear
    await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 2000 });

    // Verify progress message changes
    const progressMessage = page.locator('.progress-message');
    await expect(progressMessage).toBeVisible();

    // Check for different progress states
    const initialText = await progressMessage.textContent();
    expect(initialText).toBeTruthy();
  });

  test('cancels identity creation', async ({ page }) => {
    // Open modal
    await page.click('#create-identity-btn');

    // Fill some data
    await page.fill('#funding-amount', '2');

    // Click cancel
    await page.click('.modal-cancel');

    // Verify modal closes
    await expect(page.locator('#create-modal')).toBeHidden();

    // Verify still on welcome state
    await expect(page.locator('.welcome-card')).toBeVisible();
  });

  test('closes modal when clicking close button', async ({ page }) => {
    // Open modal
    await page.click('#create-identity-btn');

    // Click close button
    await page.click('.modal-close');

    // Verify modal closes
    await expect(page.locator('#create-modal')).toBeHidden();
  });

  test('creates identity with duffs unit', async ({ page }) => {
    // Open modal
    await page.click('#create-identity-btn');

    // Fill with duffs
    await page.fill('#funding-amount', '150000000');
    await page.selectOption('#unit-selector', 'duffs');
    await page.fill('#identity-label', 'Duffs Test');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 10000 });

    // Verify balance (150000000 duffs = 1.5 DASH)
    const balanceText = await page.locator('.balance-main').textContent();
    expect(balanceText).toContain('1.5 DASH');
  });

  test('displays created identity in selector', async ({ page }) => {
    // Create identity
    await page.click('#create-identity-btn');
    await page.fill('#funding-amount', '1');
    await page.fill('#identity-label', 'Selector Test');
    await page.click('button[type="submit"]');

    // Wait for creation
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 10000 });

    // Click identity selector
    await page.click('.selector-trigger');

    // Verify dropdown opens
    await expect(page.locator('.selector-dropdown')).toBeVisible();

    // Verify identity appears in list
    const identityList = page.locator('.identity-list');
    await expect(identityList).toContainText('Selector Test');
  });

  test('shows public keys after creation', async ({ page }) => {
    // Create identity
    await page.click('#create-identity-btn');
    await page.fill('#funding-amount', '1');
    await page.click('button[type="submit"]');

    // Wait for creation
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 10000 });

    // Verify keys table is visible
    await expect(page.locator('.keys-table')).toBeVisible();

    // Verify keys are displayed
    const keyRows = page.locator('.keys-table tbody tr');
    const keyCount = await keyRows.count();
    expect(keyCount).toBeGreaterThan(0);

    // Verify key count badge
    const keyCountBadge = await page.locator('#key-count').textContent();
    expect(keyCountBadge).toContain('keys');
  });

  test('shows identity info after creation', async ({ page }) => {
    // Create identity
    await page.click('#create-identity-btn');
    await page.fill('#funding-amount', '2.5');
    await page.fill('#identity-label', 'Info Test');
    await page.click('button[type="submit"]');

    // Wait for creation
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 10000 });

    // Verify identity info is displayed
    await expect(page.locator('#identity-info')).toBeVisible();

    // Check for key info fields
    await expect(page.locator('#identity-info')).toContainText('Identity ID');
    await expect(page.locator('#identity-info')).toContainText('Balance');
    await expect(page.locator('#identity-info')).toContainText('Keys');
    await expect(page.locator('#identity-info')).toContainText('Revision');
    await expect(page.locator('#identity-info')).toContainText('Created');
  });

  test('minimizes modal and shows progress in activity panel', async ({ page }) => {
    // Open modal
    await page.click('#create-identity-btn');
    await page.fill('#funding-amount', '1');
    await page.fill('#identity-label', 'Minimize Test');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for progress to appear
    await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 2000 });

    // Verify minimize button is present
    const minimizeBtn = page.locator('.modal-minimize');
    await expect(minimizeBtn).toBeVisible();

    // Click minimize button
    await minimizeBtn.click();

    // Verify modal closes
    await expect(page.locator('#create-modal')).toBeHidden({ timeout: 1000 });

    // Verify notification appears
    await expect(page.locator('.notification-success')).toContainText('Operation moved to activity panel');

    // Verify activity panel is visible and expanded
    await expect(page.locator('#activity-panel')).toBeVisible();
    await expect(page.locator('#activity-panel')).toHaveClass(/expanded/);

    // Verify operation appears in activity panel
    const operationItem = page.locator('.operation-item.operation-in-progress').first();
    await expect(operationItem).toBeVisible({ timeout: 1000 });
    await expect(operationItem).toContainText('Create Identity');

    // Verify progress bar is animating
    await expect(operationItem.locator('.operation-progress-bar')).toBeVisible();

    // Wait for operation to complete
    await expect(page.locator('.operation-item.operation-completed')).toBeVisible({ timeout: 10000 });

    // Verify final success notification
    await expect(page.locator('.notification-success')).toContainText('created successfully');
  });

  test('allows continuing work while creation is in progress', async ({ page }) => {
    // Open and submit create modal
    await page.click('#create-identity-btn');
    await page.fill('#funding-amount', '1');
    await page.click('button[type="submit"]');

    // Wait for progress and minimize
    await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 2000 });
    await page.click('.modal-minimize');

    // Verify we can navigate around
    await expect(page.locator('#create-modal')).toBeHidden();

    // Click logo to go to dashboard (this should work while operation is running)
    await page.click('.logo-section');

    // Verify dashboard is visible
    await expect(page.locator('#dashboard-view')).toBeVisible();

    // Verify operation is still running in activity panel
    await expect(page.locator('.operation-item.operation-in-progress')).toBeVisible();

    // Wait for completion
    await expect(page.locator('.operation-item.operation-completed')).toBeVisible({ timeout: 10000 });
  });
});