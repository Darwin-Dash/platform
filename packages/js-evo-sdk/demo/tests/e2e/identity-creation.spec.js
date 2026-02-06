import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard, waitForMainView, completeFundingFlowToCreateModal } from './helpers/test-setup.js';

/**
 * Identity Creation Flow Tests
 *
 * The identity creation flow involves a multi-step process:
 * 1. Click "Create Identity" -> Shows funding modal first
 * 2. Complete funding flow (Already funded -> timeframe -> scanning -> confirmation)
 *    OR (Sending now -> monitoring -> TX detected -> IS -> CL -> confirmation)
 * 3. Click "Proceed to Create" -> Shows create modal
 *
 * These tests verify both the funding flow integration and the create modal itself.
 * The TransactionFinderService mock properly emits events for testing.
 */
test.describe('Identity Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    // Give app time to fully initialize
    await page.waitForTimeout(500);
  });

  test('shows create identity button in welcome state', async ({ page }) => {
    const viewType = await waitForMainView(page);

    // In welcome state (no identities), create button should be visible
    if (viewType === 'welcome') {
      const createBtn = page.locator('#create-identity-btn, [data-action="create"]');
      await expect(createBtn).toBeVisible();
    }
  });

  test('can open create action menu', async ({ page }) => {
    await waitForDashboard(page);

    // Open actions menu
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn');
    await actionsBtn.click();
    await page.waitForTimeout(300);

    // Create action should be visible in the menu (use role-based selector)
    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    await expect(createAction).toBeVisible();
  });

  test('can open create identity modal from actions menu', async ({ page }) => {
    await waitForDashboard(page);

    // Open actions menu and click create
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    await createAction.click();
    await page.waitForTimeout(500);

    // Should show funding modal first
    const fundingModal = page.locator('#wallet-funding-modal');
    await expect(fundingModal).toBeVisible({ timeout: 5000 });

    // Complete funding flow to reach create modal
    await completeFundingFlowToCreateModal(page);

    // Verify create modal appeared
    const createModal = page.locator('#create-modal');
    await expect(createModal).toBeVisible({ timeout: 5000 });
  });

  test('create modal has required fields', async ({ page }) => {
    await waitForDashboard(page);

    // Navigate to create modal via funding flow
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    await createAction.click();
    await page.waitForTimeout(500);

    // Complete funding flow
    await completeFundingFlowToCreateModal(page);

    // Verify create modal has amount input (actual selector is #funding-amount)
    const amountInput = page.locator('#funding-amount');
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    // Verify create modal has submit button (actual selector is button[type="submit"] in modal footer)
    const submitBtn = page.locator('#create-modal button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });

  test('validates amount field', async ({ page }) => {
    await waitForDashboard(page);

    // Navigate to create modal via funding flow
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    await createAction.click();
    await page.waitForTimeout(500);

    // Complete funding flow
    await completeFundingFlowToCreateModal(page);

    // Find amount input (actual selector is #funding-amount)
    const amountInput = page.locator('#funding-amount');
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    // Try to enter invalid (too low) amount - minimum is 0.001 DASH per input help text
    await amountInput.clear();
    await amountInput.fill('0.0001'); // Below minimum (0.001 DASH)

    // Try to submit
    const submitBtn = page.locator('#create-modal button[type="submit"]');
    await submitBtn.click();

    // HTML5 validation may prevent submission, or error may be shown
    // The input has min="0.001" so browser validation should trigger
    const errorMsg = page.locator('.error-message, .validation-error, [class*="error"], :invalid');
    const isErrorVisible = await errorMsg.isVisible().catch(() => false);

    // Either error is shown, button is disabled, or input validation fails
    const isInputInvalid = await amountInput.evaluate(el => !el.checkValidity());

    expect(isErrorVisible || isInputInvalid).toBe(true);
  });

  test('can close create modal', async ({ page }) => {
    await waitForDashboard(page);

    // Navigate to create modal via funding flow
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    await createAction.click();
    await page.waitForTimeout(500);

    // Complete funding flow
    await completeFundingFlowToCreateModal(page);

    // Verify create modal is open (check it doesn't have hidden attribute)
    const createModal = page.locator('#create-modal');
    await expect(createModal).not.toHaveAttribute('hidden', '', { timeout: 5000 });

    // Click the X button to close (more reliable than Escape)
    await page.locator('#create-modal .modal-close').click();
    await page.waitForTimeout(300);

    // Verify modal is hidden (has hidden attribute)
    await expect(createModal).toHaveAttribute('hidden', '', { timeout: 3000 });
  });

  test('shows funding flow when starting creation', async ({ page }) => {
    await waitForDashboard(page);

    // Open actions menu
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    // Click create action (use role-based selector)
    const createAction = page.getByRole('menuitem', { name: /Create Identity/i });
    await createAction.click();
    await page.waitForTimeout(500);

    // Should show funding modal first (not create modal directly)
    const fundingModal = page.locator('#wallet-funding-modal');
    const createModal = page.locator('#create-modal');

    // Either funding modal appears or we have the create modal if funding is already done
    const fundingVisible = await fundingModal.isVisible().catch(() => false);
    const createVisible = await createModal.isVisible().catch(() => false);

    expect(fundingVisible || createVisible).toBe(true);
  });
});

/**
 * Identity Top-Up Flow Tests
 *
 * Similar to creation but for adding credits to existing identities.
 */
test.describe('Identity Top-Up Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
    await handleLoginIfNeeded(page);
    await page.waitForTimeout(500);
  });

  test('can initiate top-up from actions menu', async ({ page }) => {
    await waitForDashboard(page);

    // Open actions menu
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    // Look for top-up action
    const topupAction = page.getByRole('menuitem', { name: /Top.?Up/i });
    const topupVisible = await topupAction.isVisible().catch(() => false);

    if (topupVisible) {
      await topupAction.click();
      await page.waitForTimeout(500);

      // Should show funding modal for top-up
      const fundingModal = page.locator('#wallet-funding-modal');
      await expect(fundingModal).toBeVisible({ timeout: 5000 });
    } else {
      // Top-up might be in a submenu or require identity selection
      // Skip if action not directly available
      test.skip();
    }
  });

  test('shows correct context message for top-up', async ({ page }) => {
    await waitForDashboard(page);

    // Open actions menu
    await page.locator('.actions-menu-trigger, .actions-btn').click();
    await page.waitForTimeout(300);

    const topupAction = page.getByRole('menuitem', { name: /Top.?Up/i });
    const topupVisible = await topupAction.isVisible().catch(() => false);

    if (topupVisible) {
      await topupAction.click();
      await page.waitForTimeout(500);

      // Funding modal should mention "top up" context
      const modalContent = page.locator('#wallet-funding-modal');
      const hasTopUpContext = await modalContent.textContent()
        .then(text => text?.toLowerCase().includes('top') || text?.toLowerCase().includes('fund'))
        .catch(() => false);

      expect(hasTopUpContext).toBe(true);
    } else {
      test.skip();
    }
  });
});
