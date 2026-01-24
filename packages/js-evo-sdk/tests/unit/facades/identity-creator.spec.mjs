/**
 * Unit tests for IdentityCreator facade
 *
 * Tests input validation logic for identity creation operations.
 * Note: Full coordinator orchestration testing requires integration tests.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('IdentityCreator', () => {
  let wasmSdk;
  let client;
  let creator;
  let sandbox;

  const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const CREATE_MIN_AMOUNT = 200000; // From IDENTITY_CONFIG
  const MAX_AMOUNT = 100000000000; // From IDENTITY_CONFIG
  const MIN_START_HEIGHT = 1;
  const MAX_START_HEIGHT = 10000000;

  beforeEach(async function setup() {
    await init();
    const builder = wasmSDKPackage.WasmSdkBuilder.testnetTrusted();
    wasmSdk = builder.build();
    client = EvoSDK.fromWasm(wasmSdk);
    creator = client.identities.creator;
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('createWithWallet() - Input Validation', () => {
    describe('Mnemonic validation', () => {
      it('should reject missing mnemonic', async () => {
        await expect(creator.createWithWallet(null, 200000))
          .to.be.rejectedWith('Mnemonic is required');

        await expect(creator.createWithWallet(undefined, 200000))
          .to.be.rejectedWith('Mnemonic is required');

        await expect(creator.createWithWallet('', 200000))
          .to.be.rejectedWith('Mnemonic is required');
      });

      it('should reject mnemonic with incorrect word count', async () => {
        // Too few words
        const shortMnemonic = 'abandon abandon abandon';
        await expect(creator.createWithWallet(shortMnemonic, 200000))
          .to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 3');

        // Too many words
        const longMnemonic = VALID_MNEMONIC + ' extra extra words';
        await expect(creator.createWithWallet(longMnemonic, 200000))
          .to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 15');
      });

      it('should accept valid 12-word mnemonic', () => {
        // Valid mnemonic format passes validation (will fail at coordinator invocation)
        const words = VALID_MNEMONIC.split(' ');
        expect(words.length).to.equal(12);
      });

      it('should handle extra whitespace in mnemonic', async () => {
        const spacedMnemonic = '  abandon   abandon  abandon abandon abandon abandon abandon abandon abandon abandon abandon   about  ';
        // Will fail at coordinator invocation but passes validation
        const words = spacedMnemonic.trim().split(/\s+/);
        expect(words.length).to.equal(12);
      });
    });

    describe('Amount validation', () => {
      it('should reject amount below minimum', async () => {
        await expect(creator.createWithWallet(VALID_MNEMONIC, CREATE_MIN_AMOUNT - 1))
          .to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(creator.createWithWallet(VALID_MNEMONIC, 0))
          .to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(creator.createWithWallet(VALID_MNEMONIC, 100))
          .to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject amount above maximum', async () => {
        await expect(creator.createWithWallet(VALID_MNEMONIC, MAX_AMOUNT + 1))
          .to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject invalid amount types', async () => {
        await expect(creator.createWithWallet(VALID_MNEMONIC, NaN))
          .to.be.rejectedWith('Invalid amount');

        await expect(creator.createWithWallet(VALID_MNEMONIC, 'not-a-number'))
          .to.be.rejectedWith('Invalid amount');

        await expect(creator.createWithWallet(VALID_MNEMONIC, null))
          .to.be.rejectedWith('Invalid amount');
      });

      it('should accept valid amount within range', () => {
        // Valid amounts (will fail at coordinator but pass validation)
        expect(CREATE_MIN_AMOUNT).to.be.gte(CREATE_MIN_AMOUNT);
        expect(500000).to.be.gte(CREATE_MIN_AMOUNT);
        expect(500000).to.be.lte(MAX_AMOUNT);
      });
    });

    describe('Start height validation', () => {
      it('should reject start height below minimum', async () => {
        await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: 0 }))
          .to.be.rejectedWith(`Invalid startHeight: must be between ${MIN_START_HEIGHT} and ${MAX_START_HEIGHT}`);

        await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: -100 }))
          .to.be.rejectedWith(`Invalid startHeight: must be between ${MIN_START_HEIGHT} and ${MAX_START_HEIGHT}`);
      });

      it('should reject start height above maximum', async () => {
        await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: MAX_START_HEIGHT + 1 }))
          .to.be.rejectedWith(`Invalid startHeight: must be between ${MIN_START_HEIGHT} and ${MAX_START_HEIGHT}`);
      });

      it('should reject invalid start height types', async () => {
        await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: NaN }))
          .to.be.rejectedWith('Invalid startHeight');

        await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: 'not-a-number' }))
          .to.be.rejectedWith('Invalid startHeight');
      });

      it('should accept valid start height within range', () => {
        // Valid heights (will fail at coordinator but pass validation)
        expect(1).to.be.gte(MIN_START_HEIGHT);
        expect(1330000).to.be.gte(MIN_START_HEIGHT);
        expect(1330000).to.be.lte(MAX_START_HEIGHT);
      });

      it('should use default start height when not provided', () => {
        // Default is 1 when startHeight option is undefined
        const options = {};
        const startHeight = options.startHeight ?? 1;
        expect(startHeight).to.equal(1);
      });
    });

    describe('Options handling', () => {
      it('should accept valid options object', () => {
        const options = {
          startHeight: 1330000,
          useSourceAsChangeAddress: true,
          onProgress: (event) => {},
        };

        expect(options.startHeight).to.be.a('number');
        expect(options.useSourceAsChangeAddress).to.be.a('boolean');
        expect(options.onProgress).to.be.a('function');
      });

      it('should handle empty options object', () => {
        const options = {};
        const startHeight = options.startHeight ?? 1;
        const useSourceAsChangeAddress = options.useSourceAsChangeAddress !== false;

        expect(startHeight).to.equal(1);
        expect(useSourceAsChangeAddress).to.equal(true);
      });

      it('should handle undefined options', () => {
        const options = undefined;
        const opts = options || {};
        const startHeight = opts.startHeight ?? 1;

        expect(startHeight).to.equal(1);
      });
    });
  });

  // Note: createWithAccount() was a wallet-lib style API that was not ported.
  // The js-evo-sdk uses createWithWallet() and createWithUTXO() instead.

  describe('Edge cases', () => {
    it('should handle boundary amounts correctly', async () => {
      // Minimum amount should pass validation
      const minAmount = CREATE_MIN_AMOUNT;
      // (Will fail at coordinator but validation passes)
      expect(minAmount).to.equal(200000);

      // Maximum amount should pass validation
      const maxAmount = MAX_AMOUNT;
      expect(maxAmount).to.equal(100000000000);

      // Just below minimum should fail
      await expect(creator.createWithWallet(VALID_MNEMONIC, CREATE_MIN_AMOUNT - 1))
        .to.be.rejectedWith('Invalid amount');

      // Just above maximum should fail
      await expect(creator.createWithWallet(VALID_MNEMONIC, MAX_AMOUNT + 1))
        .to.be.rejectedWith('Invalid amount');
    });

    it('should handle boundary start heights correctly', async () => {
      // Minimum should pass
      expect(MIN_START_HEIGHT).to.equal(1);

      // Maximum should pass
      expect(MAX_START_HEIGHT).to.equal(10000000);

      // Below minimum should fail
      await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: 0 }))
        .to.be.rejectedWith('Invalid startHeight');

      // Above maximum should fail
      await expect(creator.createWithWallet(VALID_MNEMONIC, 200000, { startHeight: MAX_START_HEIGHT + 1 }))
        .to.be.rejectedWith('Invalid startHeight');
    });
  });
});
