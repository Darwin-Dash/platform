# Dash Identity Viewer

A web-based dashboard for inspecting Dash Platform identities on testnet and mainnet.

## Overview

The Identity Viewer is a standalone HTML demo that allows you to:
- View detailed information about Dash Platform identities
- Inspect public keys associated with identities
- Monitor identity balance in credits
- Track identity revision history
- Switch between testnet and mainnet

## Getting Started

### Prerequisites

- Node.js and npm installed
- The js-evo-sdk built and available

### Building the SDK

First, ensure the SDK is built:

```bash
cd ../..
npm run build
```

### Accessing the Demo

The Identity Viewer is served as a static HTML page. You can access it in multiple ways:

#### Option 1: Using npm serve script (Recommended)

```bash
# From the identity-viewer directory
cd packages/js-evo-sdk/demo/identity-viewer
npm run serve
```

Then navigate to: `http://localhost:8000/identity-viewer/`

#### Option 2: Using Manual HTTP Server (from demo directory)

```bash
cd packages/js-evo-sdk/demo
python3 -m http.server 8000
```

Then navigate to: `http://localhost:8000/identity-viewer/`

#### Option 3: Using npm serve from platform-status

If you're already running the platform-status demo:

```bash
cd packages/js-evo-sdk/demo/platform-status
npm run serve
```

Then navigate to: `http://localhost:8000/identity-viewer/`

⚠️ **Do NOT open `index.html` directly** - browser CORS restrictions will prevent ES6 module imports from working. Always use an HTTP server.

## Features

### Identity Lookup
- Enter any valid Dash Platform identity ID
- Automatically load and display identity information
- Pre-populated with the default test identity from `.env`

### Identity Metrics
- **Identity ID**: The unique identifier
- **Balance**: Available credits for this identity
- **Public Keys**: Number of public keys associated
- **Revision**: Identity revision number

### Identity Details
- **Owner ID**: The identity that owns this identity (usually itself for primary identities)
- **Created At**: Timestamp of identity creation
- **Updated At**: Timestamp of last update
- **Updated Block Height**: The block height of the last update

### Public Keys Display
Shows all public keys with:
- Key ID and type
- Purpose (signing, encryption, etc.)
- Full public key data
- Disabled status indicator

### Network Switching
- Toggle between testnet and mainnet
- Network configuration stored per session
- Automatic reconnection when switching networks

### Refresh Functionality
- Manual refresh button to reload current identity data
- Last updated timestamp display
- Auto-refresh capability (can be extended)

## Configuration

### Default Identity

The default test identity is loaded from the `.env` file in the js-evo-sdk package:

```
TEST_IDENTITY_ID=DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq
```

This identity is pre-populated in the input field on page load.

### SDK Version

The demo uses the built EvoSDK module from:
```
../dist/evo-sdk.module.js
```

This path works because the HTTP server is run from the `demo/` folder, making the SDK accessible at `/dist/`.

Ensure this file exists by running `npm run build` from the sdk root:
```bash
cd packages/js-evo-sdk
npm run build
```

## Usage Examples

### View Default Test Identity
1. Open the page - it automatically loads the default test identity
2. See all associated information in the dashboard

### Look Up a Different Identity
1. Enter an identity ID in the "Identity ID" input field
2. Click "Search" or press Enter
3. The dashboard updates with the new identity's information

### Switch Networks
1. Click "Mainnet" button to switch to mainnet
2. Enter a mainnet identity ID
3. The SDK reconnects and displays mainnet data

### Refresh Identity Data
1. Click "Refresh" to reload the currently displayed identity
2. Useful if you expect the identity to have changed

## Styling

The Identity Viewer uses the same design language as the Platform Status dashboard:
- Gradient purple background
- Clean white cards for information
- Responsive grid layout
- Mobile-friendly design
- Consistent typography and spacing

## Error Handling

The demo includes comprehensive error handling:
- Connection errors display with clear messages
- Invalid identity IDs show specific error feedback
- Network errors are caught and displayed
- User-friendly error messages guide next steps

## Development

### File Structure

```
identity-viewer/
├── index.html              # Main HTML file with styling
├── identity-viewer.js      # Main application logic
└── README.md              # This file
```

### Extending the Demo

To add features:

1. **Add new metrics**: Add HTML elements and update the display function
2. **Add data export**: Implement JSON/CSV export of identity data
3. **Add history**: Track previous identity lookups
4. **Add filtering**: Filter public keys by purpose or type
5. **Add charts**: Visualize balance history (requires additional data collection)

### Key Functions

- `initializeSDK()` - Establishes connection to Dash Platform
- `loadIdentity(identityId)` - Fetches identity data using `sdk.identities.get()`
- `displayPublicKeys(publicKeys)` - Renders public keys in UI
- `switchNetwork(network)` - Switches between testnet/mainnet

### SDK API Methods Used

The Identity Viewer uses the following EvoSDK methods:

```javascript
// Get an identity by ID
const identity = await sdk.identities.get(identityId);

// Access identity properties
const id = identity.id.toString();
const balance = identity.balance;
const publicKeys = identity.getPublicKeys();
const revision = identity.revision;
const createdAt = identity.createdAt;
const updatedAt = identity.updatedAt;
```

For alternative identity lookup methods, see the [EvoSDK IdentitiesFacade documentation](../../src/identities/facade.ts).

## Troubleshooting

### "SDK not built" Error or "Failed to fetch dynamically imported module"
- The HTTP server isn't running, or the SDK isn't built
- Run:
  ```bash
  cd packages/js-evo-sdk
  npm run build
  ```
- Then:
  ```bash
  cd packages/js-evo-sdk/demo/identity-viewer
  npm run serve
  ```
- Navigate to: `http://localhost:8000/identity-viewer/`

### "Connection Failed"
- Check network connectivity
- Verify the Dash Platform network is accessible
- Check browser console (F12) for detailed error messages
- Ensure you're on the correct network (testnet vs mainnet)

### "Identity not found"
- Verify the identity ID is correct
- Ensure you're on the correct network (testnet vs mainnet)
- Check that the identity actually exists on the network
- Use the platform-status demo to verify network connectivity

### CORS Issues or Module Import Errors
- Always use an HTTP server - don't open `index.html` directly
- Use the npm script:
  ```bash
  cd packages/js-evo-sdk/demo/identity-viewer
  npm run serve
  ```
- Then open: `http://localhost:8000/identity-viewer/`

## Related

- [Platform Status Dashboard](../platform-status/) - Network status monitoring
- [js-evo-sdk Documentation](../../README.md)
- [Dash Platform Documentation](https://docs.dash.org)

## License

See LICENSE in the root repository.
