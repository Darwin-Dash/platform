# Testing Automation Guide

## Overview

This guide covers both **automated testing** with Puppeteer and **interactive testing** with the MCP bridge for the Dash Identity Manager demo application.

## Prerequisites

1. **Static HTTP Server Running**:
   ```bash
   python3 -m http.server 8080
   # or
   npm run serve:static
   ```
   Application should be accessible at: http://localhost:8080/index-static.html

2. **Dependencies Installed**:
   ```bash
   yarn install
   ```

---

## Option 1: Automated Testing (Recommended)

### Quick Start

```bash
# Run complete automated test suite
yarn node test-automated.js

# Or use npm script
npm run test:automated
```

### What It Tests

The automated suite runs 9 comprehensive tests:

1. ✅ **Page Load Verification** - Checks title, header, main app container
2. ✅ **Mock Data Loading** - Verifies 3 mock identities loaded
3. ✅ **Identity Selection** - Tests dropdown interaction
4. ❌ **Identity Creation Flow** - Full creation with progress (currently failing - button timing issue)
5. ✅ **Top-Up Operation** - Tests balance increase
6. ✅ **Withdraw Operation** - Tests balance decrease
7. ✅ **Transfer Operation** - Tests identity-to-identity transfer
8. ❌ **Form Validation** - Tests required field validation (currently failing - timing issue)
9. ✅ **State Persistence** - Tests localStorage across page reload

### Current Status

```
Total Tests: 9
Passed: 7 ✅
Failed: 2 ❌
Success Rate: 77.8%
```

### Output

After running, you'll find:

**Screenshots**:
```
screenshots/
├── test1-page-load-*.png
├── test2-mock-data-*.png
├── test3-selector-open-*.png
├── test5-topup-panel-*.png
├── test5-topup-complete-*.png
└── ... (one for each test step)
```

**Test Report**:
```
reports/test-report-<timestamp>.html
```

Open the HTML report in your browser to see:
- Test summary with pass/fail counts
- Individual test results with details
- Embedded screenshots
- Console errors captured

### Browser Mode

By default, tests run in **headed mode** (visible browser) for debugging.

**To run headless** (for CI/CD), edit `test-automated.js`:
```javascript
this.browser = await puppeteer.launch({
  headless: true,  // Change to true
  args: ['--window-size=1920,1080']
});
```

### Known Issues

**Test 4 & 8 Failures** - Timing issues with create identity button:
- The button is overlaid by welcome state initially
- Needs wait for identity selection to complete first
- Will be fixed in next iteration

**Workaround**: Run tests twice - first run selects an identity, second run will pass more tests.

---

## Option 2: Interactive MCP Bridge

### What Is It?

The MCP bridge allows **Claude (AI)** to control the browser during conversation, enabling:
- Interactive testing and debugging
- On-demand screenshots
- Live page inspection
- Real-time test execution

### Starting the MCP Bridge

```bash
# Start the bridge
yarn node mcp-bridge.js

# Or use npm script
npm run test:mcp
```

The bridge will:
1. Launch Chrome with DevTools open
2. Navigate to http://localhost:8080/index-static.html
3. Listen for commands on stdin
4. Return results on stdout

### Available Commands

The MCP bridge accepts JSON commands:

#### Navigate
```json
{"action": "navigate", "params": {"url": "http://localhost:8080/index-static.html"}}
```

#### Click Element
```json
{"action": "click", "params": {"selector": ".selector-trigger"}}
```

#### Type Text
```json
{"action": "type", "params": {"selector": "#funding-amount", "text": "0.01"}}
```

#### Take Screenshot
```json
{"action": "screenshot", "params": {"filename": "my-test.png", "fullPage": false}}
```

#### Execute JavaScript
```json
{"action": "evaluate", "params": {"code": "window.stateManager.getAllIdentities().length"}}
```

#### Get Identities
```json
{"action": "getIdentities"}
```

#### Get Selected Identity
```json
{"action": "getSelectedIdentity"}
```

#### Wait for Selector
```json
{"action": "waitForSelector", "params": {"selector": "#create-modal", "timeout": 5000}}
```

#### Get Text
```json
{"action": "getText", "params": {"selector": ".app-title"}}
```

### Example Session

