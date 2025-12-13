import { test, expect } from '@playwright/test';

test.describe('Identity Transfer Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and load
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select first identity (source for transfers)
    await page.click('.selector-trigger');
    await page.waitForSelector('.identity-list', { state: 'visible' });
    await page.locator('.identity-item').first().click();

    // Wait for identity view
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test('displays transfer panel when clicking transfer button', async ({ page }) => {
    // Click transfer action button
    await page.click('button[data-action="transfer"]');

    // Verify transfer panel appears
    await expect(page.locator('#action-panel')).toBeVisible();
    await expect(page.locator('#action-panel h3')).toContainText('Transfer');

    // Verify form fields
    await expect(page.locator('#transfer-recipient')).toBeVisible();
    await expect(page.locator('#transfer-amount')).toBeVisible();
    await expect(page.locator('#transfer-unit')).toBeVisible();
  });

  test('shows other identities in recipient dropdown', async ({ page }) => {
    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Click recipient dropdown
    await page.click('#transfer-recipient');

    // Verify dropdown has options (excluding current identity)
    const options = page.locator('#transfer-recipient option');
    const optionCount = await options.count();

    // Should have at least: placeholder + 2 other identities from mock data
    expect(optionCount).toBeGreaterThanOrEqual(3);

    // Verify placeholder option
    const firstOption = await options.first().textContent();
    expect(firstOption).toContain('Select recipient');
  });

  test('validates recipient selection', async ({ page }) => {
    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Fill amount but no recipient
    await page.fill('#transfer-amount', '0.5');

    // Submit
    await page.click('button[type="submit"]');

    // Verify error notification
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.notification-error')).toContainText('recipient');
  });

  test('validates sufficient balance for transfer', async ({ page }) => {
    // Get current balance
    const balanceText = await page.locator('.balance-main').textContent();
    const currentBalance = parseFloat(balanceText.match(/[\d.]+/)[0]);

    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Select recipient
    await page.selectOption('#transfer-recipient', { index: 1 });

    // Try to transfer more than available
    await page.fill('#transfer-amount', (currentBalance + 10).toString());

    // Submit
    await page.click('button[type="submit"]');

    // Verify insufficient balance error
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.notification-error')).toContainText('Insufficient balance');
  });

  test('successfully transfers credits between identities', async ({ page }) => {
    // Get sender's initial balance
    const senderInitialText = await page.locator('.balance-main').textContent();
    const senderInitial = parseFloat(senderInitialText.match(/[\d.]+/)[0]);

    // Get sender ID for later verification
    const senderIdText = await page.locator('.monospace').first().textContent();

    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Get recipient option value (second option after placeholder)
    const recipientOption = page.locator('#transfer-recipient option').nth(1);
    const recipientId = await recipientOption.getAttribute('value');

    // Fill form
    await page.selectOption('#transfer-recipient', recipientId);
    await page.fill('#transfer-amount', '0.25');
    await page.selectOption('#transfer-unit', 'dash');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for loading
    await expect(page.locator('#loading-overlay')).toBeVisible({ timeout: 1000 });

    // Wait for success (mock takes ~2.5 seconds)
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.notification-success')).toContainText('Transfer successful');

    // Verify panel closes
    await expect(page.locator('#action-panel')).toBeHidden();

    // Verify sender balance decreased
    const senderNewText = await page.locator('.balance-main').textContent();
    const senderNew = parseFloat(senderNewText.match(/[\d.]+/)[0]);

    expect(senderNew).toBeLessThan(senderInitial);
    expect(senderNew).toBeCloseTo(senderInitial - 0.25, 1);

    // Switch to recipient identity to verify balance increased
    await page.click('.selector-trigger');
    const recipientItem = page.locator('.identity-list').locator(`li:has-text("${recipientId.substring(0, 8)}")`);
    await recipientItem.click();

    // Note: We can't easily verify recipient balance increase without knowing initial balance
    // But we can verify the recipient identity loaded
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test('transfers with duffs unit', async ({ page }) => {
    // Get initial balance
    const initialDuffsText = await page.locator('.balance-sub').textContent();
    const initialDuffs = parseInt(initialDuffsText.replace(/[,\s]/g, '').match(/\d+/)[0]);

    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Fill form with duffs
    await page.selectOption('#transfer-recipient', { index: 1 });
    await page.fill('#transfer-amount', '10000000');
    await page.selectOption('#transfer-unit', 'duffs');

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Verify balance decreased
    const newDuffsText = await page.locator('.balance-sub').textContent();
    const newDuffs = parseInt(newDuffsText.replace(/[,\s]/g, '').match(/\d+/)[0]);

    expect(newDuffs).toBeLessThan(initialDuffs);
  });

  test('cancels transfer operation', async ({ page }) => {
    // Get initial balance
    const initialBalanceText = await page.locator('.balance-main').textContent();

    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Fill form
    await page.selectOption('#transfer-recipient', { index: 1 });
    await page.fill('#transfer-amount', '0.5');

    // Cancel
    await page.click('.cancel-action');

    // Verify panel closes
    await expect(page.locator('#action-panel')).toBeHidden();

    // Verify balance unchanged
    const currentBalanceText = await page.locator('.balance-main').textContent();
    expect(currentBalanceText).toBe(initialBalanceText);
  });

  test('shows transaction in activity list', async ({ page }) => {
    // Perform transfer
    await page.click('button[data-action="transfer"]');
    await page.selectOption('#transfer-recipient', { index: 1 });
    await page.fill('#transfer-amount', '0.05');
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Check activity list
    const activityList = page.locator('#activity-list');
    const firstActivity = activityList.locator('.activity-item').first();

    // Verify transfer transaction appears
    await expect(firstActivity).toContainText('transfer');

    // Verify it shows as outgoing
    await expect(firstActivity.locator('.activity-icon')).toHaveClass(/out/);
  });

  test('validates minimum transfer amount', async ({ page }) => {
    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Fill with amount below minimum
    await page.selectOption('#transfer-recipient', { index: 1 });
    await page.fill('#transfer-amount', '0.0001');

    // Submit
    await page.click('button[type="submit"]');

    // Verify error
    await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.notification-error')).toContainText('0.001 DASH');
  });

  test('requires recipient selection', async ({ page }) => {
    // Open transfer panel
    await page.click('button[data-action="transfer"]');

    // Fill amount but leave recipient unselected
    await page.fill('#transfer-amount', '0.5');

    // Submit - should validate recipient
    await page.click('button[type="submit"]');

    // Verify still on transfer panel or error shown
    await expect(page.locator('#action-panel')).toBeVisible();
  });
});