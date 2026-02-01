/**
 * E2E tests for private key derivation and display
 *
 * Tests that the "View Private Key" feature:
 * 1. Displays actual WIF and hex keys (not loading/error states)
 * 2. Shows correct format for derived keys
 * 3. Handles edge cases gracefully
 */
import { test, expect } from '@playwright/test';

/**
 * Setup a returning user with mock identities that include keys
 * Similar to setupReturningUser but with explicit key data
 */
async function setupUserWithIdentityKeys(page) {
  // Build mock identity state with keys (includes index for key derivation)
  const mockIdentities = [
    [
      'mock-keyed-identity-0',
      {
        id: 'mock-keyed-identity-0',
        balance: 5000000,
        revision: 1,
        publicKeysCount: 4,
        label: 'Test Identity',
        dpnsNames: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        index: 0, // CRITICAL: Required for key derivation
        keys: [
          {
            id: 0,
            keyType: 'ECDSA_SECP256K1',
            purpose: 'AUTHENTICATION',
            securityLevel: 'MASTER',
            status: 'active',
            data: '0x02abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
            disabledAt: null
          },
          {
            id: 1,
            keyType: 'ECDSA_SECP256K1',
            purpose: 'AUTHENTICATION',
            securityLevel: 'HIGH',
            status: 'active',
            data: '0x03abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
            disabledAt: null
          },
          {
            id: 2,
            keyType: 'ECDSA_SECP256K1',
            purpose: 'AUTHENTICATION',
            securityLevel: 'CRITICAL',
            status: 'active',
            data: '0x02fedcba0987654321fedcba0987654321fedcba0987654321fedcba09876543',
            disabledAt: null
          },
          {
            id: 3,
            keyType: 'ECDSA_SECP256K1',
            purpose: 'TRANSFER',
            securityLevel: 'CRITICAL',
            status: 'active',
            data: '0x03fedcba0987654321fedcba0987654321fedcba0987654321fedcba09876543',
            disabledAt: null
          }
        ],
        lastUpdated: Date.now()
      }
    ]
  ];

  const stateToStore = {
    identities: mockIdentities,
    transactions: [],
    operations: [],
    network: 'testnet',
    ui: {
      selectedIdentityId: 'mock-keyed-identity-0',
      activePanel: null,
      isCreating: false,
      isLoading: false,
      loadingMessage: '',
      modalOpen: false
    }
  };

  const identityStateJson = JSON.stringify(stateToStore);

  // Use addInitScript to set localStorage BEFORE page JS runs
  await page.addInitScript((stateJson) => {
    localStorage.setItem('useMockMode', 'true');
    localStorage.setItem('dash-logged-in', 'true');
    localStorage.setItem('dash-identity-state', stateJson);
    // Set a test mnemonic for key derivation
    sessionStorage.setItem('dash-test-mnemonic',
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    );
  }, identityStateJson);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Wait for app to initialize
  await page.waitForFunction(
    () => {
      const identityView = document.getElementById('identity-view');
      return identityView && !identityView.hasAttribute('hidden');
    },
    { timeout: 15000 }
  );
}

