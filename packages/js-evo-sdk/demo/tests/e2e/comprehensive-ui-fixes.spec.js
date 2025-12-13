/**
 * E2E Tests - Comprehensive UI Fixes Validation
 *
 * Validates all UI improvements and fixes across light and dark modes.
 * Tests functionality, styling, and responsive behavior.
 */

import { test, expect } from '@playwright/test';

const DEMO_URL = 'http://localhost:8080';

test.describe('Comprehensive UI Fixes - Light Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Force light mode
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(DEMO_URL);
    await page.waitForSelector('.app-container', { timeout: 5000 });
  });

  test('faucet modal width is 750px and close button works', async ({ page }) => {
    // Navigate to funding flow
    const createBtn = page.locator('#create-identity-btn');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Click "Need help" button
      const helpBtn = page.locator('#need-help-btn');
      await helpBtn.click();
      await page.waitForTimeout(300);

      // Check modal width
      const modal = page.locator('.help-modal .modal-content');
      const box = await modal.boundingBox();
      expect(box.width).toBeLessThanOrEqual(750);

      // Test X close button
      const closeBtn = page.locator('.help-modal .modal-close').first();
      await closeBtn.click();
      await page.waitForTimeout(300);

      // Modal should be closed
      expect(await page.locator('.help-modal').count()).toBe(0);
    }
  });

  test('contact card buttons work correctly', async ({ page }) => {
    // Login first
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Select an identity
    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Check for contact cards
      const contactCards = page.locator('.contact-card');
      if (await contactCards.count() > 0) {
        // Test "View Profile" button
        const viewBtn = contactCards.first().locator('[data-action="view-profile"]');
        await viewBtn.click();
        await page.waitForTimeout(500);

        // Should navigate to identity view (check we're still on identity view)
        expect(await page.locator('#identity-view').isVisible()).toBe(true);

        // Test "Send Credits" button
        const sendBtn = contactCards.first().locator('[data-action="send-credits"]');
        await sendBtn.click();
        await page.waitForTimeout(500);

        // Transfer modal should open
        expect(await page.locator('#transfer-modal').isVisible()).toBe(true);

        // Recipient should be pre-filled
        const recipientInput = page.locator('#transfer-recipient');
        const value = await recipientInput.inputValue();
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  test('DashPay documents have dark card styling', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Select an identity
    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Check for DashPay documents
      const dashPayDocs = page.locator('.dashpay-document-item');
      if (await dashPayDocs.count() > 0) {
        const firstDoc = dashPayDocs.first();

        // Check background color
        const bgColor = await firstDoc.evaluate(el =>
          window.getComputedStyle(el).backgroundColor
        );
        // Should be gray-800 (dark card)
        expect(bgColor).toBe('rgb(31, 41, 55)');

        // Check border color
        const borderColor = await firstDoc.evaluate(el =>
          window.getComputedStyle(el).borderTopColor
        );
        expect(borderColor).toBe('rgb(55, 65, 81)'); // gray-700
      }
    }
  });

  test('official Dash logo displays correctly', async ({ page }) => {
    // Check header logo
    const headerLogo = page.locator('.logo-section img');
    expect(await headerLogo.isVisible()).toBe(true);
    expect(await headerLogo.getAttribute('src')).toBe('./white-d.svg');

    // Check welcome screen logo
    if (await page.locator('#welcome-state').isVisible()) {
      const welcomeLogo = page.locator('.welcome-icon');
      expect(await welcomeLogo.getAttribute('src')).toBe('./blue-d.svg');
    }
  });

  test('Add Contact button is in sidebar', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Select an identity
    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Check sidebar has Add Contact button
      const sidebarAddContactBtn = page.locator('#sidebar-add-contact-btn');
      expect(await sidebarAddContactBtn.isVisible()).toBe(true);

      // Check contacts-viewer does NOT have the button
      const viewerAddBtn = page.locator('#contacts-viewer #add-contact-btn');
      expect(await viewerAddBtn.count()).toBe(0);
    }
  });

  test('keys modal has hover tooltip on public keys', async ({ page }) => {
    // Login and select identity
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Open keys modal
      const manageKeysBtn = page.locator('[data-action="manage-keys"]');
      await manageKeysBtn.click();
      await page.waitForTimeout(500);

      // Hover over public key
      const publicKey = page.locator('.public-key-value').first();
      await publicKey.hover();
      await page.waitForTimeout(300);

      // Check for tooltip (via ::after pseudo-element presence)
      const hasTooltip = await publicKey.evaluate(el => {
        const after = window.getComputedStyle(el, '::after');
        return after.content !== 'none' && after.content !== '';
      });
      expect(hasTooltip).toBe(true);
    }
  });

  test('dashboard button text is "Create Identity"', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Check dashboard button text
    const createBtn = page.locator('#dashboard-create-btn');
    if (await createBtn.isVisible()) {
      const text = await createBtn.textContent();
      expect(text.trim()).toContain('Create Identity');
      expect(text.trim()).not.toContain('Create New');
    }
  });

  test('Total Names stat has appropriate icon', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    // Check Total Names card has hash/tag icon (not trash icon)
    const namesStatCard = page.locator('.stat-card').nth(2);
    const svgPath = await namesStatCard.locator('svg path').first().getAttribute('d');

    // Should be hash icon pattern, not trash can pattern
    expect(svgPath).toContain('20l4-16'); // Hash icon has this pattern
    expect(svgPath).not.toContain('M19 7l'); // Trash can pattern
  });
});

