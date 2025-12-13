# Identity Management Website Development Plan

## Executive Summary

A comprehensive web application for Dash Platform identity management using the `@dashevo/evo-sdk` package. The application follows a **mock-first development approach**, building a complete, polished interface with mock data before integrating real Platform functionality.

## 1. Project Overview

### 1.1 Objectives
- Create a user-friendly interface for managing Dash Platform identities
- Support identity creation, top-up, withdrawal, and transfer operations
- Display comprehensive identity information and public keys
- Demonstrate js-evo-sdk capabilities in a browser environment

### 1.2 Core Principles
- **Mock-First Development**: Build complete UI with mock data before Platform integration
- **Progressive Enhancement**: Start with static mockups, add interactivity, then real data
- **Single Page Application**: All operations on one unified interface
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### 1.3 Technology Stack
- **Framework**: Vanilla JavaScript (no framework dependencies)
- **Build Tool**: Webpack 5 for bundling
- **SDK**: @dashevo/evo-sdk with browser polyfills
- **Styling**: Modern CSS with CSS Grid and Flexbox
- **State Management**: Simple JavaScript state with event-driven updates

## 2. Architecture

### 2.1 Project Structure
```
packages/js-evo-sdk/demo/
├── index.html                      # Main application HTML
├── app.js                          # Application controller
├── styles.css                      # Main stylesheet
├── mock-data.js                   # Mock Platform data
├── state-manager.js               # State management
├── components/
│   ├── identity-selector.js       # Dropdown selector component
│   ├── identity-view.js           # Main identity display
│   ├── identity-actions.js        # Action panels (top-up, etc.)
│   ├── identity-create.js         # Creation flow component
│   ├── public-keys.js            # Keys display component
│   └── notifications.js          # Toast notification system
├── utils/
│   ├── formatter.js               # Data formatting utilities
│   ├── validator.js               # Input validation
│   └── platform-adapter.js       # SDK integration layer
├── webpack.config.js              # Browser build configuration
└── package.json                   # Demo dependencies
```

### 2.2 Component Hierarchy
```
App
├── Header
│   ├── IdentitySelector
│   └── CreateButton
├── MainContent
│   ├── IdentityView
│   │   ├── OverviewCard
│   │   ├── ActionsPanel
│   │   └── PublicKeysTable
│   └── CreateIdentityModal
└── NotificationContainer
```

### 2.3 State Management Architecture
```javascript
// Centralized state structure
const appState = {
  // UI State
  ui: {
    selectedIdentityId: null,
    activePanel: null, // 'topup' | 'withdraw' | 'transfer' | null
    isCreating: false,
    isLoading: false
  },

  // Data State
  identities: Map<string, Identity>,
  transactions: Map<string, Transaction>,

  // Network State
  network: 'testnet',
  isConnected: false,
  syncProgress: 0
};
```

## 3. Phase 1: Mock Interface Development

### 3.1 Mock Data Schema

```javascript
// mock-data.js
const mockIdentity = {
  id: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  balance: 10250000000, // duffs (10.25 DASH)
  revision: 3,
  publicKeysCount: 4,
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-10-01T14:22:00Z',
  keys: [
    {
      id: 0,
      keyType: 'ECDSA_SECP256K1',
      purpose: 'AUTHENTICATION',
      securityLevel: 'MASTER',
      status: 'active',
      data: '0x2d3c4e5f...' // Hex public key
    },
    {
      id: 1,
      keyType: 'ECDSA_SECP256K1',
      purpose: 'AUTHENTICATION',
      securityLevel: 'HIGH',
      status: 'active',
      data: '0x3d4c5e6f...'
    },
    {
      id: 2,
      keyType: 'ECDSA_SECP256K1',
      purpose: 'TRANSFER',
      securityLevel: 'CRITICAL',
      status: 'disabled',
      data: '0x4d5c6e7f...'
    },
    {
      id: 3,
      keyType: 'ECDSA_SECP256K1',
      purpose: 'AUTHENTICATION',
      securityLevel: 'CRITICAL',
      status: 'active',
      data: '0x5d6c7e8f...'
    }
  ]
};

const mockTransaction = {
  id: 'tx_' + Date.now(),
  type: 'topup', // 'topup' | 'withdraw' | 'transfer' | 'create'
  amount: 1000000000, // duffs
  status: 'pending', // 'pending' | 'confirming' | 'confirmed' | 'failed'
  timestamp: Date.now(),
  confirmations: 0,
  hash: '7f3e2a1b...',
  fee: 226 // duffs
};
```

