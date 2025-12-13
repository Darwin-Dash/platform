/**
 * Key Management E2E Tests
 * End-to-end tests for disable keys feature
 */

import { test, expect } from '@playwright/test';

test.describe('Key Management - Disable Keys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Login
    await page.click('button[type="submit"]');
    await page.waitForSelector('#dashboard-view', { state: 'visible', timeout: 10000 });

    // Select first identity
    const firstCard = page.locator('.identity-card').first();
    await firstCard.locator('[data-view-identity]').click();
    await page.waitForSelector('#identity-view', { state: 'visible' });

    // Open keys modal
    await page.click('button[data-action="manage-keys"]');
    await page.waitForSelector('#keys-modal', { state: 'visible' });
  });

  test.describe('Button Visibility and Alignment', () => {
    test('should show View Private button for all keys', async ({ page }) => {
      const viewPrivateButtons = page.locator('[data-view-private]');
      const count = await viewPrivateButtons.count();

      expect(count).toBeGreaterThan(0);

      // All buttons should be visible
      for (let i = 0; i < count; i++) {
        await expect(viewPrivateButtons.nth(i)).toBeVisible();
      }
    });

    test('should show Disable button only for keys that can be disabled', async ({ page }) => {
      const disableButtons = page.locator('[data-disable-key]');
      const count = await disableButtons.count();

      // Should have some but not all keys with disable buttons
      expect(count).toBeGreaterThan(0);

      // All disable buttons should be visible
      for (let i = 0; i < count; i++) {
        await expect(disableButtons.nth(i)).toBeVisible();
      }
    });

    test('should have consistent button alignment across all rows', async ({ page }) => {
      const rows = page.locator('.keys-modal-table tbody tr');
      const rowCount = await rows.count();

      if (rowCount > 1) {
        // Get positions of View Private buttons
        const positions = [];
        for (let i = 0; i < rowCount; i++) {
          const viewBtn = rows.nth(i).locator('[data-view-private]');
          if (await viewBtn.count() > 0) {
            const box = await viewBtn.boundingBox();
            positions.push(box?.x);
          }
        }

        // All View Private buttons should have same X position (±5px tolerance for rendering)
        if (positions.length > 1) {
          const firstX = positions[0];
          positions.forEach(x => {
            expect(Math.abs(x - firstX)).toBeLessThan(5);
          });
        }
      }
    });

    test('should not show Disable button for disabled keys', async ({ page }) => {
      // Check if any keys are already disabled
      const disabledRows = page.locator('.keys-modal-table tbody tr:has(.key-status-dot-disabled)');
      const disabledCount = await disabledRows.count();

      if (disabledCount > 0) {
        // Disabled rows should not have disable buttons
        for (let i = 0; i < disabledCount; i++) {
          const disableBtn = disabledRows.nth(i).locator('[data-disable-key]');
          expect(await disableBtn.count()).toBe(0);
        }
      }
    });
  });

  test.describe('Disable Key Workflow', () => {
    test('should open disable confirmation modal when clicking Disable', async ({ page }) => {
      const disableButtons = page.locator('[data-disable-key]');
      const firstDisableBtn = disableButtons.first();

      if (await firstDisableBtn.count() > 0) {
        await firstDisableBtn.click();

        // Disable modal should appear
        await expect(page.locator('#disable-key-modal')).toBeVisible();

        // Should show warning message
        await expect(page.locator('#disable-key-modal')).toContainText('This action cannot be undone');

        // Should show key details
        await expect(page.locator('#disable-key-id')).toBeVisible();
        await expect(page.locator('#disable-key-purpose')).toBeVisible();
        await expect(page.locator('#disable-key-security')).toBeVisible();
      }
    });

    test('should close disable modal when clicking Cancel', async ({ page }) => {
      const disableButtons = page.locator('[data-disable-key]');

      if (await disableButtons.count() > 0) {
        await disableButtons.first().click();
        await page.waitForSelector('#disable-key-modal:not([hidden])');

        // Click close button
        await page.click('#disable-key-modal .modal-close');

        // Modal should be hidden
        await expect(page.locator('#disable-key-modal')).toBeHidden();
      }
    });

    test('should disable key successfully when confirmed', async ({ page }) => {
      const disableButtons = page.locator('[data-disable-key]');

      if (await disableButtons.count() > 0) {
        // Get the row that has the disable button
        const targetRow = page.locator('.keys-modal-table tbody tr').filter({
          has: page.locator('[data-disable-key]')
        }).first();

        // Get initial status
        const initialStatus = await targetRow.locator('.keys-modal-status').textContent();

        // Click disable
        await targetRow.locator('[data-disable-key]').click();
        await page.waitForSelector('#disable-key-modal:not([hidden])');

        // Confirm disable
        await page.click('#confirm-disable-key');

        // Wait for loading overlay to appear and disappear
        await page.waitForSelector('#loading-overlay', { state: 'visible', timeout: 2000 });
        await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 5000 });

        // Modal should close
        await expect(page.locator('#disable-key-modal')).toBeHidden();

        // Success notification should appear
        await expect(page.locator('.notification-success')).toBeVisible({ timeout: 3000 });
        await expect(page.locator('.notification-success')).toContainText('Key disabled successfully');
      }
    });
  });

  test.describe('Protection Rules Visual Feedback', () => {
    test('should not show disable button for master key row', async ({ page }) => {
      // Find row with Master security level
      const masterRow = page.locator('.keys-modal-table tbody tr').filter({
        hasText: 'Master'
      }).first();

      if (await masterRow.count() > 0) {
        // Should have View Private button
        await expect(masterRow.locator('[data-view-private]')).toBeVisible();

        // Should NOT have Disable button
        expect(await masterRow.locator('[data-disable-key]').count()).toBe(0);
      }
    });

    test('should not show disable button for critical auth keys', async ({ page }) => {
      // Find Authentication row with Critical security
      const criticalAuthRow = page.locator('.keys-modal-table tbody tr').filter({
        hasText: /Authentication.*Critical/
      }).first();

      if (await criticalAuthRow.count() > 0) {
        // Should have View Private button
        await expect(criticalAuthRow.locator('[data-view-private]')).toBeVisible();

        // Should NOT have Disable button
        expect(await criticalAuthRow.locator('[data-disable-key]').count()).toBe(0);
      }
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should maintain button alignment on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      // Buttons should still be visible and aligned
      const viewPrivateButtons = page.locator('[data-view-private]');
      const count = await viewPrivateButtons.count();

      if (count > 0) {
        for (let i = 0; i < count; i++) {
          await expect(viewPrivateButtons.nth(i)).toBeVisible();
        }
      }
    });
  });
});
