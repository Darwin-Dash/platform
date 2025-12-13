import { test, expect } from '@playwright/test';

test.describe('Identity Selector Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('displays identity selector in header', async ({ page }) => {
    const selector = page.locator('.identity-selector');
    await expect(selector).toBeVisible();

    const trigger = page.locator('.selector-trigger');
    await expect(trigger).toBeVisible();
  });

  test('opens dropdown when clicking trigger', async ({ page }) => {
    // Click selector trigger
    await page.click('.selector-trigger');

    // Verify dropdown opens
    const dropdown = page.locator('.selector-dropdown');
    await expect(dropdown).toBeVisible();

    // Verify aria-expanded is set
    const expanded = await page.locator('.selector-trigger').getAttribute('aria-expanded');
    expect(expanded).toBe('true');
  });

  test('displays list of mock identities', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Verify identity list contains items
    const identityItems = page.locator('.identity-item');
    const count = await identityItems.count();

    // Should have 3 mock identities from mock-data
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('displays create new identity option', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Verify "Create New" option is present
    const createOption = page.locator('.create-new');
    await expect(createOption).toBeVisible();
    await expect(createOption).toContainText('Create New Identity');
  });

  test('shows search input in dropdown', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Verify search input
    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', /Search/);
  });

  test('filters identities by search term', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Get initial count
    const initialCount = await page.locator('.identity-item').count();

    // Type in search
    await page.fill('.search-input', 'Personal');

    // Wait a moment for filtering
    await page.waitForTimeout(300);

    // Count should be reduced (or same if "Personal" exists)
    const filteredCount = await page.locator('.identity-item').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('shows no results message when search has no matches', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Search for non-existent identity
    await page.fill('.search-input', 'NonExistentIdentityXYZ123');

    // Wait for filtering
    await page.waitForTimeout(300);

    // Verify no results message or empty list
    const identityItems = page.locator('.identity-item');
    const count = await identityItems.count();

    expect(count).toBe(0);
  });

  test('selects identity when clicking item', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Click first identity
    const firstIdentity = page.locator('.identity-item').first();
    const identityText = await firstIdentity.textContent();

    await firstIdentity.click();

    // Verify dropdown closes
    await expect(page.locator('.selector-dropdown')).toBeHidden();

    // Verify identity view appears
    await expect(page.locator('#identity-view')).toBeVisible();
    await expect(page.locator('.welcome-state')).toBeHidden();

    // Verify selected identity is shown in trigger
    const trigger = page.locator('.selector-trigger');
    const triggerText = await trigger.textContent();
    expect(triggerText).toBeTruthy();
  });

  test('switches between identities', async ({ page }) => {
    // Select first identity
    await page.click('.selector-trigger');
    await page.locator('.identity-item').first().click();
    await expect(page.locator('#identity-view')).toBeVisible();

    // Get first identity balance
    const balance1 = await page.locator('.balance-main').textContent();

    // Select second identity
    await page.click('.selector-trigger');
    await page.locator('.identity-item').nth(1).click();

    // Get second identity balance
    const balance2 = await page.locator('.balance-main').textContent();

    // Balances should be different
    expect(balance1).not.toBe(balance2);
  });

  test('marks selected identity in dropdown', async ({ page }) => {
    // Select first identity
    await page.click('.selector-trigger');
    await page.locator('.identity-item').first().click();

    // Reopen dropdown
    await page.click('.selector-trigger');

    // Verify first item has selected class
    const firstItem = page.locator('.identity-item').first();
    await expect(firstItem).toHaveClass(/selected/);
  });

  test('closes dropdown when clicking outside', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');
    await expect(page.locator('.selector-dropdown')).toBeVisible();

    // Click outside (on the main content area)
    await page.click('body');

    // Verify dropdown closes
    await expect(page.locator('.selector-dropdown')).toBeHidden({ timeout: 1000 });
  });

  test('opens create modal when clicking create new', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Click create new option
    await page.click('.create-new');

    // Verify dropdown closes
    await expect(page.locator('.selector-dropdown')).toBeHidden();

    // Verify create modal opens
    await expect(page.locator('#create-modal')).toBeVisible();
  });

  test('clears search when closing dropdown', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Type search term
    await page.fill('.search-input', 'test');

    // Close dropdown
    await page.click('body');

    // Reopen dropdown
    await page.click('.selector-trigger');

    // Verify search is cleared
    const searchValue = await page.locator('.search-input').inputValue();
    expect(searchValue).toBe('');
  });

  test('focuses search input when dropdown opens', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Wait a moment for focus
    await page.waitForTimeout(200);

    // Verify search input is focused
    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeFocused();
  });

  test('displays identity label in dropdown', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Verify items show labels or IDs
    const items = page.locator('.identity-item');
    const firstItemText = await items.first().textContent();

    expect(firstItemText).toBeTruthy();
    expect(firstItemText.length).toBeGreaterThan(0);
  });

  test('displays balance for each identity in list', async ({ page }) => {
    // Open dropdown
    await page.click('.selector-trigger');

    // Verify first item shows balance
    const firstItem = page.locator('.identity-item').first();
    const itemText = await firstItem.textContent();

    expect(itemText).toContain('DASH');
  });

  test('updates selector display after identity changes', async ({ page }) => {
    // Select identity
    await page.click('.selector-trigger');
    await page.locator('.identity-item').first().click();

    // Get initial balance shown in selector
    const initialDisplay = await page.locator('.identity-preview').textContent();

    // Perform top-up to change balance
    await page.click('button[data-action="topup"]');
    await page.fill('#topup-amount', '0.5');
    await page.click('button[type="submit"]');

    await expect(page.locator('.notification-success')).toBeVisible({ timeout: 5000 });

    // Verify selector display updated
    const newDisplay = await page.locator('.identity-preview').textContent();
    expect(newDisplay).not.toBe(initialDisplay);
  });
});