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

export class DashPayManager {
  constructor(platformOps) {
    this.platformOps = platformOps;
    this.currentIdentityId = null;
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
      // Query all contact requests where toUserId matches this identity
      const allDocuments = await this.platformOps.getDocumentsByOwner(identityId);

      // In a real implementation, this would query:
      // sdk.platform.documents.get('dashpay.contactRequest', {
      //   where: [['toUserId', '==', identityId]]
      // })

      // For mock: Find all contactRequest documents where toUserId equals identityId
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
   * Accept a contact request
   */
  async acceptContactRequest(identityId, contactRequestId) {
    try {
      // Mock: Simulate accepting contact request
      await new Promise(r => setTimeout(r, 1200));

      // In real implementation, this would:
      // 1. Create contactInfo document for the requester
      // 2. Create contactInfo document for this identity
      // 3. Both parties become contacts

      notifications.success('Contact request accepted');
      return true;
    } catch (error) {
      console.error('Failed to accept contact request:', error);
      throw error;
    }
  }

  /**
   * Reject a contact request
   */
  async rejectContactRequest(identityId, contactRequestId) {
    try {
      // Mock: Simulate rejecting contact request
      await new Promise(r => setTimeout(r, 800));

      // In real implementation, this would delete the contactRequest document

      notifications.success('Contact request rejected');
      return true;
    } catch (error) {
      console.error('Failed to reject contact request:', error);
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
}
