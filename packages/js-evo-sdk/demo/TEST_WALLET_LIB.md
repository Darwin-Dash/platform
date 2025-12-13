# Testing wallet-lib Integration - Quick Reference

## Problem We Solved

Browser couldn't resolve `wallet-lib` in dynamic imports → webpack build crashed → needed simpler approach

## Solution: Minimal Standalone Tests

Created 3-level approach to validate wallet-lib without app complexity:

### Level 1: Node.js Test (Simplest)

**What**: Standalone Node.js script that tests complete discovery flow

**Where**: `../test-wallet-discovery.js`

**Run**:
```bash
cd ../
yarn node test-wallet-discovery.js
```

**Why first**:
- No browser/bundler needed
- Tests pattern in isolation
- Runs in <2 minutes (after wallet sync)
- Clear pass/fail result

**Expected output**:
```
✅ SDK initialized for testnet
✅ Wallet created
✅ Wallet synced
✅ 0 identities found (or more if you have funded identities)
🎉 SUCCESS: wallet-lib integration is working!
```

---

### Level 2: Browser Bundle Test

**What**: Webpack-bundled browser test with UI

**Where**:
- Source: `./test-discovery-bundle-source.js`
- UI: `./test-discovery-bundle.html`
- Config: `./webpack.discovery-test.config.cjs`

**Build & Run**:
```bash
npm run test:discovery-bundle
npm run serve:static
# Open http://localhost:8080/test-discovery-bundle.html
```

**Why second**:
- Proves wallet-lib can be bundled for browser
- Minimal webpack config (not full app)
- Beautiful real-time UI
- Validates browser integration

**Expected**: Page shows real-time discovery, final results

---

### Level 3: Integration into Demo App

**After** both tests pass:

1. Open `./app.js`
2. Find `performRealDiscovery()` function
3. Replace mock discovery with pattern from test:

```javascript
import { Wallet } from '@dashevo/wallet-lib';
import InMem from '@dashevo/wallet-lib/src/adapters/InMem.js';

async performRealDiscovery(mnemonic) {
  // Create wallet
  const wallet = new Wallet({
    adapter: InMem,
    network: 'testnet',
    mnemonic
  });

  // Sync wallet
  const account = await wallet.getAccount({ synchronize: true });

  // Discover identities
  return await this.sdk.identities.getIdentityIds(account, {
    onProgress: (state) => {
      // Update UI progress
      document.getElementById('discovery-count').textContent = state.foundCount;
      document.getElementById('discovery-scanned').textContent = state.currentIndex;
    }
  });
}
```

---

## Quick Test Commands

### All-in-one validation:
```bash
cd packages/js-evo-sdk/demo
npm run test:wallet-lib
```

This:
1. Runs Node.js test
2. Shows results
3. Tells you next steps

### Step-by-step:
```bash
# Test 1: Node.js
cd ../
yarn node test-wallet-discovery.js

# Test 2: Browser (in separate terminal)
cd demo/
npm run test:discovery-bundle
npm run serve:static
# Then open http://localhost:8080/test-discovery-bundle.html
```

---

## File Locations

| What | Where | Purpose |
|------|-------|---------|
| Node.js test | `../test-wallet-discovery.js` | Core validation |
| Browser source | `./test-discovery-bundle-source.js` | Browser test code |
| Browser UI | `./test-discovery-bundle.html` | Browser test page |
| Webpack config | `./webpack.discovery-test.config.cjs` | Minimal bundling |
| This file | `./TEST_WALLET_LIB.md` | Quick reference |
| Full guide | `../WALLET_LIB_INTEGRATION_GUIDE.md` | Detailed docs |
| Quick start | `../QUICK_START_WALLET_LIB_TEST.md` | Another reference |
| Summary | `../SOLUTION_SUMMARY.md` | Problem/solution/approach |

---

## What Each Test Validates

| Test | Validates |
|------|-----------|
| Node.js | wallet-lib can be imported and used for discovery |
| Browser | wallet-lib can be bundled and run in browser |
| Integration | Real SDK discovery works in full demo app |

---

## Key Pattern (Copy This)

```javascript
// 1. Import
import { Wallet } from '@dashevo/wallet-lib';
import InMem from '@dashevo/wallet-lib/src/adapters/InMem.js';

// 2. Create wallet
const wallet = new Wallet({
  adapter: InMem,
  network: 'testnet',
  mnemonic: userProvidedMnemonic
});

// 3. Sync wallet
const account = await wallet.getAccount({
  synchronize: true,
  startHeight: 1330000  // Optional: start from recent block
});

// 4. Discover identities
const identities = await sdk.identities.getIdentityIds(account, {
  gapLimit: 20,        // Stop after 20 consecutive empty indices
  batchSize: 50,       // Check 50 at a time
  onProgress: (state) => {
    // Called frequently during discovery
    console.log(`Found: ${state.foundCount}, Scanned: ${state.currentIndex}`);
  }
});

// 5. Done!
console.log('Result:', identities);
// Output: [
//   { index: 0, identityId: 'abc123...' },
//   { index: 5, identityId: 'def456...' }
// ]
```

---

## Debugging

### Node.js test verbose output:
```bash
LOG_LEVEL=debug yarn node ../test-wallet-discovery.js
```

### Browser test troubleshooting:
- Check console: F12 → Console tab
- Check Network tab for DAPI requests
- Check if `dist/test-discovery-bundle.js` exists

### Common issues:
- **"Module not found"**: Run `npm run test:discovery-bundle` first
- **"Cannot sync wallet"**: DAPI might be down, try again
- **"0 identities"**: Normal for test wallets - tests still pass!

---

## Performance

- Node.js test: ~2 minutes (wallet sync from network)
- Browser bundle build: ~30 seconds
- Browser test: ~2 minutes (same wallet sync)
- Discovery time: Depends on gap limit and wallet age

---

## Next Steps After Testing

1. ✅ Run Node.js test
2. ✅ Run browser test
3. ✅ Verify both pass
4. → Integrate into `app.js`
5. → Test full demo app
6. → Remove diagnostic code
7. → Demo app uses real identity discovery!

---

See `WALLET_LIB_INTEGRATION_GUIDE.md` for detailed troubleshooting and advanced options.
