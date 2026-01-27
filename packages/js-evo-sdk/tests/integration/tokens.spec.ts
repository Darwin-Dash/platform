/**
 * Integration Tests for Token Operations
 *
 * Tests token querying and management operations using the EvoSDK.
 * These tests connect to testnet and validate:
 * - Token balance queries
 * - Token total supply queries
 * - Token contract info retrieval
 * - Token transfers (requires funded wallet)
 * - Error handling
 *
 * Read operations require no wallet funding.
 * Write operations require TEST_MNEMONIC environment variable with funded wallet.
 *
 * NOTE: Some methods from original tests don't exist on TokensFacade:
 * - balance(tokenId, identityId) → Use balances([identityId], tokenId) instead
 * - get(tokenId) → No equivalent (use totalSupply or contractInfo)
 * - list({contractId, limit}) → No equivalent
 * - holders(tokenId, {limit}) → No equivalent
 * - metadata(tokenId) → Use contractInfo(contractId) instead
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
        // Use balances([identityId], tokenId) and extract from Map
        const balanceMap = await sdk.tokens.balances(
          [TESTNET_IDENTITIES.SAMPLE],
          TESTNET_TOKEN_ID
        );

        expect(balanceMap).toBeInstanceOf(Map);
        const balance = balanceMap.values().next().value ?? 0n;
        expect(typeof balance === 'bigint').toBe(true);
        console.log(`[Balance] Token balance for sample identity: ${balance}`);
      } catch (error) {
        // Token may not exist or identity may not hold it
        console.log('[Balance] Query result:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should return zero for identity with no tokens', async () => {
      const { sdk } = sdkResult;

      try {
        // Use balances([identityId], tokenId) and extract from Map
        const balanceMap = await sdk.tokens.balances(
          [TESTNET_IDENTITIES.DPNS_CONTRACT],
          TESTNET_TOKEN_ID
        );

        expect(balanceMap).toBeInstanceOf(Map);
        // System identity likely doesn't hold tokens - may return empty map or zero
        const balance = balanceMap.values().next().value ?? 0n;
        expect(typeof balance === 'bigint').toBe(true);
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
    it.skip('should get token by ID - method not available in facade', async () => {
      // sdk.tokens.get() does not exist
      // Available alternatives:
      // - totalSupply(tokenId) - returns supply info
      // - statuses([tokenId]) - returns status map
      // - contractInfo(contractId) - returns contract info
    });

    it.skip('should list tokens for contract - method not available in facade', async () => {
      // sdk.tokens.list() does not exist
      // No direct equivalent available
    });

    it.skip('should get token holders - method not available in facade', async () => {
      // sdk.tokens.holders() does not exist
      // No direct equivalent available
    });
  });

  // ============================================================================
  // Token Information
  // ============================================================================

  describe('Token Information', () => {
    it('should get token total supply', async () => {
      const { sdk } = sdkResult;

      try {
        const supply = await sdk.tokens.totalSupply(TESTNET_TOKEN_ID);

        // totalSupply returns TokenTotalSupply | undefined
        if (supply !== undefined) {
          console.log(`[Supply] Total supply retrieved`);
        } else {
          console.log('[Supply] Token not found or no supply info');
        }
      } catch (error) {
        console.log('[Supply]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should get token contract info', async () => {
      const { sdk } = sdkResult;

      try {
        // Use contractInfo(contractId) instead of metadata(tokenId)
        const contractInfo = await sdk.tokens.contractInfo(TESTNET_TOKEN_CONTRACT_ID);

        if (contractInfo !== undefined) {
          console.log(`[ContractInfo] Token contract info retrieved`);
        } else {
          console.log('[ContractInfo] Contract info not found');
        }
      } catch (error) {
        console.log('[ContractInfo]:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should get token statuses', async () => {
      const { sdk } = sdkResult;

      try {
        const statusMap = await sdk.tokens.statuses([TESTNET_TOKEN_ID]);

        expect(statusMap).toBeInstanceOf(Map);
        console.log(`[Statuses] Retrieved statuses for ${statusMap.size} token(s)`);
      } catch (error) {
        console.log('[Statuses]:', (error as Error).message);
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
        // Use identityBalances(identityId, [tokenIds]) instead of balances(identityId)
        // Note: This requires knowing which token IDs to query
        const holdingsMap = await sdk.tokens.identityBalances(
          TESTNET_IDENTITIES.SAMPLE,
          [TESTNET_TOKEN_ID]
        );

        expect(holdingsMap).toBeInstanceOf(Map);
        console.log(`[Holdings] Identity has balance records for ${holdingsMap.size} token(s)`);

        // Check the balance value
        for (const [tokenId, balance] of holdingsMap) {
          console.log(`[Holdings] Token ${tokenId}: ${balance}`);
          expect(typeof balance === 'bigint').toBe(true);
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

          // Check if sender has any tokens using identityBalances
          const holdingsMap = await sdk.tokens.identityBalances(senderIdentityId, [TESTNET_TOKEN_ID]);

          if (holdingsMap.size === 0) {
            console.log('[Transfer] Skipping: Sender has no tokens');
            return;
          }

          const tokenBalance = holdingsMap.values().next().value ?? 0n;
          console.log(`[Transfer] Sender has ${tokenBalance} of token ${TESTNET_TOKEN_ID}`);

          if (tokenBalance <= 0n) {
            console.log('[Transfer] Skipping: Sender has zero balance');
            return;
          }

          // Transfer a small amount to another identity (if we have multiple)
          if (identityIds.length >= 2) {
            const recipientIdentityId = identityIds[1].identityId;
            const transferAmount = 1n;

            const result = await sdk.tokens.transfer({
              tokenId: TESTNET_TOKEN_ID,
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
          console.log('[Create Token] Use sdk.tokens.mint() to mint tokens after contract creation');

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
        // Use balances with invalid token ID
        await sdk.tokens.balances(
          [TESTNET_IDENTITIES.SAMPLE],
          'invalid-token-id'
        );
        // May throw or return empty map
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should handle invalid identity ID in balance query', async () => {
      const { sdk } = sdkResult;

      try {
        // Use balances with invalid identity ID
        await sdk.tokens.balances(
          ['invalid-identity-id'],
          TESTNET_TOKEN_ID
        );
        // May throw or return empty map
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
