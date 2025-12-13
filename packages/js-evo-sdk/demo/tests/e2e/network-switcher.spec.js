/**
 * Network Switcher E2E Tests
 * Tests visual appearance, dropdown interactions, network switching, and persistence
 */

import { test, expect } from '@playwright/test';

test.describe('Network Switcher E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe('Visual Appearance and Accessibility', () => {
    test('should display network switcher in header', async ({ page }) => {
      await page.goto('/');

      const networkSwitcher = page.locator('#network-switcher-container');
      await expect(networkSwitcher).toBeVisible();
    });

    test('should show testnet as default network', async ({ page }) => {
      await page.goto('/');

      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Testnet');
    });

    test('should have accessible aria attributes', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      await expect(trigger).toHaveAttribute('aria-label', 'Select network');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    test('should display network indicator', async ({ page }) => {
      await page.goto('/');

      const indicator = page.locator('.network-selector-trigger .network-indicator');
      await expect(indicator).toBeVisible();
    });

    test('should display chevron icon', async ({ page }) => {
      await page.goto('/');

      const chevron = page.locator('.network-selector-trigger .chevron-icon');
      await expect(chevron).toBeVisible();
    });
  });

  test.describe('Dropdown Interactions', () => {
    test('should open dropdown when trigger is clicked', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Dropdown should be hidden initially
      await expect(dropdown).toHaveAttribute('hidden', '');

      // Click to open
      await trigger.click();

      // Dropdown should be visible
      await expect(dropdown).not.toHaveAttribute('hidden', '');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    test('should close dropdown when trigger is clicked again', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open dropdown
      await trigger.click();
      await expect(dropdown).not.toHaveAttribute('hidden', '');

      // Close dropdown
      await trigger.click();
      await expect(dropdown).toHaveAttribute('hidden', '');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    test('should close dropdown when clicking outside', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open dropdown
      await trigger.click();
      await expect(dropdown).not.toHaveAttribute('hidden', '');

      // Click outside (on the header)
      await page.locator('.app-header').click({ position: { x: 10, y: 10 } });

      // Dropdown should close
      await expect(dropdown).toHaveAttribute('hidden', '');
    });

    test('should close dropdown when pressing Escape key', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open dropdown
      await trigger.click();
      await expect(dropdown).not.toHaveAttribute('hidden', '');

      // Press Escape
      await page.keyboard.press('Escape');

      // Dropdown should close
      await expect(dropdown).toHaveAttribute('hidden', '');
    });

    test('should display both network options in dropdown', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      await trigger.click();

      const testnetOption = page.locator('[data-network="testnet"]');
      const mainnetOption = page.locator('[data-network="mainnet"]');

      await expect(testnetOption).toBeVisible();
      await expect(mainnetOption).toBeVisible();
      await expect(testnetOption).toContainText('Testnet');
      await expect(mainnetOption).toContainText('Mainnet');
    });

    test('should show checkmark on selected network option', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      await trigger.click();

      const testnetOption = page.locator('[data-network="testnet"]');

      // Testnet should be selected by default
      await expect(testnetOption).toHaveClass(/selected/);
    });
  });

  test.describe('Network Switching Functionality', () => {
    test('should switch from testnet to mainnet', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const networkName = page.locator('#current-network-name');

      // Verify initial state
      await expect(networkName).toHaveText('Testnet');

      // Open dropdown and select mainnet
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      // Verify network switched
      await expect(networkName).toHaveText('Mainnet');
    });

    test('should switch from mainnet to testnet', async ({ page }) => {
      // Set mainnet in localStorage first
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('dash-network', 'mainnet'));
      await page.reload();

      const trigger = page.locator('.network-selector-trigger');
      const networkName = page.locator('#current-network-name');

      // Verify initial state is mainnet
      await expect(networkName).toHaveText('Mainnet');

      // Switch to testnet
      await trigger.click();
      await page.locator('[data-network="testnet"]').click();

      // Verify network switched
      await expect(networkName).toHaveText('Testnet');
    });

    test('should update selected state when switching networks', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');

      // Open dropdown
      await trigger.click();

      const testnetOption = page.locator('[data-network="testnet"]');
      const mainnetOption = page.locator('[data-network="mainnet"]');

      // Initially testnet is selected
      await expect(testnetOption).toHaveClass(/selected/);
      await expect(mainnetOption).not.toHaveClass(/selected/);

      // Switch to mainnet
      await mainnetOption.click();

      // Open dropdown again to check selected state
      await trigger.click();

      // Now mainnet should be selected
      await expect(testnetOption).not.toHaveClass(/selected/);
      await expect(mainnetOption).toHaveClass(/selected/);
    });

    test('should close dropdown after selecting a network', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open dropdown
      await trigger.click();
      await expect(dropdown).not.toHaveAttribute('hidden', '');

      // Select mainnet
      await page.locator('[data-network="mainnet"]').click();

      // Dropdown should close
      await expect(dropdown).toHaveAttribute('hidden', '');
    });

    test('should update network indicator color for mainnet', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const indicator = page.locator('.network-selector-trigger .network-indicator');

      // Initially should not have mainnet class
      await expect(indicator).not.toHaveClass(/network-indicator-mainnet/);

      // Switch to mainnet
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      // Should now have mainnet class
      await expect(indicator).toHaveClass(/network-indicator-mainnet/);
    });

    test('should remove mainnet indicator color when switching back to testnet', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('dash-network', 'mainnet'));
      await page.reload();

      const trigger = page.locator('.network-selector-trigger');
      const indicator = page.locator('.network-selector-trigger .network-indicator');

      // Should have mainnet class initially
      await expect(indicator).toHaveClass(/network-indicator-mainnet/);

      // Switch to testnet
      await trigger.click();
      await page.locator('[data-network="testnet"]').click();

      // Should not have mainnet class anymore
      await expect(indicator).not.toHaveClass(/network-indicator-mainnet/);
    });
  });

  test.describe('Persistence Across Page Reloads', () => {
    test('should persist testnet selection after page reload', async ({ page }) => {
      await page.goto('/');

      const networkName = page.locator('#current-network-name');

      // Verify testnet is selected
      await expect(networkName).toHaveText('Testnet');

      // Reload page
      await page.reload();

      // Should still be testnet
      await expect(networkName).toHaveText('Testnet');
    });

    test('should persist mainnet selection after page reload', async ({ page }) => {
      await page.goto('/');

      // Switch to mainnet
      const trigger = page.locator('.network-selector-trigger');
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Mainnet');

      // Reload page
      await page.reload();

      // Should still be mainnet
      await expect(networkName).toHaveText('Mainnet');
    });

    test('should restore network from localStorage on page load', async ({ page }) => {
      await page.goto('/');

      // Set mainnet in localStorage
      await page.evaluate(() => localStorage.setItem('dash-network', 'mainnet'));

      // Reload page
      await page.reload();

      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Mainnet');

      const indicator = page.locator('.network-selector-trigger .network-indicator');
      await expect(indicator).toHaveClass(/network-indicator-mainnet/);
    });

    test('should maintain network selection across multiple page navigations', async ({ page }) => {
      await page.goto('/');

      // Switch to mainnet
      const trigger = page.locator('.network-selector-trigger');
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      // Navigate away and back
      await page.goto('about:blank');
      await page.goto('/');

      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Mainnet');
    });
  });

  test.describe('Visual Feedback and Animations', () => {
    test('should show dropdown enter animation', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open dropdown
      await trigger.click();

      // Should have animation class
      await expect(dropdown).toHaveClass(/dropdown-enter/);
    });

    test('should remove animation class when closing dropdown', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open and close dropdown
      await trigger.click();
      await expect(dropdown).toHaveClass(/dropdown-enter/);

      await trigger.click();

      // Animation class should be removed
      await expect(dropdown).not.toHaveClass(/dropdown-enter/);
    });
  });

  test.describe('Edge Cases and Error Handling', () => {
    test('should handle rapid clicking on trigger', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Rapidly click trigger multiple times
      await trigger.click();
      await trigger.click();
      await trigger.click();

      // Dropdown should end up closed (toggle behavior)
      await expect(dropdown).toHaveAttribute('hidden', '');
    });

    test('should handle rapid network switching', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const networkName = page.locator('#current-network-name');

      // Rapidly switch networks
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      await trigger.click();
      await page.locator('[data-network="testnet"]').click();

      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      // Final state should be mainnet
      await expect(networkName).toHaveText('Mainnet');
    });

    test('should handle invalid localStorage values gracefully', async ({ page }) => {
      await page.goto('/');

      // Set invalid network value
      await page.evaluate(() => localStorage.setItem('dash-network', 'invalid-network'));

      // Reload page
      await page.reload();

      // Should fall back to testnet (default)
      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Testnet');
    });

    test('should handle missing localStorage gracefully', async ({ page }) => {
      // Start with clean localStorage
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Should default to testnet
      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Testnet');
    });
  });

  test.describe('Integration with Application State', () => {
    test('should allow switching networks before login', async ({ page }) => {
      await page.goto('/');

      // Should be on login view
      const loginView = page.locator('#login-view');
      await expect(loginView).toBeVisible();

      // Should be able to switch networks
      const trigger = page.locator('.network-selector-trigger');
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Mainnet');
    });

    test('should maintain network selection across different views', async ({ page }) => {
      await page.goto('/');

      // Switch to mainnet on login view
      const trigger = page.locator('.network-selector-trigger');
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      // Network should still be mainnet regardless of view state
      const networkName = page.locator('#current-network-name');
      await expect(networkName).toHaveText('Mainnet');
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should be keyboard accessible', async ({ page }) => {
      await page.goto('/');

      // Tab to network switcher
      await page.keyboard.press('Tab');
      // Continue tabbing until we reach the network switcher
      // (exact number depends on page structure)
      let focused = await page.locator(':focus');
      let attempts = 0;
      while (!(await focused.getAttribute('aria-label'))?.includes('Select network') && attempts < 20) {
        await page.keyboard.press('Tab');
        focused = await page.locator(':focus');
        attempts++;
      }

      // Should be focused on trigger
      await expect(focused).toHaveAttribute('aria-label', 'Select network');

      // Press Enter to open dropdown
      await page.keyboard.press('Enter');
      const dropdown = page.locator('.network-dropdown');
      await expect(dropdown).not.toHaveAttribute('hidden', '');
    });

    test('should close dropdown with Escape key', async ({ page }) => {
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const dropdown = page.locator('.network-dropdown');

      // Open dropdown
      await trigger.click();
      await expect(dropdown).not.toHaveAttribute('hidden', '');

      // Press Escape
      await page.keyboard.press('Escape');

      // Should close
      await expect(dropdown).toHaveAttribute('hidden', '');
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('should be visible on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      const networkSwitcher = page.locator('#network-switcher-container');
      await expect(networkSwitcher).toBeVisible();
    });

    test('should be functional on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      const trigger = page.locator('.network-selector-trigger');
      const networkName = page.locator('#current-network-name');

      // Should be able to switch networks
      await trigger.click();
      await page.locator('[data-network="mainnet"]').click();

      await expect(networkName).toHaveText('Mainnet');
    });
  });
});
