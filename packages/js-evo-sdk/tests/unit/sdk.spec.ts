import { describe, it, expect } from 'vitest';
import { EvoSDK } from '../../src/sdk.js';

// Test addresses (RFC 6761 reserved test domain - no network calls in unit tests)
const TEST_ADDRESS_1 = 'https://node-1.test:1443';
const TEST_ADDRESS_2 = 'https://node-2.test:1443';
const TEST_ADDRESS_3 = 'https://node-3.test:1443';
const TEST_ADDRESSES = [TEST_ADDRESS_1, TEST_ADDRESS_2, TEST_ADDRESS_3];

describe('EvoSDK', () => {
  it('exposes constructor and factories', () => {
    expect(EvoSDK).toBeTypeOf('function');
    expect(EvoSDK.testnet).toBeTypeOf('function');
    expect(EvoSDK.mainnet).toBeTypeOf('function');
    expect(EvoSDK.testnetTrusted).toBeTypeOf('function');
    expect(EvoSDK.mainnetTrusted).toBeTypeOf('function');
    expect(EvoSDK.withAddresses).toBeTypeOf('function');
  });

  it('fromWasm() marks instance as connected', () => {
    const wasmStub = { version: () => 1 };
    const sdk = EvoSDK.fromWasm(wasmStub);
    expect(sdk.isConnected).toBe(true);
    expect(sdk.wasm).toBe(wasmStub);
  });

  describe('EvoSDK.withAddresses()', () => {
    it('creates SDK instance with specific addresses', () => {
      const sdk = EvoSDK.withAddresses([TEST_ADDRESS_1], 'testnet');
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.isConnected).toBe(false);
    });

    it('defaults to testnet when network not specified', () => {
      const sdk = EvoSDK.withAddresses([TEST_ADDRESS_1]);
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.isConnected).toBe(false);
    });

    it('accepts mainnet network', () => {
      const sdk = EvoSDK.withAddresses([TEST_ADDRESS_2], 'mainnet');
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('mainnet');
      expect(sdk.isConnected).toBe(false);
    });

    it('accepts multiple addresses', () => {
      const sdk = EvoSDK.withAddresses(TEST_ADDRESSES, 'testnet');
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.addresses).toEqual(TEST_ADDRESSES);
    });

    it('accepts additional connection options', () => {
      const sdk = EvoSDK.withAddresses(
        [TEST_ADDRESS_1],
        'testnet',
        {
          version: 1,
          proofs: true,
          logs: 'info',
          settings: {
            connectTimeoutMs: 10000,
            timeoutMs: 30000,
            retries: 3,
            banFailedAddress: false,
          },
        },
      );
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.trusted).toBe(false);
      expect(sdk.options.addresses).toEqual([TEST_ADDRESS_1]);
      expect(sdk.options.version).toBe(1);
      expect(sdk.options.proofs).toBe(true);
      expect(sdk.options.logs).toBe('info');
      expect(sdk.options.settings).toBeDefined();
      expect(sdk.options.settings.connectTimeoutMs).toBe(10000);
      expect(sdk.options.settings.timeoutMs).toBe(30000);
      expect(sdk.options.settings.retries).toBe(3);
      expect(sdk.options.settings.banFailedAddress).toBe(false);
    });
  });

  describe('constructor with addresses option', () => {
    it('accepts addresses in options', () => {
      const sdk = new EvoSDK({
        addresses: [TEST_ADDRESS_1],
        network: 'testnet',
      });
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.trusted).toBe(false);
      expect(sdk.isConnected).toBe(false);
    });

    it('works with testnet default', () => {
      const sdk = new EvoSDK({
        addresses: [TEST_ADDRESS_1],
      });
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.trusted).toBe(false);
    });

    it('works with mainnet', () => {
      const sdk = new EvoSDK({
        addresses: [TEST_ADDRESS_2],
        network: 'mainnet',
      });
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('mainnet');
      expect(sdk.options.trusted).toBe(false);
    });

    it('combines addresses with other options', () => {
      const sdk = new EvoSDK({
        addresses: [TEST_ADDRESS_1],
        network: 'testnet',
        version: 1,
        proofs: true,
        logs: 'debug',
        settings: {
          connectTimeoutMs: 5000,
          timeoutMs: 15000,
          retries: 5,
          banFailedAddress: true,
        },
      });
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.trusted).toBe(false);
      expect(sdk.options.addresses).toEqual([TEST_ADDRESS_1]);
      expect(sdk.options.version).toBe(1);
      expect(sdk.options.proofs).toBe(true);
      expect(sdk.options.logs).toBe('debug');
      expect(sdk.options.settings).toBeDefined();
      expect(sdk.options.settings.connectTimeoutMs).toBe(5000);
      expect(sdk.options.settings.timeoutMs).toBe(15000);
      expect(sdk.options.settings.retries).toBe(5);
      expect(sdk.options.settings.banFailedAddress).toBe(true);
    });

    it('prioritizes addresses over network presets when both provided', () => {
      // When addresses are provided, they should be used instead of default network addresses
      const sdk = new EvoSDK({
        addresses: [TEST_ADDRESS_3],
        network: 'testnet',
        trusted: true,
      });
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.addresses).toEqual([TEST_ADDRESS_3]);
      expect(sdk.options.trusted).toBe(true);
    });

    it('withAddresses() and constructor with addresses produce equivalent SDKs', () => {
      const addresses = [TEST_ADDRESS_1];
      const options = { version: 1, proofs: true };

      const sdk1 = EvoSDK.withAddresses(addresses, 'testnet', options);
      const sdk2 = new EvoSDK({ addresses, network: 'testnet', ...options });

      expect(sdk1.options.addresses).toEqual(sdk2.options.addresses);
      expect(sdk1.options.network).toBe(sdk2.options.network);
      expect(sdk1.options.version).toBe(sdk2.options.version);
      expect(sdk1.options.proofs).toBe(sdk2.options.proofs);
    });
  });

  describe('factory methods for standard configurations', () => {
    it('testnet() creates testnet instance', () => {
      const sdk = EvoSDK.testnet();
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.trusted).toBe(false);
      expect(sdk.options.addresses).toBeUndefined();
      expect(sdk.isConnected).toBe(false);
    });

    it('mainnet() creates mainnet instance', () => {
      const sdk = EvoSDK.mainnet();
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('mainnet');
      expect(sdk.options.trusted).toBe(false);
      expect(sdk.isConnected).toBe(false);
    });

    it('testnetTrusted() creates trusted testnet instance', () => {
      const sdk = EvoSDK.testnetTrusted();
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('testnet');
      expect(sdk.options.trusted).toBe(true);
      expect(sdk.isConnected).toBe(false);
    });

    it('mainnetTrusted() creates trusted mainnet instance', () => {
      const sdk = EvoSDK.mainnetTrusted();
      expect(sdk).toBeInstanceOf(EvoSDK);
      expect(sdk.options.network).toBe('mainnet');
      expect(sdk.options.trusted).toBe(true);
      expect(sdk.isConnected).toBe(false);
    });

    it('factory methods accept connection options', () => {
      const sdk = EvoSDK.testnet({
        version: 1,
        proofs: false,
        logs: 'warn',
      });
      expect(sdk).toBeInstanceOf(EvoSDK);
    });
  });
});
