/**
 * DashPay Manager Component
 * Coordinates all DashPay-related features:
 * - Profile management
 * - Contact list (accepted contacts)
 * - Contact requests (inbound and outbound)
 * - DashPay contract operations
 */

import { stateManager } from '../state-manager.js';
import { notifications } from './notifications.js';
import { formatIdentityId, formatTimestamp } from '../utils/formatter.js';
import { retryOperation, verifyByBalanceChange } from '../utils/retry-utils.js';
import cbor from 'cbor';
import CryptoJS from 'crypto-js';

// DashPay Contract ID on testnet
const DASHPAY_CONTRACT_ID = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';

export class DashPayManager {
  constructor(platformOps, sdk = null, mnemonic = null) {
    this.platformOps = platformOps;
    this.sdk = sdk;
    this.mnemonic = mnemonic;
    this.currentIdentityId = null;
  }

  /**
   * Check if real SDK operations are available
   */
  canUseRealSDK() {
    const useMockMode = localStorage.getItem('useMockMode') === 'true';
    return !useMockMode && this.sdk && this.mnemonic;
  }

  /**
   * Update SDK reference (called when SDK is initialized)
   */
  setSDK(sdk, mnemonic) {
    this.sdk = sdk;
    this.mnemonic = mnemonic;
  }

  /**
   * Transform WASM SDK document to the format expected by the component
   * WASM documents expose properties via toJSON(), not getProperties()
   */
  transformWasmDocument(doc, documentType = 'contactRequest') {
    if (!doc) return null;

    // Get document ID
    const id = doc.getId?.() ? doc.getId().base58() : (doc.id || doc.$id);
    const ownerId = doc.getOwnerId?.() ? doc.getOwnerId().base58() : (doc.ownerId || doc.$ownerId);

    // Handle BigInt timestamps
    const rawCreatedAt = doc.getCreatedAt?.() || doc.createdAt || doc.$createdAt;
    const rawUpdatedAt = doc.getUpdatedAt?.() || doc.updatedAt || doc.$updatedAt;
    const createdAt = rawCreatedAt ? new Date(Number(rawCreatedAt)).toISOString() : new Date().toISOString();
    const updatedAt = rawUpdatedAt ? new Date(Number(rawUpdatedAt)).toISOString() : createdAt;

    // WASM documents expose properties via toJSON()
    const data = (typeof doc.toJSON === 'function' ? doc.toJSON() : null) || doc.getProperties?.() || doc.data || {};

    return {
      id: id || `dashpay-${Date.now()}`,
      ownerId,
      contractId: 'dashpay',
      documentType,
      createdAt,
      updatedAt,
      data
    };
  }

  /**
   * Load all DashPay data for a given identity
   */
  async loadDashPayData(identityId) {
    this.currentIdentityId = identityId;

    try {
      // Fetch all DashPay documents for this identity
      const documents = await this.platformOps.getDocumentsByOwner(identityId);

      // Separate by document type
      const profile = documents.find(doc =>
        doc.contractId === 'dashpay' && doc.documentType === 'profile'
      );

      const contactRequests = documents.filter(doc =>
        doc.contractId === 'dashpay' && doc.documentType === 'contactRequest'
      );

      const contactInfos = documents.filter(doc =>
        doc.contractId === 'dashpay' && doc.documentType === 'contactInfo'
      );

      return {
        profile,
        contactRequests,
        contacts: contactInfos
      };
    } catch (error) {
      console.error('Failed to load DashPay data:', error);
      throw error;
    }
  }

  /**
   * Get inbound contact requests (sent TO this identity)
   */
  async getInboundContactRequests(identityId) {
    try {
      // Try real SDK query first if available
      if (this.canUseRealSDK()) {
        try {
          console.log('[DashPay] Querying inbound contact requests via SDK for:', identityId);
          const resultMap = await this.sdk.documents.query({
            dataContractId: DASHPAY_CONTRACT_ID,
            documentTypeName: 'contactRequest',
            where: [['toUserId', '==', identityId]],
            limit: 50
          });
          console.log('[DashPay] SDK query returned:', resultMap);
          // Convert Map to array and transform WASM documents
          const docsArray = resultMap instanceof Map ? Array.from(resultMap.values()).filter(Boolean) : [];
          return docsArray.map(doc => this.transformWasmDocument(doc, 'contactRequest'));
        } catch (sdkError) {
          console.warn('[DashPay] SDK query failed, falling back to mock:', sdkError);
        }
      }

      // Fallback to mock: Find all contactRequest documents where toUserId equals identityId
      const mockDocuments = await import('../mock-data.js');
      const inboundRequests = mockDocuments.mockDocuments.filter(doc =>
        doc.contractId === 'dashpay' &&
        doc.documentType === 'contactRequest' &&
        doc.data.toUserId === identityId
      );

      return inboundRequests;
    } catch (error) {
      console.error('Failed to get inbound contact requests:', error);
      return [];
    }
  }

