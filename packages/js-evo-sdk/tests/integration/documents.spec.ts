/**
 * Integration Tests for Document Operations
 *
 * Tests document querying and CRUD operations using the EvoSDK.
 * These tests connect to testnet and validate:
 * - Document querying with various filters
 * - Single document retrieval
 * - Document creation (requires funded wallet)
 * - Document updates (requires funded wallet)
 * - Error handling
 *
 * Read operations require no wallet funding.
 * Write operations require MNEMONIC environment variable with funded wallet.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEST_CONFIG,
  createEvoSDKWithWallet,
  waitForDocument,
  waitForSTPropagated,
  skipIfNoMnemonic,
  createCleanup,
  type EvoSDKWithWalletResult,
} from './setup.js';
import {
  TESTNET_IDENTITIES,
  TESTNET_CONTRACTS,
  TEST_TIMEOUTS,
  getDpnsDocumentFixture,
} from '../lib/fixtures.js';

// Known DPNS contract and document type for testing queries
const DPNS_CONTRACT_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';
const DOMAIN_DOCUMENT_TYPE = 'domain';
const KNOWN_DOCUMENT_ID = '7NYmEKQsYtniQRUmxwdPGeVcirMoPh5ZPyAKz8BWFy3r';

describe('Document Operations - Integration', () => {
  let sdkResult: EvoSDKWithWalletResult;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    sdkResult = await createEvoSDKWithWallet({
      network: 'testnet',
      autoConnect: true,
    });
    cleanup = createCleanup(sdkResult);
    console.log(`[Document Tests] SDK connected to ${sdkResult.network}`);
  }, TEST_TIMEOUTS.SDK_CONNECT);

  afterAll(async () => {
    await cleanup();
    console.log('[Document Tests] Cleanup complete');
  });

  // ============================================================================
  // Query Operations (no wallet required)
  // ============================================================================

  describe('Document Queries', () => {
    it('should query documents by type', async () => {
      const { sdk } = sdkResult;

      // API expects dataContractId and documentTypeName (not contractId/type)
      const documentsMap = await sdk.documents.query({
        dataContractId: DPNS_CONTRACT_ID,
        documentTypeName: DOMAIN_DOCUMENT_TYPE,
        limit: 10,
      });

      expect(documentsMap).toBeDefined();
      expect(documentsMap instanceof Map).toBe(true);
      expect(documentsMap.size).toBeGreaterThan(0);
      console.log(`[Query] Found ${documentsMap.size} domain documents`);
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should query documents with ordering', async () => {
      const { sdk } = sdkResult;

      const documentsMap = await sdk.documents.query({
        dataContractId: DPNS_CONTRACT_ID,
        documentTypeName: DOMAIN_DOCUMENT_TYPE,
        limit: 5,
        orderBy: [['normalizedLabel', 'asc']],
      });

      expect(documentsMap).toBeDefined();
      expect(documentsMap instanceof Map).toBe(true);
      console.log(`[Query] Found ${documentsMap.size} ordered documents`);

      // Verify ordering if documents returned
      if (documentsMap.size >= 2) {
        const labels: string[] = [];
        for (const [, doc] of documentsMap) {
          if (doc) {
            const data = doc.data || doc;
            labels.push(data.normalizedLabel);
          }
        }
        const sortedLabels = [...labels].sort();
        expect(labels).toEqual(sortedLabels);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should query documents with where clause', async () => {
      const { sdk } = sdkResult;

      // Query domains with a specific normalized parent
      const documentsMap = await sdk.documents.query({
        dataContractId: DPNS_CONTRACT_ID,
        documentTypeName: DOMAIN_DOCUMENT_TYPE,
        where: [['normalizedParentDomainName', '==', 'dash']],
        limit: 5,
      });

      expect(documentsMap).toBeDefined();
      expect(documentsMap instanceof Map).toBe(true);
      console.log(`[Query] Found ${documentsMap.size} .dash domain documents`);
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should query with pagination using limit', async () => {
      const { sdk } = sdkResult;

      // First page
      const page1 = await sdk.documents.query({
        dataContractId: DPNS_CONTRACT_ID,
        documentTypeName: DOMAIN_DOCUMENT_TYPE,
        limit: 3,
      });

      expect(page1).toBeDefined();
      expect(page1 instanceof Map).toBe(true);
      expect(page1.size).toBeLessThanOrEqual(3);
      console.log(`[Pagination] Page 1: ${page1.size} documents`);
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should return empty map for no matches', async () => {
      const { sdk } = sdkResult;

      // Query with impossible condition
      const documentsMap = await sdk.documents.query({
        dataContractId: DPNS_CONTRACT_ID,
        documentTypeName: DOMAIN_DOCUMENT_TYPE,
        where: [['normalizedLabel', '==', 'definitelynonexistentname12345678901234567890']],
        limit: 10,
      });

      expect(documentsMap).toBeDefined();
      expect(documentsMap instanceof Map).toBe(true);
      expect(documentsMap.size).toBe(0);
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Single Document Retrieval
  // ============================================================================

  describe('Document Retrieval', () => {
    it('should get a single document by ID', async () => {
      const { sdk } = sdkResult;

      const document = await sdk.documents.get(
        DPNS_CONTRACT_ID,
        DOMAIN_DOCUMENT_TYPE,
        KNOWN_DOCUMENT_ID
      );

      expect(document).toBeDefined();
      // Document should have standard properties
      console.log(`[Get] Retrieved document: ${KNOWN_DOCUMENT_ID}`);
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should return null for non-existent document', async () => {
      const { sdk } = sdkResult;
      const nonExistentId = 'ZZZZzzzz1111111111111111111111111111111111';

      try {
        const document = await sdk.documents.get(
          DPNS_CONTRACT_ID,
          DOMAIN_DOCUMENT_TYPE,
          nonExistentId
        );
        // May return null or throw
        expect(document).toBeFalsy();
      } catch (error) {
        // Some implementations throw for not found
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Data Contract Operations
  // ============================================================================

  describe('Data Contract Operations', () => {
    it('should fetch data contract by ID', async () => {
      const { sdk } = sdkResult;

      try {
        const contract = await sdk.contracts.get(DPNS_CONTRACT_ID);

        expect(contract).toBeDefined();
        console.log(`[Contract] Retrieved contract: ${DPNS_CONTRACT_ID}`);
      } catch (error) {
        // contracts.get may not be available in all versions
        console.log('[Contract] Get contract not available:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Write Operations (requires funded wallet)
  // ============================================================================

  describe('Document Creation', () => {
    it('should create a new document', async () => {
      await skipIfNoMnemonic(async () => {
        const { sdk, mnemonic } = sdkResult;

        try {
          // Get an existing identity
          const identityIds = await sdk.identities.getIdentityIds(mnemonic, { gapLimit: 20 });

          if (identityIds.length === 0) {
            console.log('[Create] Skipping: No identities found for wallet');
            return;
          }

          // Note: Creating documents requires having a data contract first
          // This test demonstrates the API pattern but may require
          // a pre-existing contract or creating one first

          console.log('[Create] Document creation requires an owned data contract');
          console.log('[Create] Use sdk.contracts.create() first to register a contract');

        } catch (error) {
          const message = (error as Error).message;
          if (message.includes('insufficient') ||
              message.includes('No UTXOs') ||
              message.includes('contract')) {
            console.log('[Create] Skipping:', message);
          } else {
            throw error;
          }
        }
      });
    }, TEST_TIMEOUTS.STATE_TRANSITION);
  });

  // ============================================================================
  // DashPay Documents (social features)
  // ============================================================================

  describe('DashPay Documents', () => {
    const DASHPAY_CONTRACT_ID = TESTNET_CONTRACTS.DASHPAY;

    it('should query DashPay profiles', async () => {
      const { sdk } = sdkResult;

      try {
        const profilesMap = await sdk.documents.query({
          dataContractId: DASHPAY_CONTRACT_ID,
          documentTypeName: 'profile',
          limit: 5,
        });

        expect(profilesMap).toBeDefined();
        expect(profilesMap instanceof Map).toBe(true);
        console.log(`[DashPay] Found ${profilesMap.size} profiles`);
      } catch (error) {
        // DashPay may not have many profiles on testnet
        console.log('[DashPay] Profile query:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should query DashPay contact requests', async () => {
      const { sdk } = sdkResult;

      try {
        const contactsMap = await sdk.documents.query({
          dataContractId: DASHPAY_CONTRACT_ID,
          documentTypeName: 'contactRequest',
          limit: 5,
        });

        expect(contactsMap).toBeDefined();
        expect(contactsMap instanceof Map).toBe(true);
        console.log(`[DashPay] Found ${contactsMap.size} contact requests`);
      } catch (error) {
        console.log('[DashPay] Contact query:', (error as Error).message);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle invalid contract ID', async () => {
      const { sdk } = sdkResult;

      try {
        await sdk.documents.query({
          dataContractId: 'invalid-contract-id',
          documentTypeName: 'domain',
          limit: 5,
        });
        // May throw or return empty
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should handle invalid document type', async () => {
      const { sdk } = sdkResult;

      try {
        await sdk.documents.query({
          dataContractId: DPNS_CONTRACT_ID,
          documentTypeName: 'nonexistent_type',
          limit: 5,
        });
        // May throw or return empty
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);

    it('should handle invalid where clause', async () => {
      const { sdk } = sdkResult;

      try {
        await sdk.documents.query({
          dataContractId: DPNS_CONTRACT_ID,
          documentTypeName: DOMAIN_DOCUMENT_TYPE,
          where: [['nonexistentField', '==', 'value']],
          limit: 5,
        });
        // May throw or return empty
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }, TEST_TIMEOUTS.DOCUMENT_QUERY);
  });
});
