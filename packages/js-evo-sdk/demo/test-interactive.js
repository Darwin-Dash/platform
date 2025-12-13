#!/usr/bin/env node
/**
 * Interactive Testing Script for Dash Identity Manager
 * Run with: node test-interactive.js
 */

import puppeteer from 'puppeteer';

async function main() {
  console.log('🚀 Starting interactive browser test...\n');

  // Launch browser in headed mode so you can see it
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true, // Auto-open DevTools
    args: ['--window-size=1920,1080']
  });

  const page = await browser.newPage();

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Enable console logging from the page
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[Browser ${type.toUpperCase()}]:`, text);
  });

  // Navigate to the demo app
  console.log('📱 Navigating to http://localhost:8080/index-static.html\n');
  await page.goto('http://localhost:8080/index-static.html', {
    waitUntil: 'networkidle2'
  });

  console.log('✅ Application loaded!\n');
  console.log('🔍 You can now interact with the application in the browser window.\n');
  console.log('DevTools is open for debugging.\n');
  console.log('\nAvailable test actions:\n');
  console.log('  1. Check page title');
  console.log('  2. Click identity selector');
  console.log('  3. Open create identity modal');
  console.log('  4. Take screenshot');
  console.log('  5. Get current state');
  console.log('  6. Exit\n');

  // Keep the browser open - wait for manual intervention
  console.log('⏸️  Browser will stay open. Press Ctrl+C to exit.\n');

  // Optional: Add some automated tests
  const title = await page.title();
  console.log(`📄 Page Title: ${title}`);

  const hasIdentitySelector = await page.$('#identity-selector-container');
  console.log(`✓ Identity Selector: ${hasIdentitySelector ? 'Found' : 'Not found'}`);

  const hasCreateButton = await page.$('#create-identity-btn');
  console.log(`✓ Create Button: ${hasCreateButton ? 'Found' : 'Not found'}`);

  // Get mock identities loaded
  const identityCount = await page.evaluate(() => {
    return window.stateManager?.getAllIdentities()?.length || 0;
  });
  console.log(`✓ Mock Identities Loaded: ${identityCount} identities\n`);

  // Wait for user to close browser or press Ctrl+C
  await new Promise(resolve => {
    process.on('SIGINT', async () => {
      console.log('\n\n👋 Closing browser...');
      await browser.close();
      resolve();
    });
  });
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