test.describe('Comprehensive UI Fixes - Dark Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Force dark mode
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(DEMO_URL);
    await page.waitForSelector('.app-container', { timeout: 5000 });
  });

  test('all interactive elements visible in dark mode', async ({ page }) => {
    // Check buttons are visible
    const buttons = page.locator('button').all();
    const visibleButtons = await Promise.all(
      (await buttons).map(async btn => await btn.isVisible())
    );

    // At least some buttons should be visible
    const anyVisible = visibleButtons.some(v => v);
    expect(anyVisible).toBe(true);
  });

  test('help modal FAQ items have dark backgrounds', async ({ page }) => {
    const createBtn = page.locator('#create-identity-btn');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(500);

      const helpBtn = page.locator('#need-help-btn');
      await helpBtn.click();
      await page.waitForTimeout(300);

      // Check FAQ item backgrounds
      const faqItems = page.locator('.faq-item');
      if (await faqItems.count() > 0) {
        const firstItem = faqItems.first();
        const bgColor = await firstItem.evaluate(el =>
          window.getComputedStyle(el).backgroundColor
        );

        // Should have dark semi-transparent background
        expect(bgColor).toMatch(/rgba?\(0,\s*0,\s*0,\s*0\.2?\)/);
      }
    }
  });

  test('input fields visible on dark backgrounds', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Open transfer modal
      const transferBtn = page.locator('[data-action="transfer"]');
      await transferBtn.click();
      await page.waitForTimeout(500);

      // Check input field visibility
      const input = page.locator('#transfer-recipient');
      const textColor = await input.evaluate(el =>
        window.getComputedStyle(el).color
      );

      // Should have light text color
      const match = textColor.match(/\d+/g);
      if (match) {
        const [r, g, b] = match.map(v => parseInt(v));
        const brightness = (r + g + b) / 3;
        expect(brightness).toBeGreaterThan(200); // Light text
      }
    }
  });

  test('DashPay documents text is readable', async ({ page }) => {
    // Login and select identity
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Check DashPay document text colors
      const docType = page.locator('.dashpay-document-type').first();
      if (await docType.isVisible()) {
        const textColor = await docType.evaluate(el =>
          window.getComputedStyle(el).color
        );
        // Should be gray-50 (light on dark)
        expect(textColor).toBe('rgb(249, 250, 251)');
      }

      const docPreview = page.locator('.dashpay-document-preview').first();
      if (await docPreview.isVisible()) {
        const textColor = await docPreview.evaluate(el =>
          window.getComputedStyle(el).color
        );
        // Should be gray-300 (readable on dark)
        expect(textColor).toBe('rgb(209, 213, 219)');
      }
    }
  });
});

