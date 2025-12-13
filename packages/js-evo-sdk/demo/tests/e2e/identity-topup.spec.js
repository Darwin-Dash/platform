import { test, expect } from '@playwright/test';

test.describe('Identity Top-Up Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and wait for load
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select first pre-loaded mock identity (should exist from mock-data)
    await page.click('.selector-trigger');
    await page.waitForSelector('.identity-list', { state: 'visible' });

    // Click first identity in list
    const firstIdentity = page.locator('.identity-item').first();
    await firstIdentity.click();

    // Wait for identity view to load
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test('displays top-up panel when clicking top-up button', async ({ page }) => {
    // Click top-up action button
    await page.click('button[data-action="topup"]');

    // Verify top-up panel appears
    await expect(page.locator('#action-panel')).toBeVisible();
    await expect(page.locator('#action-panel h3')).toContainText('Top Up');

    // Verify form fields are present
    await expect(page.locator('#topup-amount')).toBeVisible();
    await expect(page.locator('#topup-unit')).toBeVisible();
  });

  test('validates minimum top-up amount', async ({ page }) => {
    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Enter amount below minimum
    await page.fill('#topup-amount', '0.0001');
    await page.selectOption('#topup-unit', 'dash');

    // Submit
    await page.click('button[type="submit"]');

    // Verify error notification
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.notification-error')).toContainText('0.001 DASH');
  });

  test('successfully tops up identity with DASH', async ({ page }) => {
    // Get initial balance
    const initialBalanceText = await page.locator('.balance-main').textContent();
    const initialBalance = parseFloat(initialBalanceText.match(/[\d.]+/)[0]);

    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Fill form
    await page.fill('#topup-amount', '0.5');
    await page.selectOption('#topup-unit', 'dash');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success notification (mock takes ~2 seconds)
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.notification-success')).toContainText('Top-up successful');

    // Verify panel closes
    await expect(page.locator('#action-panel')).toBeHidden();

    // Verify balance increased
    const newBalanceText = await page.locator('.balance-main').textContent();
    const newBalance = parseFloat(newBalanceText.match(/[\d.]+/)[0]);

    expect(newBalance).toBeGreaterThan(initialBalance);
    expect(newBalance).toBeCloseTo(initialBalance + 0.5, 1);
  });

  test('successfully tops up identity with duffs', async ({ page }) => {
    // Get initial balance in duffs
    const initialDuffsText = await page.locator('.balance-sub').textContent();
    const initialDuffs = parseInt(initialDuffsText.replace(/[,\s]/g, '').match(/\d+/)[0]);

    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Fill form with duffs
    await page.fill('#topup-amount', '50000000');
    await page.selectOption('#topup-unit', 'duffs');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Verify balance increased
    const newDuffsText = await page.locator('.balance-sub').textContent();
    const newDuffs = parseInt(newDuffsText.replace(/[,\s]/g, '').match(/\d+/)[0]);

    expect(newDuffs).toBeGreaterThan(initialDuffs);
  });

  test('displays progress in activity panel during top-up', async ({ page }) => {
    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Fill and submit
    await page.fill('#topup-amount', '1');
    await page.click('button[type="submit"]');

    // Verify activity panel appears and expands
    await expect(page.locator('#activity-panel')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('#activity-panel')).toHaveClass(/expanded/);

    // Verify operation appears in panel
    const operationItem = page.locator('.operation-item.operation-in-progress').first();
    await expect(operationItem).toBeVisible({ timeout: 1000 });
    await expect(operationItem).toContainText('Top Up');

    // Verify progress bar is visible
    await expect(operationItem.locator('.operation-progress-bar')).toBeVisible();

    // Wait for completion
    await expect(page.locator('.operation-item.operation-completed')).toBeVisible({ timeout: 10000 });
  });

  test('cancels top-up operation', async ({ page }) => {
    // Get initial balance
    const initialBalanceText = await page.locator('.balance-main').textContent();

    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Fill form
    await page.fill('#topup-amount', '5');

    // Click cancel
    await page.click('.cancel-action');

    // Verify panel closes
    await expect(page.locator('#action-panel')).toBeHidden();

    // Verify balance unchanged
    const currentBalanceText = await page.locator('.balance-main').textContent();
    expect(currentBalanceText).toBe(initialBalanceText);
  });

  test('updates revision after top-up', async ({ page }) => {
    // Get initial revision
    const revisionElement = page.locator('#identity-info').locator('text=Revision').locator('..');
    const initialRevisionText = await revisionElement.textContent();
    const initialRevision = parseInt(initialRevisionText.match(/\d+/)[0]);

    // Perform top-up
    await page.click('button[data-action="topup"]');
    await page.fill('#topup-amount', '0.1');
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Verify revision increased
    const newRevisionText = await revisionElement.textContent();
    const newRevision = parseInt(newRevisionText.match(/\d+/)[0]);

    expect(newRevision).toBe(initialRevision + 1);
  });

  test('shows transaction in activity list after top-up', async ({ page }) => {
    // Perform top-up
    await page.click('button[data-action="topup"]');
    await page.fill('#topup-amount', '0.25');
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Check activity list
    const activityList = page.locator('#activity-list');
    await expect(activityList).toBeVisible();

    // Verify new transaction appears
    const activityItems = activityList.locator('.activity-item');
    const firstActivity = activityItems.first();

    await expect(firstActivity).toBeVisible();
    await expect(firstActivity).toContainText('topup');
  });

  test('validates numeric input', async ({ page }) => {
    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Try to enter non-numeric value
    await page.fill('#topup-amount', 'abc');

    // Verify field rejects non-numeric input (HTML5 validation)
    const value = await page.locator('#topup-amount').inputValue();
    expect(value).toBe('');
  });

  test('allows decimal amounts', async ({ page }) => {
    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Enter decimal amount
    await page.fill('#topup-amount', '1.23456789');

    // Verify value is accepted
    const value = await page.locator('#topup-amount').inputValue();
    expect(value).toBe('1.23456789');
  });

  test('shows help text with minimum amount', async ({ page }) => {
    // Open top-up panel
    await page.click('button[data-action="topup"]');

    // Verify help text is displayed
    const helpText = page.locator('.input-help');
    await expect(helpText).toBeVisible();
    await expect(helpText).toContainText('0.001 DASH');
  });

  test('displays updated last modified timestamp', async ({ page }) => {
    // Perform top-up
    await page.click('button[data-action="topup"]');
    await page.fill('#topup-amount', '0.1');
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Check last updated field
    const lastUpdated = page.locator('#identity-info').locator('text=Last Updated').locator('..');
    await expect(lastUpdated).toContainText('Just now');
  });
});