### 3.2 UI Components Specification

#### 3.2.1 Identity Selector Component
```html
<!-- Dropdown with search capability -->
<div class="identity-selector">
  <button class="selector-trigger">
    <span class="identity-preview">
      <span class="identity-id">GWRSAVFMj...</span>
      <span class="identity-balance">10.25 DASH</span>
    </span>
    <svg class="chevron-icon">...</svg>
  </button>

  <div class="selector-dropdown">
    <input type="text" placeholder="Search identities..." />
    <ul class="identity-list">
      <li class="identity-item selected">
        <span class="identity-id">GWRSAVFMj...</span>
        <span class="identity-balance">10.25 DASH</span>
      </li>
      <li class="identity-item">
        <span class="identity-id">H3KTBYNQk...</span>
        <span class="identity-balance">5.50 DASH</span>
      </li>
      <li class="create-new">
        + Create New Identity
      </li>
    </ul>
  </div>
</div>
```

#### 3.2.2 Identity View Component
```html
<div class="identity-view">
  <!-- Overview Card -->
  <div class="card overview-card">
    <h2>Identity Overview</h2>
    <div class="info-grid">
      <div class="info-item">
        <label>Identity ID</label>
        <div class="value-with-action">
          <span class="monospace">GWRSAVFMjXx8HpQF...</span>
          <button class="copy-btn" title="Copy full ID">📋</button>
        </div>
      </div>
      <div class="info-item">
        <label>Balance</label>
        <div class="balance-display">
          <span class="balance-main">10.25 DASH</span>
          <span class="balance-sub">10,250,000,000 duffs</span>
        </div>
      </div>
      <div class="info-item">
        <label>Keys</label>
        <span>4 keys (3 active, 1 disabled)</span>
      </div>
      <div class="info-item">
        <label>Revision</label>
        <span>3</span>
      </div>
      <div class="info-item">
        <label>Created</label>
        <span>Jan 15, 2024 10:30 AM</span>
      </div>
      <div class="info-item">
        <label>Last Updated</label>
        <span>Oct 1, 2024 2:22 PM</span>
      </div>
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="card actions-card">
    <h2>Quick Actions</h2>
    <div class="action-buttons">
      <button class="btn btn-primary" data-action="topup">
        <svg class="icon">...</svg> Top Up
      </button>
      <button class="btn btn-secondary" data-action="withdraw">
        <svg class="icon">...</svg> Withdraw
      </button>
      <button class="btn btn-secondary" data-action="transfer">
        <svg class="icon">...</svg> Transfer
      </button>
    </div>
  </div>

  <!-- Dynamic Action Panel -->
  <div class="card action-panel" data-panel="topup">
    <h3>Top Up Credits</h3>
    <form class="action-form">
      <div class="form-group">
        <label for="topup-amount">Amount</label>
        <div class="amount-input-group">
          <input type="number" id="topup-amount" step="0.00000001" />
          <select class="unit-selector">
            <option value="dash">DASH</option>
            <option value="duffs">duffs</option>
          </select>
        </div>
        <span class="input-help">Min: 0.001 DASH</span>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Execute Top Up</button>
        <button type="button" class="btn btn-ghost cancel">Cancel</button>
      </div>
    </form>
  </div>

  <!-- Public Keys Table -->
  <div class="card keys-card">
    <h2>Public Keys</h2>
    <table class="keys-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Purpose</th>
          <th>Security Level</th>
          <th>Status</th>
          <th>Key Data</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>0</td>
          <td><span class="badge badge-auth">AUTHENTICATION</span></td>
          <td><span class="badge badge-master">MASTER</span></td>
          <td><span class="status-active">●</span> Active</td>
          <td class="key-data">0x2d3c4e5f...</td>
        </tr>
        <!-- More rows -->
      </tbody>
    </table>
  </div>
</div>
```

