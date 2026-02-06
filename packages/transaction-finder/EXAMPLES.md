# Usage Examples

Practical examples for common use cases with `@dashevo/transaction-finder`.

## Table of Contents

1. [Basic UTXO Finding](#example-1-basic-utxo-finding)
2. [Payment Monitoring](#example-2-payment-monitoring)
3. [Wallet Sync Workflow](#example-3-wallet-sync-workflow)
4. [Transaction Confirmation Tracking](#example-4-transaction-confirmation-tracking)
5. [Error Handling & Retries](#example-5-error-handling--retries)
6. [Memory Management](#example-6-memory-management)
7. [Progress Tracking](#example-7-progress-tracking)
8. [Multi-Address Monitoring](#example-8-multi-address-monitoring)

## Example 1: Basic UTXO Finding

Find all UTXOs for an address from blockchain history.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
import DAPIClient from '@dashevo/dapi-client';

async function findUTXOs() {
  // Initialize DAPI client
  const dapiClient = new DAPIClient({
    network: 'testnet',
    seeds: [{ service: '54.186.154.251:1443' }],
  });

  // Create historic finder
  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
    dapiClient: dapiClient,
    fromHeight: 1,  // Scan from genesis
  });

  // Find all UTXOs
  const utxos = await finder.findUTXOs();

  console.log(`Found ${utxos.length} UTXOs`);
  utxos.forEach(utxo => {
    console.log(`  ${utxo.txId}:${utxo.vout}`);
    console.log(`    Amount: ${utxo.satoshis} satoshis`);
    console.log(`    Block: ${utxo.blockHeight}`);
    console.log(`    ChainLocked: ${utxo.isChainLocked}`);
  });

  return utxos;
}
```

## Example 2: Payment Monitoring

Monitor an address for incoming payments with InstantSend confirmation.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
import DAPIClient from '@dashevo/dapi-client';

async function monitorPayments() {
  const dapiClient = new DAPIClient({
    network: 'testnet',
    seeds: [{ service: '54.186.154.251:1443' }],
  });

  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
    dapiClient: dapiClient,
  });

  console.log('Monitoring for payments...');

  const stopMonitoring = await finder.monitorAddresses(
    ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
    {
      onTransaction: (tx) => {
        console.log('💰 Payment received!');
        console.log('  Transaction ID:', tx.txid);
        console.log('  Time:', new Date(tx.timestamp).toISOString());
      },
      onInstantLock: (lock) => {
        console.log('✅ Payment confirmed via InstantSend');
        console.log('  Transaction ID:', lock.txid);
        console.log('  Confirmation time:', lock.latency, 'ms');
      },
      onChainLock: (cl) => {
        console.log('🔒 Payment finalized via ChainLock');
        console.log('  Transaction ID:', cl.txid);
        console.log('  Block height:', cl.blockHeight);
        console.log('  ChainLocked height:', cl.chainLockedHeight);
      },
    }
  );

  // Monitor for 5 minutes then stop
  setTimeout(() => {
    console.log('Stopping monitoring...');
    stopMonitoring();
  }, 300000);
}
```

## Example 3: Wallet Sync Workflow

Complete wallet synchronization: sync history then monitor for new transactions.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
import DAPIClient from '@dashevo/dapi-client';

async function syncWallet() {
  const dapiClient = new DAPIClient({
    network: 'testnet',
    seeds: [{ service: '54.186.154.251:1443' }],
  });

  const walletAddresses = [
    'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',
    'yf1j1PKDDz3U7PjhRfPpGfeniz5gHuZChZ',
  ];

  const finder = new TransactionFinder({
    mode: FinderMode.HYBRID,
    network: 'testnet',
    addresses: walletAddresses,
    dapiClient: dapiClient,
    historic: {
      fromHeight: 1,
      onProgress: (progress) => {
        console.log(`Syncing: ${progress.progress.toFixed(1)}% (${progress.syncedBlocks}/${progress.totalBlocks} blocks)`);
      },
    },
    realtime: {
      autoPruneOnConfirmation: true,  // Auto-cleanup for long-running
    },
  });

  // Listen to phase transitions
  finder.on('phase', ({ phase, status, utxos }) => {
    if (phase === 'historic' && status === 'completed') {
      console.log(`✅ Historic sync complete: found ${utxos} UTXOs`);
    } else if (phase === 'realtime' && status === 'active') {
      console.log('⚡ Now monitoring for new transactions...');
    }
  });

  // Perform hybrid sync + monitor
  const { utxos, stopMonitoring } = await finder.syncAndMonitor({
    onTransaction: (tx) => {
      console.log('📨 New transaction:', tx.txid);
      // Update wallet balance, UI, etc.
    },
    onInstantLock: (lock) => {
      console.log('⚡ InstantLocked:', lock.txid);
      // Mark as confirmed in UI
    },
    onChainLock: (cl) => {
      console.log('🔒 ChainLocked:', cl.txid);
      // Final confirmation
    },
  });

  console.log('Wallet sync complete!');
  console.log('Current balance:', calculateBalance(utxos), 'satoshis');

  // Keep monitoring until user closes app
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    stopMonitoring();
    process.exit(0);
  });
}

function calculateBalance(utxos) {
  return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
}
```

## Example 4: Transaction Confirmation Tracking

Wait for a specific transaction to be confirmed.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function waitForPaymentConfirmation(txid: string) {
  const dapiClient = new DAPIClient({
    network: 'testnet',
    seeds: [{ service: '54.186.154.251:1443' }],
  });

  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
    dapiClient: dapiClient,
  });

  console.log('Waiting for transaction confirmation...');
  console.log('Transaction ID:', txid);

  try {
    const result = await finder.waitForConfirmation(txid, {
      requireInstantLock: true,
      requireChainLock: false,  // Don't wait for ChainLock
      timeout: 180000,  // 3 minutes max
      onProgress: (status) => {
        console.log(`Status: ${status.status} (${(status.elapsedMs / 1000).toFixed(1)}s elapsed)`);
      },
    });

    if (result.method === 'instantlock') {
      console.log('✅ Payment confirmed via InstantSend');
      console.log('   Confirmation time:', result.totalLatencyMs, 'ms');
    } else if (result.method === 'chainlock') {
      console.log('✅ Payment confirmed via ChainLock');
      console.log('   Block height:', result.blockHeight);
    } else if (result.method === 'timeout') {
      console.log('⏱️  Timeout - payment not confirmed yet');
      console.log('   Check transaction status manually');
    }

    return result;
  } catch (error) {
    console.error('Error waiting for confirmation:', error);
    throw error;
  } finally {
    finder.stop();
  }
}
```

## Example 5: Error Handling & Retries

Robust error handling for production use.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function findUTXOsWithRetry(maxRetries = 3) {
  const dapiClient = new DAPIClient({
    network: 'testnet',
    seeds: [{ service: '54.186.154.251:1443' }],
    timeout: 10000,
    retries: 5,
  });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const finder = new TransactionFinder({
        mode: FinderMode.HISTORIC,
        network: 'testnet',
        addresses: ['yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy'],
        dapiClient: dapiClient,
        fromHeight: 1,
        timeout: 60000,  // 1 minute stream timeout
      });

      // Listen for errors
      finder.on('error', (error) => {
        console.error('Finder error:', error.message);
      });

      const utxos = await finder.findUTXOs();
      console.log('✅ Success:', utxos.length, 'UTXOs found');
      return utxos;

    } catch (error) {
      console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries - 1) {
        const delay = 3000 * Math.pow(2, attempt);  // Exponential backoff
        console.log(`   Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ All retry attempts exhausted');
        throw error;
      }
    }
  }
}
```

## Example 6: Memory Management

Manage memory in long-running monitoring services.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function longRunningMonitor() {
  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: ['yX3CJJ42...'],
    dapiClient: myDapiClient,
    autoPruneOnConfirmation: true,  // ✅ Auto-cleanup
    maxTrackedTransactions: 500,     // ✅ Safety limit
  });

  await finder.monitorAddresses(['yX3CJJ42...'], {
    onTransaction: (tx) => {
      console.log('Transaction:', tx.txid);
    },
    onChainLock: (cl) => {
      console.log('ChainLocked:', cl.txid);
      // Transaction auto-pruned after ChainLock (if autoPrune enabled)
    },
  });

  // Manual cleanup strategy (if autoPrune disabled)
  setInterval(() => {
    const status = finder.getStatus();
    console.log('Tracked transactions:', status.trackedTransactions);

    if (status.trackedTransactions > 400) {
      console.log('Cleaning up confirmed transactions...');
      finder.clearAllConfirmed();
    }
  }, 60000);

  // Monitor memory stats
  setInterval(() => {
    const status = finder.getStatus();
    console.log('Memory stats:', {
      tracked: status.trackedTransactions,
      chainLockHeight: status.chainLockHeight,
    });
  }, 300000);
}
```

## Example 7: Progress Tracking

Detailed progress tracking for historic blockchain scans.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function syncWithProgressBar() {
  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: ['yX3CJJ42...'],
    dapiClient: myDapiClient,
    fromHeight: 1,
    onProgress: (progress) => {
      // Update progress bar
      const percent = progress.progress.toFixed(1);
      const blocks = `${progress.syncedBlocks}/${progress.totalBlocks}`;
      const height = progress.currentHeight;
      console.log(`[${percent}%] Blocks: ${blocks} | Height: ${height}`);
    },
  });

  // Listen to sync steps
  finder.on('step', ({ step }) => {
    switch (step) {
      case 'building-bloom-filter':
        console.log('📋 Building bloom filter...');
        break;
      case 'syncing-transactions':
        console.log('🔄 Syncing transactions...');
        break;
      case 'extracting-utxos':
        console.log('🔍 Extracting UTXOs...');
        break;
      case 'selecting-latest-utxo':
        console.log('🎯 Selecting latest UTXO...');
        break;
    }
  });

  const utxos = await finder.findUTXOs();

  console.log('✅ Sync complete!');
  console.log(`   Found ${utxos.length} UTXOs`);
  console.log(`   Total value: ${calculateBalance(utxos)} satoshis`);

  return utxos;
}

function calculateBalance(utxos) {
  return utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
}
```

## Example 8: Multi-Address Monitoring

Monitor multiple addresses simultaneously.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function monitorMultipleAddresses() {
  const addresses = [
    'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy',  // Receiving address
    'yf1j1PKDDz3U7PjhRfPpGfeniz5gHuZChZ',  // Change address
    'yML9arPR79wVhsQJF315ca3W5KPyx2b5GY',  // Another wallet address
  ];

  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: addresses,
    dapiClient: myDapiClient,
    logLevel: 'info',
  });

  const addressLabels = {
    'yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy': 'Receiving',
    'yf1j1PKDDz3U7PjhRfPpGfeniz5gHuZChZ': 'Change',
    'yML9arPR79wVhsQJF315ca3W5KPyx2b5GY': 'Savings',
  };

  const stopMonitoring = await finder.monitorAddresses(addresses, {
    onTransaction: (tx) => {
      console.log('💰 Transaction detected:', tx.txid);
      // Determine which address(es) received funds
      // (requires parsing transaction - see dashcore-lib)
    },
    onInstantLock: (lock) => {
      console.log('⚡ InstantLocked:', lock.txid);
      console.log('   Confirmed in', lock.latency, 'ms');

      // Get full transaction details
      const txState = finder.getTransaction(lock.txid);
      if (txState) {
        console.log('   Status:', txState.status);
        console.log('   Block:', txState.blockHeight || 'mempool');
      }
    },
    onChainLock: (cl) => {
      console.log('🔒 ChainLocked:', cl.txid);
      console.log('   Final confirmation at height', cl.chainLockedHeight);
    },
  });

  return stopMonitoring;
}
```

## Example 9: Finding Specific Amount

Find a UTXO with enough funds for a payment.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function findPaymentUTXO(requiredSatoshis: number) {
  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: ['yX3CJJ42...'],
    dapiClient: myDapiClient,
    fromHeight: 1,
    requiredAmount: requiredSatoshis,
  });

  try {
    const utxo = await finder.findLatestSpendableUTXO();

    console.log('✅ Found suitable UTXO');
    console.log(`   Amount: ${utxo.satoshis} satoshis (required: ${requiredSatoshis})`);
    console.log(`   Transaction: ${utxo.txId}:${utxo.vout}`);
    console.log(`   Block: ${utxo.blockHeight}`);

    return utxo;
  } catch (error) {
    if (error.message.includes('Insufficient funds')) {
      console.error(`❌ No UTXO found with ${requiredSatoshis} satoshis`);

      // Find all UTXOs to show total available
      const allUtxos = await finder.findUTXOs();
      const total = allUtxos.reduce((sum, u) => sum + u.satoshis, 0);
      console.log(`   Total available: ${total} satoshis`);
    }
    throw error;
  }
}
```

## Example 10: Custom Logging

Configure logging for debugging.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function debugSync() {
  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: ['yX3CJJ42...'],
    dapiClient: myDapiClient,
    fromHeight: 1,
    logLevel: 'debug',  // Enable debug logging
  });

  const utxos = await finder.findUTXOs();
  return utxos;
}

