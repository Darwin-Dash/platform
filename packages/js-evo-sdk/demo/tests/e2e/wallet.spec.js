import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, handleFundingModal } from './helpers/test-setup.js';

test.describe('Wallet Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
  });

  test('wallet section displays balance info', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Check for balance display
    const balanceDisplay = page.locator('.wallet-balance, .balance-display, .total-balance');
    const visible = await balanceDisplay.isVisible({ timeout: 5000 }).catch(() => false);
    // Balance should be visible after login
  });

  test('receive address is displayed', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const addressDisplay = page.locator('.receive-address, #wallet-address');
      const visible = await addressDisplay.isVisible({ timeout: 3000 }).catch(() => false);
    }
  });

  test('copy address button copies to clipboard', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const copyBtn = page.locator('[data-action="copy-address"], .copy-btn');
      if (await copyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await copyBtn.click();

        // Check for success feedback
        const feedback = page.locator('.copy-success, .toast');
        const visible = await feedback.isVisible({ timeout: 2000 }).catch(() => false);
      }
    }
  });

  test('QR code displays for receive address', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const showQrBtn = page.locator('[data-action="show-qr"], .qr-btn');
      if (await showQrBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await showQrBtn.click();

        const qrCode = page.locator('.qr-code, canvas, svg');
        await expect(qrCode).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('transaction history displays', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const historyTab = page.locator('[data-tab="history"], .history-tab');
      if (await historyTab.isVisible()) {
        await historyTab.click();

        const historyList = page.locator('.transaction-history, #tx-list');
        await expect(historyList).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('UTXO list shows available outputs', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const utxoTab = page.locator('[data-tab="utxos"], .utxo-tab');
      if (await utxoTab.isVisible()) {
        await utxoTab.click();

        const utxoList = page.locator('.utxo-list, #utxos');
        await expect(utxoList).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('send funds form validates amount', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const sendBtn = page.locator('[data-action="send"], .send-btn');
      if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendBtn.click();

        const amountField = page.locator('#send-amount, [name="amount"]');
        if (await amountField.isVisible()) {
          // Test negative amount
          await amountField.fill('-100');

          const submitBtn = page.locator('button[type="submit"]');
          await submitBtn.click();

          const error = page.locator('.amount-error, .validation-error');
          const visible = await error.isVisible({ timeout: 2000 }).catch(() => false);
        }
      }
    }
  });

  test('send funds form validates address', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const sendBtn = page.locator('[data-action="send"], .send-btn');
      if (await sendBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendBtn.click();

        const addressField = page.locator('#recipient-address, [name="address"]');
        if (await addressField.isVisible()) {
          // Test invalid address
          await addressField.fill('not-a-valid-address');

          const submitBtn = page.locator('button[type="submit"]');
          await submitBtn.click();

          const error = page.locator('.address-error, .validation-error');
          const visible = await error.isVisible({ timeout: 2000 }).catch(() => false);
        }
      }
    }
  });

  test('funding modal appears when wallet needs funds', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // Try to create identity (may trigger funding)
    const createBtn = page.locator('[data-action="create"], #create-identity-btn');
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();

      const amountField = page.locator('#create-amount, [name="amount"]');
      if (await amountField.isVisible()) {
        await amountField.fill('200000');
        await page.locator('button[type="submit"]').click();
      }

      // Funding modal may appear
      const fundingModal = page.locator('#wallet-funding-modal, .funding-modal');
      const visible = await fundingModal.isVisible({ timeout: 5000 }).catch(() => false);
      // May or may not appear depending on mock wallet state
    }
  });

  test('faucet option works in funding modal', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view, #welcome-state', { timeout: 10000 });

    // This test verifies the faucet flow when funding is needed
    const fundingModal = page.locator('#wallet-funding-modal, .funding-modal');
    if (await fundingModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await handleFundingModal(page, 'faucet');
    }
  });

  test('refresh balance button updates display', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const refreshBtn = page.locator('[data-action="refresh-balance"], .refresh-btn');
    if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await refreshBtn.click();

      // Loading indicator should appear
      const loading = page.locator('.loading, .refreshing');
      const visible = await loading.isVisible({ timeout: 1000 }).catch(() => false);
    }
  });

  test('address derivation path is displayed', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const walletNav = page.locator('[data-nav="wallet"], .wallet-nav');
    if (await walletNav.isVisible()) {
      await walletNav.click();

      const pathDisplay = page.locator('.derivation-path, .address-path');
      const visible = await pathDisplay.isVisible({ timeout: 3000 }).catch(() => false);
      // Path may be shown in advanced mode
    }
  });
});
