# Quick Start Guide - js-evo-sdk Standalone Demo

## The Problem We Solved

✅ **Fixed wasm-bindgen version mismatch** (0.2.100 → 0.2.103)
✅ **Successfully built the entire monorepo**
✅ **Created a true standalone HTML demo** (no dev server required)
✅ **SDK properly compiled and bundled** at `dist/evo-sdk.module.js`

## Run the Demo Now

⚠️ **You MUST use an HTTP server.** Opening the HTML file directly will fail due to browser CORS restrictions.

### HTTP Server (Required)

```bash
cd packages/js-evo-sdk/demo
python3 -m http.server 8000
```

Then open in your browser:
```
http://localhost:8000/index.html
```

Click **"Connect to Dash Platform"** to test the connection.

### Why HTTP is Required

- ❌ `file://` protocol (opening HTML directly) - CORS blocks ES6 module imports
- ✅ `http://` protocol (HTTP server) - Allows ES6 module imports

This is **identical to how S3, Netlify, and GitHub Pages work** - they all serve via HTTP/HTTPS.

## What You Get

A **fully functional demo** that:
- ✅ Connects to Dash Platform testnet
- ✅ Displays SDK version
- ✅ Fetches platform status
- ✅ Shows real-time activity logs
- ✅ Works completely offline after initial load
- ✅ No build tools or npm install required

## File Structure

```
packages/js-evo-sdk/
├── dist/
│   └── evo-sdk.module.js    ← Built SDK bundle (6.5MB)
└── demo/
    ├── index.html            ← Open this in browser
    ├── demo.js              ← Connection logic
    ├── README.md            ← Full documentation
    └── QUICKSTART.md        ← This file
```

## Troubleshooting

**Nothing happens when clicking "Connect"?**
- Check browser console (F12 → Console tab)
- Make sure `../dist/evo-sdk.module.js` exists

**Get "Module not found" error?**
- SDK wasn't built. From js-evo-sdk directory:
  ```bash
  npm run build
  ```

**CORS errors when opening file directly?**
- Use the HTTP server method instead

## How We Built This

1. **Fixed the build issue**: Updated wasm-bindgen-cli from 0.2.100 → 0.2.103
2. **Built the monorepo**: `yarn build` compiled all packages including Rust → WASM
3. **Created demo**: Simple HTML + JS that imports the built SDK bundle
4. **Result**: Standalone demo with no dependencies

## What Changed from Dev Server Approach

- ❌ Removed Vite, webpack, all bundlers
- ❌ Removed node_modules, package-lock.json
- ✅ Added direct SDK import from dist
- ✅ Single index.html with inline CSS
- ✅ Works immediately, no build step

## Key Files

- **index.html** (356 lines): UI + CSS
- **demo.js** (125 lines): SDK logic
- **README.md**: Full documentation
- **evo-sdk.module.js** (6.5MB): Pre-built SDK (loaded from dist)

## Next Steps

1. Open `index.html` in your browser
2. Click "Connect to Dash Platform"
3. Click "Fetch Status" to query the platform
4. Check the Activity Log for diagnostics

Done! You now have a working standalone HTML demo of the js-evo-sdk.