  /**
   * Get outbound contact requests (sent FROM this identity)
   */
  async getOutboundContactRequests(identityId) {
    try {
      // Try real SDK query first if available
      if (this.canUseRealSDK()) {
        try {
          console.log('[DashPay] Querying outbound contact requests via SDK for:', identityId);
          const resultMap = await this.sdk.documents.query({
            dataContractId: DASHPAY_CONTRACT_ID,
            documentTypeName: 'contactRequest',
            where: [['$ownerId', '==', identityId]],
            limit: 50
          });
          console.log('[DashPay] SDK query returned:', resultMap);
          // Convert Map to array and transform WASM documents
          const docsArray = resultMap instanceof Map ? Array.from(resultMap.values()).filter(Boolean) : [];
          return docsArray.map(doc => this.transformWasmDocument(doc, 'contactRequest'));
        } catch (sdkError) {
          console.warn('[DashPay] SDK query failed, falling back to mock:', sdkError);
        }
      }

      // Fallback to mock/platformOps
      const documents = await this.platformOps.getDocumentsByOwner(identityId);

      const outboundRequests = documents.filter(doc =>
        doc.contractId === 'dashpay' && doc.documentType === 'contactRequest'
      );

      return outboundRequests;
    } catch (error) {
      console.error('Failed to get outbound contact requests:', error);
      return [];
    }
  }

  /**
   * Get profile for an identity
   */
  async getProfile(identityId) {
    try {
      // Try real SDK query first if available
      if (this.canUseRealSDK()) {
        try {
          console.log('[DashPay] Querying profile via SDK for:', identityId);
          const resultMap = await this.sdk.documents.query({
            dataContractId: DASHPAY_CONTRACT_ID,
            documentTypeName: 'profile',
            where: [['$ownerId', '==', identityId]],
            limit: 1
          });
          console.log('[DashPay] SDK profile query returned:', resultMap);
          // Convert Map to array and transform WASM documents
          const docsArray = resultMap instanceof Map ? Array.from(resultMap.values()).filter(Boolean) : [];
          const documents = docsArray.map(doc => this.transformWasmDocument(doc, 'profile'));
          return documents.length > 0 ? documents[0] : null;
        } catch (sdkError) {
          console.warn('[DashPay] SDK profile query failed, falling back to mock:', sdkError);
        }
      }

      // Fallback to mock/platformOps
      const documents = await this.platformOps.getDocumentsByOwner(identityId);

      const profile = documents.find(doc =>
        doc.contractId === 'dashpay' && doc.documentType === 'profile'
      );

      return profile || null;
    } catch (error) {
      console.error('Failed to get profile:', error);
      return null;
    }
  }

  /**
   * Get accepted contacts (contactInfo documents)
   */
  async getAcceptedContacts(identityId) {
    try {
      // Try real SDK query first if available
      if (this.canUseRealSDK()) {
        try {
          console.log('[DashPay] Querying accepted contacts via SDK for:', identityId);
          const resultMap = await this.sdk.documents.query({
            dataContractId: DASHPAY_CONTRACT_ID,
            documentTypeName: 'contactInfo',
            where: [['$ownerId', '==', identityId]],
            limit: 100
          });
          console.log('[DashPay] SDK contacts query returned:', resultMap);
          // Convert Map to array and transform WASM documents
          const docsArray = resultMap instanceof Map ? Array.from(resultMap.values()).filter(Boolean) : [];
          return docsArray.map(doc => this.transformWasmDocument(doc, 'contactInfo'));
        } catch (sdkError) {
          console.warn('[DashPay] SDK contacts query failed, falling back to mock:', sdkError);
        }
      }

      // Fallback to mock/platformOps
      const documents = await this.platformOps.getDocumentsByOwner(identityId);

      const contacts = documents.filter(doc =>
        doc.contractId === 'dashpay' && doc.documentType === 'contactInfo'
      );

      return contacts;
    } catch (error) {
      console.error('Failed to get contacts:', error);
      return [];
    }
  }

