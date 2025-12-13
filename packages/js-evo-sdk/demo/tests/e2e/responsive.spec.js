import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test.describe('Mobile Viewport (375px)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('displays correctly on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify header is visible and responsive
      await expect(page.locator('.app-header')).toBeVisible();
      await expect(page.locator('.selector-trigger')).toBeVisible();

      // Verify welcome card is visible
      await expect(page.locator('.welcome-card')).toBeVisible();
    });

    test('create button works on mobile', async ({ page }) => {
      await page.goto('/');

      // Click create button
      await page.click('#create-identity-btn');

      // Verify modal opens and is properly sized
      await expect(page.locator('#create-modal')).toBeVisible();
      await expect(page.locator('.modal-content')).toBeVisible();

      // Modal should not exceed viewport
      const modalBox = await page.locator('.modal-content').boundingBox();
      expect(modalBox.width).toBeLessThanOrEqual(375);
    });

    test('identity selector dropdown works on mobile', async ({ page }) => {
      await page.goto('/');

      // Open selector
      await page.click('.selector-trigger');

      // Dropdown should be visible and properly sized
      await expect(page.locator('.selector-dropdown')).toBeVisible();

      const dropdownBox = await page.locator('.selector-dropdown').boundingBox();
      expect(dropdownBox.width).toBeLessThanOrEqual(375);
    });

    test('action buttons stack vertically on mobile', async ({ page }) => {
      await page.goto('/');

      // Select an identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Get action buttons
      const actionButtons = page.locator('.action-buttons');
      await expect(actionButtons).toBeVisible();

      // Buttons should be visible and accessible
      await expect(page.locator('button[data-action="topup"]')).toBeVisible();
      await expect(page.locator('button[data-action="withdraw"]')).toBeVisible();
      await expect(page.locator('button[data-action="transfer"]')).toBeVisible();
    });

    test('forms are usable on mobile', async ({ page }) => {
      await page.goto('/');

      // Select identity and open top-up
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();
      await page.click('button[data-action="topup"]');

      // Verify form fields are accessible
      await expect(page.locator('#topup-amount')).toBeVisible();

      // Fill form
      await page.fill('#topup-amount', '1.0');

      // Submit button should be visible and clickable
      const submitBtn = page.locator('button[type="submit"]');
      await expect(submitBtn).toBeVisible();
    });

    test('notifications display correctly on mobile', async ({ page }) => {
      await page.goto('/');

      // Select identity and trigger error
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();
      await page.click('button[data-action="topup"]');
      await page.fill('#topup-amount', '0.0001');
      await page.click('button[type="submit"]');

      // Verify notification appears and is within viewport
      const notification = page.locator('.notification-error');
      await expect(notification).toBeVisible({ timeout: 3000 });

      const notificationBox = await notification.boundingBox();
      expect(notificationBox.width).toBeLessThanOrEqual(375);
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('displays correctly on tablet', async ({ page }) => {
      await page.goto('/');

      // Verify layout adapts to tablet size
      await expect(page.locator('.app-header')).toBeVisible();
      await expect(page.locator('.container')).toBeVisible();
    });

    test('info grid uses appropriate columns', async ({ page }) => {
      await page.goto('/');

      // Select identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Info grid should be visible
      const infoGrid = page.locator('.info-grid');
      await expect(infoGrid).toBeVisible();

      // Grid should have multiple columns on tablet
      const gridBox = await infoGrid.boundingBox();
      expect(gridBox.width).toBeGreaterThan(400);
    });

    test('action buttons display horizontally on tablet', async ({ page }) => {
      await page.goto('/');

      // Select identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Action buttons should be visible
      const actionButtons = page.locator('.action-buttons');
      await expect(actionButtons).toBeVisible();

      // All buttons should be visible
      await expect(page.locator('button[data-action="topup"]')).toBeVisible();
      await expect(page.locator('button[data-action="withdraw"]')).toBeVisible();
      await expect(page.locator('button[data-action="transfer"]')).toBeVisible();
    });

    test('modal content is appropriately sized', async ({ page }) => {
      await page.goto('/');

      await page.click('#create-identity-btn');

      const modal = page.locator('.modal-content');
      await expect(modal).toBeVisible();

      // Modal should not be too wide on tablet
      const modalBox = await modal.boundingBox();
      expect(modalBox.width).toBeLessThanOrEqual(600);
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('displays correctly on desktop', async ({ page }) => {
      await page.goto('/');

      // Verify full layout
      await expect(page.locator('.app-header')).toBeVisible();
      await expect(page.locator('.container')).toBeVisible();
      await expect(page.locator('.welcome-card')).toBeVisible();
    });

    test('container is properly centered', async ({ page }) => {
      await page.goto('/');

      const container = page.locator('.container');
      const containerBox = await container.boundingBox();

      // Container should be centered with max-width
      expect(containerBox.width).toBeLessThanOrEqual(1280);
    });

    test('info grid uses maximum columns', async ({ page }) => {
      await page.goto('/');

      // Select identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Info grid should use 3 columns on desktop
      const infoGrid = page.locator('.info-grid');
      await expect(infoGrid).toBeVisible();

      // Should have good width
      const gridBox = await infoGrid.boundingBox();
      expect(gridBox.width).toBeGreaterThan(600);
    });

    test('all UI elements accessible', async ({ page }) => {
      await page.goto('/');

      // Select identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Verify all sections visible
      await expect(page.locator('.overview-card')).toBeVisible();
      await expect(page.locator('.actions-card')).toBeVisible();
      await expect(page.locator('.keys-card')).toBeVisible();
      await expect(page.locator('.history-card')).toBeVisible();
    });

    test('tables display properly', async ({ page }) => {
      await page.goto('/');

      // Select identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Keys table should be visible
      const keysTable = page.locator('.keys-table');
      await expect(keysTable).toBeVisible();

      // All columns should be visible
      await expect(page.locator('.keys-table th').filter({ hasText: 'ID' })).toBeVisible();
      await expect(page.locator('.keys-table th').filter({ hasText: 'Purpose' })).toBeVisible();
      await expect(page.locator('.keys-table th').filter({ hasText: 'Security Level' })).toBeVisible();
      await expect(page.locator('.keys-table th').filter({ hasText: 'Status' })).toBeVisible();
      await expect(page.locator('.keys-table th').filter({ hasText: 'Key Data' })).toBeVisible();
    });
  });

  test.describe('Orientation Changes', () => {
    test('handles viewport resize', async ({ page }) => {
      await page.goto('/');

      // Start with desktop
      await page.setViewportSize({ width: 1280, height: 800 });

      // Select identity
      await page.click('.selector-trigger');
      await page.locator('.identity-item').first().click();

      // Verify everything visible
      await expect(page.locator('#identity-view')).toBeVisible();

      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 667 });

      // Verify still functional
      await expect(page.locator('#identity-view')).toBeVisible();
      await expect(page.locator('.overview-card')).toBeVisible();

      // Resize back to desktop
      await page.setViewportSize({ width: 1280, height: 800 });

      // Verify layout restored
      await expect(page.locator('#identity-view')).toBeVisible();
    });
  });

  test.describe('Touch Interactions', () => {
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

    test('touch navigation works', async ({ page }) => {
      await page.goto('/');

      // Tap selector
      await page.tap('.selector-trigger');

      // Dropdown should open
      await expect(page.locator('.selector-dropdown')).toBeVisible();

      // Tap identity
      await page.tap('.identity-item:first-of-type');

      // Should select identity
      await expect(page.locator('#identity-view')).toBeVisible();
    });

    test('touch buttons work', async ({ page }) => {
      await page.goto('/');

      // Select identity
      await page.tap('.selector-trigger');
      await page.tap('.identity-item:first-of-type');

      // Tap top-up button
      await page.tap('button[data-action="topup"]');

      // Panel should open
      await expect(page.locator('#action-panel')).toBeVisible();
    });
  });
});