### 3.3 Mock Interactions

```javascript
// Mock operation handlers
class MockPlatformOperations {
  async topUp(identityId, amount) {
    // Show loading state
    showLoading('Processing top-up...');

    // Simulate network delay
    await delay(2000);

    // Update mock data
    const identity = mockIdentities.get(identityId);
    identity.balance += amount;
    identity.updatedAt = new Date().toISOString();
    identity.revision += 1;

    // Create transaction record
    const transaction = {
      id: 'tx_' + Date.now(),
      type: 'topup',
      amount: amount,
      status: 'pending',
      timestamp: Date.now()
    };

    // Simulate confirmation
    setTimeout(() => {
      transaction.status = 'confirmed';
      transaction.confirmations = 6;
      updateTransactionUI(transaction);
    }, 5000);

    // Update UI
    hideLoading();
    showSuccess(`Added ${formatDuffs(amount)} to identity`);
    updateIdentityDisplay(identity);

    return transaction;
  }

  async withdraw(identityId, toAddress, amount) {
    showLoading('Processing withdrawal...');
    await delay(3000);

    const identity = mockIdentities.get(identityId);
    if (identity.balance < amount) {
      throw new Error('Insufficient balance');
    }

    identity.balance -= amount;
    identity.updatedAt = new Date().toISOString();
    identity.revision += 1;

    hideLoading();
    showSuccess(`Withdrew ${formatDuffs(amount)} to ${toAddress}`);
    updateIdentityDisplay(identity);
  }

  async transfer(senderId, recipientId, amount) {
    showLoading('Processing transfer...');
    await delay(2500);

    const sender = mockIdentities.get(senderId);
    const recipient = mockIdentities.get(recipientId);

    if (sender.balance < amount) {
      throw new Error('Insufficient balance');
    }

    sender.balance -= amount;
    recipient.balance += amount;

    hideLoading();
    showSuccess(`Transferred ${formatDuffs(amount)} to ${recipientId}`);
    updateIdentityDisplay(sender);
  }

  async createIdentity(fundingAmount) {
    showLoading('Creating identity...');

    // Step 1: Initialize
    updateProgress('Initializing...', 20);
    await delay(1000);

    // Step 2: Generate keys
    updateProgress('Generating keys...', 40);
    await delay(1500);

    // Step 3: Create transaction
    updateProgress('Creating transaction...', 60);
    await delay(1500);

    // Step 4: Submit to network
    updateProgress('Submitting to network...', 80);
    await delay(2000);

    // Step 5: Confirm
    updateProgress('Confirming...', 100);
    await delay(1000);

    // Create new mock identity
    const newIdentity = {
      id: generateMockIdentityId(),
      balance: fundingAmount,
      revision: 0,
      publicKeysCount: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      keys: generateMockKeys()
    };

    mockIdentities.set(newIdentity.id, newIdentity);

    hideLoading();
    showSuccess('Identity created successfully!');
    selectIdentity(newIdentity.id);

    return newIdentity;
  }
}
```

## 4. Phase 2: Styling & User Experience

### 4.1 Design System

#### Colors
```css
:root {
  /* Brand Colors */
  --dash-blue: #008DE4;
  --dash-blue-dark: #0066A3;
  --dash-blue-light: #E6F4FB;

  /* Status Colors */
  --success: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  --info: #3B82F6;

  /* Neutral Colors */
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;

  /* Semantic Colors */
  --background: var(--gray-50);
  --surface: white;
  --text-primary: var(--gray-900);
  --text-secondary: var(--gray-600);
  --border: var(--gray-200);
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --background: var(--gray-900);
    --surface: var(--gray-800);
    --text-primary: var(--gray-50);
    --text-secondary: var(--gray-400);
    --border: var(--gray-700);
  }
}
```

