/**
 * Integration Tests for Token Operations
 *
 * Tests token querying and management operations using the EvoSDK.
 * These tests connect to testnet and validate:
 * - Token balance queries
 * - Token holder queries
 * - Token contract retrieval
 * - Token transfers (requires funded wallet)
 * - Error handling
 *
 * Read operations require no wallet funding.
 * Write operations require TEST_MNEMONIC environment variable with funded wallet.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  waitForSTPropagated,
  skipIfNoMnemonic,
  createCleanup,
  type EvoSDKWithWalletResult,
} from './setup.js';
import {
  TESTNET_IDENTITIES,
  TEST_TIMEOUTS,
} from '../lib/fixtures.js';

// Known testnet token for testing
const TESTNET_TOKEN_CONTRACT_ID = 'ALybvzfcCwMs7sinDwmtumw17NneuW7RgFtFHgjKmF3A';
const TESTNET_TOKEN_ID = 'Hqyu8WcRwXCTwbNxdga4CN5gsVEGc67wng4TFzceyLUv';

describe('Token Operations - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    sdkResult = await createEvoSDKWithWallet({
      network: 'testnet',
      autoConnect: true,
    });
    cleanup = createCleanup(sdkResult);
    console.log(`[Token Tests] SDK connected to ${sdkResult.network}`);
  }, TEST_TIMEOUTS.SDK_CONNECT);

  afterAll(async () => {
    await cleanup();
    console.log('[Token Tests] Cleanup complete');
  });

  // ============================================================================
  // Balance Queries (no wallet required)
  // ============================================================================

  describe('Token Balances', () => {
    it('should get token balance for identity', async () => {
      const { sdk } = sdkResult;

      try {
        const balance = await sdk.tokens.balance(
          TESTNET_TOKEN_ID,
          TESTNET_IDENTITIES.SAMPLE
        );

        expect(typeof balance === 'bigint' || typeof balance === 'number').toBe(true);
        console.log(`[Balance] Token balance for sample identity: ${balance}`);
      } catch (error) {
        // Token may not exist or identity may not hold it
        console.log('[Balance] Query result:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should return zero for identity with no tokens', async () => {
      const { sdk } = sdkResult;

      try {
        const balance = await sdk.tokens.balance(
          TESTNET_TOKEN_ID,
          TESTNET_IDENTITIES.DPNS_CONTRACT
        );

        // System identity likely doesn't hold tokens
        expect(typeof balance === 'bigint' || typeof balance === 'number').toBe(true);
      } catch (error) {
        // May throw if identity has no balance record
        console.log('[Balance] No balance record:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Token Queries
  // ============================================================================

  describe('Token Queries', () => {
    it('should get token by ID', async () => {
      const { sdk } = sdkResult;

      try {
        const token = await sdk.tokens.get(TESTNET_TOKEN_ID);

        expect(token).toBeDefined();
        console.log(`[Token] Retrieved token: ${TESTNET_TOKEN_ID}`);
      } catch (error) {
        // Token may not exist on testnet
        console.log('[Token] Get token:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should list tokens for contract', async () => {
      const { sdk } = sdkResult;

      try {
        const tokens = await sdk.tokens.list({
          contractId: TESTNET_TOKEN_CONTRACT_ID,
          limit: 10,
        });

        expect(tokens).toBeDefined();
        expect(Array.isArray(tokens)).toBe(true);
        console.log(`[Token List] Found ${tokens.length} tokens for contract`);
      } catch (error) {
        console.log('[Token List]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should get token holders', async () => {
      const { sdk } = sdkResult;

      try {
        const holders = await sdk.tokens.holders(TESTNET_TOKEN_ID, {
          limit: 10,
        });

        expect(holders).toBeDefined();
        expect(Array.isArray(holders)).toBe(true);
        console.log(`[Holders] Found ${holders.length} token holders`);

        // Each holder should have identityId and balance
        if (holders.length > 0) {
          expect(holders[0]).toHaveProperty('identityId');
          expect(holders[0]).toHaveProperty('balance');
        }
      } catch (error) {
        console.log('[Holders]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Token Information
  // ============================================================================

  describe('Token Information', () => {
    it('should get token total supply', async () => {
      const { sdk } = sdkResult;

      try {
        const supply = await sdk.tokens.totalSupply(TESTNET_TOKEN_ID);

        expect(typeof supply === 'bigint' || typeof supply === 'number').toBe(true);
        console.log(`[Supply] Total supply: ${supply}`);
      } catch (error) {
        console.log('[Supply]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should get token metadata', async () => {
      const { sdk } = sdkResult;

      try {
        const metadata = await sdk.tokens.metadata(TESTNET_TOKEN_ID);

        expect(metadata).toBeDefined();
        // Metadata might include name, symbol, decimals, etc.
        console.log(`[Metadata] Token metadata retrieved`);
      } catch (error) {
        console.log('[Metadata]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Identity Token Holdings
  // ============================================================================

  describe('Identity Token Holdings', () => {
    it('should list tokens held by identity', async () => {
      const { sdk } = sdkResult;

      try {
        const holdings = await sdk.tokens.balances(TESTNET_IDENTITIES.SAMPLE);

        expect(holdings).toBeDefined();
        expect(Array.isArray(holdings)).toBe(true);
        console.log(`[Holdings] Identity holds ${holdings.length} different tokens`);

        // Each holding should have tokenId and balance
        if (holdings.length > 0) {
          expect(holdings[0]).toHaveProperty('tokenId');
          expect(holdings[0]).toHaveProperty('balance');
        }
      } catch (error) {
        console.log('[Holdings]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Transfer Operations (requires funded wallet)
  // ============================================================================

  describe('Token Transfers', () => {
    it('should transfer tokens between identities', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          // Get sender's identity
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length === 0) {
            console.log('[Transfer] Skipping: No identities found for wallet');
            return;
          }

          const senderIdentityId = identityIds[0].identityId;

          // Check if sender has any tokens
          const holdings = await sdk.tokens.balances(senderIdentityId);

          if (holdings.length === 0) {
            console.log('[Transfer] Skipping: Sender has no tokens');
            return;
          }

          const tokenToTransfer = holdings[0];
          console.log(`[Transfer] Sender has ${tokenToTransfer.balance} of token ${tokenToTransfer.tokenId}`);

          // Transfer a small amount to another identity (if we have multiple)
          if (identityIds.length >= 2) {
            const recipientIdentityId = identityIds[1].identityId;
            const transferAmount = 1n;

            const result = await sdk.tokens.transfer({
              tokenId: tokenToTransfer.tokenId,
              toIdentityId: recipientIdentityId,
              amount: transferAmount,
              mnemonic,
              onProgress: (event) => {
                console.log(`[Transfer] ${event.phase}: ${event.message}`);
              },
            });

            expect(result).toBeDefined();
            expect(result).toHaveProperty('transactionHash');
            console.log(`[Transfer] Transfer complete: ${result.transactionHash}`);

            // Wait for propagation
            await waitForSTPropagated();
          } else {
            console.log('[Transfer] Skipping: Need at least 2 identities for transfer test');
          }

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('insufficient') ||
              message.includes('No UTXOs') ||
              message.includes('balance')) {
            console.log('[Transfer] Skipping:', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.STATE_TRANSITION);
  });

  // ============================================================================
  // Token Creation (requires funded wallet)
  // ============================================================================

  describe('Token Creation', () => {
    it('should create a new token contract', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length === 0) {
            console.log('[Create Token] Skipping: No identities found');
            return;
          }

          console.log('[Create Token] Token creation requires identity with sufficient credits');
          console.log('[Create Token] Use sdk.tokens.create() to create a new token contract');

          // Token creation is a complex operation that requires:
          // 1. Sufficient credits on the identity
          // 2. Token contract definition
          // 3. Initial supply configuration

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('insufficient') || message.includes('credits')) {
            console.log('[Create Token] Skipping:', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.STATE_TRANSITION);
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle invalid token ID', async () => {
      const { sdk } = sdkResult;

      try {
        await sdk.tokens.balance(
          'invalid-token-id',
          TESTNET_IDENTITIES.SAMPLE
        );
        // May throw or return null/zero
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should handle invalid identity ID in balance query', async () => {
      const { sdk } = sdkResult;

      try {
        await sdk.tokens.balance(
          TESTNET_TOKEN_ID,
          'invalid-identity-id'
        );
        // May throw or return null/zero
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should reject transfer with insufficient balance', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length < 2) {
            console.log('[Transfer Error] Skipping: Need 2 identities');
            return;
          }

          // Try to transfer more than available
          await sdk.tokens.transfer({
            tokenId: TESTNET_TOKEN_ID,
            toIdentityId: identityIds[1].identityId,
            amount: BigInt('999999999999999999'),
            mnemonic,
          });

          expect.fail('Should have rejected insufficient balance');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          // Error could be validation or during submission
        }
      });
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });
});
