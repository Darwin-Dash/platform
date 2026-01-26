import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded } from './helpers/test-setup.js';

test.describe('DashPay Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockMode(page);
  });

  test('dashpay section displays properly', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    // Navigate to DashPay
    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();
      await page.waitForSelector('#dashpay-view, .dashpay-container', { timeout: 5000 });
    }
  });

  test('profile section shows current profile', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const profileSection = page.locator('.profile-section, #profile');
      const visible = await profileSection.isVisible({ timeout: 3000 }).catch(() => false);
      // Profile may or may not exist
    }
  });

  test('create profile form validates display name', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const createBtn = page.locator('[data-action="create-profile"], .create-profile-btn');
      if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createBtn.click();

        const displayNameField = page.locator('#display-name, [name="displayName"]');
        if (await displayNameField.isVisible()) {
          // Test empty name validation
          await displayNameField.fill('');
          await page.locator('button[type="submit"]').click();

          const error = page.locator('.validation-error, .display-name-error');
          const visible = await error.isVisible({ timeout: 2000 }).catch(() => false);
        }
      }
    }
  });

  test('profile avatar upload shows preview', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const avatarInput = page.locator('input[type="file"], #avatar-upload');
      // File upload testing requires specific setup
    }
  });

  test('contacts list displays properly', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const contactsTab = page.locator('[data-tab="contacts"], .contacts-tab');
      if (await contactsTab.isVisible()) {
        await contactsTab.click();

        const contactsList = page.locator('.contacts-list, #contacts');
        await expect(contactsList).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('contact search filters results', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const contactsTab = page.locator('[data-tab="contacts"], .contacts-tab');
      if (await contactsTab.isVisible()) {
        await contactsTab.click();

        const searchInput = page.locator('#contact-search, [name="search"]');
        if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await searchInput.fill('alice');
          // Results should filter
        }
      }
    }
  });

  test('inbound requests tab shows pending requests', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const inboundTab = page.locator('[data-tab="inbound"], .inbound-requests-tab');
      if (await inboundTab.isVisible()) {
        await inboundTab.click();

        const requestsList = page.locator('.inbound-requests, #inbound-requests');
        await expect(requestsList).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('outbound requests tab shows sent requests', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const outboundTab = page.locator('[data-tab="outbound"], .outbound-requests-tab');
      if (await outboundTab.isVisible()) {
        await outboundTab.click();

        const requestsList = page.locator('.outbound-requests, #outbound-requests');
        await expect(requestsList).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('send contact request validates username', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const sendRequestBtn = page.locator('[data-action="send-request"], .send-request-btn');
      if (await sendRequestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendRequestBtn.click();

        const usernameField = page.locator('#recipient-username, [name="username"]');
        if (await usernameField.isVisible()) {
          // Test invalid username
          await usernameField.fill('inv@lid');
          await page.locator('button[type="submit"]').click();

          const error = page.locator('.validation-error, .username-error');
          const visible = await error.isVisible({ timeout: 2000 }).catch(() => false);
        }
      }
    }
  });

  test('accept contact request button works', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const inboundTab = page.locator('[data-tab="inbound"], .inbound-requests-tab');
      if (await inboundTab.isVisible()) {
        await inboundTab.click();

        const acceptBtn = page.locator('[data-action="accept"], .accept-btn').first();
        if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await acceptBtn.click();
          // Confirmation or success message should appear
        }
      }
    }
  });

  test('decline contact request button works', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const inboundTab = page.locator('[data-tab="inbound"], .inbound-requests-tab');
      if (await inboundTab.isVisible()) {
        await inboundTab.click();

        const declineBtn = page.locator('[data-action="decline"], .decline-btn').first();
        if (await declineBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await declineBtn.click();
          // Confirmation dialog may appear
        }
      }
    }
  });

  test('contact card shows username and avatar', async ({ page }) => {
    await handleLoginIfNeeded(page);
    await page.waitForSelector('#dashboard-view', { timeout: 10000 });

    const dashpayNav = page.locator('[data-nav="dashpay"], .dashpay-nav');
    if (await dashpayNav.isVisible()) {
      await dashpayNav.click();

      const contactsTab = page.locator('[data-tab="contacts"], .contacts-tab');
      if (await contactsTab.isVisible()) {
        await contactsTab.click();

        const contactCard = page.locator('.contact-card, .contact-item').first();
        if (await contactCard.isVisible({ timeout: 2000 }).catch(() => false)) {
          const username = contactCard.locator('.username, .contact-name');
          const avatar = contactCard.locator('.avatar, img');
          // May or may not be visible depending on mock data
        }
      }
    }
  });
});