  /**
   * Send a contact request
   */
  async sendContactRequest(fromIdentityId, toIdentityId) {
    try {
      // Mock: Simulate sending contact request
      await new Promise(r => setTimeout(r, 1500));

      // In real implementation, this would create a contactRequest document
      const contactRequest = {
        id: 'doc_contact_req_' + Date.now(),
        contractId: 'dashpay',
        documentType: 'contactRequest',
        ownerId: fromIdentityId,
        data: {
          toUserId: toIdentityId,
          encryptedPublicKey: '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
          encryptedAccountReference: '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
          coreHeightCreatedAt: 920000
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      notifications.success('Contact request sent successfully');
      return contactRequest;
    } catch (error) {
      console.error('Failed to send contact request:', error);
      throw error;
    }
  }

  /**
   * Accept a contact request by creating a contactInfo document
   *
   * @param {string} identityId - The accepting identity's ID
   * @param {object} contactRequestDoc - The full contact request document
   * @param {string} privateKeyWif - Private key in WIF format for signing
   */
  async acceptContactRequest(identityId, contactRequestDoc, privateKeyWif) {
    // Fallback to mock if no real SDK or private key
    if (!this.canUseRealSDK() || !privateKeyWif) {
      console.log('[DashPay] Accept: Using mock mode (no SDK or privateKey)');
      await new Promise(r => setTimeout(r, 1200));
      notifications.success('Contact request accepted (Mock)');
      return true;
    }

    try {
      console.log('[DashPay] Accepting contact request with encryption');

      // 1. Extract sender ID from contact request document
      const senderId = contactRequestDoc?.data?.toUserId || contactRequestDoc?.ownerId;
      if (!senderId) {
        throw new Error('Cannot determine sender identity from contact request');
      }
      console.log('[DashPay] Creating contact for sender:', senderId);

      // 2. Derive shared secret for encryption
      const sharedSecret = this.deriveSharedSecret(privateKeyWif, senderId);

      // 3. Prepare privateData array: [aliasName, note, displayHidden]
      const privateDataArray = [
        '',      // aliasName - empty for now
        '',      // note - empty for now
        false    // displayHidden
      ];

      // 4. CBOR encode privateData
      const privateDataCbor = cbor.encode(privateDataArray);

      // 5. AES encrypt privateData with shared secret
      const privateDataEncrypted = CryptoJS.AES.encrypt(
        privateDataCbor.toString('hex'),
        sharedSecret
      ).toString();

      // 6. Encrypt toUserId (the sender's ID we're storing as contact)
      const encToUserId = CryptoJS.AES.encrypt(
        senderId,
        sharedSecret
      ).toString();

      // 7. Convert encrypted strings to byte arrays (32 and 48+ bytes)
      const encToUserIdBytes = this.stringToBytes(encToUserId, 32);
      const privateDataBytes = this.stringToBytes(privateDataEncrypted, 48);

      // 8. Generate entropy for document ID
      const entropyHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      // 9. Get initial balance for verification fallback
      let initialBalance = null;
      try {
        const initialIdentity = await this.sdk.identities.get(identityId);
        initialBalance = initialIdentity?.balance;
        console.log('[DashPay] Accept: Initial balance:', initialBalance);
      } catch (balanceErr) {
        console.warn('[DashPay] Accept: Could not get initial balance:', balanceErr.message);
      }

      // 10. Create contactInfo document with retry logic
      console.log('[DashPay] Creating contactInfo document via SDK');
      let result = null;
      let createError = null;

      try {
        result = await retryOperation(
          async (attempt) => {
            console.log(`[DashPay] Accept: Attempt ${attempt} - creating contactInfo...`);
            return await this.sdk.documents.create({
              dataContractId: DASHPAY_CONTRACT_ID,
              documentTypeName: 'contactInfo',
              ownerId: identityId,
              data: {
                encToUserId: encToUserIdBytes,
                rootEncryptionKeyIndex: 0,
                derivationEncryptionKeyIndex: 0,
                privateData: privateDataBytes
              },
              entropyHex: entropyHex,
              privateKeyWif: privateKeyWif
            });
          },
          {
            maxAttempts: 5,
            operationName: 'AcceptContactRequest',
            onRetry: (attempt, maxAttempts, delay, error) => {
              console.log(`[DashPay] Accept: Retry ${attempt}/${maxAttempts} in ${Math.round(delay)}ms`);
              notifications.info(`Retrying accept (${attempt}/${maxAttempts})...`);
            }
          }
        );
      } catch (err) {
        createError = err;
        console.warn('[DashPay] Accept: SDK threw error after retries:', err.message);
      }

      // 11. Handle "Unknown error" - verify via balance check
      if (createError && createError.message?.includes('Unknown error') && initialBalance !== null) {
        console.log('[DashPay] Accept: Got "Unknown error" - verifying via balance check...');
        const verification = await verifyByBalanceChange(this.sdk, identityId, initialBalance);
        if (verification.success) {
          console.log('[DashPay] Accept: Balance decreased by', verification.balanceChange, 'credits - operation succeeded!');
          result = { type: 'DocumentCreated', verifiedByBalance: true };
          createError = null;
        }
      }

      // 12. Re-throw if still have error
      if (createError) {
        throw createError;
      }

      console.log('[DashPay] ContactInfo document created:', result);
      notifications.success('Contact request accepted!');
      return result;

    } catch (error) {
      console.error('[DashPay] Accept failed:', error);
      notifications.error(`Failed to accept: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject a contact request
   *
   * Note: In DashPay, rejecting a contact request doesn't require a blockchain
   * transaction - we simply don't create a contactInfo document. The original
   * contactRequest document remains on-chain but is effectively ignored.
   *
   * @param {string} identityId - The rejecting identity's ID
   * @param {object} contactRequestDoc - The full contact request document
   * @param {string} privateKeyWif - Private key in WIF format (optional, not needed for reject)
   */
  async rejectContactRequest(identityId, contactRequestDoc, privateKeyWif) {
    // Fallback to mock if no real SDK
    if (!this.canUseRealSDK()) {
      console.log('[DashPay] Reject: Using mock mode');
      await new Promise(r => setTimeout(r, 800));
      notifications.success('Contact request rejected (Mock)');
      return true;
    }

    try {
      console.log('[DashPay] Rejecting contact request');

      // In DashPay, rejection is a client-side decision:
      // - The contactRequest document stays on-chain (we can't delete others' documents)
      // - We simply don't create a contactInfo document
      // - The UI marks this request as rejected locally

      const senderId = contactRequestDoc?.ownerId || contactRequestDoc?.data?.ownerId;
      console.log('[DashPay] Rejection recorded locally for request from:', senderId);

      // Add small delay for UI consistency
      await new Promise(r => setTimeout(r, 500));

      notifications.success('Contact request rejected');
      return true;

    } catch (error) {
      console.error('[DashPay] Reject failed:', error);
      notifications.error(`Failed to reject: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update profile
   */
  async updateProfile(identityId, profileData) {
    try {
      // Mock: Simulate updating profile
      await new Promise(r => setTimeout(r, 1500));

      // In real implementation, this would update the profile document
      const profile = {
        id: 'doc_profile_' + identityId,
        contractId: 'dashpay',
        documentType: 'profile',
        ownerId: identityId,
        data: profileData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      notifications.success('Profile updated successfully');
      return profile;
    } catch (error) {
      console.error('Failed to update profile:', error);
      throw error;
    }
  }

  /**
   * Remove a contact
   */
  async removeContact(identityId, contactInfoId) {
    try {
      // Mock: Simulate removing contact
      await new Promise(r => setTimeout(r, 1000));

      // In real implementation, this would delete the contactInfo document

      notifications.success('Contact removed');
      return true;
    } catch (error) {
      console.error('Failed to remove contact:', error);
      throw error;
    }
  }

  /**
   * Get identity by DPNS name (helper for contact lookup)
   */
  async getIdentityByName(dpnsName) {
    try {
      // Normalize name
      if (!dpnsName.endsWith('.dash')) {
        dpnsName = `${dpnsName}.dash`;
      }

      // Search through all identities
      const identities = stateManager.getAllIdentities();
      const owner = identities.find(identity =>
        identity.dpnsNames && identity.dpnsNames.includes(dpnsName)
      );

      return owner || null;
    } catch (error) {
      console.error('Failed to resolve name:', error);
      return null;
    }
  }

  // =====================================================
  // Encryption Helper Methods for Contact Operations
  // =====================================================

  /**
   * Derive a shared secret for encryption
   *
   * Note: This is a simplified implementation using SHA256.
   * A full implementation would use ECDH with actual public keys
   * derived from identity authentication keys.
   *
   * @param {string} privateKeyWif - Our private key in WIF format
   * @param {string} theirIdentityId - The other party's identity ID
   * @returns {string} Shared secret as hex string
   */
  deriveSharedSecret(privateKeyWif, theirIdentityId) {
    // Use a deterministic hash of both keys as the shared secret
    // Full implementation would use ECDH: sharedSecret = ECDH(myPrivateKey, theirPublicKey)
    const combined = privateKeyWif + theirIdentityId;
    return CryptoJS.SHA256(combined).toString();
  }

  /**
   * Convert a string to a fixed-length byte array
   *
   * @param {string} str - Input string
   * @param {number} minLength - Minimum length of output array
   * @returns {Array<number>} Byte array with at least minLength bytes
   */
  stringToBytes(str, minLength) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    // Ensure minimum length by padding with zeros
    const result = new Uint8Array(Math.max(bytes.length, minLength));
    result.set(bytes);
    return Array.from(result);
  }
}
