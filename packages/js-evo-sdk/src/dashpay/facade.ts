import * as wasm from '../wasm.js';
import type { EvoSDK } from '../sdk.js';
import { withErrorHandling } from '../errors.js';

/**
 * DashPay Contract ID on mainnet
 * Note: Testnet may have a different contract ID
 */
export const DASHPAY_CONTRACT_ID = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';

/**
 * Options for querying a profile
 */
export interface GetProfileOptions {
  /** Identity ID whose profile to fetch */
  identityId: wasm.IdentifierLike;
}

/**
 * Profile data fields matching DashPay contract schema
 */
export interface ProfileData {
  /** Display name (1-25 characters) */
  displayName?: string;
  /** Public message (1-140 characters) */
  publicMessage?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** SHA256 hash of avatar image (32 bytes) */
  avatarHash?: Uint8Array;
  /** dHash fingerprint of avatar image (8 bytes) */
  avatarFingerprint?: Uint8Array;
}

/**
 * Contact request data fields matching DashPay contract schema
 */
export interface ContactRequestData {
  /** Recipient identity ID */
  toUserId: wasm.IdentifierLike;
  /** Encrypted public key (96 bytes) */
  encryptedPublicKey: Uint8Array;
  /** Sender key index */
  senderKeyIndex: number;
  /** Recipient key index */
  recipientKeyIndex: number;
  /** Account reference */
  accountReference: number;
  /** Optional encrypted account label (48-80 bytes) */
  encryptedAccountLabel?: Uint8Array;
  /** Optional auto-accept proof (38-102 bytes) */
  autoAcceptProof?: Uint8Array;
}

/**
 * Contact info data fields matching DashPay contract schema
 */
export interface ContactInfoData {
  /** Encrypted toUserId (32 bytes) */
  encToUserId: Uint8Array;
  /** Root encryption key index */
  rootEncryptionKeyIndex: number;
  /** Derivation encryption key index */
  derivationEncryptionKeyIndex: number;
  /** Encrypted private data (48-2048 bytes) */
  privateData: Uint8Array;
}

/**
 * Options for querying contact requests
 */
export interface ContactRequestsQueryOptions {
  /** Identity ID to query requests for */
  identityId: wasm.IdentifierLike;
  /** Maximum number of results */
  limit?: number;
  /** Start after this creation timestamp for pagination */
  startAfter?: Date;
}

/**
 * Options for querying contacts
 */
export interface ContactsQueryOptions {
  /** Identity ID to query contacts for */
  identityId: wasm.IdentifierLike;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Options for deriving DashPay contact keys
 */
export interface DeriveContactKeyOptions {
  /** BIP39 mnemonic phrase */
  mnemonic: string;
  /** Optional passphrase */
  passphrase?: string;
  /** Sender identity ID */
  senderIdentityId: wasm.IdentifierLike;
  /** Receiver identity ID */
  receiverIdentityId: wasm.IdentifierLike;
  /** Account number */
  account: number;
  /** Address index */
  addressIndex: number;
  /** Network ('mainnet' or 'testnet') */
  network: string;
}

/**
 * DashPay facade for social payments functionality.
 * Provides profile management and contact request operations.
 *
 * DashPay uses three document types:
 * - `profile`: User profiles with display name, avatar, and public message
 * - `contactRequest`: Requests sent from one user to another
 * - `contactInfo`: Accepted contacts (private contact list)
 *
 * @example
 * ```typescript
 * const sdk = new EvoSDK({ network: 'testnet' });
 * await sdk.connect();
 *
 * // Get a profile
 * const profile = await sdk.dashpay.getProfile({
 *   identityId: 'someIdentityId'
 * });
 *
 * // Get inbound contact requests
 * const requests = await sdk.dashpay.getInboundContactRequests({
 *   identityId: myIdentityId,
 *   limit: 20
 * });
 * ```
 */
export class DashPayFacade {
  private sdk: EvoSDK;
  private contractId: wasm.IdentifierLike;

  constructor(sdk: EvoSDK, contractId: wasm.IdentifierLike = DASHPAY_CONTRACT_ID) {
    this.sdk = sdk;
    this.contractId = contractId;
  }

  /**
   * Get the DashPay contract ID
   */
  getContractId(): wasm.IdentifierLike {
    return this.contractId;
  }

