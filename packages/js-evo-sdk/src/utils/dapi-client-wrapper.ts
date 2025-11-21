/**
 * DAPI Client Wrapper - Bypasses WASM for read operations via gRPC
 *
 * The DAPI Client queries the Dash Platform via gRPC without using WASM,
 * allowing concurrent reads while WASM operations are queued for serialization.
 *
 * Architecture:
 * - Lazy-loads DAPI client on first use
 * - Derives public key hashes from mnemonics
 * - Queries identities via gRPC without WASM
 * - Returns identity data directly from Platform
 *
 * Usage:
 * ```typescript
 * import { dapiClientWrapper } from './utils/dapi-client-wrapper.js';
 *
 * const identities = await dapiClientWrapper.getIdentitiesForMnemonic(mnemonic);
 * ```
 */

import type { DAPIClient } from '@dashevo/dapi-client';

interface DerivedIdentity {
  identityId: string;
  publicKeyHash: string;
  keyIndex: number;
}

export class DAPIClientWrapper {
  private dapiClient: DAPIClient | null = null;
  private network: 'testnet' | 'mainnet' = 'testnet';
  private initialized = false;

  /**
   * Initialize the DAPI client
   * @param network Network to connect to (testnet or mainnet)
   */
  async initialize(network: 'testnet' | 'mainnet' = 'testnet'): Promise<void> {
    if (this.initialized && this.network === network) {
      return; // Already initialized for this network
    }

    try {
      // Lazy load DAPI Client
      const { DAPIClient } = await import('@dashevo/dapi-client');

      // Create DAPI client with appropriate network configuration
      if (network === 'mainnet') {
        this.dapiClient = new DAPIClient({
          network: 'mainnet',
        });
      } else {
        this.dapiClient = new DAPIClient({
          network: 'testnet',
        });
      }

      this.network = network;
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize DAPI Client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the DAPI client, initializing if necessary
   */
  private async getClient(): Promise<DAPIClient> {
    if (!this.dapiClient) {
      await this.initialize(this.network);
    }
    return this.dapiClient!;
  }

  /**
   * Derive public key hashes from a mnemonic
   *
   * Uses BIP32/BIP44 derivation to generate identity keys from mnemonic.
   * For POC, we assume keys are at standard Dash identity paths.
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @returns Array of derived identity data
   */
  async deriveIdentityKeysFromMnemonic(mnemonic: string): Promise<DerivedIdentity[]> {
    try {
      // Import wallet derivation utilities (dynamic import for lazy loading)
      const dashcoreLib = await import('@dashevo/dashcore-lib');
      // dashcore-lib exports are on the module itself, not .default
      const Mnemonic = (dashcoreLib as any).Mnemonic;

      // Create HD wallet from mnemonic
      const mnemonicObj = new Mnemonic(mnemonic);
      const wallet = mnemonicObj.toHDPrivateKey();

      // Derive standard Dash identity key paths (simplified for POC)
      const derivedKeys: DerivedIdentity[] = [];

      // For POC: derive first 5 identity keys from m/44'/5'/0'/0/index
      for (let i = 0; i < 5; i++) {
        try {
          const path = `m/44'/5'/0'/0/${i}`;
          const key = wallet.derive(path);
          const publicKey = key.publicKey;

          // Get public key hash (hash160 of public key)
          // Use the hash160 utility function from dashcore-lib
          const crypto = require('crypto');
          const publicKeyBuffer = publicKey.toBuffer ? publicKey.toBuffer() : Buffer.from(publicKey);
          const hash160 = crypto
            .createHash('ripemd160')
            .update(crypto.createHash('sha256').update(publicKeyBuffer).digest())
            .digest('hex');

          derivedKeys.push({
            identityId: '', // Will be populated by query
            publicKeyHash: hash160,
            keyIndex: i,
          });
        } catch (keyError) {
          // Skip problematic key derivations
          continue;
        }
      }

      return derivedKeys;
    } catch (error) {
      throw new Error(`Failed to derive identity keys from mnemonic: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Query identities by public key hash via DAPI
   *
   * @param publicKeyHash 20-byte hash (40 hex chars)
   * @returns Identity ID if found, null otherwise
   */
  async queryIdentityByPublicKeyHash(publicKeyHash: string): Promise<string | null> {
    try {
      const client = await this.getClient();

      // Query DPNS contract for identity link (simplified for POC)
      // In production, this would query the actual identity index
      const response = await client.getIdentities(publicKeyHash);

      if (response && response.identities && response.identities.length > 0) {
        return response.identities[0];
      }

      return null;
    } catch (error) {
      // Identity not found is not an error
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      throw new Error(`Failed to query identity: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all identities for a given mnemonic
   *
   * Derives keys from mnemonic, then queries DAPI for each public key hash.
   * This operation bypasses WASM entirely.
   *
   * @param mnemonic 12-word BIP39 mnemonic
   * @returns Array of discovered identities with public key info
   */
  async getIdentitiesForMnemonic(
    mnemonic: string
  ): Promise<Array<{ identityId: string; publicKeyHash: string; keyIndex: number }>> {
    try {
      // Derive keys from mnemonic
      const derivedKeys = await this.deriveIdentityKeysFromMnemonic(mnemonic);

      // Query each public key hash via DAPI (concurrent, no WASM)
      const results = await Promise.all(
        derivedKeys.map(async (key) => {
          try {
            const identityId = await this.queryIdentityByPublicKeyHash(key.publicKeyHash);
            return identityId ? { ...key, identityId } : null;
          } catch {
            return null;
          }
        })
      );

      // Filter out nulls and return found identities
      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    } catch (error) {
      throw new Error(`Failed to get identities for mnemonic: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Batch query identities by public key hashes
   *
   * @param publicKeyHashes Array of public key hashes
   * @returns Array of identity IDs (null if not found)
   */
  async queryIdentitiesByPublicKeyHashBatch(publicKeyHashes: string[]): Promise<(string | null)[]> {
    try {
      return await Promise.all(
        publicKeyHashes.map((hash) =>
          this.queryIdentityByPublicKeyHash(hash).catch(() => null)
        )
      );
    } catch (error) {
      throw new Error(`Failed to batch query identities: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Close the DAPI client connection
   */
  async close(): Promise<void> {
    if (this.dapiClient) {
      try {
        // DAPI Client doesn't have explicit close, but we reset state
        this.dapiClient = null;
        this.initialized = false;
      } catch (error) {
        throw new Error(`Failed to close DAPI client: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Get client status
   */
  getStatus(): {
    initialized: boolean;
    network: 'testnet' | 'mainnet';
  } {
    return {
      initialized: this.initialized,
      network: this.network,
    };
  }
}

/**
 * Singleton instance of the DAPI client wrapper
 * Use this throughout the SDK for DAPI read operations
 */
export const dapiClientWrapper = new DAPIClientWrapper();

export default dapiClientWrapper;
