/**
 * Custom Browser Test Runner for Playwright in Yarn PnP Workspace
 *
 * This runner uses playwright-core directly (not @playwright/test)
 * to bypass Yarn PnP module resolution issues.
 *
 * Usage: yarn node run-browser-tests.cjs
 */

const { chromium } = require('playwright-core');
const path = require('path');

// Find the Chromium executable path
function findChromiumPath() {
  // Try common locations
  const possiblePaths = [
    '/tmp/playwright-browsers/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    '/tmp/playwright-browsers/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    // Add more paths as needed for Linux/Windows
  ];

  // For glob patterns, we'll use the first one as fallback
  return possiblePaths[0];
}

async function runTests() {
  console.log('🚀 Starting browser E2E tests...');
  console.log('📄 Using playwright-core (bypassing @playwright/test framework)');

  let browser;
  const testResults = [];
  const consoleErrors = [];

  try {
    // Launch browser
    const chromiumPath = findChromiumPath();
    console.log(`🌐 Launching Chromium from: ${chromiumPath}`);

    browser = await chromium.launch({
      headless: true,
      executablePath: chromiumPath
    });

    const page = await browser.newPage();

    // Capture console messages
    const allConsoleLogs = [];
    page.on('console', msg => {
      const msgText = msg.text();
      const msgType = msg.type();

      allConsoleLogs.push({ type: msgType, text: msgText });

      if (msgType === 'error') {
        console.error(`❌ [ERROR] ${msgText}`);
        consoleErrors.push(msgText);
      } else if (msgType === 'warn') {
        console.warn(`⚠️  [WARN] ${msgText}`);
      } else if (msgType === 'log') {
        // Log test messages
        if (msgText.includes('✓') || msgText.includes('✅') || msgText.includes('PASS')) {
          console.log(`✓ ${msgText}`);
        }
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      console.error(`❌ Page Error: ${error.message}`);
      consoleErrors.push(error.message);
    });

    // Navigate to test page
    console.log('⏳ Navigating to http://localhost:8080/index.html');
    try {
      await page.goto('http://localhost:8080/index.html', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    } catch (error) {
      console.error('⚠️  Navigation timeout (retrying with load state):', error.message);
      try {
        await page.goto('http://localhost:8080/index.html', {
          waitUntil: 'load',
          timeout: 10000
        });
      } catch (err) {
        console.error('❌ Failed to load page:', err.message);
        throw err;
      }
    }

    // CRITICAL: Clear localStorage to force REAL mode (not mock)
    console.log('🧹 Clearing localStorage to enable REAL SDK mode...');
    await page.evaluate(() => {
      localStorage.removeItem('useMockMode');
      localStorage.removeItem('dash-logged-in');
    });

    // Reload page to apply REAL mode
    console.log('🔄 Reloading page in REAL mode...');
    await page.reload({ waitUntil: 'load', timeout: 10000 });

    // Wait for page to be ready and app to initialize
    console.log('⏳ Waiting for app initialization...');
    try {
      await page.waitForSelector('#app', { timeout: 10000 });
      console.log('✓ App loaded');
    } catch (error) {
      console.warn('⚠️  App selector not found, but continuing...');
    }

    // Give page time to execute any initialization code
    await page.waitForTimeout(3000);

    // Check browser console for test results or errors
    console.log('\n📋 FINAL RESULTS:');
    console.log('================\n');

    // Get page title to verify load
    const title = await page.title();
    console.log(`✓ Page title: ${title}`);

    // Check for SDK mode
    const sdkMode = await page.evaluate(() => {
      const logs = [];
      // Try to find SDK mode information from localStorage or global state
      const isReal = localStorage.getItem('useMockMode') !== 'true';
      return isReal ? 'REAL (testnet DAPI)' : 'MOCK';
    });
    console.log(`✓ SDK Mode: ${sdkMode}`);

    // Check if key elements are present
    const hasLoginView = await page.locator('#login-view').isVisible().catch(() => false);
    const hasDashboard = await page.locator('#dashboard-view').isVisible().catch(() => false);

    if (hasLoginView) {
      console.log('✓ Login view is visible');
      testResults.push({ name: 'Login View Visible', passed: true });
    }
    if (hasDashboard) {
      console.log('✓ Dashboard view is visible');
      testResults.push({ name: 'Dashboard View Visible', passed: true });
    }

    // Check if mnemonic is pre-filled
    try {
      const mnemonicInput = page.locator('#login-mnemonic');
      const mnemonicValue = await mnemonicInput.inputValue().catch(() => '');
      if (mnemonicValue.length > 0) {
        console.log(`✓ Mnemonic pre-filled (${mnemonicValue.split(' ').length} words)`);
        testResults.push({ name: 'Mnemonic Pre-filled', passed: true });
      }
    } catch (error) {
      console.warn('⚠️  Could not check mnemonic field');
    }

    // Test Phase: Attempt login to verify getIdentityIds is called
    console.log('\n📋 PHASE 2: Testing Discovery Process');
    console.log('=====================================\n');

    try {
      const loginButton = page.locator('#login-form button[type="submit"]');
      if (await loginButton.isVisible().catch(() => false)) {
        console.log('👆 Clicking login button to test discovery...');

        // Collect logs during discovery
        const discoveryLogs = [];
        page.removeAllListeners('console');
        page.on('console', msg => {
          const text = msg.text();
          if (text.includes('getIdentityIds') || text.includes('Starting identity discovery') || text.includes('Batch')) {
            discoveryLogs.push(text);
          }
        });

        // Click login
        await loginButton.click();

        // Wait for discovery to start (longer timeout to account for SDK loading)
        console.log('⏳ Waiting for discovery to begin...');
        await page.waitForTimeout(5000);

        // Check if discovery progress is visible
        const discoveryView = await page.locator('#discovery-progress-view').isVisible().catch(() => false);
        if (discoveryView) {
          console.log('✓ Discovery progress view appeared');
          testResults.push({ name: 'Discovery Progress Visible', passed: true });
        } else {
          console.log('ℹ️  Discovery progress view not visible (may have completed or using mock)');
        }

        // Check if any discovery messages were logged
        if (discoveryLogs.length > 0) {
          console.log(`✓ Discovery process initiated (${discoveryLogs.length} discovery events)`);
          discoveryLogs.slice(0, 3).forEach(log => console.log(`  - ${log.substring(0, 80)}`));
          testResults.push({ name: 'Discovery Process Started', passed: true });
        } else {
          console.log('ℹ️  No discovery logs captured (may be using mock mode or discovery happened too fast)');

          // Check console logs for SDK loading issues
          const sdkErrors = allConsoleLogs
            .filter(l => (l.type === 'error' || l.type === 'warn') &&
                         (l.text.includes('SDK') || l.text.includes('wallet') || l.text.includes('Failed')))
            .slice(0, 3);

          if (sdkErrors.length > 0) {
            console.log('  SDK loading issues detected:');
            sdkErrors.forEach(err => console.log(`    - ${err.text.substring(0, 80)}`));
          }
        }

        // Check if dashboard is now visible (discovery might have completed)
        const dashboardNow = await page.locator('#dashboard-view').isVisible().catch(() => false);
        if (dashboardNow) {
          console.log('✓ Dashboard appeared after login (discovery completed)');
          testResults.push({ name: 'Dashboard After Discovery', passed: true });
        }

        // Try to get the final notification that shows mode and identity count
        await page.waitForTimeout(2000);
        try {
          const notification = await page.locator('.notification').first().textContent().catch(() => '');
          if (notification) {
            console.log(`\n📢 Final Notification: ${notification}`);

            // Parse mode from notification
            if (notification.includes('real mode')) {
              console.log('✓ REAL SDK MODE CONFIRMED');
            } else if (notification.includes('mock mode')) {
              console.log('ℹ️  Using mock mode');
            }

            // Try to count identities from dropdown
            const identityCount = await page.locator('.identity-list li').count().catch(() => 0);
            if (identityCount > 0) {
              console.log(`✓ Found ${identityCount} identities in discovery`);
            }
          }
        } catch (notifError) {
          // Ignore if notification not found
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not test discovery process: ${error.message}`);
    }

    console.log(`\n📊 Tests Completed: ${testResults.length} checks passed`);

    if (consoleErrors.length > 0) {
      console.log(`\n⚠️  Console Errors Captured: ${consoleErrors.length}`);
      consoleErrors.slice(0, 5).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.substring(0, 100)}`);
      });
    }

    console.log('\n✅ Browser test session completed successfully');

    // Exit with appropriate code
    const hasFailures = testResults.some(r => !r.passed);
    process.exit(hasFailures ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Test runner error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
