# Dash Platform Status Dashboard

A **standalone HTML demo** that demonstrates connecting to Dash Platform using the **js-evo-sdk** JavaScript library. This is a production-ready platform status dashboard that requires no build process or dependencies.

## What This Demo Does

This demo shows:
- ✅ Connection to Dash Platform testnet using the js-evo-sdk
- ✅ Retrieving SDK version information
- ✅ Fetching platform status (block height, protocol version, network time)
- ✅ Real-time activity logging with color-coded messages
- ✅ Clean, modern responsive UI with real-time feedback
- ✅ Completely standalone - no build tools required

## Project Structure

```
platform-status/
├── index.html           # Main HTML interface with all styles
├── platform-status.js   # SDK initialization and connection logic
├── package.json         # Metadata (scripts for serving)
└── README.md           # This file
```

## Getting Started

### Prerequisites

- A web browser (Chrome, Firefox, Safari, Edge)
- Python 3 (for HTTP server)
- The SDK must be built (run `npm run build` from parent directory)

### Running the Demo

#### Recommended: Using npm serve script

The dashboard includes an npm script that runs the HTTP server from the demo folder:

```bash
cd packages/js-evo-sdk/demo/platform-status
npm run serve
```

Then open in your browser:
```
http://localhost:8000/platform-status/
```

This script runs `python3 -m http.server 8000` from the demo directory, making both `platform-status/` and `identity-viewer/` accessible.

#### Alternative: Manual HTTP Server

```bash
# Navigate to demo directory
cd packages/js-evo-sdk/demo

# Start HTTP server
python3 -m http.server 8000
```

Then open in your browser:
```
http://localhost:8000/platform-status/
```

#### Why Run from Demo Folder?

The dashboard loads the SDK from `../dist/evo-sdk.module.js` (one level up). By serving from the demo folder:

```
demo/                    ← Start HTTP server HERE
├── dist/ (symlink)
│   └── evo-sdk.module.js  ← SDK is accessible at /dist/evo-sdk.module.js
├── platform-status/
│   ├── index.html        ← Dashboard is accessible at /platform-status/index.html
│   └── platform-status.js  ← Can import from ../dist/
└── identity-viewer/
    └── (similar structure)
```

**Note:** The `dist/` folder in the demo directory is typically a symlink to the actual SDK build. If it doesn't exist, run `npm run build` from the SDK root first.

## How It Works

### Connection Flow

1. Page loads automatically
2. The demo dynamically imports the EvoSDK module from `../dist/evo-sdk.module.js`
3. SDK initializes and connects to the Dash Platform testnet
4. Platform status is fetched and displayed
5. Dashboard shows the connection status and metrics in real-time

### Network Switching

1. Click testnet or mainnet button
2. The demo reconnects to the selected network
3. Status and metrics are refreshed for the new network

## Technical Details

### Architecture

**HTML (`index.html`)**
- Gradient background with modern card-based design
- Two-column layout (responsive, mobile-friendly)
- Real-time activity log console with color-coded output
- Results display panel
- Status indicator badges

**JavaScript (`demo.js`)**
- Dynamic module import of the SDK
- Connection lifecycle management
- Platform query operations
- Real-time console logging system
- Comprehensive error handling

**SDK Loading**
- The pre-built `evo-sdk.module.js` is loaded directly via `<script>` tag in HTML
- Module then dynamically imported in demo.js via `import()`
- This approach ensures compatibility with all browsers

### Key SDK Features Demonstrated

```javascript
// SDK Initialization
const { EvoSDK } = await import('../dist/evo-sdk.module.js');
const sdk = EvoSDK.testnetTrusted();
await sdk.connect();

// Platform Queries
const status = await sdk.system.status();
console.log(status); // Platform status information
```

## Troubleshooting

### Error: "Failed to resolve module specifier" / CORS error

This error has one main cause:

**Opened HTML file directly with `file://` protocol**

❌ **Wrong:**
```bash
open index.html  # Opens as file:// - CORS blocks module imports
```

✅ **Correct:**
```bash
cd packages/js-evo-sdk/demo
npm run serve
# Then open: http://localhost:8000/platform-status/
```

Or manually:
```bash
cd packages/js-evo-sdk/demo
python3 -m http.server 8000
# Then open: http://localhost:8000/platform-status/
```

**Why?** Modern browsers block ES6 module imports when using `file://` protocol for security reasons. Always use an HTTP server for local development.

### "Cannot find module '../dist/evo-sdk.module.js'"

The SDK hasn't been built yet. From the parent (`js-evo-sdk`) directory:
```bash
npm run build
```

