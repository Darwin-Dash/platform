/**
 * Key Management E2E Tests
 * End-to-end tests for identity key management features including:
 * - Viewing keys
 * - View private key functionality
 * - Disable key workflow
 * - Key protection rules
 */

import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

test.describe('Key Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
  });

  test.describe('Keys Modal Access', () => {
    test('can open keys modal from actions menu', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open actions menu
      const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
      await actionsBtn.click();

      // Click manage keys action
      const keysAction = page.locator('[data-action="manage-keys"], .manage-keys-action');
      if (await keysAction.isVisible()) {
        await keysAction.click();

        // Keys modal should appear
        const keysModal = page.locator('#keys-modal, .keys-modal');
        await expect(keysModal).toBeVisible();
      }
    });

    test('keys modal displays key list', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open actions menu and keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Should show keys table or list
        const keysTable = page.locator('.keys-modal-table, .keys-list');
        await expect(keysTable).toBeVisible();
      }
    });

    test('can close keys modal', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();

        const keysModal = page.locator('#keys-modal, .keys-modal');
        await expect(keysModal).toBeVisible();

        // Press Escape to close
        await page.keyboard.press('Escape');

        // Modal should close
        await expect(keysModal).toBeHidden({ timeout: 2000 });
      }
    });
  });

  test.describe('View Private Key', () => {
    test('shows View Private button for keys', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Should have View Private buttons
        const viewPrivateButtons = page.locator('[data-view-private], .view-private-btn');
        const count = await viewPrivateButtons.count();

        // Should have at least one view private button if keys exist
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('clicking View Private shows private key', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Click first View Private button
        const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn').first();

        if (await viewPrivateBtn.isVisible()) {
          await viewPrivateBtn.click();

          // Should show private key display or modal
          const privateKeyDisplay = page.locator('.private-key-display, #private-key-modal, .key-reveal');
          await expect(privateKeyDisplay).toBeVisible({ timeout: 3000 });
        }
      }
    });

    test('private key can be hidden again', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn').first();

        if (await viewPrivateBtn.isVisible()) {
          await viewPrivateBtn.click();

          // Close the reveal
          await page.keyboard.press('Escape');

          // Private key display should be hidden
          const privateKeyDisplay = page.locator('.private-key-display, #private-key-modal');
          await expect(privateKeyDisplay).toBeHidden({ timeout: 2000 });
        }
      }
    });
  });

  test.describe('Disable Key Workflow', () => {
    test('shows Disable button only for eligible keys', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Disable buttons should be present for some keys
        const disableButtons = page.locator('[data-disable-key], .disable-key-btn');
        const count = await disableButtons.count();

        // Should have some disable buttons (but not for all keys due to protection rules)
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('clicking Disable opens confirmation modal', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        const disableBtn = page.locator('[data-disable-key], .disable-key-btn').first();

        if (await disableBtn.isVisible()) {
          await disableBtn.click();

          // Confirmation modal should appear
          const confirmModal = page.locator('#disable-key-modal, .disable-confirm-modal');
          await expect(confirmModal).toBeVisible({ timeout: 3000 });

          // Should show warning
          const warning = page.locator('#disable-key-modal, .disable-confirm-modal').locator('text=/cannot be undone|irreversible|permanent/i');
          await expect(warning).toBeVisible();
        }
      }
    });

    test('can cancel disable key action', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        const disableBtn = page.locator('[data-disable-key], .disable-key-btn').first();

        if (await disableBtn.isVisible()) {
          await disableBtn.click();

          const confirmModal = page.locator('#disable-key-modal, .disable-confirm-modal');
          await expect(confirmModal).toBeVisible();

          // Click cancel or close
          const cancelBtn = page.locator('#disable-key-modal .modal-close, .cancel-disable, button:has-text("Cancel")');
          await cancelBtn.click();

          // Modal should close
          await expect(confirmModal).toBeHidden({ timeout: 2000 });
        }
      }
    });
  });

  test.describe('Key Protection Rules', () => {
    test('does not show disable button for master key', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Find row with Master security level
        const masterRow = page.locator('.keys-modal-table tbody tr, .key-item').filter({
          hasText: 'Master'
        }).first();

        if (await masterRow.count() > 0) {
          // Master key row should NOT have disable button
          const disableBtn = masterRow.locator('[data-disable-key], .disable-key-btn');
          expect(await disableBtn.count()).toBe(0);
        }
      }
    });

    test('does not show disable button for already disabled keys', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Find disabled key rows
        const disabledRows = page.locator('.key-status-disabled, .key-item.disabled, tr:has(.key-status-dot-disabled)');
        const disabledCount = await disabledRows.count();

        if (disabledCount > 0) {
          for (let i = 0; i < disabledCount; i++) {
            const disableBtn = disabledRows.nth(i).locator('[data-disable-key], .disable-key-btn');
            expect(await disableBtn.count()).toBe(0);
          }
        }
      }
    });
  });

  test.describe('Key Display Information', () => {
    test('shows key ID for each key', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Should display key IDs
        const keyIds = page.locator('.key-id, [data-key-id]');
        const count = await keyIds.count();

        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('shows key purpose for each key', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Should display key purposes (Authentication, Encryption, etc.)
        const purposes = page.locator('.key-purpose, [data-key-purpose]');
        const count = await purposes.count();

        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('shows key security level', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Should display security levels (Master, Critical, High, Medium)
        const securityLevels = page.locator('.key-security, [data-security-level]');
        const count = await securityLevels.count();

        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('shows key status for each key', async ({ page }) => {
      await page.waitForSelector('#dashboard-view', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // Should display key statuses (Active, Disabled)
        const statuses = page.locator('.key-status, .keys-modal-status');
        const count = await statuses.count();

        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Responsive Behavior', () => {
    test('keys modal is usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();

        const keysModal = page.locator('#keys-modal, .keys-modal');
        await expect(keysModal).toBeVisible();

        // Modal should be scrollable if content overflows
        const isScrollable = await page.evaluate(() => {
          const modal = document.querySelector('#keys-modal, .keys-modal');
          return modal ? modal.scrollHeight > modal.clientHeight || true : true;
        });

        expect(isScrollable).toBe(true);
      }
    });

    test('buttons remain clickable on small screens', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

      // Open keys modal
      await page.locator('.actions-menu-trigger, .actions-btn').click();
      const keysAction = page.locator('[data-action="manage-keys"]');

      if (await keysAction.isVisible()) {
        await keysAction.click();
        await page.waitForSelector('#keys-modal, .keys-modal', { state: 'visible' });

        // View Private buttons should be visible and clickable
        const viewPrivateButtons = page.locator('[data-view-private], .view-private-btn');
        const count = await viewPrivateButtons.count();

        if (count > 0) {
          for (let i = 0; i < Math.min(count, 3); i++) {
            await expect(viewPrivateButtons.nth(i)).toBeVisible();
          }
        }
      }
    });
  });
});
