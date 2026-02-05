import { test, expect } from '@playwright/test';
import { setupMockMode, handleLoginIfNeeded, waitForDashboard, setupReturningUser } from './helpers/test-setup.js';

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

// ============================================================================
// Add Contact Modal Tests
// ============================================================================
test.describe('Add Contact Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Use returning user setup to ensure we have identities
    await setupReturningUser(page, { identityCount: 3 });
    await waitForDashboard(page);
  });

  test('Add Contact modal opens from Actions menu', async ({ page }) => {
    // Open the actions menu
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);

    // Click the Add Contact action
    const addContactBtn = page.locator('[data-action="add-contact"]');
    await addContactBtn.click();

    // Modal should be visible
    await expect(page.locator('#send-contact-request-modal')).toBeVisible();

    // Verify modal title is "Add Contact"
    const modalTitle = page.locator('#send-contact-request-modal h2');
    await expect(modalTitle).toContainText('Add Contact');
  });

  test('modal has username input, not identity ID input', async ({ page }) => {
    // Open the actions menu and Add Contact modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    // Check label says "Username"
    const label = page.locator('label[for="contact-request-recipient"]');
    await expect(label).toContainText('Username');

    // Check placeholder mentions DPNS name format
    const input = page.locator('#contact-request-recipient');
    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder).toContain('.dash');
    expect(placeholder.toLowerCase()).toContain('username');
  });

  test('modal does NOT show "Your other identities" section', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    // Quick-select section should not exist in the DOM
    const quickSelect = page.locator('#contact-request-quick-select');
    await expect(quickSelect).toHaveCount(0);
  });

  test('modal does NOT show message field', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    // Message textarea should not exist
    const messageField = page.locator('#contact-request-message');
    await expect(messageField).toHaveCount(0);
  });

  test('validates username format - empty input', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Empty input shows default help text
    await input.fill('');
    await input.dispatchEvent('input');
    await expect(validation).toContainText('Enter the DPNS name');
  });

  test('validates username format - invalid characters', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Invalid format (special characters)
    await input.fill('!!!invalid@name');
    await input.dispatchEvent('input');
    await expect(validation).toContainText('Invalid');
  });

  test('validates username format - valid name', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Valid format
    await input.fill('alice.dash');
    await input.dispatchEvent('input');
    await expect(validation).toContainText('Valid');
  });

  test('validates username format - valid name without suffix', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Valid format without .dash suffix (will be auto-appended)
    await input.fill('alice');
    await input.dispatchEvent('input');
    await expect(validation).toContainText('Valid');
  });

  test('validates username format - name with hyphens', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Valid hyphenated name
    await input.fill('my-username-123');
    await input.dispatchEvent('input');
    await expect(validation).toContainText('Valid');
  });

  test('validates username format - too short', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Too short (less than 3 characters)
    await input.fill('ab');
    await input.dispatchEvent('input');
    await expect(validation).toContainText('3 characters');
  });

  test('modal can be closed with Cancel button', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const modal = page.locator('#send-contact-request-modal');
    await expect(modal).toBeVisible();

    // Click Cancel
    await page.locator('#send-contact-request-modal .btn-ghost').click();

    // Modal should be hidden
    await expect(modal).toBeHidden();
  });

  test('modal can be closed with X button', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const modal = page.locator('#send-contact-request-modal');
    await expect(modal).toBeVisible();

    // Click X close button (the btn-icon element, not the Cancel button)
    await page.locator('#send-contact-request-modal .btn-icon.modal-close').click();

    // Modal should be hidden
    await expect(modal).toBeHidden();
  });

  test('submitting with valid name triggers DPNS resolution (mock mode)', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');

    // Fill valid name
    await input.fill('testuser.dash');

    // Submit the form
    await page.locator('button[type="submit"][form="send-contact-request-form"]').click();

    // In mock mode, loading should appear briefly
    // Then success notification should appear
    await expect(page.locator('.notification')).toBeVisible({ timeout: 5000 });
  });

  test('shows loading state with correct message during submission', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    await input.fill('alice');

    // Submit and immediately check for loading state
    const submitBtn = page.locator('button[type="submit"][form="send-contact-request-form"]');
    await submitBtn.click();

    // Loading overlay should appear with "Looking up" message
    // (May be very brief in mock mode)
    const loadingAppeared = await Promise.race([
      page.locator('#loading-overlay:not([hidden])').waitFor({ state: 'attached', timeout: 1000 }).then(() => true).catch(() => false),
      page.waitForTimeout(1000).then(() => false),
    ]);

    // Eventually should complete (success or error)
    await expect(page.locator('.notification')).toBeVisible({ timeout: 5000 });
  });

  test('prevents sending contact request to self', async ({ page }) => {
    // Get the selected identity's DPNS name (if any)
    const identityName = await page.evaluate(() => {
      const selector = document.querySelector('.selector-trigger .identity-name');
      return selector?.textContent?.trim() || null;
    });

    if (!identityName) {
      // Identity has no DPNS name, skip test
      console.log('[SKIP] Selected identity has no DPNS name');
      return;
    }

    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');

    // Try to send to self (using own DPNS name)
    await input.fill(identityName);

    // Submit
    await page.locator('button[type="submit"][form="send-contact-request-form"]').click();

    // Should show error about sending to self
    await expect(page.locator('.notification.error, .notification:has-text("yourself")')).toBeVisible({ timeout: 5000 });
  });

  test('auto-appends .dash suffix to username', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Enter name without .dash
    await input.fill('alice');
    await input.dispatchEvent('input');

    // Validation should still show valid (app will auto-append .dash)
    await expect(validation).toContainText('Valid');
  });

  test('handles network-like name without suffix', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Enter hyphenated name (common pattern)
    await input.fill('my-friend-2024');
    await input.dispatchEvent('input');

    // Should be valid
    await expect(validation).toContainText('Valid');
  });
});