This creates the `dist/evo-sdk.module.js` file that the demo loads.

### Connection timeout or fails

- Check your internet connection
- The Dash Platform testnet may be temporarily unavailable
- Open your browser's Developer Console (F12) to see detailed error messages

### Blank page or "Status: Disconnected"

1. Check browser console (F12 → Console tab) for errors
2. Ensure the SDK is built: `npm run build` from parent directory
3. Ensure you're using a modern browser (Chrome 90+, Firefox 88+, Safari 14+)

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

The demo uses modern ES2020+ features and WebAssembly (WASM), which are required for the SDK.

## File Size

The demo is extremely lightweight:
- `index.html`: ~15 KB
- `demo.js`: ~3 KB
- Total HTML demo files: ~18 KB
- `evo-sdk.module.js`: 6.5 MB (shared SDK, loaded once)

## Deployment

This is a **true static site** - deploy anywhere that serves HTTP files (S3, Netlify, GitHub Pages, etc.).

### Prerequisites

1. **Build the SDK:**
   ```bash
   npm run build
   ```

2. **Files needed for deployment:**
   - `demo/index.html` (8.8 KB)
   - `demo/demo.js` (4.1 KB)
   - `dist/evo-sdk.module.js` (6.5 MB)

### Deployment to Common Platforms

#### AWS S3 + CloudFront

```bash
# Build SDK
npm run build

# Upload files (preserve directory structure)
aws s3 sync demo/ s3://your-bucket/demo/ --exclude package.json --exclude package-lock.json
aws s3 cp dist/evo-sdk.module.js s3://your-bucket/dist/evo-sdk.module.js

# Configure CloudFront to serve as HTTP/HTTPS
```

#### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build SDK
npm run build

# Deploy
netlify deploy --dir=demo --public=demo
```

#### GitHub Pages

1. Copy `demo/` and `dist/` to your GitHub repo
2. Enable GitHub Pages in settings
3. Demo will be at: `https://your-username.github.io/your-repo/demo/`

#### Docker / Self-Hosted

```dockerfile
FROM nginx:latest
COPY demo/ /usr/share/nginx/html/demo/
COPY dist/evo-sdk.module.js /usr/share/nginx/html/dist/evo-sdk.module.js
EXPOSE 80
```

```bash
docker build -t js-evo-sdk-demo .
docker run -p 8000:80 js-evo-sdk-demo
```

### Directory Structure on Server

```
/your-deployment/
├── demo/
│   ├── index.html
│   ├── demo.js
│   └── README.md (optional)
└── dist/
    └── evo-sdk.module.js
```

The relative path `../dist/evo-sdk.module.js` in `index.html` must be preserved.

### Key Points

- ✅ No build step required on server (pre-built)
- ✅ No Node.js or npm required on server
- ✅ No server-side processing needed
- ✅ Works with any static hosting
- ✅ Serve with HTTP/HTTPS (required for module imports)
- ⚠️ Do NOT serve with `file://` protocol

## Development Tips

### Adding New Features

To extend this demo with more SDK functionality:

1. Access different SDK facades:
   ```javascript
   sdk.documents     // Document operations
   sdk.identities    // Identity operations
   sdk.contracts     // Data contract operations
   sdk.dpns          // Dash Platform Naming Service
   sdk.tokens        // Token operations
   ```

2. Add new HTML buttons and elements
3. Create corresponding functions in `demo.js`
4. Update the logging system to show progress

### Local Testing with Custom Node

To test with a local Dash Platform instance:

```javascript
const sdk = EvoSDK.withAddresses(
  ['http://localhost:3000'],  // Your local node address
  'testnet'
);
```

## Related Documentation

