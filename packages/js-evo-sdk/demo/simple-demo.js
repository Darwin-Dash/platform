/**
 * Standalone Demo: WASM SDK Worker Pattern
 *
 * This demonstrates the SIMPLEST working pattern for using the WASM SDK.
 *
 * ⚠️  CRITICAL REQUIREMENT: Workers are NOT optional
 *
 * The WASM SDK creates Rust mutex locks that prevent concurrent access.
 * Attempting to use the SDK in the main process (especially concurrently)
 * will fail with "already locked to a reader" errors.
 *
 * EVERY operation MUST run in an isolated worker process.
 *
 * Usage:
 *   node demo/simple-demo.js
 *
 * Requirements:
 *   - Build the project first: npm run build
 *   - Testnet must be accessible
 *   - Node.js 18+ required for ES modules
 */

import { runWasmOperation } from '../dist/identities/utils/wasm-worker-runner.js';

// Known testnet identity for demonstration
// (This is a real identity on Dash testnet that you can query)
const TEST_IDENTITY = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk';

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('WASM SDK Demo: Fetch Identity Using Worker Pattern');
  console.log('='.repeat(60) + '\n');

  console.log('📋 What this demo does:');
  console.log('  1. Spawns an isolated worker process');
  console.log('  2. Initializes WASM SDK in that process');
  console.log('  3. Fetches identity from testnet');
  console.log('  4. Returns result to main process');
  console.log('  5. Worker exits, releasing WASM resources\n');

  try {
    console.log(`🔄 Fetching identity: ${TEST_IDENTITY}\n`);

    // This is the ONLY correct way to use WASM SDK
    // runWasmOperation spawns a worker, the worker calls the operation,
    // then the worker exits. This avoids mutex conflicts.
    const result = await runWasmOperation('identity-fetch', {
      identityId: TEST_IDENTITY,
    }, {
      timeout: 60000,
      network: 'testnet',
    });

    console.log('✅ Success! Identity fetched:\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error fetching identity:');
    console.error(`   ${error.message}\n`);
    console.log('Troubleshooting:');
    console.log('  - Ensure you ran: npm run build');
    console.log('  - Check testnet connectivity: ping testnet-dapi-seed-1.dashevo.io');
    console.log('  - Verify identity exists: check TEST_IDENTITY constant');
    console.log('  - Check for dashcore-lib duplicates: npm list @dashevo/dashcore-lib\n');
    process.exit(1);
  }
}

main();