#### Typography
```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
               'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono',
               Consolas, 'Courier New', monospace;

  /* Font Sizes */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

#### Components
```css
/* Cards */
.card {
  background: var(--surface);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  border: 1px solid var(--border);
}

/* Buttons */
.btn {
  font-weight: var(--font-medium);
  border-radius: 8px;
  padding: 10px 20px;
  transition: all 0.2s;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: var(--dash-blue);
  color: white;
  border: none;
}

.btn-primary:hover {
  background: var(--dash-blue-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgb(0 141 228 / 0.3);
}

.btn-secondary {
  background: var(--gray-100);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

/* Forms */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: var(--text-base);
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--dash-blue);
  box-shadow: 0 0 0 3px rgb(0 141 228 / 0.1);
}

/* Badges */
.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
}

.badge-auth {
  background: var(--info);
  color: white;
}

.badge-master {
  background: var(--warning);
  color: white;
}
```

### 4.2 Responsive Layout

```css
/* Mobile First Approach */
.container {
  width: 100%;
  padding: 16px;
}

/* Tablet */
@media (min-width: 768px) {
  .container {
    max-width: 768px;
    margin: 0 auto;
    padding: 24px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .container {
    max-width: 1024px;
  }

  .info-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .action-buttons {
    display: flex;
    gap: 12px;
  }
}

/* Wide Screen */
@media (min-width: 1280px) {
  .container {
    max-width: 1280px;
  }
}
```

### 4.3 Animations & Transitions

```css
/* Loading Spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--gray-300);
  border-top-color: var(--dash-blue);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* Slide Transitions */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-enter {
  animation: slideDown 0.2s ease-out;
}

/* Toast Notifications */
@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.toast {
  animation: slideIn 0.3s ease-out;
}
```

### 4.4 Dark Mode Compatibility Standards

#### The Problem

CSS variables like `--text-primary` change based on system dark mode preference:

```css
/* Light Mode */
--text-primary: #111827;  /* dark gray/black */

/* Dark Mode (prefers-color-scheme: dark) */
--text-primary: #F9FAFB;  /* light gray/white */
```

**Issue**: When interactive elements use **fixed backgrounds** (like `#F3F4F6` for hover) combined with **variable text colors** (`var(--text-primary)`), the text can become invisible in dark mode.

**Example of the Bug:**
```css
/* ❌ WRONG - Invisible text in dark mode */
.btn-ghost:hover {
  background: #F3F4F6;  /* Fixed light gray */
  color: var(--text-primary);  /* Could be white in dark mode! */
}
/* Result: White text on light gray = invisible */
```

#### The Solution: Explicit Colors for Interactive Elements

**Rule**: For any element with a **fixed background color**, use **explicit text colors**.

```css
/* ✅ CORRECT - Always readable */
.btn-ghost:hover {
  background: #F3F4F6;  /* Light gray background */
  color: #111827;       /* Always dark text */
}
```

#### When to Use Variables vs Explicit Colors

**Use CSS Variables:**
- Non-interactive text that adapts to theme
- Backgrounds that change with theme
- Elements without fixed-color backgrounds
- Base states (non-hover, non-active)

**Use Explicit Colors:**
- ✅ Hover states with fixed backgrounds
- ✅ Dropdowns with light backgrounds
- ✅ Any interactive element where contrast must be guaranteed
- ✅ Brand-specific colors (buttons, badges)

#### Implementation Checklist

When adding new interactive components:

- [ ] Does the element have a hover state?
- [ ] Does the hover state use a fixed background color?
- [ ] If YES to both: Use explicit colors (not CSS variables)
- [ ] Test in both light mode AND dark mode (system preferences)
- [ ] Verify text is visible in all states

#### Examples from Our Codebase

**Fixed Correctly:**
```css
/* Identity dropdown hover */
.identity-item:hover {
  background: #F3F4F6;  /* Explicit light gray */
  color: #111827;       /* Explicit dark text */
}

/* Ghost button hover */
.btn-ghost:hover {
  background: #F3F4F6;  /* Explicit light gray */
  color: #111827;       /* Explicit dark text */
}

/* Selected identity */
.identity-item.selected {
  background: #F0F9FF;  /* Explicit light blue */
  color: #0066A3;       /* Explicit dark blue */
}
```

### 4.5 Component Standards & Best Practices

#### Button Standards

**Primary Buttons (`.btn-primary`)**
- Background: `#008DE4` (dash-blue)
- Text: `white`
- Hover: `#0066A3` background, lift effect, blue glow
- Use for: Main actions (Create, Submit, Execute, Connect)

**Secondary Buttons (`.btn-secondary`)**
- Background: `white`
- Border: `2px solid #008DE4`
- Text: `#008DE4`
- Hover: Light blue background `#F0F9FF`, dark blue text `#0066A3`
- Use for: Secondary actions (Withdraw, Transfer, Top Up)

**Ghost Buttons (`.btn-ghost`)**
- Background: `transparent`
- Text: `var(--text-secondary)` (gray-600)
- **Hover: `#F3F4F6` background, `#111827` text (EXPLICIT COLORS)**
- Use for: Cancel, Logout, low-priority actions

#### Card Standards

**Light Mode Cards (`.card`, `.stat-card`, `.welcome-card`)**
- Background: `white` or `var(--surface)`
- Border: `1px solid var(--border)`
- Text: Uses CSS variables (adapts to theme)
- Shadow: Standard shadow
- Use for: Main content areas, forms, stats

**Dark Cards (`.identity-card`)**
- Background: `var(--gray-800)` (#1F2937)
- Border: `1px solid var(--gray-700)` (#374151)
- Label text: `var(--gray-50)` (#F9FAFB) - light
- Secondary text: `var(--gray-400)` (#9CA3AF)
- Use for: Dashboard identity cards (visual contrast)

#### Balance Display Standards

**Identity balances MUST show:**
1. **Primary**: Credits (Platform units)
   - Format: `10,250,000,000,000 credits`
   - Conversion: `duffs × 1000 = credits`

2. **Secondary**: DASH (user-friendly)
   - Format: `102.5 DASH`
   - Conversion: `duffs ÷ 100,000,000 = DASH`

**Code Example:**
```javascript
// utils/formatter.js
export function formatBalance(duffs) {
  const credits = duffs * 1000;
  const dash = duffs / 100000000;
  return {
    credits: credits.toLocaleString() + ' credits',
    dash: dash.toFixed(8).replace(/\.?0+$/, '') + ' DASH'
  };
}
```

#### Developer Checklist for New Features

When adding any new UI component:

- [ ] Hover states use explicit colors (if fixed background)
- [ ] Text is readable in both light and dark system modes
- [ ] Follows standard button classes (`.btn-primary`, `.btn-secondary`, `.btn-ghost`)
- [ ] Uses spacing scale (`var(--space-*)`)
- [ ] Has proper focus states for accessibility
- [ ] Includes loading/disabled states where appropriate
- [ ] Balance displays show Credits (primary) and DASH (secondary)
- [ ] Follows card background conventions (white for content, dark for dashboard cards)

## 5. Phase 3: Real Platform Integration

### 5.1 SDK Integration Layer

```javascript
// platform-adapter.js
import { EvoSDK } from '@dashevo/evo-sdk';

class PlatformAdapter {
  constructor() {
    this.sdk = null;
    this.isInitialized = false;
  }

  async initialize(network = 'testnet') {
    // Add browser polyfills
    if (typeof window !== 'undefined' && !window.Buffer) {
      window.Buffer = {
        from: (data) => {
          if (typeof data === 'string') {
            return new TextEncoder().encode(data);
          }
          return new Uint8Array(data);
        },
        allocUnsafe: (size) => new Uint8Array(size),
        concat: (arrays) => {
          const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
          const result = new Uint8Array(totalLength);
          let offset = 0;
          arrays.forEach(arr => {
            result.set(arr, offset);
            offset += arr.length;
          });
          return result;
        }
      };
    }

    // Initialize SDK
    this.sdk = new EvoSDK({
      network: network,
      version: 1,
      proofs: false
    });

    await this.sdk.connect();
    this.isInitialized = true;
  }

  async fetchIdentity(identityId) {
    if (!this.isInitialized) await this.initialize();

    const identity = await this.sdk.identities.fetch(identityId);

    return {
      id: identity.getId().toString(),
      balance: identity.getBalance(),
      revision: identity.getRevision(),
      publicKeysCount: identity.getPublicKeys().length,
      keys: identity.getPublicKeys().map(key => ({
        id: key.getId(),
        keyType: key.getType(),
        purpose: key.getPurpose(),
        securityLevel: key.getSecurityLevel(),
        data: key.getData().toString('hex'),
        status: key.getDisabledAt() ? 'disabled' : 'active'
      }))
    };
  }

  async topUpIdentity(identityId, amount, mnemonic) {
    if (!this.isInitialized) await this.initialize();

    const result = await this.sdk.identities.topUpWithWallet(
      identityId,
      amount,
      mnemonic
    );

    return {
      status: result.status,
      newBalance: result.newBalance,
      transactionHash: result.transactionHash
    };
  }

  async createIdentity(amount, mnemonic) {
    if (!this.isInitialized) await this.initialize();

    const result = await this.sdk.identities.createWithWallet(
      mnemonic,
      amount
    );

    return {
      identityId: result.identityId,
      balance: result.balance,
      transactionHash: result.transactionHash
    };
  }

  async creditWithdrawal(identityId, toAddress, amount, privateKeyWif) {
    if (!this.isInitialized) await this.initialize();

    const result = await this.sdk.identities.creditWithdrawal({
      identityId,
      toAddress,
      amount,
      privateKeyWif
    });

    return {
      status: 'success',
      transactionHash: result.transactionHash
    };
  }

  async creditTransfer(senderId, recipientId, amount, privateKeyWif) {
    if (!this.isInitialized) await this.initialize();

    const result = await this.sdk.identities.creditTransfer({
      senderId,
      recipientId,
      amount,
      privateKeyWif
    });

    return {
      status: 'success',
      transactionHash: result.transactionHash
    };
  }

  async discoverIdentities(mnemonic) {
    if (!this.isInitialized) await this.initialize();

    // Use wallet-lib to discover identities
    const { Wallet } = await import('@dashevo/wallet-lib');

    const wallet = new Wallet({
      mnemonic,
      network: this.sdk.networkConfig.network,
      offlineMode: false
    });

    const account = await wallet.getAccount();
    const identityIds = wallet.identities.getIdentityIds();

    const identities = [];
    for (const id of identityIds) {
      const identity = await this.fetchIdentity(id);
      identities.push(identity);
    }

    return identities;
  }
}
```

### 5.2 Migration Strategy

```javascript
// app.js - Migration from mock to real
class IdentityManager {
  constructor(useMockData = true) {
    this.useMockData = useMockData;
    this.operations = useMockData
      ? new MockPlatformOperations()
      : new PlatformAdapter();
  }

  async switchToReal() {
    // Transition from mock to real data
    this.useMockData = false;
    this.operations = new PlatformAdapter();

    // Re-fetch all data from Platform
    await this.refreshAllIdentities();
  }

  async topUp(identityId, amount, mnemonic) {
    if (this.useMockData) {
      return this.operations.topUp(identityId, amount);
    } else {
      return this.operations.topUpIdentity(identityId, amount, mnemonic);
    }
  }

  // Similar wrappers for other operations
}
```

## 6. Implementation Timeline

### Week 1: Mock Interface (Days 1-5)

**Day 1: Project Setup & HTML Structure**
- [ ] Initialize project with webpack configuration
- [ ] Create base HTML structure
- [ ] Set up component file structure
- [ ] Configure development server

**Day 2: Core Components**
- [ ] Build IdentitySelector component
- [ ] Build IdentityView component
- [ ] Create mock data structures
- [ ] Implement basic state management

**Day 3: Action Panels**
- [ ] Implement top-up panel
- [ ] Implement withdrawal panel
- [ ] Implement transfer panel
- [ ] Add form validation

**Day 4: Identity Creation Flow**
- [ ] Create modal component
- [ ] Build multi-step form
- [ ] Add progress indicators
- [ ] Implement mock creation logic

**Day 5: Interactions & Notifications**
- [ ] Add loading states
- [ ] Implement toast notifications
- [ ] Add error handling
- [ ] Complete mock interactions

### Week 2: Polish & Integration (Days 6-10)

**Day 6-7: Styling & Responsive Design**
- [ ] Apply design system
- [ ] Implement responsive layouts
- [ ] Add animations and transitions
- [ ] Dark mode support

**Day 8-9: Real SDK Integration**
- [ ] Set up PlatformAdapter
- [ ] Add browser polyfills
- [ ] Replace mock operations
- [ ] Test with testnet

**Day 10: Testing & Documentation**
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Write user documentation
- [ ] Deploy to demo server

## 7. Testing Strategy

### 7.1 Unit Tests
```javascript
// Test mock operations
describe('MockPlatformOperations', () => {
  test('topUp increases balance', async () => {
    const ops = new MockPlatformOperations();
    const identity = mockIdentities.get('test-id');
    const initialBalance = identity.balance;

    await ops.topUp('test-id', 1000000000);

    expect(identity.balance).toBe(initialBalance + 1000000000);
  });
});
```

### 7.2 Integration Tests
```javascript
// Test real SDK integration
describe('PlatformAdapter', () => {
  test('fetches real identity', async () => {
    const adapter = new PlatformAdapter();
    await adapter.initialize('testnet');

    const identity = await adapter.fetchIdentity(KNOWN_TESTNET_ID);

    expect(identity.id).toBe(KNOWN_TESTNET_ID);
    expect(identity.balance).toBeGreaterThanOrEqual(0);
  });
});
```

### 7.3 E2E Tests
```javascript
// Using Playwright for browser testing
test('complete identity creation flow', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Click create button
  await page.click('[data-testid="create-identity"]');

  // Fill form
  await page.fill('#funding-amount', '0.01');

  // Submit
  await page.click('[type="submit"]');

  // Wait for success
  await page.waitForSelector('.toast-success');

  // Verify new identity appears
  await expect(page.locator('.identity-selector')).toContainText('New Identity');
});
```

## 8. Deployment

### 8.1 Build Configuration

```javascript
// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html'
    })
  ],
  resolve: {
    fallback: {
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      crypto: require.resolve('crypto-browserify')
    }
  }
};
```

### 8.2 Deployment Steps

1. **Build Production Bundle**
   ```bash
   npm run build
   ```

2. **Deploy to Static Host**
   - GitHub Pages
   - Netlify
   - Vercel
   - IPFS

3. **Configure Domain & SSL**
   - Set up custom domain
   - Enable HTTPS
   - Configure CSP headers

## 9. Success Metrics

- **Performance**: Initial load < 2s, interactions < 100ms
- **Usability**: Zero training required for basic operations
- **Reliability**: 99.9% uptime, graceful error handling
- **Adoption**: 100+ daily active users within first month

## 10. Future Enhancements

### Phase 4: Advanced Features
- Multi-identity management with portfolio view
- Transaction history with filtering
- Identity analytics dashboard
- Bulk operations support
- Export/import functionality

### Phase 5: Platform Integration
- Data contract interaction
- Document management
- DApp integration framework
- Identity recovery tools
- Hardware wallet support

## Conclusion

This plan provides a comprehensive roadmap for building a professional identity management website using the js-evo-sdk. The mock-first approach ensures we can iterate quickly on the UI/UX before dealing with Platform complexity, resulting in a more polished and user-friendly final product.

---

*Document Version: 1.0*
*Last Updated: October 2024*
*Author: Dash Platform Development Team*