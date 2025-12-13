import { test, expect } from '@playwright/test';

test.describe('Identity Withdrawal Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and load app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select first identity with balance
    await page.click('.selector-trigger');
    await page.waitForSelector('.identity-list', { state: 'visible' });
    await page.locator('.identity-item').first().click();

    // Wait for identity view
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test('displays withdrawal panel when clicking withdraw button', async ({ page }) => {
    // Click withdraw action button
    await page.click('button[data-action="withdraw"]');

    // Verify withdrawal panel appears
    await expect(page.locator('#action-panel')).toBeVisible();
    await expect(page.locator('#action-panel h3')).toContainText('Withdraw');

    // Verify form fields
    await expect(page.locator('#withdraw-address')).toBeVisible();
    await expect(page.locator('#withdraw-amount')).toBeVisible();
    await expect(page.locator('#withdraw-unit')).toBeVisible();
  });

  test('shows available balance in help text', async ({ page }) => {
    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Verify help text shows available balance
    const helpText = page.locator('#withdraw-form .input-help').nth(1);
    await expect(helpText).toBeVisible();
    await expect(helpText).toContainText('Available:');
    await expect(helpText).toContainText('DASH');
  });

  test('validates address format', async ({ page }) => {
    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Enter invalid address
    await page.fill('#withdraw-address', 'invalid-address');
    await page.fill('#withdraw-amount', '0.1');

    // Submit
    await page.click('button[type="submit"]');

    // Verify error notification
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.notification-error')).toContainText('address');
  });

  test('validates sufficient balance', async ({ page }) => {
    // Get current balance
    const balanceText = await page.locator('.balance-main').textContent();
    const currentBalance = parseFloat(balanceText.match(/[\d.]+/)[0]);

    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Try to withdraw more than available
    await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
    await page.fill('#withdraw-amount', (currentBalance + 10).toString());

    // Submit
    await page.click('button[type="submit"]');

    // Verify insufficient balance error
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.notification-error')).toContainText('Insufficient balance');
  });

  test('successfully withdraws credits to address', async ({ page }) => {
    // Get initial balance
    const initialBalanceText = await page.locator('.balance-main').textContent();
    const initialBalance = parseFloat(initialBalanceText.match(/[\d.]+/)[0]);

    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Fill form with valid data
    await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
    await page.fill('#withdraw-amount', '0.25');
    await page.selectOption('#withdraw-unit', 'dash');

    // Submit
    await page.click('button[type="submit"]');

    // Verify loading overlay
    await expect(page.locator('#loading-overlay')).toBeVisible({ timeout: 1000 });

    // Wait for success (mock takes ~3 seconds)
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('.notification-success')).toContainText('Withdrawal successful');

    // Verify panel closes
    await expect(page.locator('#action-panel')).toBeHidden();

    // Verify balance decreased
    const newBalanceText = await page.locator('.balance-main').textContent();
    const newBalance = parseFloat(newBalanceText.match(/[\d.]+/)[0]);

    expect(newBalance).toBeLessThan(initialBalance);
    expect(newBalance).toBeCloseTo(initialBalance - 0.25, 1);
  });

  test('withdraws with duffs unit', async ({ page }) => {
    // Get initial balance in duffs
    const initialDuffsText = await page.locator('.balance-sub').textContent();
    const initialDuffs = parseInt(initialDuffsText.replace(/[,\s]/g, '').match(/\d+/)[0]);

    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Fill with duffs
    await page.fill('#withdraw-address', 'yYVrPomVktmhJNLJqtaBDqwUcr1PS6pvPw');
    await page.fill('#withdraw-amount', '25000000');
    await page.selectOption('#withdraw-unit', 'duffs');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 6000 });

    // Verify balance decreased
    const newDuffsText = await page.locator('.balance-sub').textContent();
    const newDuffs = parseInt(newDuffsText.replace(/[,\s]/g, '').match(/\d+/)[0]);

    expect(newDuffs).toBeLessThan(initialDuffs);
  });

  test('cancels withdrawal operation', async ({ page }) => {
    // Get initial balance
    const initialBalanceText = await page.locator('.balance-main').textContent();

    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Fill form
    await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
    await page.fill('#withdraw-amount', '1');

    // Click cancel
    await page.click('.cancel-action');

    // Verify panel closes
    await expect(page.locator('#action-panel')).toBeHidden();

    // Verify balance unchanged
    const currentBalanceText = await page.locator('.balance-main').textContent();
    expect(currentBalanceText).toBe(initialBalanceText);
  });

  test('displays transaction in activity after withdrawal', async ({ page }) => {
    // Perform withdrawal
    await page.click('button[data-action="withdraw"]');
    await page.fill('#withdraw-address', 'yNPcb7TVyh45ZTcJZBg8MHJB48tZrJBrFJ');
    await page.fill('#withdraw-amount', '0.1');
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 6000 });

    // Check activity list
    const activityList = page.locator('#activity-list');
    const activityItems = activityList.locator('.activity-item');
    const firstActivity = activityItems.first();

    // Verify withdrawal transaction appears
    await expect(firstActivity).toContainText('withdraw');
    await expect(firstActivity).toContainText('-'); // Negative/outgoing amount
  });

  test('validates testnet address format', async ({ page }) => {
    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Enter mainnet address (should fail on testnet)
    await page.fill('#withdraw-address', 'XkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
    await page.fill('#withdraw-amount', '0.1');

    // Submit
    await page.click('button[type="submit"]');

    // Verify validation error
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
  });

  test('requires address field', async ({ page }) => {
    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Leave address empty, fill amount
    await page.fill('#withdraw-amount', '0.1');

    // Submit - HTML5 validation should prevent submission
    await page.click('button[type="submit"]');

    // Panel should still be visible (form didn't submit)
    await expect(page.locator('#action-panel')).toBeVisible();
  });

  test('requires amount field', async ({ page }) => {
    // Open withdrawal panel
    await page.click('button[data-action="withdraw"]');

    // Fill address, leave amount empty
    await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');

    // Submit - HTML5 validation should prevent submission
    await page.click('button[type="submit"]');

    // Panel should still be visible
    await expect(page.locator('#action-panel')).toBeVisible();
  });
});