  /**
   * Derive a DashPay contact key for secure communication.
   * Uses DIP15 key derivation for contact-specific keys.
   *
   * @param options - Key derivation parameters
   * @returns Contact key information including private/public keys
   *
   * @example
   * ```typescript
   * const keyInfo = await sdk.dashpay.deriveContactKey({
   *   mnemonic: 'abandon abandon ...',
   *   senderIdentityId: myIdentityId,
   *   receiverIdentityId: theirIdentityId,
   *   account: 0,
   *   addressIndex: 0,
   *   network: 'testnet'
   * });
   * ```
   */
  async deriveContactKey(options: DeriveContactKeyOptions): Promise<wasm.DashpayContactKeyInfo> {
    return withErrorHandling('derive contact key', async () => {
      await wasm.ensureInitialized();
      return wasm.WasmSdk.deriveDashpayContactKey({
        mnemonic: options.mnemonic,
        passphrase: options.passphrase,
        senderIdentityId: options.senderIdentityId,
        receiverIdentityId: options.receiverIdentityId,
        account: options.account,
        addressIndex: options.addressIndex,
        network: options.network,
      });
    });
  }

  // ============================================
  // Profile Methods
  // ============================================

  /**
   * Get a user's profile by identity ID.
   *
   * @param options - Query options with identity ID
   * @returns Profile document or undefined if not found
   *
   * @example
   * ```typescript
   * const profile = await sdk.dashpay.getProfile({
   *   identityId: 'someIdentityId'
   * });
   * if (profile) {
   *   console.log('Display name:', profile.properties.displayName);
   * }
   * ```
   */
  async getProfile(options: GetProfileOptions): Promise<wasm.Document | undefined> {
    return withErrorHandling('get profile', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      const results = await w.getDocuments({
        dataContractId: this.contractId,
        documentTypeName: 'profile',
        where: [['$ownerId', '==', options.identityId]],
        limit: 1,
      });

      // Return the first document if found
      for (const [, doc] of results) {
        if (doc) return doc;
      }
      return undefined;
    }, String(options.identityId));
  }

  /**
   * Get a profile with proof metadata for verification.
   *
   * @param options - Query options with identity ID
   * @returns Profile with proof metadata
   */
  async getProfileWithProof(options: GetProfileOptions): Promise<wasm.ProofMetadataResponseTyped<wasm.Document | undefined>> {
    return withErrorHandling('get profile with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      const result = await w.getDocumentsWithProofInfo({
        dataContractId: this.contractId,
        documentTypeName: 'profile',
        where: [['$ownerId', '==', options.identityId]],
        limit: 1,
      });

      // Extract first document from the map
      let doc: wasm.Document | undefined;
      for (const [, d] of result.data) {
        if (d) {
          doc = d;
          break;
        }
      }