```bash
# Terminal 1: Start MCP bridge
$ yarn node mcp-bridge.js
[MCP Bridge] Initializing browser...
[MCP Bridge] Browser initialized and ready
[MCP Bridge] Listening for commands on stdin...

# Terminal 2: Send commands
$ echo '{"action":"getIdentities"}' | yarn node mcp-bridge.js
{"success":true,"identities":[{"id":"GWRSAVFMjXx8...","label":"Personal Wallet","balance":10250000000}, ...]}

$ echo '{"action":"click","params":{"selector":".selector-trigger"}}' | yarn node mcp-bridge.js
{"success":true,"message":"Clicked .selector-trigger"}

$ echo '{"action":"screenshot","params":{"filename":"dropdown-open.png"}}' | yarn node mcp-bridge.js
{"success":true,"message":"Screenshot saved to dropdown-open.png","path":"/path/to/screenshots/dropdown-open.png"}
```

### Using with Claude

When chatting with Claude Code:

```
You: Can you test the identity selector using MCP?

Claude: *sends command to MCP bridge*
       *receives response*

"I clicked the identity selector and found 3 identities:
1. Personal Wallet - 10.25 DASH
2. Business Account - 5.50 DASH
3. Gaming Identity - 0.75 DASH

Screenshot saved to dropdown-test.png"
```

---

## Comparison: Automated vs Interactive

| Feature | Automated Tests | MCP Bridge |
|---------|----------------|------------|
| **Speed** | Fast (runs all tests in ~15s) | Slow (interactive) |
| **Coverage** | Comprehensive (9 tests) | On-demand |
| **Debugging** | Screenshots + reports | Real-time observation |
| **CI/CD** | ✅ Perfect for automation | ❌ Not suitable |
| **Development** | ✅ Regression testing | ✅ Debugging specific issues |
| **Claude Integration** | ❌ No | ✅ Yes - Claude can control |

### When to Use Each

**Use Automated Tests**:
- Before committing code
- In CI/CD pipeline
- Regression testing
- Quick validation of all features

**Use MCP Bridge**:
- Debugging specific UI issues
- Testing edge cases
- Interactive exploration
- When you need Claude's help testing

---

## Troubleshooting

### "Cannot find package 'puppeteer'"

**Solution**: Use `yarn node` instead of plain `node`:
```bash
yarn node test-automated.js
```

### "Connection refused" or "ERR_CONNECTION_REFUSED"

**Solution**: Ensure static server is running:
```bash
# Check if server is running
lsof -i:8080

# If not, start it
python3 -m http.server 8080
```

### Browser doesn't close after tests

**Solution**: Ctrl+C to force quit, or:
```bash
pkill -f "chrome.*--remote-debugging"
```

### MCP bridge not responding

**Solution**: Check stdin/stdout:
```bash
# Test with simple command
echo '{"action":"getIdentities"}' | yarn node mcp-bridge.js
```

### Screenshots not generated

**Solution**: Check directory exists and permissions:
```bash
mkdir -p screenshots reports
chmod 755 screenshots reports
```

---

## Advanced Usage

### Custom Test Scenarios

Create your own test files:

```javascript
// my-custom-test.js
import puppeteer from 'puppeteer';

async function customTest() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080/index-static.html');

  // Your custom test logic here

  await browser.close();
}

customTest();
```

### Integration with CI/CD

**GitHub Actions example**:
```yaml
- name: Run automated tests
  run: |
    cd packages/js-evo-sdk/demo
    python3 -m http.server 8080 &
    SERVER_PID=$!
    sleep 2
    yarn node test-automated.js
    kill $SERVER_PID
```

### Headless Mode for CI

Edit `test-automated.js`:
```javascript
const isCI = process.env.CI === 'true';

this.browser = await puppeteer.launch({
  headless: isCI,  // Headless in CI, visible locally
  args: isCI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
});
```

---

## Next Steps

1. **Fix Failing Tests**: Address timing issues in Test 4 & 8
2. **Add More Tests**: Cover error scenarios, edge cases
3. **Performance Testing**: Add metrics for operation duration
4. **Visual Regression**: Compare screenshots across runs
5. **Real Platform Integration**: Replace mock operations with real SDK calls

---

## Resources

- **Test Scripts**: `test-automated.js`, `mcp-bridge.js`
- **Test Reports**: `reports/test-report-*.html`
- **Screenshots**: `screenshots/`
- **Package Scripts**: See `package.json` for npm/yarn commands

## Support

For issues or questions:
1. Check this documentation first
2. Review test screenshots in `screenshots/`
3. Check test report in `reports/`
4. Review console logs during test execution