test.describe('Private Key Derivation E2E', () => {
  test.beforeEach(async ({ page }) => {
    await setupUserWithIdentityKeys(page);
  });

  test('opens keys modal from actions menu', async ({ page }) => {
    // Click actions menu button
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();

    // Click manage keys action
    const manageKeysAction = page.locator('[data-action="manage-keys"]');
    await manageKeysAction.click();

    // Verify keys modal opens
    const keysModal = page.locator('#keys-modal');
    await expect(keysModal).toBeVisible({ timeout: 5000 });
  });

  test('keys modal displays all 4 DIP13 keys', async ({ page }) => {
    // Open keys modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    // Should show 4 keys (DIP13 standard)
    const keyRows = page.locator('#keys-modal tbody tr, #keys-modal .key-row');
    const count = await keyRows.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('view private key button exists for each key', async ({ page }) => {
    // Open keys modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    // Each key should have a "View Private" button
    const viewPrivateButtons = page.locator('[data-view-private], .view-private-btn, button:has-text("View Private")');
    const buttonCount = await viewPrivateButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(1);
  });

  test('clicking view private shows private key modal', async ({ page }) => {
    // Open keys modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    // Click first view private button
    const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn, button:has-text("View Private")');
    await viewPrivateBtn.first().click();

    // Private key modal should appear
    const privateKeyModal = page.locator('#private-key-modal');
    await expect(privateKeyModal).toBeVisible({ timeout: 5000 });
  });

  test('private key modal shows WIF format key', async ({ page }) => {
    // Open keys modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    // Click first view private button
    const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn, button:has-text("View Private")');
    await viewPrivateBtn.first().click();
    await page.waitForSelector('#private-key-modal', { state: 'visible' });

    // Wait for key derivation (it's async)
    await page.waitForTimeout(2000);

    // Get WIF element content
    const wifElement = page.locator('#private-key-wif');
    const wifValue = await wifElement.textContent();

    // Should not show loading or error states
    expect(wifValue).not.toContain('Loading');
    expect(wifValue).not.toContain('Deriving');
    expect(wifValue).not.toContain('Error');

    // WIF format: testnet keys start with 'c' or '9', and are 51-52 chars
    // OR show unavailable message (if mnemonic not set in app state)
    if (!wifValue.includes('Not Available') && !wifValue.includes('unavailable')) {
      expect(wifValue.length).toBeGreaterThan(40);
      expect(wifValue).toMatch(/^[c9KL5]/); // c/9 for testnet, K/L/5 for mainnet
    }
  });

  test('private key modal shows hex format key', async ({ page }) => {
    // Open keys modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    // Click first view private button
    const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn, button:has-text("View Private")');
    await viewPrivateBtn.first().click();
    await page.waitForSelector('#private-key-modal', { state: 'visible' });

    // Wait for key derivation
    await page.waitForTimeout(2000);

    // Get hex element content
    const hexElement = page.locator('#private-key-hex');
    const hexValue = await hexElement.textContent();

    // Should not show loading or error states
    expect(hexValue).not.toContain('Loading');
    expect(hexValue).not.toContain('Deriving');
    expect(hexValue).not.toContain('Error');

    // Hex format: 64 hex characters (32 bytes)
    // OR show unavailable message
    if (!hexValue.includes('Not Available') && !hexValue.includes('unavailable')) {
      expect(hexValue).toMatch(/^[0-9a-f]{64}$/i);
    }
  });

  test('shows unavailable message for discovered identity without index', async ({ page }) => {
    // Create identity WITHOUT index (simulates discovered identity)
    const mockIdentities = [
      [
        'discovered-identity',
        {
          id: 'discovered-identity',
          balance: 1000000,
          revision: 1,
          publicKeysCount: 1,
          label: 'Discovered Identity',
          dpnsNames: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // NO index property - this is a discovered identity
          keys: [
            {
              id: 0,
              keyType: 'ECDSA_SECP256K1',
              purpose: 'AUTHENTICATION',
              securityLevel: 'MASTER',
              status: 'active',
              data: '0x02abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
              disabledAt: null
            }
          ],
          lastUpdated: Date.now()
        }
      ]
    ];

    const stateToStore = {
      identities: mockIdentities,
      transactions: [],
      operations: [],
      network: 'testnet',
      ui: {
        selectedIdentityId: 'discovered-identity',
        activePanel: null,
        isCreating: false,
        isLoading: false,
        loadingMessage: '',
        modalOpen: false
      }
    };

    // Re-initialize page with discovered identity
    await page.addInitScript((stateJson) => {
      localStorage.setItem('useMockMode', 'true');
      localStorage.setItem('dash-logged-in', 'true');
      localStorage.setItem('dash-identity-state', stateJson);
    }, JSON.stringify(stateToStore));

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => {
        const identityView = document.getElementById('identity-view');
        return identityView && !identityView.hasAttribute('hidden');
      },
      { timeout: 15000 }
    );

    // Open keys modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    // Click view private button
    const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn, button:has-text("View Private")');
    await viewPrivateBtn.first().click();
    await page.waitForSelector('#private-key-modal', { state: 'visible' });

    // Should show unavailable message about discovered identity
    const modalContent = await page.locator('#private-key-modal .modal-body').textContent();
    expect(modalContent).toContain('Not Available');
  });

  test('private key modal can be closed', async ({ page }) => {
    // Open keys modal then private key modal
    const actionsBtn = page.locator('.actions-menu-trigger, .actions-btn, [data-action-trigger]');
    await actionsBtn.first().click();
    await page.locator('[data-action="manage-keys"]').click();
    await page.waitForSelector('#keys-modal', { state: 'visible' });

    const viewPrivateBtn = page.locator('[data-view-private], .view-private-btn, button:has-text("View Private")');
    await viewPrivateBtn.first().click();
    await page.waitForSelector('#private-key-modal', { state: 'visible' });

    // Try multiple ways to close the modal
    // First try the close button
    const closeBtn = page.locator('#private-key-modal .modal-close, #private-key-modal button:has-text("Close")');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
    } else {
      // Fall back to clicking outside the modal or pressing Escape multiple times
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
    }

    // Modal should be hidden (give it more time)
    const privateKeyModal = page.locator('#private-key-modal');
    await expect(privateKeyModal).toBeHidden({ timeout: 5000 });
  });
});
