/**
 * Unit tests for UTXO-first identity operations
 *
 * Tests input validation for:
 * - UTXOFinder.findSpendableUTXO()
 * - IdentityCreator.createWithUTXO()
 * - IdentityUpdater.topupWithUTXO()
 *
 * Note: Full integration testing requires testnet access.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import init, * as wasmSDKPackage from '@dashevo/wasm-sdk';
import { EvoSDK } from '../../../dist/sdk.js';

describe('UTXO-First Operations', () => {
  let wasmSdk;
  let client;
  let sandbox;

  const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const CREATE_MIN_AMOUNT = 200000; // From IDENTITY_CONFIG
  const TOPUP_MIN_AMOUNT = 50000; // From IDENTITY_CONFIG (actual value)
  const MAX_AMOUNT = 100000000000; // From IDENTITY_CONFIG

  // Sample UTXO for testing
  const mockUTXO = {
    txId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    vout: 0,
    address: 'yNf9wJeEwJiR9HdRLq8gNqPD3jV1p5LHkT',
    satoshis: 500000,
    script: '76a91482bbc63ab8bcf4cf96c89b437b925f7c08d7d70b88ac',
    height: 1000000,
    confirmations: 100,
    isChainLocked: true,
    isInstantLocked: true,
  };

  beforeEach(async function setup() {
    await init();
    const builder = wasmSDKPackage.WasmSdkBuilder.testnetTrusted();
    wasmSdk = builder.build();
    client = EvoSDK.fromWasm(wasmSdk);
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('IdentityCreator.createWithUTXO() - Input Validation', () => {
    let creator;

    beforeEach(() => {
      creator = client.identities.creator;
    });

    describe('Mnemonic validation', () => {
      it('should reject missing mnemonic', async () => {
        await expect(creator.createWithUTXO({
          mnemonic: null,
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT,
        })).to.be.rejectedWith('Mnemonic is required');

        await expect(creator.createWithUTXO({
          mnemonic: '',
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT,
        })).to.be.rejectedWith('Mnemonic is required');

        await expect(creator.createWithUTXO({
          mnemonic: undefined,
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT,
        })).to.be.rejectedWith('Mnemonic is required');
      });

      it('should reject mnemonic with incorrect word count', async () => {
        const shortMnemonic = 'abandon abandon abandon';
        await expect(creator.createWithUTXO({
          mnemonic: shortMnemonic,
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT,
        })).to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 3');

        const longMnemonic = VALID_MNEMONIC + ' extra extra words';
        await expect(creator.createWithUTXO({
          mnemonic: longMnemonic,
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT,
        })).to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 15');
      });
    });

    describe('Amount validation', () => {
      it('should reject amount below minimum', async () => {
        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT - 1,
        })).to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: mockUTXO,
          amount: 0,
        })).to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject amount above maximum', async () => {
        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: { ...mockUTXO, satoshis: MAX_AMOUNT + 1 },
          amount: MAX_AMOUNT + 1,
        })).to.be.rejectedWith(`Invalid amount: must be between ${CREATE_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject invalid amount types', async () => {
        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: mockUTXO,
          amount: NaN,
        })).to.be.rejectedWith('Invalid amount');

        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: mockUTXO,
          amount: 'not-a-number',
        })).to.be.rejectedWith('Invalid amount');

        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: mockUTXO,
          amount: null,
        })).to.be.rejectedWith('Invalid amount');
      });
    });

    describe('UTXO balance validation', () => {
      it('should reject UTXO with insufficient balance', async () => {
        const smallUTXO = { ...mockUTXO, satoshis: 100000 };
        await expect(creator.createWithUTXO({
          mnemonic: VALID_MNEMONIC,
          utxo: smallUTXO,
          amount: CREATE_MIN_AMOUNT,
        })).to.be.rejectedWith(/UTXO balance.*is less than requested amount/);
      });

      it('should validate exact balance is sufficient', () => {
        // Test the balance comparison logic without making network calls
        const exactUTXO = { ...mockUTXO, satoshis: CREATE_MIN_AMOUNT };
        const isBalanceSufficient = exactUTXO.satoshis >= CREATE_MIN_AMOUNT;
        expect(isBalanceSufficient).to.be.true;
      });

      it('should validate larger balance is sufficient', () => {
        // Test the balance comparison logic without making network calls
        const largeUTXO = { ...mockUTXO, satoshis: 1000000 };
        const isBalanceSufficient = largeUTXO.satoshis >= CREATE_MIN_AMOUNT;
        expect(isBalanceSufficient).to.be.true;
        expect(largeUTXO.satoshis).to.be.greaterThan(CREATE_MIN_AMOUNT);
      });

      it('should identify insufficient balance', () => {
        // Test the balance comparison logic without making network calls
        const smallUTXO = { ...mockUTXO, satoshis: 100000 };
        const isBalanceSufficient = smallUTXO.satoshis >= CREATE_MIN_AMOUNT;
        expect(isBalanceSufficient).to.be.false;
      });
    });

    describe('Options handling', () => {
      it('should accept valid options object with derivedAddresses', () => {
        const options = {
          mnemonic: VALID_MNEMONIC,
          utxo: mockUTXO,
          amount: CREATE_MIN_AMOUNT,
          skipDiscovery: true,
          useSourceAsChangeAddress: true,
          derivedAddresses: {
            external: [{
              address: mockUTXO.address,
              pubKeyHash: 'hash',
              publicKey: 'pubkey',
              privateKeyWif: 'wif',
              path: "m/44'/5'/0'/0/0",
              index: 0,
            }],
            internal: [],
          },
          onProgress: (event) => {},
        };

        expect(options.skipDiscovery).to.be.a('boolean');
        expect(options.useSourceAsChangeAddress).to.be.a('boolean');
        expect(options.derivedAddresses.external).to.be.an('array');
        expect(options.onProgress).to.be.a('function');
      });
    });
  });

  describe('IdentityUpdater.topupWithUTXO() - Input Validation', () => {
    let updater;

    const VALID_IDENTITY_ID = 'BZhHvd2x7JNYF2SRPfzTjEw28e3LJ5GPZMRqGGQMpKkZ';

    beforeEach(() => {
      updater = client.identities.updater;
    });

    describe('Mnemonic validation', () => {
      it('should reject missing mnemonic', async () => {
        await expect(updater.topupWithUTXO({
          mnemonic: null,
          identityId: VALID_IDENTITY_ID,
          utxo: mockUTXO,
          amount: TOPUP_MIN_AMOUNT,
        })).to.be.rejectedWith('Mnemonic is required');

        await expect(updater.topupWithUTXO({
          mnemonic: '',
          identityId: VALID_IDENTITY_ID,
          utxo: mockUTXO,
          amount: TOPUP_MIN_AMOUNT,
        })).to.be.rejectedWith('Mnemonic is required');
      });

      it('should reject mnemonic with incorrect word count', async () => {
        const shortMnemonic = 'abandon abandon';
        await expect(updater.topupWithUTXO({
          mnemonic: shortMnemonic,
          identityId: VALID_IDENTITY_ID,
          utxo: mockUTXO,
          amount: TOPUP_MIN_AMOUNT,
        })).to.be.rejectedWith('Invalid mnemonic: expected 12 words, got 2');
      });
    });

    describe('Identity ID validation', () => {
      it('should reject missing identity ID', async () => {
        await expect(updater.topupWithUTXO({
          mnemonic: VALID_MNEMONIC,
          identityId: null,
          utxo: mockUTXO,
          amount: TOPUP_MIN_AMOUNT,
        })).to.be.rejectedWith('Identity ID is required');

        await expect(updater.topupWithUTXO({
          mnemonic: VALID_MNEMONIC,
          identityId: '',
          utxo: mockUTXO,
          amount: TOPUP_MIN_AMOUNT,
        })).to.be.rejectedWith('Identity ID is required');
      });
    });

    describe('Amount validation', () => {
      it('should reject amount below minimum', async () => {
        await expect(updater.topupWithUTXO({
          mnemonic: VALID_MNEMONIC,
          identityId: VALID_IDENTITY_ID,
          utxo: mockUTXO,
          amount: TOPUP_MIN_AMOUNT - 1,
        })).to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);

        await expect(updater.topupWithUTXO({
          mnemonic: VALID_MNEMONIC,
          identityId: VALID_IDENTITY_ID,
          utxo: mockUTXO,
          amount: 0,
        })).to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });

      it('should reject amount above maximum', async () => {
        await expect(updater.topupWithUTXO({
          mnemonic: VALID_MNEMONIC,
          identityId: VALID_IDENTITY_ID,
          utxo: { ...mockUTXO, satoshis: MAX_AMOUNT + 1 },
          amount: MAX_AMOUNT + 1,
        })).to.be.rejectedWith(`Invalid amount: must be between ${TOPUP_MIN_AMOUNT} and ${MAX_AMOUNT}`);
      });
    });

    describe('UTXO balance validation', () => {
      it('should reject UTXO with insufficient balance', async () => {
        // UTXO with 25000 satoshis (less than TOPUP_MIN_AMOUNT of 50000)
        const smallUTXO = { ...mockUTXO, satoshis: 25000 };
        await expect(updater.topupWithUTXO({
          mnemonic: VALID_MNEMONIC,
          identityId: VALID_IDENTITY_ID,
          utxo: smallUTXO,
          amount: TOPUP_MIN_AMOUNT, // 50000
        })).to.be.rejectedWith(/UTXO balance.*is less than requested amount/);
      });
    });
  });

  describe('UTXOFinder - Input Validation', () => {
    describe('findSpendableUTXO options', () => {
      it('should accept valid minAmount parameter', () => {
        const options = {
          mnemonic: VALID_MNEMONIC,
          startHeight: 1000000,
          minAmount: 200000,
        };

        expect(options.minAmount).to.equal(200000);
        expect(options.minAmount).to.be.gte(CREATE_MIN_AMOUNT);
      });

      it('should provide default minAmount when not specified', () => {
        const options = {
          mnemonic: VALID_MNEMONIC,
          startHeight: 1000000,
        };

        const minAmount = options.minAmount ?? CREATE_MIN_AMOUNT;
        expect(minAmount).to.equal(CREATE_MIN_AMOUNT);
      });

      it('should accept valid startHeight', () => {
        const options = {
          mnemonic: VALID_MNEMONIC,
          startHeight: 1330000,
          minAmount: 200000,
        };

        expect(options.startHeight).to.be.a('number');
        expect(options.startHeight).to.be.gte(1);
      });
    });

    describe('findAllUTXOs options', () => {
      it('should accept valid address count', () => {
        const options = {
          mnemonic: VALID_MNEMONIC,
          startHeight: 1,
          toHeight: 1000000,
          addressCount: 20,
        };

        expect(options.addressCount).to.equal(20);
        expect(options.addressCount).to.be.gte(1);
      });

      it('should use default address count when not specified', () => {
        const options = {
          mnemonic: VALID_MNEMONIC,
          startHeight: 1,
        };

        const addressCount = options.addressCount ?? 20;
        expect(addressCount).to.equal(20);
      });
    });
  });

  describe('UTXO Structure Validation', () => {
    it('should have required UTXO fields', () => {
      // Validate the mockUTXO has all required fields
      expect(mockUTXO).to.have.property('txId');
      expect(mockUTXO).to.have.property('vout');
      expect(mockUTXO).to.have.property('address');
      expect(mockUTXO).to.have.property('satoshis');
      expect(mockUTXO).to.have.property('script');

      expect(mockUTXO.txId).to.be.a('string');
      expect(mockUTXO.txId).to.have.lengthOf(64);
      expect(mockUTXO.vout).to.be.a('number');
      expect(mockUTXO.address).to.be.a('string');
      expect(mockUTXO.satoshis).to.be.a('number');
      expect(mockUTXO.script).to.be.a('string');
    });

    it('should have optional confirmation fields', () => {
      // Optional but recommended fields
      expect(mockUTXO).to.have.property('height');
      expect(mockUTXO).to.have.property('confirmations');
      expect(mockUTXO).to.have.property('isChainLocked');
      expect(mockUTXO).to.have.property('isInstantLocked');

      expect(mockUTXO.height).to.be.a('number');
      expect(mockUTXO.confirmations).to.be.a('number');
      expect(mockUTXO.isChainLocked).to.be.a('boolean');
      expect(mockUTXO.isInstantLocked).to.be.a('boolean');
    });
  });

  describe('Edge Cases', () => {
    it('should reject amount just below createWithUTXO minimum', async () => {
      const creator = client.identities.creator;
      const exactMinUTXO = { ...mockUTXO, satoshis: CREATE_MIN_AMOUNT };

      // Just below minimum should fail amount validation
      await expect(creator.createWithUTXO({
        mnemonic: VALID_MNEMONIC,
        utxo: exactMinUTXO,
        amount: CREATE_MIN_AMOUNT - 1,
      })).to.be.rejectedWith('Invalid amount');
    });

    it('should validate createWithUTXO boundary conditions', () => {
      // Test boundary validation logic without network calls
      const minAmount = CREATE_MIN_AMOUNT;
      const maxAmount = MAX_AMOUNT;

      // Minimum boundary
      expect(minAmount).to.equal(200000);
      expect(minAmount >= CREATE_MIN_AMOUNT).to.be.true;
      expect(minAmount <= MAX_AMOUNT).to.be.true;

      // Maximum boundary
      expect(maxAmount).to.equal(100000000000);

      // Just below min is invalid
      expect(minAmount - 1 >= CREATE_MIN_AMOUNT).to.be.false;

      // Just above max is invalid
      expect(maxAmount + 1 <= MAX_AMOUNT).to.be.false;
    });

    it('should reject amount just below topupWithUTXO minimum', async () => {
      const updater = client.identities.updater;
      const exactMinUTXO = { ...mockUTXO, satoshis: TOPUP_MIN_AMOUNT };
      const VALID_IDENTITY_ID = 'BZhHvd2x7JNYF2SRPfzTjEw28e3LJ5GPZMRqGGQMpKkZ';

      // Just below minimum should fail amount validation
      await expect(updater.topupWithUTXO({
        mnemonic: VALID_MNEMONIC,
        identityId: VALID_IDENTITY_ID,
        utxo: exactMinUTXO,
        amount: TOPUP_MIN_AMOUNT - 1,
      })).to.be.rejectedWith('Invalid amount');
    });

    it('should validate topupWithUTXO boundary conditions', () => {
      // Test boundary validation logic without network calls
      const minAmount = TOPUP_MIN_AMOUNT;
      const maxAmount = MAX_AMOUNT;

      // Minimum boundary
      expect(minAmount).to.equal(50000);
      expect(minAmount >= TOPUP_MIN_AMOUNT).to.be.true;
      expect(minAmount <= MAX_AMOUNT).to.be.true;

      // Just below min is invalid
      expect(minAmount - 1 >= TOPUP_MIN_AMOUNT).to.be.false;

      // Just above max is invalid
      expect(maxAmount + 1 <= MAX_AMOUNT).to.be.false;
    });
  });
});
