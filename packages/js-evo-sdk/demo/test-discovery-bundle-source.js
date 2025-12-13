/**
 * Minimal standalone browser bundle source for wallet-lib discovery test
 *
 * This file is meant to be bundled with webpack to create:
 *   test-discovery-bundle.js
 *
 * It validates that wallet-lib can be loaded and used in the browser
 * for identity discovery, without the complexity of the full demo app.
 */

// Import what we need
import { EvoSDK } from '../dist/sdk.js';
import { Wallet } from '@dashevo/wallet-lib';
import InMem from '@dashevo/wallet-lib/src/adapters/InMem.js';

// Test mnemonic
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const START_HEIGHT = 1330000;

async function runDiscoveryTest() {
  const statusEl = document.getElementById('status');
  const outputEl = document.getElementById('output');

  try {
    // Step 1: Initialize SDK
    updateStatus('Initializing EvoSDK...');
    const sdk = new EvoSDK({ network: 'testnet' });
    log('✅ SDK initialized');

    // Step 2: Create wallet
    updateStatus('Creating wallet from mnemonic...');
    const wallet = new Wallet({
      adapter: InMem,
      network: 'testnet',
      mnemonic: TEST_MNEMONIC
    });
    log('✅ Wallet created');

    // Step 3: Sync wallet
    updateStatus('Syncing wallet with testnet (this may take 1-2 minutes)...');
    const account = await wallet.getAccount({
      synchronize: true,
      startHeight: START_HEIGHT
    });
    log('✅ Wallet synced');

    // Step 4: Validate account
    if (!account?.identities?.getIdentityHDKeyByIndex) {
      throw new Error('Invalid account: missing identities methods');
    }
    log('✅ Account has required identity methods');

    // Step 5: Discover identities
    updateStatus('Discovering identities...');
    let discoveryProgress = 0;

    const discoveredIdentities = await sdk.identities.getIdentityIds(
      account,
      {
        gapLimit: 20,
        batchSize: 50,
        onProgress: (state) => {
          discoveryProgress = state.currentIndex;
          updateStatus(`Discovering identities (scanned: ${state.currentIndex}, found: ${state.foundCount})...`);
          log(`Batch ${state.batchNumber}: Index ${state.currentIndex}, Found: ${state.foundCount}`);
        }
      }
    );

    // Step 6: Report results
    updateStatus('✅ Discovery complete!');

    if (discoveredIdentities.length === 0) {
      log('');
      log('⚠️  No identities found (this is expected for test wallets)');
      log('');
    } else {
      log('');
      log(`🎉 Found ${discoveredIdentities.length} identity/identities:`);
      discoveredIdentities.forEach((identity, idx) => {
        log(`  ${idx + 1}. Index ${identity.index}: ${identity.identityId}`);
      });
      log('');
    }

    log('✅ SUCCESS: wallet-lib browser integration is working!');

  } catch (error) {
    updateStatus('❌ Error: ' + error.message);
    log('❌ Error: ' + error.message);
    if (error.stack) {
      log('Stack: ' + error.stack);
    }
  }
}

function updateStatus(message) {
  const el = document.getElementById('status');
  if (el) el.textContent = message;
  console.log(message);
}

function log(message) {
  const el = document.getElementById('output');
  if (el) {
    const line = document.createElement('div');
    line.textContent = message;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }
  console.log(message);
}

// Start test when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runDiscoveryTest);
} else {
  runDiscoveryTest();
}

export { runDiscoveryTest };
