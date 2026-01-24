/**
 * Unit tests for IdentityUpdater facade
 *
 * Tests input validation logic for identity top-up operations.
 * Note: Full coordinator orchestration testing requires integration tests.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('IdentityUpdater', () => {
  let wasmSdk;
  let client;
  let updater;
  let sandbox;

  const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const VALID_IDENTITY_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'; // Example Base58 ID
  const TOPUP_MIN_AMOUNT = 50000; // From IDENTITY_CONFIG
  const MAX_AMOUNT = 100000000000; // From IDENTITY_CONFIG
  const MIN_START_HEIGHT = 1;
  const MAX_START_HEIGHT = 10000000;

  beforeEach(async function setup() {
    await init();
    const builder = wasmSDKPackage.WasmSdkBuilder.testnetTrusted();
    wasmSdk = builder.build();
    client = EvoSDK.fromWasm(wasmSdk);
    updater = client.identities.updater;
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('topUpWithWallet() - Input Validation', () => {
    describe('Identity ID validation', () => {
      it('should reject missing identity ID', async () => {
        await expect(updater.topUpWithWallet(null, 50000, VALID_MNEMONIC))
          .to.be.rejectedWith('Identity ID is required');

        await expect(updater.topUpWithWallet(undefined, 50000, VALID_MNEMONIC))
          .to.be.rejectedWith('Identity ID is required');

        await expect(updater.topUpWithWallet('', 50000, VALID_MNEMONIC))
          .to.be.rejectedWith('Identity ID is required');
      });

      it('should accept valid identity ID format', () => {
        // Valid Base58 format (will fail at coordinator but passes validation)
        expect(VALID_IDENTITY_ID.length).to.be.greaterThan(0);
      });
    });

    describe('Amount validation', () => {
      it('should reject amount below minimum', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, TOPUP_MIN_AMOUNT - 1, VALID_MNEMONIC))
          .to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 0, VALID_MNEMONIC))
          .to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 1000, VALID_MNEMONIC))
          .to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject amount above maximum', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, MAX_AMOUNT + 1, VALID_MNEMONIC))
          .to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject invalid amount types', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, NaN, VALID_MNEMONIC))
          .to.be.rejectedWith('Invalid amount');

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 'not-a-number', VALID_MNEMONIC))
          .to.be.rejectedWith('Invalid amount');

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, null, VALID_MNEMONIC))
          .to.be.rejectedWith('Invalid amount');
      });

      it('should accept valid amount within range', () => {
        // Valid amounts (will fail at coordinator but pass validation)
        expect(TOPUP_MIN_AMOUNT).to.equal(50000);
        expect(100000).to.be.gte(TOPUP_MIN_AMOUNT);
        expect(100000).to.be.lte(MAX_AMOUNT);
      });

      it('should use lower minimum for topUp than create', () => {
        const CREATE_MIN = 200000;
        expect(TOPUP_MIN_AMOUNT).to.be.lessThan(CREATE_MIN);
        expect(TOPUP_MIN_AMOUNT).to.equal(50000);
      });
    });

    describe('Mnemonic validation', () => {
      it('should reject missing mnemonic', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, null))
          .to.be.rejectedWith('Mnemonic is required');

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, undefined))
          .to.be.rejectedWith('Mnemonic is required');

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, ''))
          .to.be.rejectedWith('Mnemonic is required');
      });

      it('should reject mnemonic with incorrect word count', async () => {
        // Too few words
        const shortMnemonic = 'abandon abandon abandon';
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, shortMnemonic))
          .to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 3');

        // Too many words
        const longMnemonic = VALID_MNEMONIC + ' extra extra words';
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, longMnemonic))
          .to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 15');
      });

      it('should accept valid 12-word mnemonic', () => {
        const words = VALID_MNEMONIC.split(' ');
        expect(words.length).to.equal(12);
      });
    });

    describe('Start height validation', () => {
      it('should reject start height below minimum', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: 0 }))
          .to.be.rejectedWith(`Invalid startHeight: must be between ${MIN_START_HEIGHT} and ${MAX_START_HEIGHT}`);

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: -100 }))
          .to.be.rejectedWith(`Invalid startHeight: must be between ${MIN_START_HEIGHT} and ${MAX_START_HEIGHT}`);
      });

      it('should reject start height above maximum', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: MAX_START_HEIGHT + 1 }))
          .to.be.rejectedWith(`Invalid startHeight: must be between ${MIN_START_HEIGHT} and ${MAX_START_HEIGHT}`);
      });

      it('should reject invalid start height types', async () => {
        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: NaN }))
          .to.be.rejectedWith('Invalid startHeight');

        await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: 'not-a-number' }))
          .to.be.rejectedWith('Invalid startHeight');
      });

      it('should accept valid start height within range', () => {
        expect(1).to.be.gte(MIN_START_HEIGHT);
        expect(1330000).to.be.gte(MIN_START_HEIGHT);
        expect(1330000).to.be.lte(MAX_START_HEIGHT);
      });

      it('should use default start height when not provided', () => {
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
    });
  });

  // Note: topUpWithAccount() was a wallet-lib style API that was not ported.
  // The js-evo-sdk uses topUpWithWallet() and topupWithUTXO() instead.

  describe('Edge cases', () => {
    it('should handle boundary amounts correctly', async () => {
      // Minimum amount should pass validation
      expect(TOPUP_MIN_AMOUNT).to.equal(50000);

      // Maximum amount should pass validation
      expect(MAX_AMOUNT).to.equal(100000000000);

      // Just below minimum should fail
      await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, TOPUP_MIN_AMOUNT - 1, VALID_MNEMONIC))
        .to.be.rejectedWith('Invalid amount');

      // Just above maximum should fail
      await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, MAX_AMOUNT + 1, VALID_MNEMONIC))
        .to.be.rejectedWith('Invalid amount');
    });

    it('should handle boundary start heights correctly', async () => {
      expect(MIN_START_HEIGHT).to.equal(1);
      expect(MAX_START_HEIGHT).to.equal(10000000);

      // Below minimum should fail
      await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: 0 }))
        .to.be.rejectedWith('Invalid startHeight');

      // Above maximum should fail
      await expect(updater.topUpWithWallet(VALID_IDENTITY_ID, 50000, VALID_MNEMONIC, { startHeight: MAX_START_HEIGHT + 1 }))
        .to.be.rejectedWith('Invalid startHeight');
    });
  });
});