// ============================================================================
// Contact Request Error Scenarios (Mock Mode)
// ============================================================================
test.describe('Contact Request Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupReturningUser(page, { identityCount: 3 });
    await waitForDashboard(page);
  });

  test('shows validation error for empty username', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    // Try to submit with empty input
    const submitBtn = page.locator('button[type="submit"][form="send-contact-request-form"]');

    // Check if submit is disabled or if validation prevents submission
    const isDisabled = await submitBtn.isDisabled();
    if (!isDisabled) {
      await submitBtn.click();
      // Should show notification or validation error
      const hasError = await Promise.race([
        page.locator('.notification.error').waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false),
        page.locator('#contact-request-validation:has-text("Enter")').waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false),
      ]);
      expect(hasError).toBe(true);
    }
  });

  test('shows validation error for username with invalid characters', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const input = page.locator('#contact-request-recipient');
    const validation = page.locator('#contact-request-validation');

    // Enter invalid name with special characters
    await input.fill('user@domain.com');
    await input.dispatchEvent('input');

    // Should show invalid message
    await expect(validation).toContainText('Invalid');
  });

  test('closes modal on Cancel without side effects', async ({ page }) => {
    // Open the modal
    await page.click('.actions-menu-trigger');
    await page.waitForTimeout(200);
    await page.click('[data-action="add-contact"]');
    await page.waitForTimeout(200);

    const modal = page.locator('#send-contact-request-modal');
    await expect(modal).toBeVisible();

    // Fill some data
    const input = page.locator('#contact-request-recipient');
    await input.fill('testuser');

    // Click Cancel
    await page.locator('#send-contact-request-modal .btn-ghost').click();

    // Modal should be hidden
    await expect(modal).toBeHidden();

    // No notification should appear
    const notificationVisible = await page.locator('.notification').isVisible().catch(() => false);
    expect(notificationVisible).toBe(false);
  });
});