// Or set via environment variable
// LOG_LEVEL=debug node my-script.js
```

**Log Levels:**
- `'silent'` - No logging
- `'error'` - Errors only
- `'warn'` - Warnings and errors
- `'info'` - Informational messages (recommended for production)
- `'debug'` - Detailed debug information
- `'trace'` - Extremely verbose (development only)

## Example 11: Realtime Transaction State

Track transaction state changes over time.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function trackTransactionLifecycle(txid: string) {
  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: ['yX3CJJ42...'],
    dapiClient: myDapiClient,
  });

  // Track state changes
  const states: string[] = [];

  await finder.monitorAddresses(['yX3CJJ42...'], {
    onTransaction: (tx) => {
      if (tx.txid === txid) {
        states.push('detected');
        console.log('State: detected');
      }
    },
    onInstantLock: (lock) => {
      if (lock.txid === txid) {
        states.push('instantlocked');
        console.log('State: instantlocked (after', lock.latency, 'ms)');
      }
    },
    onChainLock: (cl) => {
      if (cl.txid === txid) {
        states.push('chainlocked');
        console.log('State: chainlocked (after', cl.latency, 'ms)');

        // Get final state
        const finalState = finder.getTransaction(txid);
        console.log('Final state:', {
          status: finalState?.status,
          blockHeight: finalState?.blockHeight,
          chainLockHeight: finalState?.chainLockBlockHeight,
          instantLockTime: finalState?.instantLockTime,
          chainLockTime: finalState?.chainLockTime,
        });
      }
    },
  });

  return states;
}
```

