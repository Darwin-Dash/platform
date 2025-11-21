/**
 * IdentityKeyGenerator - DIP13 Standard Identity Key Generation
 *
 * Generates the 4 required identity keys using wallet-lib's HD derivation
 * following the DIP13 standard derivation path:
 * m/9'/network'/5'/0'/0'/identityIndex'/keyIndex'
 *
 * Key Types (DIP13):
 * - Key 0: AUTHENTICATION/MASTER (primary authentication key)
 * - Key 1: AUTHENTICATION/HIGH (high-security operations)
 * - Key 2: AUTHENTICATION/CRITICAL (critical operations)
 * - Key 3: TRANSFER/CRITICAL (asset transfer operations)
 */

import { createLogger } from '../utils/identity-logger.js';
import type { WalletAccount } from '../types/wallet-types.js';

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
 * This class extracts key generation logic from createWithWallet(),
 * providing a clean interface for generating the 4 required identity keys
 * using wallet-lib's HD derivation.
 *
 * Key Responsibilities:
 * - Generate exactly 4 keys per DIP13 standard
 * - Use wallet-lib's identity HD derivation (m/9'/network'/5'/0'/0'/identityIndex'/keyIndex')
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
   * Generate identity keys from wallet account using DIP13 standard
   *
   * @param freshAccount wallet-lib account with identity support
   * @param identityIndex The identity index to use (from getUnusedIdentityIndex())
   * @returns Array of 4 identity keys in WASM SDK format
   */
  async generateFromWallet(freshAccount: WalletAccount, identityIndex: number): Promise<IdentityKey[]> {
    // Validate account has identity support
    if (!freshAccount.identities || !freshAccount.identities.getIdentityHDKeyByIndex) {
      throw new Error('Account does not support identity HD key derivation. Ensure identities are enabled.');
    }

    const keys: IdentityKey[] = [];

    // Generate all 4 required keys using DIP13 derivation
    for (const config of IdentityKeyGenerator.KEY_CONFIGS) {
      try {
        // Use wallet-lib's identity HD derivation (DIP13 standard)
        // Path: m/9'/network'/5'/0'/0'/identityIndex'/keyIndex'
        const hdKey = freshAccount.identities.getIdentityHDKeyByIndex(identityIndex, config.keyIndex);

        // Get both private and public keys
        const privateKey = hdKey.privateKey;
        const publicKey = privateKey.toPublicKey();

        // Convert keys to required formats
        const publicKeyHex = publicKey.toBuffer().toString('hex');
        const privateKeyWif = privateKey.toWIF();

        // Validate the public key data
        this.validatePublicKey(publicKeyHex, config.id);

        // CRITICAL: WASM SDK requires privateKeyWif for ECDSA keys
        // It will derive the public key data internally from the private key
        keys.push({
          id: config.id,
          keyType: 'ECDSA_SECP256K1',
          purpose: config.purpose,
          securityLevel: config.securityLevel,
          privateKeyWif: privateKeyWif,  // WASM SDK derives public key from this
          readOnly: false
        });

        logger.debug(`Generated identity key ${config.id} (${config.purpose}/${config.securityLevel}): ${publicKeyHex.substring(0, 10)}...`);
      } catch (error) {
        throw new Error(`Failed to generate identity key ${config.id}: ${(error as Error).message}`);
      }
    }

    logger.info(`✅ Successfully generated ${keys.length} HD-derived identity keys for identity index ${identityIndex}`);
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
