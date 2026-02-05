#!/usr/bin/env node

/**
 * Setup Test Token Script
 *
 * One-time setup script to deploy a test token contract on testnet.
 * The baseSupply is auto-minted to the contract owner (our test identity).
 *
 * Usage:
 *   node scripts/setup-test-token.mjs
 *
 * Environment variables (loaded from .env):
 *   MNEMONIC - The wallet mnemonic
 *   TEST_IDENTITY_ID - The identity ID to use as contract owner
 *   NETWORK - Network to deploy to (default: testnet)
 *
 * Output:
 *   - Contract ID (base58)
 *   - Token ID (base58)
 *   - Instructions for saving to .env.local
 */

import { config } from 'dotenv';
import DAPIClient from '@dashevo/dapi-client';
import bs58 from 'bs58';

// Load .env file
config();

// Configuration
const MNEMONIC = process.env.MNEMONIC;
const IDENTITY_ID = process.env.TEST_IDENTITY_ID || 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';
const NETWORK = process.env.NETWORK || 'testnet';
const IDENTITY_INDEX = parseInt(process.env.IDENTITY_INDEX || '0', 10);

// Token configuration
const TOKEN_CONFIG = {
  name: 'EvoTestToken',
  pluralName: 'EvoTestTokens',
  decimals: 8,
  baseSupply: 100000000000n, // 1000 tokens with 8 decimals (1000 * 10^8)
};