## Example 12: Browser Integration

Using transaction-finder in a browser environment.

```typescript
// Ensure Buffer is available
if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = require('buffer').Buffer;
}

import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
import DAPIClient from '@dashevo/dapi-client';

class WalletUI {
  private finder: TransactionFinder;

  async initialize() {
    const dapiClient = new DAPIClient({
      network: 'testnet',
      seeds: [{ service: 'seed-1.testnet.networks.dash.org' }],
    });

    this.finder = new TransactionFinder({
      mode: FinderMode.HYBRID,
      network: 'testnet',
      addresses: this.getWalletAddresses(),
      dapiClient: dapiClient,
      historic: {
        fromHeight: this.getLastSyncHeight(),
        onProgress: (progress) => {
          this.updateProgressBar(progress.progress);
        },
      },
      realtime: {
        autoPruneOnConfirmation: true,
      },
    });

    const { utxos, stopMonitoring } = await this.finder.syncAndMonitor({
      onTransaction: (tx) => {
        this.showNotification('New transaction received');
        this.updateBalance();
      },
      onInstantLock: (lock) => {
        this.showNotification('Payment confirmed (InstantSend)');
        this.updateTransactionStatus(lock.txid, 'confirmed');
      },
    });

    this.updateBalance(utxos);
    this.stopMonitoringCallback = stopMonitoring;
  }

  cleanup() {
    if (this.stopMonitoringCallback) {
      this.stopMonitoringCallback();
    }
  }

  // Helper methods
  getWalletAddresses() { return ['yX3CJJ42...']; }
  getLastSyncHeight() { return localStorage.getItem('lastSyncHeight') || 1; }
  updateProgressBar(percent) { /* Update UI */ }
  showNotification(msg) { /* Show toast */ }
  updateBalance(utxos?) { /* Update balance display */ }
  updateTransactionStatus(txid, status) { /* Update TX list */ }
}
```

