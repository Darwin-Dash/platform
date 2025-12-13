# E2E Testing Guide - Network Switcher

Comprehensive guide for running end-to-end (E2E) tests for the network switcher component using Playwright.

## ⚠️ Important: Yarn PnP Compatibility

This project uses **Yarn with Plug'n'Play (PnP)**, which requires special handling for Playwright:

**✅ DO**:
- Use npm scripts: `npm run test:e2e`, `npm run test:e2e:ui`, `npm run test:e2e:headed`
- Install browsers via: `npx -y playwright@1.40.0 install chromium`

**❌ DON'T**:
- Run `npx playwright test` (will fail with MODULE_NOT_FOUND)
- Run `playwright test` directly (module resolution fails)

**Why**: Yarn PnP uses a different module resolution system. npm scripts work correctly through Yarn's package manager.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running E2E Tests](#running-e2e-tests)
- [Test Structure](#test-structure)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)
- [Advanced Usage](#advanced-usage)

---

## Prerequisites

### Required Software
- **Node.js**: v16 or higher
- **Yarn**: Installed and configured for this project (Yarn PnP enabled)
- **Chromium Browser**: Automatically installed via Playwright

### Project Setup
This project uses Yarn with Plug'n'Play (PnP), which requires special configuration for Playwright.

---

## Installation

### Step 1: Install Dependencies

```bash
# From project root
yarn install

# Or from demo directory
cd packages/js-evo-sdk/demo
yarn install
```

### Step 2: Install Playwright Browsers

**Important**: Due to Yarn PnP, you must use `npx` to install browsers:

```bash
# From project root
npx -y playwright@1.40.0 install chromium

# This will download and install:
# - Chromium browser (~150MB)
# - FFMPEG for video recording
```

**Verification**:
```bash
# Check browser installation
npx playwright --version
# Expected: Version 1.40.0
```

---

## Running E2E Tests

### Two-Terminal Setup (Required)

E2E tests require a static HTTP server running on port 8080.

**Terminal 1 - Start Server**:
```bash
cd packages/js-evo-sdk/demo
npm run serve:static
```

**Output**:
```
Starting up http-server, serving .

http-server version: 14.1.1

Available on:
  http://127.0.0.1:8080
  http://192.168.1.x:8080
```

**Terminal 2 - Run Tests**:
```bash
cd packages/js-evo-sdk/demo

# Run all E2E tests (headless mode)
npm run test:e2e

# Run with UI mode (recommended for debugging)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run all browsers (chromium, firefox, webkit)
npm run test:e2e:all-browsers
```

### Alternative: Run from Project Root

```bash
# From project root, using yarn workspace
yarn workspace @dashevo/evo-sdk-identity-demo run test:e2e
```

---

## Test Structure

### Test File
Location: `packages/js-evo-sdk/demo/tests/e2e/network-switcher.spec.js`

### Test Coverage
The E2E test suite includes **40+ tests** across **10 test suites**:

1. **Visual Appearance** (5 tests)
   - Component visibility
   - Default state rendering
   - Color scheme validation
   - Layout structure

2. **Accessibility** (4 tests)
   - ARIA attributes
   - Keyboard navigation
   - Screen reader support
   - Focus management

3. **Dropdown Interactions** (6 tests)
   - Opening/closing dropdown
   - Option selection
   - Click outside behavior
   - Escape key handling

4. **Network Switching** (8 tests)
   - Switching to different networks
   - UI state updates
   - Persistence across page reloads
   - Event dispatching

5. **Persistence** (3 tests)
   - LocalStorage integration
   - State restoration
   - Cross-session consistency

6. **Keyboard Navigation** (4 tests)
   - Tab navigation
   - Enter/Space activation
   - Arrow key navigation
   - Escape key closing

7. **Event System** (3 tests)
   - Custom event dispatching
   - Event payload validation
   - Multiple listener handling

8. **Edge Cases** (3 tests)
   - Rapid clicking
   - Concurrent switches
   - State consistency

9. **Integration** (2 tests)
   - State manager sync
   - Notification system integration

10. **Mobile Responsiveness** (2 tests)
    - Touch interactions
    - Viewport adaptation

### Test Configuration
File: `playwright.config.cjs`

```javascript
{
  testDir: './tests/e2e',
  baseURL: 'http://localhost:8080/index-static.html',
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  projects: [
    { name: 'chromium' }
  ]
}
```

---

## Troubleshooting

### Issue 1: Yarn PnP Module Resolution

**Problem**: `Error: Cannot find module '@playwright/test'` or `MODULE_NOT_FOUND` errors

**Root Cause**: Yarn Plug'n'Play (PnP) uses a different module resolution system that Playwright installed via `npx` cannot access.

**Solution**: **ALWAYS** use npm scripts, never direct `playwright` or `npx playwright` commands.

```bash
# ✅ CORRECT - Use npm scripts
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:headed

# ❌ WRONG - Direct commands fail with Yarn PnP
npx playwright test
yarn playwright test
playwright test
```

**Why This Works**:
- npm scripts run through Yarn's package manager
- Yarn PnP properly resolves `@playwright/test` module
- Package scripts defined in `package.json` have correct module resolution

**Install Browsers**:
```bash
# Install browsers via npx (this step works fine)
npx -y playwright@1.40.0 install chromium

# But run tests via npm scripts
npm run test:e2e
```

### Issue 2: Browser Not Found

**Problem**: `browserType.launch: Executable doesn't exist`

**Solution**: Install the browser:

```bash
# Install chromium browser
npx -y playwright@1.40.0 install chromium

# Verify installation
ls ~/Library/Caches/ms-playwright/
# Should show: chromium-1091, ffmpeg-1009
```

### Issue 3: Static Server Not Running

**Problem**: `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:8080`

**Solution**: Start the static server first:

```bash
# Terminal 1
cd packages/js-evo-sdk/demo
npm run serve:static

# Wait for "Available on: http://127.0.0.1:8080"

# Terminal 2 (new terminal)
npm run test:e2e
```

### Issue 4: Port 8080 Already in Use

**Problem**: `EADDRINUSE: address already in use :::8080`

**Solution**: Kill the existing process:

```bash
# macOS/Linux
lsof -ti:8080 | xargs kill

# Or use a different port
npx http-server . -p 8081 -s -c-1

# Update baseURL in playwright.config.cjs
```

### Issue 5: Tests Timing Out

**Problem**: Tests hang or timeout after 30 seconds

**Solution**: Increase timeout in test file:

```javascript
test.setTimeout(60000); // 60 seconds
```

Or check that the server is accessible:
```bash
curl http://localhost:8080/index-static.html
# Should return HTML content
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: yarn install

      - name: Install Playwright browsers
        run: npx -y playwright@1.40.0 install chromium --with-deps

      - name: Start server
        run: |
          cd packages/js-evo-sdk/demo
          npm run serve:static &
          sleep 5  # Wait for server to start

      - name: Run E2E tests
        run: |
          cd packages/js-evo-sdk/demo
          npm run test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: packages/js-evo-sdk/demo/playwright-report/
```

### Environment Variables

```bash
# CI mode (enables retries, serial execution)
CI=true npm run test:e2e

# Debug mode (verbose logging)
DEBUG=pw:api npm run test:e2e

# Headed mode (see browser)
HEADED=1 npm run test:e2e:headed
```

---

## Advanced Usage

### Running Specific Tests

```bash
# Run single test file
npx playwright test tests/e2e/network-switcher.spec.js

# Run tests matching pattern
npx playwright test --grep "should switch network"

# Run only failed tests
npx playwright test --last-failed
```

### Debugging Tests

```bash
# UI Mode (recommended)
npm run test:e2e:ui
# - Visual test runner
# - Step through tests
# - Inspect DOM
# - View traces

# Debug Mode (pause on failures)
npx playwright test --debug

# Headed Mode (see browser)
npm run test:e2e:headed
```

### Generating Test Reports

```bash
# Run tests and generate HTML report
npm run test:e2e

# Open report
open playwright-report/index.html

# Or use built-in command
npx playwright show-report
```

### Recording Videos

Videos are automatically recorded on test failures:

Location: `test-results/*/video.webm`

To always record videos:
```javascript
// In playwright.config.cjs
use: {
  video: 'on'  // Record all tests
}
```

### Taking Screenshots

Screenshots are taken on failure by default:

Location: `test-results/*/screenshot.png`

Manual screenshot in test:
```javascript
await page.screenshot({ path: 'screenshot.png' });
```

### Mobile Testing

Test mobile viewports:

```bash
# Run mobile viewport tests
npx playwright test --project="Mobile Chrome"
```

Add to `playwright.config.cjs`:
```javascript
projects: [
  {
    name: 'Mobile Chrome',
    use: { ...devices['Pixel 5'] }
  }
]
```

---

## Test Commands Reference

```bash
# Installation
npx -y playwright@1.40.0 install chromium

# Server
npm run serve:static                  # Start static server

# Basic Testing
npm run test:e2e                      # Headless mode (CI)
npm run test:e2e:headed               # Headed mode (see browser)
npm run test:e2e:ui                   # UI mode (visual debugger)

# All Tests
npm run test:all                      # Unit + Integration + E2E

# Debugging
npx playwright test --debug           # Debug mode
npx playwright test --headed          # Show browser
npx playwright show-report            # View HTML report

# Specific Tests
npx playwright test tests/e2e/network-switcher.spec.js
npx playwright test --grep "dropdown"
```

---

## Best Practices

### 1. Always Start Server First
```bash
# Terminal 1
npm run serve:static

# Wait for "Available on:" message

# Terminal 2
npm run test:e2e
```

### 2. Use UI Mode for Development
```bash
# Best for writing and debugging tests
npm run test:e2e:ui
```

### 3. Run Headless in CI
```bash
# Faster, no GUI overhead
CI=true npm run test:e2e
```

### 4. Clean Up Between Runs
```bash
# Remove old test results
rm -rf test-results/
rm -rf playwright-report/

# Re-run tests
npm run test:e2e
```

### 5. Check Server Accessibility
```bash
# Before running tests
curl http://localhost:8080/index-static.html

# Should return HTML, not 404
```

---

## Performance Tips

### Faster Test Runs

1. **Use Chromium Only** (default)
   - Fastest browser for testing
   - Skip Firefox/WebKit unless needed

2. **Disable Video/Screenshots**
   ```javascript
   // For passing tests only
   video: 'retain-on-failure',
   screenshot: 'only-on-failure'
   ```

3. **Parallel Execution**
   ```bash
   # Run tests in parallel
   npx playwright test --workers=4
   ```

4. **Reuse Browser Contexts**
   ```javascript
   test.describe.configure({ mode: 'serial' });
   ```

---

## Support

### Official Documentation
- [Playwright Docs](https://playwright.dev/docs/intro)
- [Yarn PnP Guide](https://yarnpkg.com/features/pnp)

### Common Questions

**Q: Why use npx instead of yarn?**
A: Yarn PnP doesn't expose binary paths correctly for Playwright.

**Q: Can I run tests without starting a server?**
A: No, E2E tests require an HTTP server for the web app.

**Q: How do I run tests in multiple browsers?**
A: Use `npm run test:e2e:all-browsers` or configure in `playwright.config.cjs`.

**Q: Why are tests slow?**
A: E2E tests are inherently slower. Use `--headed` to see progress, or run specific tests.

---

## Summary

**Setup Checklist**:
- ✅ Yarn dependencies installed
- ✅ Playwright browsers installed (`npx -y playwright@1.40.0 install chromium`)
- ✅ Static server running on port 8080 (`npm run serve:static`)
- ✅ Tests passing (`npm run test:e2e`)

**Quick Start**:
```bash
# Terminal 1
cd packages/js-evo-sdk/demo
npm run serve:static

# Terminal 2
cd packages/js-evo-sdk/demo
npm run test:e2e:ui  # Visual test runner (recommended)
```

---

*Last Updated: 2025-10-15*
*Test Suite: 40+ E2E tests for network switcher component*