      return {
        data: doc,
        proof: result.proof,
        metadata: result.metadata,
      };
    }, String(options.identityId));
  }

  /**
   * Create a profile document on Dash Platform.
   * Uses the DocumentsFacade for the actual creation.
   *
   * @param options - Document creation options from wasm SDK
   *
   * @example
   * ```typescript
   * // Build profile document first
   * const document = Document.fromJSON({
   *   $ownerId: myIdentityId,
   *   $dataContractId: DASHPAY_CONTRACT_ID,
   *   $type: 'profile',
   *   displayName: 'Alice',
   *   publicMessage: 'Hello!'
   * });
   *
   * await sdk.dashpay.createProfile({
   *   document,
   *   identityKey: myIdentity.publicKeys[0],
   *   signer: mySigner,
   * });
   * ```
   */
  async createProfile(options: wasm.DocumentCreateOptions): Promise<void> {
    return withErrorHandling('create profile', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      await w.documentCreate(options);
    });
  }

  /**
   * Update an existing profile on Dash Platform.
   *
   * @param options - Document replace options from wasm SDK
   */
  async updateProfile(options: wasm.DocumentReplaceOptions): Promise<void> {
    return withErrorHandling('update profile', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      await w.documentReplace(options);
    });
  }

  // ============================================
  // Contact Request Methods
  // ============================================

  /**
   * Send a contact request to another user.
   * Uses the DocumentsFacade for the actual creation.
   *
   * @param options - Document creation options from wasm SDK
   *
   * @example
   * ```typescript
   * await sdk.dashpay.sendContactRequest({
   *   document: contactRequestDoc,
   *   identityKey: myIdentity.publicKeys[0],
   *   signer: mySigner,
   * });
   * ```
   */
  async sendContactRequest(options: wasm.DocumentCreateOptions): Promise<void> {
    return withErrorHandling('send contact request', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      await w.documentCreate(options);
    });
  }

  /**
   * Accept a contact request by creating a contactInfo document.
   *
   * @param options - Document creation options from wasm SDK
   */
  async acceptContactRequest(options: wasm.DocumentCreateOptions): Promise<void> {
    return withErrorHandling('accept contact request', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      await w.documentCreate(options);
    });
  }

  /**
   * Get inbound contact requests (requests sent TO this identity).
   *
   * @param options - Query options
   * @returns Array of contact request documents
   *
   * @example
   * ```typescript
   * const requests = await sdk.dashpay.getInboundContactRequests({
   *   identityId: myIdentityId,
   *   limit: 20
   * });
   * for (const request of requests) {
   *   console.log('Request from:', request.ownerId);
   * }
   * ```
   */
  async getInboundContactRequests(options: ContactRequestsQueryOptions): Promise<wasm.Document[]> {
    return withErrorHandling('get inbound contact requests', async () => {
      const w = await this.sdk.getWasmSdkConnected();

      const where: Array<[string, string, unknown]> = [['toUserId', '==', options.identityId]];

      if (options.startAfter) {
        where.push(['$createdAt', '>', options.startAfter.getTime()]);
      }

      const results = await w.getDocuments({
        dataContractId: this.contractId,
        documentTypeName: 'contactRequest',
        where,
        orderBy: [['$createdAt', 'asc']],
        limit: options.limit ?? 100,
      });

      // Convert map to array, filtering out undefined values
      const documents: wasm.Document[] = [];
      for (const [, doc] of results) {
        if (doc) documents.push(doc);
      }
      return documents;
    }, String(options.identityId));
  }

  /**
   * Get outbound contact requests (requests sent FROM this identity).
   *
   * @param options - Query options
   * @returns Array of contact request documents
   *
   * @example
   * ```typescript
   * const requests = await sdk.dashpay.getOutboundContactRequests({
   *   identityId: myIdentityId,
   *   limit: 20
   * });
   * for (const request of requests) {
   *   console.log('Request to:', request.properties.toUserId);
   * }
   * ```
   */
  async getOutboundContactRequests(options: ContactRequestsQueryOptions): Promise<wasm.Document[]> {
    return withErrorHandling('get outbound contact requests', async () => {
      const w = await this.sdk.getWasmSdkConnected();

      const where: Array<[string, string, unknown]> = [['$ownerId', '==', options.identityId]];

      if (options.startAfter) {
        where.push(['$createdAt', '>', options.startAfter.getTime()]);
      }

      const results = await w.getDocuments({
        dataContractId: this.contractId,
        documentTypeName: 'contactRequest',
        where,
        orderBy: [['$createdAt', 'asc']],
        limit: options.limit ?? 100,
      });

      // Convert map to array, filtering out undefined values
      const documents: wasm.Document[] = [];
      for (const [, doc] of results) {
        if (doc) documents.push(doc);
      }
      return documents;
    }, String(options.identityId));
  }

  // ============================================
  // Contact Methods
  // ============================================

  /**
   * Get accepted contacts (contactInfo documents).
   * These are contacts that have been accepted by the identity.
   *
   * @param options - Query options
   * @returns Array of contactInfo documents
   *
   * @example
   * ```typescript
   * const contacts = await sdk.dashpay.getContacts({
   *   identityId: myIdentityId,
   *   limit: 50
   * });
   * console.log('Number of contacts:', contacts.length);
   * ```
   */
  async getContacts(options: ContactsQueryOptions): Promise<wasm.Document[]> {
    return withErrorHandling('get contacts', async () => {
      const w = await this.sdk.getWasmSdkConnected();

      const results = await w.getDocuments({
        dataContractId: this.contractId,
        documentTypeName: 'contactInfo',
        where: [['$ownerId', '==', options.identityId]],
        orderBy: [['$updatedAt', 'asc']],
        limit: options.limit ?? 100,
      });

      // Convert map to array, filtering out undefined values
      const documents: wasm.Document[] = [];
      for (const [, doc] of results) {
        if (doc) documents.push(doc);
      }
      return documents;
    }, String(options.identityId));
  }

  /**
   * Get contacts with proof metadata for verification.
   *
   * @param options - Query options
   * @returns Contacts with proof metadata
   */
  async getContactsWithProof(options: ContactsQueryOptions): Promise<wasm.ProofMetadataResponseTyped<wasm.Document[]>> {
    return withErrorHandling('get contacts with proof', async () => {
      const w = await this.sdk.getWasmSdkConnected();

      const result = await w.getDocumentsWithProofInfo({
        dataContractId: this.contractId,
        documentTypeName: 'contactInfo',
        where: [['$ownerId', '==', options.identityId]],
        orderBy: [['$updatedAt', 'asc']],
        limit: options.limit ?? 100,
      });

      // Convert map to array, filtering out undefined values
      const documents: wasm.Document[] = [];
      for (const [, doc] of result.data) {
        if (doc) documents.push(doc);
      }

      return {
        data: documents,
        proof: result.proof,
        metadata: result.metadata,
      };
    }, String(options.identityId));
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get the DashPay data contract.
   * Useful for constructing documents.
   *
   * @returns DashPay DataContract or undefined if not found
   */
  async getContract(): Promise<wasm.DataContract | undefined> {
    return withErrorHandling('get DashPay contract', async () => {
      const w = await this.sdk.getWasmSdkConnected();
      return w.getDataContract(this.contractId);
    });
  }
}