## Example 13: Testing with Mock DAPI

Test your application without hitting real DAPI servers.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';
import { vi } from 'vitest';

function createMockDapiClient() {
  return {
    core: {
      getBestBlockHeight: vi.fn().mockResolvedValue(1000),
      getBlockchainStatus: vi.fn().mockResolvedValue({
        chain: { blocksCount: 1000 },
      }),
      subscribeToTransactionsWithProofs: vi.fn().mockReturnValue({
        on: vi.fn(),
        cancel: vi.fn(),
      }),
      subscribeToBlockHeadersWithChainLocks: vi.fn().mockReturnValue({
        on: vi.fn(),
      }),
    },
    platform: {
      getEpochsInfo: vi.fn().mockResolvedValue({
        getMetadata: () => ({
          getCoreChainLockedHeight: () => 100,
        }),
      }),
    },
  };
}

async function testFinder() {
  const mockDapi = createMockDapiClient();

  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: ['yX3CJJ42...'],
    dapiClient: mockDapi,
    fromHeight: 1,
  });

  // Test factory pattern
  expect(finder.getMode()).toBe(FinderMode.HISTORIC);
  expect(finder.getNetwork()).toBe('testnet');
}
```

## Example 14: Incremental Sync

Sync only new blocks since last sync.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

class WalletSync {
  private lastSyncHeight: number = 0;

  async performSync() {
    // Get current chain height
    const currentHeight = await this.getCurrentBlockHeight();

    const finder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: 'testnet',
      addresses: this.getWalletAddresses(),
      dapiClient: myDapiClient,
      fromHeight: this.lastSyncHeight + 1,  // Start from last sync
      toHeight: currentHeight,              // Up to current tip
    });

    console.log(`Syncing blocks ${this.lastSyncHeight + 1} to ${currentHeight}`);

    const utxos = await finder.findUTXOs();

    // Save sync progress
    this.lastSyncHeight = currentHeight;
    this.saveLastSyncHeight(currentHeight);

    console.log(`Sync complete. Found ${utxos.length} new UTXOs`);
    return utxos;
  }

  async getCurrentBlockHeight() {
    const status = await myDapiClient.core.getBlockchainStatus();
    return status.chain.blocksCount;
  }

  getWalletAddresses() {
    return ['yX3CJJ42...'];
  }

  saveLastSyncHeight(height: number) {
    localStorage.setItem('lastSyncHeight', height.toString());
  }
}
```

