import { test, expect } from '@playwright/test';

test.describe('Form Validation and Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select an identity to access action panels
    await page.click('.selector-trigger');
    await page.locator('.identity-item').first().click();
    await expect(page.locator('#identity-view')).toBeVisible();
  });

  test.describe('Amount Validation', () => {
    test('rejects negative amounts', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      // HTML5 number input should prevent negative
      await page.fill('#topup-amount', '-1');

      // Value should be rejected or empty
      const value = await page.locator('#topup-amount').inputValue();
      expect(value === '' || parseFloat(value) >= 0).toBe(true);
    });

    test('rejects zero amount', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      await page.fill('#topup-amount', '0');
      await page.click('button[type="submit"]');

      // Should show validation error
      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    });

    test('enforces minimum DASH amount', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      await page.fill('#topup-amount', '0.0009');
      await page.selectOption('#topup-unit', 'dash');
      await page.click('button[type="submit"]');

      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('.notification-error')).toContainText('0.001 DASH');
    });

    test('enforces minimum duffs amount', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      await page.fill('#topup-amount', '999999');
      await page.selectOption('#topup-unit', 'duffs');
      await page.click('button[type="submit"]');

      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('.notification-error')).toContainText('1,000,000 duffs');
    });

    test('allows valid decimal DASH amounts', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      await page.fill('#topup-amount', '1.23456789');

      // Should not show error immediately
      const value = await page.locator('#topup-amount').inputValue();
      expect(value).toBe('1.23456789');
    });
  });

  test.describe('Address Validation', () => {
    test('rejects empty address', async ({ page }) => {
      await page.click('button[data-action="withdraw"]');

      await page.fill('#withdraw-amount', '0.1');
      // Leave address empty

      // HTML5 validation should prevent submission
      await page.click('button[type="submit"]');

      // Panel should still be visible
      await expect(page.locator('#action-panel')).toBeVisible();
    });

    test('rejects invalid address format', async ({ page }) => {
      await page.click('button[data-action="withdraw"]');

      await page.fill('#withdraw-address', 'invalid-format-123');
      await page.fill('#withdraw-amount', '0.1');
      await page.click('button[type="submit"]');

      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('.notification-error')).toContainText('address');
    });

    test('accepts valid testnet address', async ({ page }) => {
      await page.click('button[data-action="withdraw"]');

      // Enter valid testnet address
      await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
      await page.fill('#withdraw-amount', '0.1');
      await page.click('button[type="submit"]');

      // Should show loading (validation passed)
      await expect(page.locator('#loading-overlay')).toBeVisible({ timeout: 1000 });
    });
  });

  test.describe('Balance Validation', () => {
    test('prevents withdrawal exceeding balance', async ({ page }) => {
      const balanceText = await page.locator('.balance-main').textContent();
      const balance = parseFloat(balanceText.match(/[\d.]+/)[0]);

      await page.click('button[data-action="withdraw"]');

      await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
      await page.fill('#withdraw-amount', (balance + 100).toString());
      await page.click('button[type="submit"]');

      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('.notification-error')).toContainText('Insufficient');
    });

    test('prevents transfer exceeding balance', async ({ page }) => {
      const balanceText = await page.locator('.balance-main').textContent();
      const balance = parseFloat(balanceText.match(/[\d.]+/)[0]);

      await page.click('button[data-action="transfer"]');

      await page.selectOption('#transfer-recipient', { index: 1 });
      await page.fill('#transfer-amount', (balance + 50).toString());
      await page.click('button[type="submit"]');

      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('.notification-error')).toContainText('Insufficient');
    });

    test('allows maximum available balance withdrawal', async ({ page }) => {
      const balanceText = await page.locator('.balance-main').textContent();
      const balance = parseFloat(balanceText.match(/[\d.]+/)[0]);

      await page.click('button[data-action="withdraw"]');

      await page.fill('#withdraw-address', 'yXkMDsZmrZxPxenTLvJJumWGB8LNDt4Ssd');
      await page.fill('#withdraw-amount', balance.toString());
      await page.click('button[type="submit"]');

      // Should show loading (validation passed)
      await expect(page.locator('#loading-overlay')).toBeVisible({ timeout: 1000 });
    });
  });

  test.describe('Identity Creation Validation', () => {
    test('validates minimum funding for new identity', async ({ page }) => {
      await page.click('#create-identity-btn');

      await page.fill('#funding-amount', '0.0005');
      await page.click('button[type="submit"]');

      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });
    });

    test('accepts valid funding amount', async ({ page }) => {
      await page.click('#create-identity-btn');

      await page.fill('#funding-amount', '1');
      await page.click('button[type="submit"]');

      // Should show progress (validation passed)
      await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 2000 });
    });

    test('accepts optional label', async ({ page }) => {
      await page.click('#create-identity-btn');

      // Leave label empty
      await page.fill('#funding-amount', '1');
      await page.click('button[type="submit"]');

      // Should still proceed
      await expect(page.locator('.modal-progress')).toBeVisible({ timeout: 2000 });
    });
  });

  test.describe('Error Notification Display', () => {
    test('shows error notification with correct styling', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      // Trigger error
      await page.fill('#topup-amount', '0.0001');
      await page.click('button[type="submit"]');

      // Verify error notification styling
      const notification = page.locator('.notification-error');
      await expect(notification).toBeVisible({ timeout: 3000 });
      await expect(notification).toHaveClass(/notification-error/);

      // Verify error icon is present
      await expect(notification.locator('.notification-icon')).toBeVisible();
    });

    test('dismisses notification when clicking close', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      // Trigger error
      await page.fill('#topup-amount', '0');
      await page.click('button[type="submit"]');

      // Wait for notification
      await expect(page.locator('.notification-error')).toBeVisible({ timeout: 3000 });

      // Click close button
      await page.click('.notification-error .notification-close');

      // Verify notification dismisses
      await expect(page.locator('.notification-error')).toBeHidden({ timeout: 1000 });
    });
  });

  test.describe('Required Fields', () => {
    test('requires amount for top-up', async ({ page }) => {
      await page.click('button[data-action="topup"]');

      // Submit without filling amount
      await page.click('button[type="submit"]');

      // HTML5 validation should prevent submission
      await expect(page.locator('#action-panel')).toBeVisible();
    });

    test('requires address for withdrawal', async ({ page }) => {
      await page.click('button[data-action="withdraw"]');

      await page.fill('#withdraw-amount', '0.5');
      // Leave address empty

      await page.click('button[type="submit"]');

      // Should remain on panel
      await expect(page.locator('#action-panel')).toBeVisible();
    });

    test('requires recipient for transfer', async ({ page }) => {
      await page.click('button[data-action="transfer"]');

      await page.fill('#transfer-amount', '0.5');
      // Leave recipient empty

      await page.click('button[type="submit"]');

      // Should show error or remain on panel
      const panelVisible = await page.locator('#action-panel').isVisible();
      expect(panelVisible).toBe(true);
    });
  });

  test.describe('Copy Functionality', () => {
    test('copies identity ID to clipboard', async ({ page }) => {
      // Mock clipboard permissions
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      // Click copy button for identity ID
      const copyBtn = page.locator('.info-item').filter({ hasText: 'Identity ID' }).locator('.copy-btn');
      await copyBtn.click();

      // Verify success notification
      await expect(page.locator('.notification-success')).toBeVisible({ timeout: 2000 });
      await expect(page.locator('.notification-success')).toContainText('clipboard');
    });

    test('copies public key to clipboard', async ({ page }) => {
      // Grant clipboard permissions
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      // Click copy button in keys table
      const copyBtn = page.locator('.keys-table tbody tr').first().locator('button[data-copy]');
      await copyBtn.click();

      // Verify success notification
      await expect(page.locator('.notification-success')).toBeVisible({ timeout: 2000 });
    });
  });
});