- [js-evo-sdk Repository](https://github.com/dashevo/js-evo-sdk)
- [Dash Platform Documentation](https://dashcore.readme.io/)
- [EvoSDK API Reference](../README.md)

## How to Rebuild the Demo

If you modify the SDK or demo code:

```bash
# From js-evo-sdk directory (parent)
npm run build

# This regenerates dist/evo-sdk.module.js
# The demo automatically uses the updated version
```

No demo-specific build is needed - just rebuild the SDK!

## License

This demo is part of the js-evo-sdk project and follows the same licensing terms.

## Support

For issues or questions:

1. **Check the browser console** (F12 → Console tab) for detailed error messages
2. **Review the Activity Log** in the demo UI for connection diagnostics
3. **Check SDK documentation** at https://github.com/dashevo/js-evo-sdk
4. **Open an issue** on the [js-evo-sdk repository](https://github.com/dashevo/js-evo-sdk/issues)

## Testing

This demo includes a comprehensive **Playwright E2E test suite** that validates all functionality.

### Running Tests

First, ensure you have dependencies installed:

```bash
# Install Playwright and test dependencies
cd packages/js-evo-sdk/demo/platform-status
npm install
```

Then run the tests:

```bash
# Run all tests
npm test

# Run tests with browser visible (headed mode)
npm run test:headed

# Run tests in interactive UI
npm run test:ui

# Debug a specific test
npm run test:debug
```

### Test Coverage

The test suite includes:

✅ **Page Load & Initial State**
- Loads without console errors
- Displays correct UI elements
- Shows correct initial state

✅ **SDK Connection Flow**
- Connects to Dash Platform testnet
- Updates connection status
- Logs initialization steps
- Manages button states

✅ **Platform Query Operations**
- Fetches system status
- Displays block height
- Shows protocol version
- Displays network timestamp

✅ **Activity Log Functionality**
- Auto-scrolls to latest messages
- Displays timestamps
- Color-codes entries
- Maintains chronological order

✅ **Error Handling**
- Displays error messages
- Shows error styling
- Recovers gracefully

✅ **UI Responsiveness**
- Works on mobile viewports (375px)
- Works on tablet viewports (768px)
- Works on desktop viewports (1920px)

✅ **Integration Tests**
- Complete connection + query flow
- Multiple connection attempts

### Test Results

Tests run against multiple browsers:
- **Chromium** (Desktop Chrome)
- **Firefox** (Desktop Firefox)
- **WebKit** (Safari)
- **Mobile Chrome** (Pixel 5 viewport)

Test artifacts are saved in `test-results/`:
- HTML report: `index.html`
- JSON results: `results.json`
- JUnit XML: `junit.xml`
- Screenshots and videos of failures

### Viewing Test Results

After running tests, view the HTML report:

```bash
npm run test:report
```

This opens an interactive report showing:
- Pass/fail status for each test
- Screenshots of failures
- Video recordings of failed tests
- Detailed error messages

### CI/CD Integration

To run tests in your CI/CD pipeline:

```bash
# In GitHub Actions, GitLab CI, etc.
npm install
npm test
```

The test suite is configured to:
- Use single worker in CI (faster)
- Retry failed tests 2 times
- Capture screenshots on failure
- Record videos on failure

### Test Architecture

**Configuration**: `playwright.config.js`
- Web server auto-starts on http://localhost:8000
- 30 second timeout per test
- Parallel execution across browsers
- Screenshot/video on failure

**Tests**: `tests/demo.spec.js`
- ~50+ individual test cases
- Organized by feature area
- Tests real testnet connectivity
- No mocking (validates actual SDK functionality)

### Troubleshooting Tests

If tests fail:

1. **Check testnet connectivity**:
   ```bash
   # From demo directory
   cd packages/js-evo-sdk/demo
   npm run serve
   # Manually test: Open http://localhost:8000/platform-status/ and verify it connects
   ```

2. **Run in headed mode to see what's happening**:
   ```bash
   npm run test:headed
   ```

3. **Debug a specific test**:
   ```bash
   npm run test:debug
   # Opens Playwright Inspector with step-by-step execution
   ```

4. **Check test artifacts**:
   ```bash
   npm run test:report
   # View screenshots/videos of failures
   ```

### Developing Tests

To add new tests:

1. Edit `tests/demo.spec.js`
2. Add test case in appropriate `describe` block
3. Use Playwright APIs: `page.goto()`, `page.click()`, `page.waitFor()`, etc.
4. Run `npm run test:headed` to debug
5. Run `npm test` to verify

Example test:

```javascript
test('my new feature', async ({ page }) => {
  await page.goto('/');  // baseURL is http://localhost:8000/demo
  await page.click('#myButton');
  await expect(page.locator('#result')).toContainText('expected text');
});
```

See [Playwright docs](https://playwright.dev) for more information.

---

## Tips for Success

- **Run HTTP server from demo directory**: `cd packages/js-evo-sdk/demo && python3 -m http.server 8000`
- Or use the npm script: `cd packages/js-evo-sdk/demo/platform-status && npm run serve`
- Always rebuild the SDK after pulling changes: `cd packages/js-evo-sdk && npm run build`
- Access demo at: `http://localhost:8000/platform-status/`
- Check the dashboard status badge for connection status
- Open Developer Console (F12) for advanced debugging
- The demo works completely offline after SDK loads (no CDN required)
- Run tests regularly to catch regressions: `cd platform-status && npm test`