async function main() {
  console.log('=== Test Token Setup Script ===\n');

  // Validate environment
  if (!MNEMONIC) {
    console.error('ERROR: MNEMONIC environment variable is required');
    console.error('Please set it in .env file');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Network: ${NETWORK}`);
  console.log(`  Identity ID: ${IDENTITY_ID}`);
  console.log(`  Identity Index: ${IDENTITY_INDEX}`);
  console.log(`  Token Name: ${TOKEN_CONFIG.name}`);
  console.log(`  Base Supply: ${Number(TOKEN_CONFIG.baseSupply) / Math.pow(10, TOKEN_CONFIG.decimals)} tokens`);
  console.log('');

  // Step 1: Initialize WASM SDK
  console.log('Step 1: Initializing WASM SDK...');
  const wasmSdk = await import('@dashevo/wasm-sdk');
  const initWasm = wasmSdk.default;
  await initWasm();

  const {
    WasmSdk,
    WasmSdkBuilder,
    DataContract,
    IdentitySigner,
    PrivateKey,
    IdentityPublicKey,
    Identity,
    Identifier,
  } = wasmSdk;

  console.log('  WASM SDK initialized\n');

  // Step 2: Prefetch quorums and build SDK
  console.log('Step 2: Building SDK client...');
  await WasmSdk.prefetchTrustedQuorumsTestnet();
  const builder = WasmSdkBuilder.testnetTrusted();
  const client = await builder.build();
  console.log('  SDK client built\n');

  // Step 3: Fetch identity to verify it exists and get key info
  console.log('Step 3: Fetching identity from network...');

  // Use DAPI client to fetch identity
  const dapiClient = new DAPIClient({ network: NETWORK, timeout: 30000, retries: 3 });
  const identityBytes = bs58.decode(IDENTITY_ID);
  const identityResponse = await dapiClient.platform.getIdentity(identityBytes, { prove: false });

  if (!identityResponse.identity || identityResponse.identity.length === 0) {
    console.error('ERROR: Identity not found on network');
    process.exit(1);
  }

  const identity = Identity.fromBytes(identityResponse.identity);
  const identityJson = identity.toJSON();

  console.log(`  Identity found: ${identityJson.id}`);
  console.log(`  Balance: ${identityJson.balance} credits (~${(Number(identityJson.balance) / 100000000).toFixed(4)} DASH)`);
  console.log(`  Revision: ${identityJson.revision}`);
  console.log(`  Public Keys: ${identityJson.publicKeys?.length || 0}`);
  console.log('');

  // Step 4: Derive signing key from mnemonic
  console.log('Step 4: Deriving signing key...');

  // Contract operations require CRITICAL security level (key index 1)
  // HD path: m/9'/coinType'/5'/0'/0'/identityIndex'/keyIndex'
  const coinType = NETWORK === 'mainnet' ? 5 : 1;
  const keyIndex = 1; // CRITICAL level key
  const path = `m/9'/${coinType}'/5'/0'/0'/${IDENTITY_INDEX}'/${keyIndex}'`;

  console.log(`  Derivation path: ${path}`);

  const derivedKeyInfo = WasmSdk.deriveKeyFromSeedWithPath({
    mnemonic: MNEMONIC,
    passphrase: null,
    path,
    network: NETWORK,
  });

  // WasmSdk returns object with getter methods
  const derivedPublicKey = derivedKeyInfo.publicKey;
  const derivedPrivateKeyHex = derivedKeyInfo.privateKeyHex;

  console.log(`  Derived public key: ${derivedPublicKey}`);

  // Verify derived key matches on-chain key
  const onChainKeys = identityJson.publicKeys || [];
  const criticalKey = onChainKeys.find(k => k.id === keyIndex);

  if (!criticalKey) {
    console.error(`ERROR: No key with ID ${keyIndex} found on identity`);
    process.exit(1);
  }

  // Compare keys (handle base64 encoding)
  const onChainKeyHex = criticalKey.data;
  let keyMatches = false;

  if (onChainKeyHex === derivedPublicKey) {
    keyMatches = true;
  } else {
    // Try base64 to hex conversion
    try {
      const decoded = Buffer.from(onChainKeyHex, 'base64').toString('hex');
      if (decoded === derivedPublicKey) {
        keyMatches = true;
      }
    } catch {
      // Ignore decode errors
    }
  }

  if (!keyMatches) {
    console.error('ERROR: Derived key does not match on-chain key');
    console.error(`  On-chain: ${onChainKeyHex}`);
    console.error(`  Derived:  ${derivedPublicKey}`);
    console.error('\nThis mnemonic may not match the identity, or the identity index may be wrong.');
    process.exit(1);
  }

  console.log('  Key verified - matches on-chain key');
  console.log('');

  // Step 5: Create signer and identity key
  console.log('Step 5: Creating signer...');

  let signer, identityKey;
  try {
    signer = new IdentitySigner();
    console.log('  IdentitySigner created');
  } catch (e) {
    console.error('ERROR creating IdentitySigner:', e);
    process.exit(1);
  }

  try {
    const privateKey = PrivateKey.fromHex(derivedPrivateKeyHex, NETWORK);
    console.log('  PrivateKey created from hex');
    signer.addKey(privateKey);
    console.log('  Key added to signer');
  } catch (e) {
    console.error('ERROR adding private key:', e);
    process.exit(1);
  }

  try {
    // Security levels: MASTER = 0, CRITICAL = 1, HIGH = 2, MEDIUM = 3
    // JSON uses "type" not "keyType" for the key type field
    const keyType = criticalKey.type ?? criticalKey.keyType ?? 0;
    console.log(`  Creating IdentityPublicKey with id=${criticalKey.id}, purpose=${criticalKey.purpose}, securityLevel=${criticalKey.securityLevel}, type=${keyType}`);
    identityKey = new IdentityPublicKey(
      criticalKey.id,
      criticalKey.purpose, // AUTHENTICATION = 0
      criticalKey.securityLevel, // CRITICAL = 1
      keyType, // ECDSA_SECP256K1 = 0
      false, // readOnly
      derivedPublicKey,
      undefined, // disabled_at
      undefined, // contract_bounds
    );
    console.log('  IdentityPublicKey created');
  } catch (e) {
    console.error('ERROR creating IdentityPublicKey:', e);
    process.exit(1);
  }

  console.log('  Signer setup complete\n');

  // Step 6: Create token contract schema
  console.log('Step 6: Creating token contract...');

  console.log('  Token configuration:');
  console.log(`    Name: ${TOKEN_CONFIG.name}`);
  console.log(`    Decimals: ${TOKEN_CONFIG.decimals}`);
  console.log(`    Base Supply: ${TOKEN_CONFIG.baseSupply}`);
  console.log('');

  // Create the token configuration using WASM objects
  // This is required because the WASM SDK expects TokenConfiguration WASM objects, not plain JS objects
  let dataContract;
  try {
    console.log('  Creating TokenConfiguration WASM objects...');

    // 1. Create localization (should_capitalize, singular_form, plural_form)
    const localization = new wasmSdk.TokenConfigurationLocalization(
      false,
      TOKEN_CONFIG.name,
      TOKEN_CONFIG.pluralName
    );
    console.log('    Localization created');

    // 2. Create convention (localizations object, decimals)
    const convention = new wasmSdk.TokenConfigurationConvention(
      { en: localization },
      TOKEN_CONFIG.decimals
    );
    console.log('    Convention created, decimals:', convention.decimals);

    // 3. Create default change control rules with ContractOwner
    const noOne = wasmSdk.AuthorizedActionTakers.NoOne();
    const contractOwner = wasmSdk.AuthorizedActionTakers.ContractOwner();

    const defaultChangeRules = new wasmSdk.ChangeControlRules(
      noOne, // authorized_to_make_change
      noOne, // admin_action_takers
      false, // changing_authorized_action_takers_to_no_one_allowed
      false, // changing_admin_action_takers_to_no_one_allowed
      false  // self_changing_admin_action_takers_allowed
    );
    console.log('    Default ChangeControlRules created');

    // Owner can mint/burn
    const ownerChangeRules = new wasmSdk.ChangeControlRules(
      contractOwner, // authorized_to_make_change
      noOne, // admin_action_takers
      false, // changing_authorized_action_takers_to_no_one_allowed
      false, // changing_admin_action_takers_to_no_one_allowed
      false  // self_changing_admin_action_takers_allowed
    );
    console.log('    Owner ChangeControlRules created');

    // 4. Create keeps history rules
    const keepsHistory = new wasmSdk.TokenKeepsHistoryRules(
      true, // keeps_transfer_history
      true, // keeps_freezing_history
      true, // keeps_minting_history
      true, // keeps_burning_history
      true, // keeps_direct_pricing_history
      true  // keeps_direct_purchase_history
    );
    console.log('    TokenKeepsHistoryRules created');

    // 5. Create distribution rules
    const distributionRules = new wasmSdk.TokenDistributionRules(
      undefined, // perpetual_distribution
      defaultChangeRules, // perpetual_distribution_rules
      undefined, // pre_programmed_distribution
      undefined, // new_tokens_destination_identity
      defaultChangeRules, // new_tokens_destination_identity_rules
      true, // minting_allow_choosing_destination
      defaultChangeRules, // minting_allow_choosing_destination_rules
      defaultChangeRules  // change_direct_purchase_pricing_rules
    );
    console.log('    TokenDistributionRules created');

    // 6. Create marketplace rules
    const marketplaceRules = new wasmSdk.TokenMarketplaceRules(
      wasmSdk.TokenTradeMode.NotTradeable(), // trade_mode
      defaultChangeRules // trade_mode_change_rules
    );
    console.log('    TokenMarketplaceRules created');

    // 7. Create the full token configuration
    const tokenConfig = new wasmSdk.TokenConfiguration(
      convention, // conventions
      defaultChangeRules, // conventions_change_rules
      TOKEN_CONFIG.baseSupply, // base_supply (bigint)
      undefined, // max_supply (none)
      keepsHistory, // keeps_history
      false, // start_as_paused
      true, // allow_transfer_to_frozen_balance
      defaultChangeRules, // max_supply_change_rules
      distributionRules, // distribution_rules
      marketplaceRules, // marketplace_rules
      ownerChangeRules, // manual_minting_rules
      ownerChangeRules, // manual_burning_rules
      defaultChangeRules, // freeze_rules
      defaultChangeRules, // unfreeze_rules
      defaultChangeRules, // destroy_frozen_funds_rules
      defaultChangeRules, // emergency_action_rules
      undefined, // main_control_group
      noOne, // main_control_group_can_be_modified
      undefined // description
    );
    console.log('    TokenConfiguration created, baseSupply:', tokenConfig.baseSupply);

    // 8. Create the tokens configuration map
    const tokensConfig = { 0: tokenConfig };
    console.log('  Token configuration complete');

    // Create data contract
    // Parameters: ownerId, nonce, documentSchemas, definitions, tokens, fullValidation, platformVersion
    console.log('  Creating DataContract...');
    console.log(`    Owner: ${IDENTITY_ID}`);

    // Note: The WASM SDK validates contracts before adding tokens, so we need a dummy document
    // to pass validation. The token will still be the main feature of this contract.
    const dummyDocumentSchema = {
      tokenMetadata: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            maxLength: 100,
            position: 0,
          },
        },
        additionalProperties: false,
      },
    };

    dataContract = new DataContract(
      IDENTITY_ID, // owner ID
      0n, // placeholder nonce (SDK will assign actual ID during publish)
      dummyDocumentSchema, // document schemas (needed to pass validation)
      undefined, // definitions (optional)
      tokensConfig, // tokens configuration
      true, // full validation
      undefined, // platform version (use default)
    );
    console.log('  DataContract created successfully');
  } catch (e) {
    console.error('ERROR creating DataContract:', e);
    console.error('  Message:', e.message);
    process.exit(1);
  }

  console.log('  Data contract created\n');

  // Step 7: Publish contract
  console.log('Step 7: Publishing contract to network...');
  console.log('  This may take a moment...');

  try {
    const publishedContract = await client.contractPublish({
      dataContract,
      identityKey,
      signer,
    });

    const contractId = publishedContract.id.toString();
    console.log(`  Contract published successfully!`);
    console.log(`  Contract ID: ${contractId}`);
    console.log('');

    // Step 8: Calculate token ID
    console.log('Step 8: Calculating token ID...');
    const tokenId = WasmSdk.calculateTokenIdFromContract(contractId, 0);
    console.log(`  Token ID: ${tokenId}`);
    console.log('');

    // Step 9: Output results
    console.log('=== SETUP COMPLETE ===\n');
    console.log('Token contract deployed successfully!\n');
    console.log('Contract Details:');
    console.log(`  Contract ID: ${contractId}`);
    console.log(`  Token ID: ${tokenId}`);
    console.log(`  Token Name: ${TOKEN_CONFIG.name}`);
    console.log(`  Initial Supply: ${Number(TOKEN_CONFIG.baseSupply) / Math.pow(10, TOKEN_CONFIG.decimals)} tokens`);
    console.log(`  Owner: ${IDENTITY_ID}`);
    console.log('');
    console.log('To save these IDs, add the following to your .env.local file:');
    console.log('');
    console.log(`TEST_TOKEN_CONTRACT_ID=${contractId}`);
    console.log(`TEST_TOKEN_ID=${tokenId}`);
    console.log('');
    console.log('Verification:');
    console.log('  1. Run the web demo: yarn demo:web:dev');
    console.log('  2. Select the test identity');
    console.log(`  3. Check Tokens tab - should show "${TOKEN_CONFIG.name}" with balance`);

    // Cleanup
    client.free();

  } catch (error) {
    console.error('ERROR: Contract publishing failed');
    console.error(`  Message: ${error.message || error}`);

    if (error.message?.includes('insufficient')) {
      console.error('\nThe identity may not have enough credits.');
      console.error('Please top up the identity and try again.');
    }

    if (error.message?.includes('nonce')) {
      console.error('\nThere may be a nonce conflict.');
      console.error('Wait a few seconds and try again.');
    }

    client.free();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