## Example 15: Payment Invoice Monitoring

Monitor for payment to a specific invoice address.

```typescript
import { TransactionFinder, FinderMode } from '@dashevo/transaction-finder';

async function monitorInvoice(invoiceAddress: string, expectedAmount: number) {
  const finder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: [invoiceAddress],
    dapiClient: myDapiClient,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopMonitoring();
      reject(new Error('Invoice payment timeout (10 minutes)'));
    }, 600000);

    const stopMonitoring = await finder.monitorAddresses([invoiceAddress], {
      onTransaction: (tx) => {
        console.log('Payment received, waiting for confirmation...');
      },
      onInstantLock: async (lock) => {
        console.log('Payment InstantLocked!');

        // Get transaction details to verify amount
        const txState = finder.getTransaction(lock.txid);
        // In production: parse transaction to verify amount

        clearTimeout(timeout);
        stopMonitoring();
        resolve({
          txid: lock.txid,
          confirmed: true,
          latency: lock.latency,
        });
      },
    });
  });
}

// Usage
try {
  const result = await monitorInvoice('yX3CJJ42...', 100000);
  console.log('Invoice paid:', result.txid);
} catch (error) {
  console.error('Payment failed:', error.message);
}
```

## Common Patterns

### Pattern 1: Wallet Initialization

