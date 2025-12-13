import { test, expect } from '@playwright/test';

test.describe('Notification Sizing Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Wait for app to be ready
    await page.waitForSelector('.app-header', { timeout: 5000 });
  });

  test('single notification has fixed 400px width', async ({ page }) => {
    // Trigger a notification
    await page.evaluate(() => {
      window.showSuccess('Switched to Testnet');
    });

    // Wait for notification to appear
    const notification = page.locator('.notification').first();
    await expect(notification).toBeVisible();

    // Check width is exactly 400px
    const box = await notification.boundingBox();
    expect(box.width).toBe(400);
  });

  test('single notification with short text maintains 400px width', async ({ page }) => {
    // Trigger notification with very short text
    await page.evaluate(() => {
      window.showInfo('OK');
    });

    const notification = page.locator('.notification').first();
    await expect(notification).toBeVisible();

    const box = await notification.boundingBox();
    expect(box.width).toBe(400);
  });

  test('single notification with long text maintains 400px width', async ({ page }) => {
    // Trigger notification with long text
    await page.evaluate(() => {
      window.showWarning('This is a very long notification message that contains a lot of text to test wrapping behavior');
    });

    const notification = page.locator('.notification').first();
    await expect(notification).toBeVisible();

    const box = await notification.boundingBox();
    expect(box.width).toBe(400);
  });

  test('multiple notifications all have same 400px width', async ({ page }) => {
    // Trigger multiple notifications with different text lengths
    await page.evaluate(() => {
      window.showSuccess('Short');
      window.showInfo('Medium length message');
      window.showWarning('This is a much longer notification message to test consistency');
    });

    // Wait for all notifications to appear
    await page.waitForSelector('.notification:nth-child(3)', { timeout: 5000 });

    // Get all notifications
    const notifications = page.locator('.notification');
    const count = await notifications.count();
    expect(count).toBe(3);

    // Check each notification has exactly 400px width
    for (let i = 0; i < count; i++) {
      const notification = notifications.nth(i);
      const box = await notification.boundingBox();
      expect(box.width).toBe(400);
    }
  });

  test('notifications have minimum height of 64px', async ({ page }) => {
    // Trigger notification with short text
    await page.evaluate(() => {
      window.showSuccess('OK');
    });

    const notification = page.locator('.notification').first();
    await expect(notification).toBeVisible();

    const box = await notification.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(64);
  });

  test('notification height increases with wrapped text', async ({ page }) => {
    // Trigger notification with very long text that will wrap
    await page.evaluate(() => {
      window.showError('This is an extremely long error message that will definitely wrap to multiple lines and should increase the notification height beyond the minimum 64 pixels');
    });

    const notification = page.locator('.notification').first();
    await expect(notification).toBeVisible();

    const box = await notification.boundingBox();
    // Should be taller than minimum due to text wrapping
    expect(box.height).toBeGreaterThan(64);
    // But width should still be exactly 400px
    expect(box.width).toBe(400);
  });

  test('first notification and subsequent notifications have same width', async ({ page }) => {
    // Show first notification
    await page.evaluate(() => {
      window.showSuccess('Switched to Testnet');
    });

    const firstNotification = page.locator('.notification').first();
    await expect(firstNotification).toBeVisible();
    const firstBox = await firstNotification.boundingBox();

    // Show second notification
    await page.evaluate(() => {
      window.showInfo('You are now on Mainnet - real funds will be used!');
    });

    await page.waitForSelector('.notification:nth-child(2)', { timeout: 5000 });

    const secondNotification = page.locator('.notification').nth(1);
    const secondBox = await secondNotification.boundingBox();

    // Both should have same width
    expect(firstBox.width).toBe(400);
    expect(secondBox.width).toBe(400);
    expect(firstBox.width).toBe(secondBox.width);
  });

  test('notification width remains 400px during entrance animation', async ({ page }) => {
    // Trigger notification and immediately check size
    await page.evaluate(() => {
      window.showSuccess('Testing animation');
    });

    const notification = page.locator('.notification').first();

    // Check multiple times during animation (0ms, 100ms, 200ms)
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(100);
      const box = await notification.boundingBox();
      if (box) {
        // Width should always be 400px, even during animation
        expect(box.width).toBe(400);
      }
    }
  });

  test('different notification types all have same width', async ({ page }) => {
    // Show one of each type
    await page.evaluate(() => {
      window.showSuccess('Success notification');
      window.showError('Error notification');
      window.showWarning('Warning notification');
      window.showInfo('Info notification');
    });

    await page.waitForSelector('.notification:nth-child(4)', { timeout: 5000 });

    const notifications = page.locator('.notification');
    const count = await notifications.count();
    expect(count).toBe(4);

    // All should have same width
    const widths = [];
    for (let i = 0; i < count; i++) {
      const box = await notifications.nth(i).boundingBox();
      widths.push(box.width);
    }

    // All widths should be 400px
    widths.forEach(width => {
      expect(width).toBe(400);
    });
  });

  test('notification container does not affect notification size', async ({ page }) => {
    // Add many notifications to test container behavior
    await page.evaluate(() => {
      for (let i = 1; i <= 5; i++) {
        window.showInfo(`Notification ${i}`);
      }
    });

    await page.waitForSelector('.notification:nth-child(5)', { timeout: 5000 });

    const notifications = page.locator('.notification');
    const count = await notifications.count();
    expect(count).toBe(5);

    // All should still be 400px regardless of container
    for (let i = 0; i < count; i++) {
      const box = await notifications.nth(i).boundingBox();
      expect(box.width).toBe(400);
    }
  });

  test('CSS properties are correctly applied', async ({ page }) => {
    await page.evaluate(() => {
      window.showSuccess('Test');
    });

    const notification = page.locator('.notification').first();
    await expect(notification).toBeVisible();

    // Check computed styles
    const width = await notification.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.width;
    });

    const minHeight = await notification.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return computed.minHeight;
    });

    expect(width).toBe('400px');
    expect(minHeight).toBe('64px');
  });
});
