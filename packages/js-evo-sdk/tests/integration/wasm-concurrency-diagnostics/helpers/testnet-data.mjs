/**
 * Testnet Data Helper for Queue + DAPI POC Testing
 *
 * Provides test data utilities for POC scenarios:
 * - Known testnet identities for testing
 * - Test mnemonics with existing identities
 * - Helper functions to load and query testnet data
 */

/**
 * Known testnet identities for reference
 * (These are documented identities for testing purposes)
 */
export const TESTNET_IDENTITIES = {
  // Common test identity used in examples
  example1: {
    identityId: '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk',
    description: 'Example test identity (testnet)',
    createdAt: 'documented'
  }
};

/**
 * Test mnemonics for POC testing
 *
 * Note: These are test mnemonics. Use real testnet mnemonics
 * with actual funded addresses for full integration tests.
 */
export const TEST_MNEMONICS = {
  // Placeholder - should be replaced with actual testnet mnemonics
  test_mnemonic_1: {
    mnemonic: null, // Set to actual test mnemonic
    description: 'Test mnemonic with known identities',
    expectedIdentities: [],
    remark: 'Replace with actual testnet mnemonic for testing'
  }
};

/**
 * Helper: Get a test mnemonic for POC testing
 *
 * For real testing, this should load actual testnet mnemonics.
 * For now, returns placeholder that can be configured.
 *
 * @param name - Name of test mnemonic to retrieve
 * @returns {string|null} Mnemonic string or null if not configured
 */
export function getTestMnemonic(name = 'test_mnemonic_1') {
  const testMnemonics = TEST_MNEMONICS[name];
  if (!testMnemonics) {
    throw new Error(`Unknown test mnemonic: ${name}`);
  }

  if (!testMnemonics.mnemonic) {
    throw new Error(
      `Test mnemonic "${name}" not configured. ` +
      'Please set a valid testnet mnemonic in TEST_MNEMONICS before running tests.'
    );
  }

  return testMnemonics.mnemonic;
}

/**
 * Helper: Get a known testnet identity for reference
 *
 * @param name - Name of test identity to retrieve
 * @returns {object} Identity data
 */
export function getTestIdentity(name = 'example1') {
  const identity = TESTNET_IDENTITIES[name];
  if (!identity) {
    throw new Error(`Unknown test identity: ${name}`);
  }
  return identity;
}

/**
 * Helper: Derive public key hashes from mnemonic
 *
 * Used for testing DAPI identity retrieval without full identity creation.
 *
 * @param mnemonic - BIP39 mnemonic string
 * @param indexRange - Range of key indices to derive (default: 0-4)
 * @returns {Promise<Array>} Array of {publicKeyHash, keyIndex} objects
 */