```typescript
async function initializeWallet() {
  // First: sync history
  const historicFinder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: getWalletAddresses(),
    dapiClient: myDapiClient,
    fromHeight: getLastSyncHeight(),
  });

  const utxos = await historicFinder.findUTXOs();
  updateWalletBalance(utxos);
  saveLastSyncHeight(getCurrentHeight());

  // Then: start monitoring
  const realtimeFinder = new TransactionFinder({
    mode: FinderMode.REALTIME,
    network: 'testnet',
    addresses: getWalletAddresses(),
    dapiClient: myDapiClient,
  });

  await realtimeFinder.monitorAddresses(getWalletAddresses(), {
    onTransaction: handleNewTransaction,
    onInstantLock: handleInstantLock,
  });
}
```

### Pattern 2: One-Shot Payment Check

```typescript
async function checkPaymentReceived(address: string, minAmount: number) {
  const finder = new TransactionFinder({
    mode: FinderMode.HISTORIC,
    network: 'testnet',
    addresses: [address],
    dapiClient: myDapiClient,
    fromHeight: getRecentBlockHeight(),  // Last hour or so
    requiredAmount: minAmount,
  });

  try {
    const utxo = await finder.findLatestSpendableUTXO();
    return {
      received: true,
      amount: utxo.satoshis,
      txid: utxo.txId,
    };
  } catch (error) {
    return {
      received: false,
      error: error.message,
    };
  }
}
```

### Pattern 3: Real-time Balance Updates

```typescript
class WalletBalanceTracker {
  private balance: number = 0;
  private finder: TransactionFinder;

  async start() {
    // Sync initial balance
    await this.syncBalance();

    // Monitor for changes
    this.finder = new TransactionFinder({
      mode: FinderMode.REALTIME,
      network: 'testnet',
      addresses: this.getAddresses(),
      dapiClient: myDapiClient,
    });

    await this.finder.monitorAddresses(this.getAddresses(), {
      onTransaction: async (tx) => {
        console.log('Transaction detected, re-syncing balance...');
        await this.syncBalance();
      },
    });
  }

  async syncBalance() {
    const historicFinder = new TransactionFinder({
      mode: FinderMode.HISTORIC,
      network: 'testnet',
      addresses: this.getAddresses(),
      dapiClient: myDapiClient,
      fromHeight: 1,
    });

    const utxos = await historicFinder.findUTXOs();
    this.balance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);

    console.log('Balance updated:', this.balance, 'satoshis');
    this.emitBalanceUpdate(this.balance);
  }

  getAddresses() { return ['yX3CJJ42...']; }
  emitBalanceUpdate(balance: number) { /* Notify UI */ }
}
```

## Tips

1. **Use Hybrid Mode for Wallets**: It handles everything in one go
2. **Use Historic Mode for One-off Queries**: Finding UTXOs without monitoring
3. **Use Realtime Mode for Payment Processors**: Monitor payments continuously
4. **Enable Auto-Pruning**: For long-running services to prevent memory leaks
5. **Handle Timeouts**: Always implement timeout handling for production
6. **Log Appropriately**: Use `'info'` for production, `'debug'` for development
7. **Test with Testnet First**: Always test thoroughly on testnet before mainnet

## See Also

- [README.md](./README.md) - Package overview
- [API.md](./API.md) - Complete API reference
- [MIGRATION.md](./MIGRATION.md) - Migration from old packages
