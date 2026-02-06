/**
 * IdentityKeyGenerator - DIP13 Standard Identity Key Generation
 *
 * Generates the 4 required identity keys using WASM SDK HD derivation
 * following the DIP13 standard derivation path:
 * m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
 *
 * Key Types (DIP13):
 * - Key 0: AUTHENTICATION/MASTER (primary authentication key)
 * - Key 1: AUTHENTICATION/HIGH (high-security operations)
 * - Key 2: AUTHENTICATION/CRITICAL (critical operations)
 * - Key 3: TRANSFER/CRITICAL (asset transfer operations)
 */

import { createLogger } from '../utils/identity-logger.js';

const logger = createLogger('IdentityKeyGenerator');

// Declare process for Node.js environment (TypeScript compatibility)
declare const process: { env: { [key: string]: string | undefined } };

export interface IdentityKeyConfig {
  id: number;
  keyIndex: number;
  purpose: 'AUTHENTICATION' | 'TRANSFER';
  securityLevel: 'MASTER' | 'HIGH' | 'CRITICAL';
}

export interface IdentityKey {
  id: number;
  keyType: string;
  purpose: string;
  securityLevel: string;
  privateKeyWif: string; // Private key in WIF format (WASM SDK derives public key internally)
  readOnly: boolean;
}

/**
 * IdentityKeyGenerator handles DIP13-compliant identity key generation
 *
 * This class provides a clean interface for generating the 4 required identity keys
 * using WASM SDK HD derivation.
 *
 * Key Responsibilities:
 * - Generate exactly 4 keys per DIP13 standard
 * - Use WASM SDK HD derivation (m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex')
 * - Validate public key format (33 or 65 bytes)
 * - Return keys in WASM SDK-compatible format
 */
export class IdentityKeyGenerator {
  /**
   * DIP13 standard key configurations
   * These 4 keys are required for every identity
   */
  private static readonly KEY_CONFIGS: IdentityKeyConfig[] = [
    { id: 0, keyIndex: 0, purpose: 'AUTHENTICATION', securityLevel: 'MASTER' },
    { id: 1, keyIndex: 1, purpose: 'AUTHENTICATION', securityLevel: 'HIGH' },
    { id: 2, keyIndex: 2, purpose: 'AUTHENTICATION', securityLevel: 'CRITICAL' },
    { id: 3, keyIndex: 3, purpose: 'TRANSFER', securityLevel: 'CRITICAL' }
  ];

  /**
   * Generate identity keys from mnemonic using DIP13 standard
   * This method uses WASM SDK wallet functions directly, without wallet-lib.
   *
   * DIP13 Identity key derivation path:
   * m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @param identityIndex The identity index to use
   * @param network Network name (testnet/mainnet)
   * @returns Array of 4 identity keys in WASM SDK format
   */
  async generateFromMnemonic(
    mnemonic: string,
    identityIndex: number,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<IdentityKey[]> {
    // Import wallet functions for HD derivation
    const { wallet: walletFunctions } = await import('../../wallet/functions.js');

    const keys: IdentityKey[] = [];
    // DIP13: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
    // coin_type: 1 for testnet, 5 for mainnet
    const coinType = network === 'mainnet' ? 5 : 1;

    // Generate all 4 required keys using DIP13 derivation
    for (const config of IdentityKeyGenerator.KEY_CONFIGS) {
      try {
        // Build DIP13 identity key derivation path
        // Format: m/9'/coin_type'/5'/0'/0'/identityIndex'/keyIndex'
        const path = `m/9'/${coinType}'/5'/0'/0'/${identityIndex}'/${config.keyIndex}'`;

        // Use WASM SDK wallet function to derive key
        const childKey = await walletFunctions.deriveKeyFromSeedWithPath({
          mnemonic,
          passphrase: null,
          path,
          network
        });

        // childKey contains: privateKeyWif, publicKey, etc. (camelCase from WASM)
        const privateKeyWif = childKey.privateKeyWif;
        const publicKeyHex = childKey.publicKey;

        // Validate the public key data
        this.validatePublicKey(publicKeyHex, config.id);

        // CRITICAL: WASM SDK requires privateKeyWif for ECDSA keys
        // It will derive the public key data internally from the private key
        keys.push({
          id: config.id,
          keyType: 'ECDSA_SECP256K1',
          purpose: config.purpose,
          securityLevel: config.securityLevel,
          privateKeyWif: privateKeyWif, // WASM SDK derives public key from this
          readOnly: false
        });

        logger.debug(`Generated identity key ${config.id} (${config.purpose}/${config.securityLevel}): ${publicKeyHex.substring(0, 10)}...`);
      } catch (error) {
        throw new Error(`Failed to generate identity key ${config.id}: ${(error as Error).message}`);
      }
    }

    logger.info(`✅ Successfully generated ${keys.length} DIP13 identity keys for identity index ${identityIndex}`);
    return keys;
  }

  /**
   * Validate public key format and length
   *
   * @param publicKeyHex Public key in hex format
   * @param keyId Key ID for error messages
   * @throws Error if public key is invalid
   */
  private validatePublicKey(publicKeyHex: string, keyId: number): void {
    // Validate hex format
    if (!publicKeyHex || !/^[0-9a-fA-F]+$/.test(publicKeyHex)) {
      throw new Error(`Invalid public key data for key ${keyId}`);
    }

    // Ensure proper length (33 bytes compressed or 65 bytes uncompressed)
    const byteLength = publicKeyHex.length / 2;
    if (byteLength !== 33 && byteLength !== 65) {
      throw new Error(`Invalid public key length for key ${keyId}: ${byteLength} bytes`);
    }
  }

  /**
   * Get the standard DIP13 key configurations
   *
   * @returns Array of key configurations
   */
  static getKeyConfigs(): IdentityKeyConfig[] {
    return IdentityKeyGenerator.KEY_CONFIGS;
  }
}
