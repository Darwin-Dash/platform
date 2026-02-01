import * as wasm from '../wasm.js';
import type { NetworkLike } from '../wasm.js';

export namespace wallet {
  export async function generateMnemonic(params?: wasm.GenerateMnemonicParams): Promise<string> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.generateMnemonic(params ?? null);
  }

  export async function validateMnemonic(mnemonic: string, languageCode?: string): Promise<boolean> {
    // Return false for invalid inputs instead of crashing WASM
    if (mnemonic === undefined || mnemonic === null || typeof mnemonic !== 'string') {
      return false;
    }
    if (mnemonic.trim() === '') {
      return false;
    }

    await wasm.ensureInitialized();
    return wasm.WasmSdk.validateMnemonic(mnemonic, languageCode ?? null);
  }

  export async function mnemonicToSeed(mnemonic: string, passphrase?: string): Promise<Uint8Array> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.mnemonicToSeed(mnemonic, passphrase ?? null);
  }

  export async function deriveKeyFromSeedPhrase(params: wasm.DeriveKeyFromSeedPhraseParams): Promise<wasm.SeedPhraseKeyInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.deriveKeyFromSeedPhrase(params);
  }

  export async function deriveKeyFromSeedWithPath(params: wasm.DeriveKeyFromSeedWithPathParams): Promise<wasm.PathDerivedKeyInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.deriveKeyFromSeedWithPath(params);
  }

  export async function deriveKeyFromSeedWithExtendedPath(params: wasm.DeriveKeyFromSeedWithExtendedPathParams): Promise<wasm.DerivedKeyInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.deriveKeyFromSeedWithExtendedPath(params);
  }

  export async function deriveDashpayContactKey(params: wasm.DeriveDashpayContactKeyParams): Promise<wasm.DashpayContactKeyInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.deriveDashpayContactKey(params);
  }

  export async function derivationPathBip44Mainnet(account: number, change: number, index: number): Promise<wasm.DerivationPathInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.derivationPathBip44Mainnet(account, change, index);
  }

  export async function derivationPathBip44Testnet(account: number, change: number, index: number): Promise<wasm.DerivationPathInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.derivationPathBip44Testnet(account, change, index);
  }

  export async function derivationPathDip9Mainnet(featureType: number, account: number, index: number): Promise<wasm.DerivationPathInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.derivationPathDip9Mainnet(featureType, account, index);
  }

  export async function derivationPathDip9Testnet(featureType: number, account: number, index: number): Promise<wasm.DerivationPathInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.derivationPathDip9Testnet(featureType, account, index);
  }

  export async function derivationPathDip13Mainnet(account: number): Promise<wasm.Dip13DerivationPathInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.derivationPathDip13Mainnet(account);
  }

  export async function derivationPathDip13Testnet(account: number): Promise<wasm.Dip13DerivationPathInfo> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.derivationPathDip13Testnet(account);
  }

  export async function deriveChildPublicKey(xpub: string, index: number, hardened: boolean): Promise<string> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.deriveChildPublicKey(xpub, index, hardened);
  }

  export async function xprvToXpub(xprv: string): Promise<string> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.xprvToXpub(xprv);
  }

  export async function generateKeyPair(network: NetworkLike): Promise<wasm.KeyPair> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.generateKeyPair(network);
  }

  export async function generateKeyPairs(network: NetworkLike, count: number): Promise<wasm.KeyPair[]> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.generateKeyPairs(network, count);
  }

  export async function keyPairFromWif(privateKeyWif: string): Promise<wasm.KeyPair> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.keyPairFromWif(privateKeyWif);
  }

  export async function keyPairFromHex(privateKeyHex: string, network: NetworkLike): Promise<wasm.KeyPair> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.keyPairFromHex(privateKeyHex, network);
  }

  export async function pubkeyToAddress(pubkeyHex: string, network: NetworkLike): Promise<string> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.pubkeyToAddress(pubkeyHex, network);
  }

  export async function validateAddress(address: string, network: NetworkLike): Promise<boolean> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.validateAddress(address, network);
  }

  export async function signMessage(message: string, privateKeyWif: string): Promise<string> {
    await wasm.ensureInitialized();
    return wasm.WasmSdk.signMessage(message, privateKeyWif);
  }

  /**
   * Result of deriving an identity key
   */
  export interface IdentityKeyInfo {
    /** Private key in WIF format */
    privateKeyWif: string;
    /** Private key in hex format */
    privateKeyHex: string;
    /** Compressed public key in hex format (33 bytes) */
    publicKeyHex: string;
    /** Key ID (0-3 for standard DIP13 keys) */
    keyId: number;
    /** Key purpose: AUTHENTICATION or TRANSFER */
    purpose: 'AUTHENTICATION' | 'TRANSFER';
    /** Security level: MASTER, HIGH, or CRITICAL */
    securityLevel: 'MASTER' | 'HIGH' | 'CRITICAL';
  }

  /**
   * DIP13 key configurations for standard identity keys
   * These define the purpose and security level for each key ID
   */
  const DIP13_KEY_CONFIGS: ReadonlyArray<{
    keyId: number;
    purpose: 'AUTHENTICATION' | 'TRANSFER';
    securityLevel: 'MASTER' | 'HIGH' | 'CRITICAL';
  }> = [
    { keyId: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER' },
    { keyId: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH' },
    { keyId: 2, purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL' },
    { keyId: 3, purpose: 'TRANSFER', securityLevel: 'CRITICAL' }
  ] as const;

  /**
   * Derive a single identity key using DIP13 standard derivation path
   *
   * DIP13 Identity key derivation path:
   * m/9'/coin_type'/5'/0'/0'/identityIndex'/keyId'
   *
   * Key Types (DIP13):
   * - Key 0: AUTHENTICATION/MASTER (primary authentication key)
   * - Key 1: AUTHENTICATION/HIGH (high-security operations)
   * - Key 2: AUTHENTICATION/CRITICAL (critical operations)
   * - Key 3: TRANSFER/CRITICAL (asset transfer operations)
   *
   * @param mnemonic - 12-word BIP39 mnemonic phrase
   * @param identityIndex - The identity index (HD derivation index)
   * @param keyId - Key ID to derive (0-3 for standard keys)
   * @param network - Network: 'testnet' or 'mainnet'
   * @returns Identity key information including private/public keys and metadata
   * @throws Error if mnemonic is invalid or key derivation fails
   */
  export async function deriveIdentityKey(
    mnemonic: string,
    identityIndex: number,
    keyId: number,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<IdentityKeyInfo> {
    // Defensive validation before any WASM calls to prevent crashes
    if (mnemonic === undefined || mnemonic === null) {
      throw new Error('Mnemonic is required but was undefined or null');
    }
    if (typeof mnemonic !== 'string') {
      throw new Error(`Mnemonic must be a string, got ${typeof mnemonic}`);
    }
    if (mnemonic.trim() === '') {
      throw new Error('Mnemonic cannot be an empty string');
    }
    if (typeof identityIndex !== 'number' || identityIndex < 0 || !Number.isInteger(identityIndex)) {
      throw new Error(`identityIndex must be a non-negative integer, got ${identityIndex}`);
    }
    if (typeof keyId !== 'number' || keyId < 0 || !Number.isInteger(keyId)) {
      throw new Error(`keyId must be a non-negative integer, got ${keyId}`);
    }

    await wasm.ensureInitialized();

    // Validate mnemonic content (word count, validity, etc.)
    const isValid = await validateMnemonic(mnemonic);
    if (!isValid) {
      throw new Error('Invalid mnemonic phrase');
    }

    // DIP13: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyId'
    // coin_type: 1 for testnet, 5 for mainnet
    const coinType = network === 'mainnet' ? 5 : 1;
    const path = `m/9'/${coinType}'/5'/0'/0'/${identityIndex}'/${keyId}'`;

    // Derive key using WASM SDK
    const derivedKey = await wasm.WasmSdk.deriveKeyFromSeedWithPath({
      mnemonic,
      passphrase: null,
      path,
      network
    });

    // WASM SDK uses camelCase field names
    const privateKeyWif = derivedKey.privateKeyWif;
    const publicKeyHex = derivedKey.publicKey;

    // Validate derivation result before proceeding
    if (!privateKeyWif || typeof privateKeyWif !== 'string') {
      throw new Error(`Key derivation failed: privateKeyWif is ${typeof privateKeyWif}`);
    }

    // Get hex format of private key using keyPairFromWif
    const keyPair = await wasm.WasmSdk.keyPairFromWif(privateKeyWif);
    const privateKeyHex = keyPair.privateKeyHex;

    // Determine purpose and security level from key config
    const config = DIP13_KEY_CONFIGS.find(c => c.keyId === keyId);
    const purpose = config?.purpose ?? 'AUTHENTICATION';
    const securityLevel = config?.securityLevel ?? 'HIGH';

    return {
      privateKeyWif,
      privateKeyHex,
      publicKeyHex,
      keyId,
      purpose,
      securityLevel
    };
  }
}
