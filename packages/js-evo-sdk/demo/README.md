# Dash Identity Manager Demo

A comprehensive web application for managing Dash Platform identities using the `@dashevo/evo-sdk` package. This demo follows a **mock-first development approach**, providing a complete, polished interface with mock data before Platform integration.

## Features

- 🎨 **Professional UI/UX** - Clean, modern interface following Dash brand guidelines
- 🔄 **Identity Management** - Create, view, and manage multiple identities
- 💰 **Balance Operations** - Top-up, withdraw, and transfer credits
- 🔑 **Public Keys Display** - View and manage identity public keys
- 📊 **Transaction History** - Track recent identity operations
- 🌙 **Dark Mode Support** - Automatic dark/light theme switching
- 📱 **Responsive Design** - Works seamlessly on mobile and desktop

## Quick Start

### Installation

From the demo directory:

```bash
cd packages/js-evo-sdk/demo
npm install
```

### Development Server

Start the webpack development server:

```bash
npm start
```

This will:
- Start the development server on http://localhost:8080
- Open your browser automatically
- Enable hot module reloading

### Production Build

Create an optimized production build:

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
demo/
├── index.html                 # Main HTML structure
├── app.js                     # Application controller
├── styles.css                 # Complete design system
├── state-manager.js           # Centralized state management
├── mock-data.js               # Mock identities and transactions
├── components/
│   ├── identity-selector.js  # Identity dropdown selector
│   └── notifications.js      # Toast notification system
├── utils/
│   ├── formatter.js          # Data formatting utilities
│   └── validator.js          # Input validation utilities
├── webpack.config.js          # Webpack configuration
└── package.json              # Dependencies and scripts
```

## Usage

### Selecting an Identity

1. Click the identity selector dropdown in the header
2. Choose from available identities or create a new one
3. The main view will update to show the selected identity

### Creating a New Identity

1. Click "Create New Identity" button
2. Enter funding amount (minimum 0.001 DASH)
3. Optionally add a label for easy identification
4. Submit to create the identity

### Top-Up Operation

1. Select an identity
2. Click "Top Up" button
3. Enter the amount to add
4. Execute the top-up

### Withdrawal Operation

1. Select an identity
2. Click "Withdraw" button
3. Enter destination address and amount
4. Execute the withdrawal

### Transfer Operation

1. Select source identity
2. Click "Transfer" button
3. Select recipient identity
4. Enter transfer amount
5. Execute the transfer

## Mock Mode

The application starts in **mock mode** with simulated data and operations:

- Pre-populated identities with balances and keys
- Realistic operation delays and confirmations
- Transaction history tracking
- State persistence in localStorage

## Real Platform Integration (Future)

To switch from mock to real Platform operations:

1. Replace `MockPlatformOperations` with real SDK calls in `app.js`
2. Configure network connection (testnet/mainnet)
3. Implement authentication for private operations
4. Update the platform adapter in `utils/platform-adapter.js`

## Technologies Used

- **Vanilla JavaScript** - No framework dependencies
- **Webpack 5** - Module bundling and development server
- **CSS3** - Modern styling with CSS Grid and Flexbox
- **ES6 Modules** - Clean module organization
- **LocalStorage** - State persistence

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development Tips

### Adding New Components

1. Create component file in `components/` directory
2. Import in `app.js`
3. Initialize in `initializeComponents()`

### Modifying Styles

Edit `styles.css` which contains:
- CSS variables for theming
- Component styles
- Responsive breakpoints
- Animation definitions

### State Management

Use `stateManager` for all state operations:

```javascript
import { stateManager } from './state-manager.js';

// Update state
stateManager.setIdentity(id, data);

// Subscribe to changes
stateManager.on('identity-updated', (identity) => {
  // Handle update
});
```

## Testing

### Unit Tests (Working ✅)

```bash
# Run all unit tests
yarn test

# Run with coverage
yarn test:coverage

# Watch mode
yarn test:watch
```

**Status**: 151 tests passing with 95-98% coverage

### E2E Tests (Yarn PnP Compatibility Issue ⚠️)

**Written**: 116 comprehensive E2E tests across 6 files
**Status**: Cannot run due to Yarn PnP + Playwright compatibility issue

**See**: `YARN_PNP_PLAYWRIGHT_SOLUTION.md` for details and solutions

**To enable E2E tests**, choose one option:

**Option A: Switch to node_modules (affects entire monorepo)**
```yaml
# Edit root .yarnrc.yml
nodeLinker: node-modules
```
Then: `yarn install` from root

**Option B: Manual testing (recommended for now)**
```bash
python3 -m http.server 8080
# Open: http://localhost:8080/index-static.html
```
Follow checklist in `FINAL_TEST_STATUS.md`

**Option C: Run in CI/CD with npm (no local execution)**

---

## Troubleshooting

### Webpack Dev Server Issues

**Known Issue**: Webpack has polyfill resolution errors in Yarn PnP

**Solution**: Use static server for development:
```bash
python3 -m http.server 8080
# or
npx http-server . -p 8080
```

Then open `index-static.html`

### Playwright Tests Won't Run

See `YARN_PNP_PLAYWRIGHT_SOLUTION.md` for complete analysis and solutions.

## Contributing

This demo is part of the @dashevo/evo-sdk package. Contributions should follow the main project guidelines.

## License

MIT License - See the main project LICENSE file