/**
 * Debug script to compare WASM SDK key derivation with on-chain identity keys
 *
 * This script:
 * 1. Derives all 4 keys using WASM SDK
 * 2. Fetches the identity from testnet
 * 3. Compares the derived public keys with on-chain keys
 *
 * Usage: node scripts/debug-key-derivation.mjs
 */

import '@dashevo/wasm-sdk';

// Mnemonic (use your own funded wallet for real tests)
const MNEMONIC = process.env.MNEMONIC || 'lamp truck drip furnace now swing income victory leisure popular jeans vehicle';
const IDENTITY_ID = process.env.IDENTITY_ID || '';
const IDENTITY_INDEX = parseInt(process.env.IDENTITY_INDEX || '0', 10);
const NETWORK = process.env.NETWORK || 'testnet';

async function main() {
  console.log('=== WASM SDK Key Derivation Debug ===\n');

  // Initialize WASM SDK
  const wasmSdk = await import('@dashevo/wasm-sdk');
  const initWasm = wasmSdk.default;
  await initWasm();
  const { WasmSdk, IdentityWasm } = wasmSdk;

  // Derive keys using WASM SDK
  console.log('Deriving keys with WASM SDK...');
  console.log(`  Mnemonic: ${MNEMONIC.substring(0, 20)}...`);
  console.log(`  Identity Index: ${IDENTITY_INDEX}`);
  console.log(`  Network: ${NETWORK}`);
  console.log('');

  const coinType = NETWORK === 'mainnet' ? 5 : 1;
  const derivedKeys = [];

  for (let keyIndex = 0; keyIndex < 4; keyIndex++) {
    const path = `m/9'/${coinType}'/5'/0'/0'/${IDENTITY_INDEX}'/${keyIndex}'`;
    console.log(`  Deriving key ${keyIndex}: ${path}`);

    try {
      const childKey = await WasmSdk.deriveKeyFromSeedWithPath({
        mnemonic: MNEMONIC,
        passphrase: null,
        path,
        network: NETWORK
      });

      derivedKeys.push({
        id: keyIndex,
        path,
        publicKey: childKey.public_key,
        privateKeyWif: childKey.private_key_wif,
      });

      console.log(`    Public key: ${childKey.public_key}`);
    } catch (error) {
      console.error(`    Error: ${error.message}`);
    }
  }

  if (!IDENTITY_ID) {
    console.log('\n⚠️  No IDENTITY_ID provided. Set IDENTITY_ID env var to compare with on-chain keys.');
    console.log('   Example: IDENTITY_ID=DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq node scripts/debug-key-derivation.mjs');
    return;
  }

  console.log('\n=== Fetching On-Chain Identity ===\n');

  // Use DAPI client directly
  const DAPIClient = (await import('@dashevo/dapi-client')).default;
  const bs58 = (await import('bs58')).default;

  try {
    // Create DAPI client
    const client = new DAPIClient({
      network: NETWORK,
      timeout: 30000,
      retries: 3,
    });
    console.log('Connected to testnet via DAPI');

    // Decode identity ID to bytes
    const identityBytes = bs58.decode(IDENTITY_ID);

    // Fetch identity
    const response = await client.platform.getIdentity(identityBytes, { prove: false });

    if (!response.identity || response.identity.length === 0) {
      throw new Error('Identity not found');
    }

    const identity = IdentityWasm.fromBuffer(response.identity);
    const identityJson = identity.toJSON();

    console.log(`\nIdentity: ${identityJson.id}`);
    console.log(`Balance: ${identityJson.balance}`);
    console.log(`Revision: ${identityJson.revision}`);
    console.log(`Public Keys:`);

    // Compare keys
    console.log('\n=== Key Comparison ===\n');

    const onChainKeys = identityJson.publicKeys || [];

    for (const onChainKey of onChainKeys) {
      const keyId = onChainKey.id;
      const keyData = onChainKey.data;
      const keyType = onChainKey.keyType;
      const purpose = onChainKey.purpose;
      const securityLevel = onChainKey.securityLevel;

      console.log(`Key #${keyId}:`);
      console.log(`  Purpose: ${purpose}`);
      console.log(`  Security Level: ${securityLevel}`);
      console.log(`  Key Type: ${keyType}`);
      console.log(`  On-chain data: ${keyData}`);

      const derivedKey = derivedKeys.find(k => k.id === keyId);
      if (derivedKey) {
        console.log(`  Derived pubkey: ${derivedKey.publicKey}`);

        // Compare - handle both hex and base64 encoding
        const onChainHex = keyData.startsWith('0x') ? keyData.slice(2) : keyData;
        const derivedHex = derivedKey.publicKey;

        // Try direct hex comparison
        if (onChainHex.toLowerCase() === derivedHex.toLowerCase()) {
          console.log(`  ✅ MATCH (hex)`);
        } else {
          // Try base64 to hex conversion
          try {
            const decoded = Buffer.from(onChainHex, 'base64').toString('hex');
            if (decoded.toLowerCase() === derivedHex.toLowerCase()) {
              console.log(`  ✅ MATCH (base64 decoded)`);
            } else {
              console.log(`  ❌ MISMATCH`);
              console.log(`    On-chain (base64 decoded): ${decoded}`);
            }
          } catch {
            console.log(`  ❌ MISMATCH`);
          }
        }
      } else {
        console.log(`  ⚠️ No derived key for comparison`);
      }
      console.log('');
    }

    // No cleanup needed for DAPI client
  } catch (error) {
    console.error('Error fetching identity:', error.message);
  }
}

main().catch(console.error);