export async function derivePublicKeyHashesFromMnemonic(
  mnemonic,
  indexRange = { start: 0, end: 4 }
) {
  try {
    // Lazy import dashcore-lib
    const dashcoreLib = await import('@dashevo/dashcore-lib');
    const Mnemonic = dashcoreLib.Mnemonic;

    // Create HD wallet from mnemonic
    const mnemonicObj = new Mnemonic(mnemonic);
    const wallet = mnemonicObj.toHDPrivateKey();

    const hashes = [];

    // Derive keys at standard Dash identity paths
    for (let i = indexRange.start; i <= indexRange.end; i++) {
      try {
        const path = `m/44'/5'/0'/0/${i}`;
        const key = wallet.derive(path);
        const publicKey = key.publicKey;

        // Calculate hash160 (SHA256 then RIPEMD160)
        const crypto = require('crypto');
        const publicKeyBuffer = publicKey.toBuffer ? publicKey.toBuffer() : Buffer.from(publicKey);
        const hash160 = crypto
          .createHash('ripemd160')
          .update(crypto.createHash('sha256').update(publicKeyBuffer).digest())
          .digest('hex');

        hashes.push({
          publicKeyHash: hash160,
          keyIndex: i,
          path: path
        });
      } catch (keyError) {
        // Skip problematic keys
        continue;
      }
    }

    return hashes;
  } catch (error) {
    throw new Error(
      `Failed to derive public key hashes from mnemonic: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Helper: Check if a mnemonic has been configured for testing
 *
 * @returns {boolean} True if at least one valid mnemonic is configured
 */
export function hasConfiguredMnemonics() {
  return Object.values(TEST_MNEMONICS).some(m => m.mnemonic !== null);
}

/**
 * Helper: Get all configured test mnemonics
 *
 * @returns {Array} Array of configured mnemonics
 */
export function getConfiguredMnemonics() {
  return Object.entries(TEST_MNEMONICS)
    .filter(([_, m]) => m.mnemonic !== null)
    .map(([name, m]) => ({ name, ...m }));
}

/**
 * Helper: Get test parameters for POC scenarios
 *
 * Provides pre-configured test parameters for each scenario type
 *
 * @returns {object} Test parameters
 */
export function getPOCTestParameters() {
  return {
    // Queue scenario parameters
    queueCreateAmount: 200000, // duffs to fund identity
    queueTopUpAmount: 50000,   // duffs to top up with

    // DAPI scenario parameters
    dapiQueryTimeout: 10000,   // ms to wait for DAPI query
    dapiQueryRetries: 2,       // times to retry failed query

    // Timing expectations
    timingExpectations: {
      queueCreateSequential: {
        min: 300,  // ms minimum for 1 operation
        max: 1000, // ms maximum for 1 operation
        perOp: 300 // ms per operation when serialized
      },
      dapiReadConcurrent: {
        min: 100,  // ms minimum for concurrent reads
        max: 500,  // ms maximum for concurrent reads
        perOp: 100 // ms per operation (parallel, not additive)
      }
    }
  };
}

/**
 * Helper: Validate test scenario configuration
 *
 * Checks that scenario has required test data configured
 *
 * @param scenario - POC scenario object
 * @returns {object} {valid: boolean, errors: string[]}
 */
export function validateScenarioConfiguration(scenario) {
  const errors = [];

  // Queue scenarios need a test mnemonic
  if (scenario.useQueue && !hasConfiguredMnemonics()) {
    errors.push('Queue scenarios require a configured test mnemonic');
  }

  // DAPI scenarios need a test mnemonic
  if (scenario.useDapi && !hasConfiguredMnemonics()) {
    errors.push('DAPI scenarios require a configured test mnemonic');
  }

  // Mixed scenarios need both
  if (scenario.useQueue && scenario.useDapi && !hasConfiguredMnemonics()) {
    errors.push('Mixed scenarios require a configured test mnemonic');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Helper: Get scenario execution context
 *
 * Prepares everything needed to execute a POC scenario
 *
 * @param scenario - POC scenario object
 * @returns {Promise<object>} Execution context with mnemonic and parameters
 */
export async function getScenarioExecutionContext(scenario) {
  const validation = validateScenarioConfiguration(scenario);
  if (!validation.valid) {
    throw new Error(`Invalid scenario configuration: ${validation.errors.join(', ')}`);
  }

  const mnemonics = getConfiguredMnemonics();
  if (mnemonics.length === 0) {
    throw new Error('No test mnemonics configured for scenario execution');
  }

  return {
    mnemonic: mnemonics[0].mnemonic,
    publicKeyHashes: await derivePublicKeyHashesFromMnemonic(mnemonics[0].mnemonic),
    testParameters: getPOCTestParameters(),
    scenario
  };
}

export default {
  TESTNET_IDENTITIES,
  TEST_MNEMONICS,
  getTestMnemonic,
  getTestIdentity,
  derivePublicKeyHashesFromMnemonic,
  hasConfiguredMnemonics,
  getConfiguredMnemonics,
  getPOCTestParameters,
  validateScenarioConfiguration,
  getScenarioExecutionContext
};
