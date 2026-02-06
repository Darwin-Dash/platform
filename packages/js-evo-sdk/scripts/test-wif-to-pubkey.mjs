/**
 * Test script to verify WIF -> public key derivation
 * This simulates what the Rust code does in identityCreditTransfer
 *
 * Usage: node scripts/test-wif-to-pubkey.mjs
 */

import DashKeys from 'dashkeys';

// Test data
const WIF = process.env.TEST_WIF || 'cRAgzrmaxATw1vZ4DtuGxwDp5smtcHUJ5ZEhLQjCLgWwXN9p1JYK';
const EXPECTED_PUBKEY_HEX = process.env.EXPECTED_PUBKEY || '02196977b3a66b2f4ffc53a4281f3f97f0b8858f7cdb949f67556214786da6f14b';

console.log('=== WIF to Public Key Test ===\n');

async function main() {
  try {
    // Use DashKeys to decode WIF and get public key
    const privKeyHex = await DashKeys.wifToPrivKey(WIF, { version: 'testnet' });
    console.log(`Private key (hex): ${privKeyHex}`);
    console.log(`Private key length: ${privKeyHex.length / 2} bytes`);

    // Derive public key from private key
    const pubKeyHex = await DashKeys.privKeyToPublicKey(privKeyHex);
    console.log(`\nDerived public key: ${pubKeyHex}`);
    console.log(`Expected public key: ${EXPECTED_PUBKEY_HEX}`);
    console.log(`Public key length: ${pubKeyHex.length / 2} bytes`);

    if (pubKeyHex.toLowerCase() === EXPECTED_PUBKEY_HEX.toLowerCase()) {
      console.log('\n✅ MATCH! The WIF produces the correct public key.');
      console.log('This confirms the Rust code SHOULD derive the same public key.');
      console.log('\nThe issue must be elsewhere - possibly in how the identity is fetched');
      console.log('or how the key data is compared in the Rust code.');
    } else {
      console.log('\n❌ MISMATCH! The derived public key does not match.');
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();
