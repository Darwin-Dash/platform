/**
 * AddressDerivation - HD address derivation utilities for Dash
 * Supports both full control (mnemonic) and watch-only (HDPublicKey) modes
 */

import {
  Mnemonic,
  HDPrivateKey,
  HDPublicKey,
} from '@dashevo/dashcore-lib';

import {
  DerivedAddress,
  AddressDerivationResult,
  AddressDerivationOptions,
} from './types';

export class AddressDerivation {
  /**
   * Derive addresses from mnemonic (full control mode)
   * @param mnemonic - BIP39 mnemonic phrase
   * @param network - 'mainnet' or 'testnet'
   * @param options - Derivation options
   * @returns Object with external, internal address arrays and hdPrivateKey
   */
  static fromMnemonic(
    mnemonic: string,
    network: string = 'testnet',
    options: AddressDerivationOptions = {}
  ): AddressDerivationResult {
    const {
      accountIndex = 0,
      externalCount = 20,
      internalCount = 20,
    } = options;

    // Create seed from mnemonic
    const seed = new Mnemonic(mnemonic).toSeed();
    const hdPrivateKey = HDPrivateKey.fromSeed(seed, network);

    // BIP44 path: m/44'/COIN'/account'/chain/index
    // COIN = 5 (mainnet) or 1 (testnet)
    const coinType = network === 'mainnet' ? 5 : 1;
    const accountPath = `m/44'/${coinType}'/${accountIndex}'`;
    const accountKey = hdPrivateKey.deriveChild(accountPath);

    // Derive external addresses (receiving)
    const external: DerivedAddress[] = [];
    for (let i = 0; i < externalCount; i++) {
      const childPath = `m/44'/${coinType}'/${accountIndex}'/0/${i}`;
      const key = hdPrivateKey.deriveChild(childPath);
      external.push({
        index: i,
        path: childPath,
        address: key.privateKey.toAddress(network).toString(),
        privateKey: key.privateKey,
        publicKey: key.publicKey,
      });
    }

    // Derive internal addresses (change)
    const internal: DerivedAddress[] = [];
    for (let i = 0; i < internalCount; i++) {
      const childPath = `m/44'/${coinType}'/${accountIndex}'/1/${i}`;
      const key = hdPrivateKey.deriveChild(childPath);
      internal.push({
        index: i,
        path: childPath,
        address: key.privateKey.toAddress(network).toString(),
        privateKey: key.privateKey,
        publicKey: key.publicKey,
      });
    }

    return { external, internal, hdPrivateKey: accountKey };
  }

  /**
   * Derive addresses from HDPublicKey (watch-only mode)
   * @param hdPublicKey - Extended public key (xpub or tpub)
   * @param network - 'mainnet' or 'testnet'
   * @param options - Derivation options
   * @returns Object with external and internal address arrays (no private keys)
   */
  static fromHDPublicKey(
    hdPublicKey: HDPublicKey | string,
    network: string = 'testnet',
    options: AddressDerivationOptions = {}
  ): Omit<AddressDerivationResult, 'hdPrivateKey'> {
    return this.deriveFromXpub(hdPublicKey, network, options);
  }

  /**
   * Derive addresses from xpub (watch-only mode) - alias for fromHDPublicKey
   * @param xpub - Extended public key (xpub or tpub)
   * @param network - 'mainnet' or 'testnet'
   * @param options - Derivation options
   * @returns Object with external and internal address arrays (no private keys)
   */
  static deriveFromXpub(
    xpub: HDPublicKey | string,
    network: string = 'testnet',
    options: AddressDerivationOptions = {}
  ): Omit<AddressDerivationResult, 'hdPrivateKey'> {
    const {
      externalCount = 20,
      internalCount = 20,
    } = options;

    const hdPublicKey = typeof xpub === 'string'
      ? new HDPublicKey(xpub)
      : xpub;

    // Derive external addresses (no private keys)
    const external: DerivedAddress[] = [];
    for (let i = 0; i < externalCount; i++) {
      const key = hdPublicKey.deriveChild(`m/0/${i}`);
      external.push({
        index: i,
        address: key.publicKey.toAddress(network).toString(),
        publicKey: key.publicKey,
        path: `m/0/${i}`, // Relative path in watch-only mode
      });
    }

    // Derive internal addresses
    const internal: DerivedAddress[] = [];
    for (let i = 0; i < internalCount; i++) {
      const key = hdPublicKey.deriveChild(`m/1/${i}`);
      internal.push({
        index: i,
        address: key.publicKey.toAddress(network).toString(),
        publicKey: key.publicKey,
        path: `m/1/${i}`, // Relative path in watch-only mode
      });
    }

    return { external, internal };
  }

  /**
   * Derive a specific address by index
   * @param mnemonic - BIP39 mnemonic
   * @param network - 'mainnet' or 'testnet'
   * @param accountIndex - BIP44 account index
   * @param addressIndex - Address index within chain
   * @param isChange - true for internal (change), false for external
   * @returns Derived address object with private key
   */
  static deriveAddress(
    mnemonic: string,
    network: string,
    accountIndex: number,
    addressIndex: number,
    isChange: boolean = false
  ): DerivedAddress {
    const seed = new Mnemonic(mnemonic).toSeed();
    const hdPrivateKey = HDPrivateKey.fromSeed(seed, network);

    const coinType = network === 'mainnet' ? 5 : 1;
    const chain = isChange ? 1 : 0;
    const path = `m/44'/${coinType}'/${accountIndex}'/${chain}/${addressIndex}`;

    const derivedKey = hdPrivateKey.deriveChild(path);

    return {
      index: addressIndex,
      path,
      address: derivedKey.privateKey.toAddress(network).toString(),
      privateKey: derivedKey.privateKey,
      publicKey: derivedKey.publicKey,
    };
  }

  /**
   * Get the extended public key from a mnemonic (for sharing watch-only capability)
   * @param mnemonic - BIP39 mnemonic
   * @param network - 'mainnet' or 'testnet'
   * @param accountIndex - BIP44 account index
   * @returns Extended public key (xpub/tpub)
   */
  static getHDPublicKeyFromMnemonic(
    mnemonic: string,
    network: string = 'testnet',
    accountIndex: number = 0
  ): string {
    const seed = new Mnemonic(mnemonic).toSeed();
    const hdPrivateKey = HDPrivateKey.fromSeed(seed, network);

    const coinType = network === 'mainnet' ? 5 : 1;
    const accountPath = `m/44'/${coinType}'/${accountIndex}'`;
    const accountKey = hdPrivateKey.deriveChild(accountPath);

    return accountKey.hdPublicKey.toString();
  }
}