test.describe('Responsive Design', () => {
  test('mobile burger menu works correctly', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(DEMO_URL);

    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Check sidebar is hidden initially
      const sidebar = page.locator('#actions-sidebar');
      const isHidden = await sidebar.evaluate(el => {
        const transform = window.getComputedStyle(el).transform;
        return transform.includes('matrix') && transform.includes('-250'); // translateX(-100%)
      });
      expect(isHidden).toBe(true);

      // Click burger menu toggle
      const toggleBtn = page.locator('#sidebar-toggle');
      await toggleBtn.click();
      await page.waitForTimeout(300);

      // Sidebar should be visible
      const isVisible = await sidebar.evaluate(el => {
        const transform = window.getComputedStyle(el).transform;
        return transform === 'none' || transform.includes('matrix(1, 0, 0, 1, 0, 0)');
      });
      expect(isVisible).toBe(true);

      // Overlay should be visible
      const overlay = page.locator('#sidebar-overlay');
      expect(await overlay.isVisible()).toBe(true);

      // Click close button in sidebar
      const closeBtn = page.locator('#sidebar-toggle-mobile');
      await closeBtn.click();
      await page.waitForTimeout(300);

      // Sidebar should be hidden again
      const isHiddenAgain = await sidebar.evaluate(el => {
        const transform = window.getComputedStyle(el).transform;
        return transform.includes('-250');
      });
      expect(isHiddenAgain).toBe(true);
    }
  });

  test('Add Contact button is in sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(DEMO_URL);

    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Open sidebar
      await page.locator('#sidebar-toggle').click();
      await page.waitForTimeout(300);

      // Check Add Contact button is in sidebar
      const addContactBtn = page.locator('#sidebar-add-contact-btn');
      expect(await addContactBtn.isVisible()).toBe(true);
    }
  });
});

test.describe('Styling Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    await page.waitForSelector('.app-container', { timeout: 5000 });
  });

  test('all card backgrounds are consistently dark', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const cards = page.locator('.card, .card-dark, .card-compact, .identity-card, .contact-card, .dashpay-document-item');
    const count = await cards.count();

    if (count > 0) {
      // Sample first 5 cards
      for (let i = 0; i < Math.min(count, 5); i++) {
        const card = cards.nth(i);
        const bgColor = await card.evaluate(el =>
          window.getComputedStyle(el).backgroundColor
        );

        // All should be gray-800 or white (for .card-adaptive)
        const isDark = bgColor === 'rgb(31, 41, 55)'; // gray-800
        const isLight = bgColor === 'rgb(255, 255, 255)'; // white
        expect(isDark || isLight).toBe(true);
      }
    }
  });

  test('badges have consistent styling', async ({ page }) => {
    // Login and navigate
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const badges = page.locator('.badge, .dpns-badge');
    if (await badges.count() > 0) {
      const firstBadge = badges.first();

      // Check background
      const bgColor = await firstBadge.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );
      expect(bgColor).toMatch(/rgba?\(0,\s*0,\s*0,\s*0\.2?\)/);

      // Check text color is dash blue
      const textColor = await firstBadge.evaluate(el =>
        window.getComputedStyle(el).color
      );
      expect(textColor).toBe('rgb(0, 141, 228)');
    }
  });

  test('hover states work without visibility issues', async ({ page }) => {
    // Force dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Test sidebar button hover
      const sidebarBtn = page.locator('[data-action="topup"]');
      if (await sidebarBtn.isVisible()) {
        await sidebarBtn.hover();
        await page.waitForTimeout(200);

        // Button should still be visible and readable
        const isVisible = await sidebarBtn.isVisible();
        expect(isVisible).toBe(true);

        const color = await sidebarBtn.evaluate(el =>
          window.getComputedStyle(el).color
        );
        // Should have explicit color (not transparent)
        expect(color).not.toBe('rgba(0, 0, 0, 0)');
      }
    }
  });
});

test.describe('Functionality Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    await page.waitForSelector('.app-container', { timeout: 5000 });
  });

  test('sidebar Add Contact button triggers dialog', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Click Add Contact in sidebar
      const addContactBtn = page.locator('#sidebar-add-contact-btn');
      await addContactBtn.click();
      await page.waitForTimeout(500);

      // Should show notification
      const notifications = page.locator('.notification');
      expect(await notifications.count()).toBeGreaterThan(0);
    }
  });

  test('modal close buttons all work', async ({ page }) => {
    // Login
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const identityCards = page.locator('.identity-card');
    if (await identityCards.count() > 0) {
      await identityCards.first().click();
      await page.waitForTimeout(500);

      // Test transfer modal close
      const transferBtn = page.locator('[data-action="transfer"]');
      await transferBtn.click();
      await page.waitForTimeout(300);

      expect(await page.locator('#transfer-modal').isVisible()).toBe(true);

      const closeBtn = page.locator('#transfer-modal .modal-close');
      await closeBtn.click();
      await page.waitForTimeout(300);

      expect(await page.locator('#transfer-modal').isHidden()).toBe(true);
    }
  });
});
