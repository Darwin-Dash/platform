/**
 * Global setup for real network E2E tests
 *
 * These tests run against actual testnet and require:
 * - MNEMONIC environment variable with funded wallet
 * - Network connectivity to Dash testnet
 */

export default async function globalSetup(config) {
  // Check for required environment variables
  const mnemonic = process.env.MNEMONIC;

  if (!mnemonic) {
    console.log('\n⚠️  WARNING: MNEMONIC not set');
    console.log('   Real network tests will be skipped.');
    console.log('   Set MNEMONIC to enable testnet E2E tests.\n');
  } else {
    console.log('\n✅ MNEMONIC found - real network tests enabled\n');
  }

  // Log test configuration
  console.log('Real Network E2E Test Configuration:');
  console.log('=====================================');
  console.log(`Network: testnet`);
  console.log(`Mnemonic: ${mnemonic ? 'Configured' : 'Not configured'}`);
  console.log('=====================================\n');
}

/**
 * Check if real network tests should run
 */
export function shouldRunRealNetworkTests() {
  return !!process.env.MNEMONIC;
}
