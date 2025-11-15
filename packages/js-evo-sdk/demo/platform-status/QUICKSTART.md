# Quick Start Guide - js-evo-sdk Standalone Demo

## The Problem We Solved

✅ **Fixed wasm-bindgen version mismatch** (0.2.100 → 0.2.103)
✅ **Successfully built the entire monorepo**
✅ **Created a true standalone HTML demo** (no dev server required)
✅ **SDK properly compiled and bundled** at `dist/evo-sdk.module.js`

## Run the Demo Now

⚠️ **You MUST use an HTTP server.** Opening the HTML file directly will fail due to browser CORS restrictions.

### HTTP Server (Required)

Option 1: Using npm script (from platform-status directory)
```bash
cd packages/js-evo-sdk/demo/platform-status
npm run serve
```

Option 2: Manual Python HTTP server (from demo directory)
```bash
cd packages/js-evo-sdk/demo
python3 -m http.server 8000
```

Then open in your browser:
```
http://localhost:8000/platform-status/
```

The dashboard will auto-connect and display platform status.

### Why HTTP is Required

- ❌ `file://` protocol (opening HTML directly) - CORS blocks ES6 module imports
- ✅ `http://` protocol (HTTP server) - Allows ES6 module imports

This is **identical to how S3, Netlify, and GitHub Pages work** - they all serve via HTTP/HTTPS.

## What You Get

A **fully functional demo** that:
- ✅ Connects to Dash Platform testnet (auto-connect on load)
- ✅ Displays platform metrics (block height, peers, network)
- ✅ Shows protocol information and chain data
- ✅ Allows switching between testnet and mainnet
- ✅ Auto-refreshes status periodically
- ✅ Works completely offline after initial load
- ✅ No build tools or npm install required (except for tests)

## File Structure

```
packages/js-evo-sdk/
├── dist/
│   └── evo-sdk.module.js         ← Built SDK bundle (6.5MB)
└── demo/
    ├── dist -> ../../dist/       ← Symlink to SDK (for HTTP access)
    ├── platform-status/
    │   ├── index.html            ← Dashboard UI
    │   ├── platform-status.js    ← Connection logic
    │   ├── tests/
    │   │   └── platform-status.spec.js   ← E2E tests
    │   ├── package.json          ← npm scripts for serving and testing
    │   ├── playwright.config.js  ← Test configuration
    │   ├── README.md             ← Full documentation
    │   └── QUICKSTART.md         ← This file
    └── identity-viewer/
        ├── index.html            ← Identity viewer UI
        ├── identity-viewer.js    ← Identity lookup logic
        ├── package.json          ← npm scripts
        └── README.md             ← Identity viewer documentation
```

## Troubleshooting

**"Failed to fetch dynamically imported module" error?**
- The HTTP server isn't running. Use:
  ```bash
  cd packages/js-evo-sdk/demo/platform-status
  npm run serve
  ```
- Then open: `http://localhost:8000/platform-status/`

**Module not found or SDK path error?**
- SDK wasn't built or symlink is missing. Run:
  ```bash
  cd packages/js-evo-sdk
  npm run build
  ```
- Then verify the symlink exists in demo folder

**Dashboard shows "Connection Failed"?**
- Check your internet connection
- Verify the Dash Platform testnet is accessible
- Open browser console (F12) for detailed error messages

**Nothing displays when opening the page?**
- Check browser console (F12 → Console tab) for errors
- Ensure you're using http:// not file:// protocol
- Try hard-refreshing the page (Ctrl+Shift+R)

## Key Features

- **Auto-connect**: Dashboard automatically connects to the platform on page load
- **Network switching**: Switch between testnet and mainnet with a button click
- **Real-time updates**: Metrics auto-refresh every 30 seconds
- **Full transparency**: All data shown with proper formatting and truncation
- **Responsive design**: Works on mobile, tablet, and desktop
- **Fully testable**: Comprehensive Playwright E2E test suite included

## Running the Tests

To run the E2E test suite:

```bash
cd packages/js-evo-sdk/demo/platform-status
npm install
npm test
```

For development:
```bash
npm run test:headed    # See the tests run in a browser
npm run test:ui        # Interactive test UI
npm run test:debug     # Step-through debugging
```

## Next Steps

1. Run the demo:
   ```bash
   cd packages/js-evo-sdk/demo/platform-status && npm run serve
   ```

2. Open in browser:
   ```
   http://localhost:8000/platform-status/
   ```

3. You'll see the dashboard auto-connect and display:
   - Block height and network metrics
   - Protocol versions and chain information
   - Network status with real-time updates

Done! You now have a fully functional standalone Dash Platform status dashboard.
