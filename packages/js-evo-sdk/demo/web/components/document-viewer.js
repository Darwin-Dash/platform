/**
 * Document Viewer Component
 * Displays documents owned by an identity, grouped by data contract
 */

import { mockDocuments, mockDataContracts } from '../mock-data.js';
import { formatTimestamp } from '../utils/formatter.js';
import { notifications } from './notifications.js';

// Known platform contract IDs (testnet)
const DASHPAY_CONTRACT_ID = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7';
const DPNS_CONTRACT_ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec';

export class DocumentViewer {
  constructor(containerElement, platformOps, sdk = null, options = {}) {
    this.container = containerElement;
    this.platformOps = platformOps;
    this.sdk = sdk;
    this.identityId = null;
    this.documents = [];
    this.expandedDocuments = new Set();
    // Track active tab to preserve selection on re-render
    this.activeTab = 'documents';
    // Callback for when DPNS names are extracted from domain documents
    this.onDpnsNamesFound = options.onDpnsNamesFound || null;
    // Debounce tracking to prevent excessive polling
    this.lastFetchTime = 0;
    this.fetchDebounceMs = 5000; // Minimum 5 seconds between fetches for same identity
    this.lastFetchedIdentityId = null;
  }

  /**
   * Set the SDK instance (can be set after construction when SDK is connected)
   */
  setSDK(sdk) {
    this.sdk = sdk;
  }

  /**
   * Show loading indicator while documents are being fetched
   */
  showLoading() {
    this.container.innerHTML = `
      <div class="empty-message">
        <div class="spinner"></div>
        <p>Loading documents...</p>
      </div>
    `;
  }

  async loadDocuments(identityId) {
    const now = Date.now();
    const sameIdentity = identityId === this.lastFetchedIdentityId;

    // Skip if same identity and within debounce window (unless documents are empty)
    if (sameIdentity && this.documents.length > 0 && (now - this.lastFetchTime) < this.fetchDebounceMs) {
      return; // Debounce - skip redundant fetch
    }

    this.identityId = identityId;
    this.lastFetchTime = now;
    this.lastFetchedIdentityId = identityId;

    // Show loading indicator
    this.showLoading();

    try {
      // Try to fetch real documents from SDK if available
      if (this.sdk) {
        this.documents = await this.fetchDocumentsFromSDK(identityId);
      } else {
        // SDK not ready yet - show waiting state, documents will reload when SDK is set
        this.documents = [];
        console.log('[DocumentViewer] SDK not ready, waiting for initialization...');
      }

      // Extract DPNS names from domain documents and notify callback
      this.notifyDpnsNames();

      // Render the view
      this.render();
    } catch (error) {
      console.error('Failed to load documents:', error);
      // Try fallback to mock data if SDK fails
      try {
        this.documents = await this.platformOps.getDocumentsByOwner(identityId);
        this.notifyDpnsNames();
        this.render();
      } catch (e) {
        notifications.error('Failed to load documents');
      }
    }
  }

  /**
   * Extract DPNS names from domain documents and notify callback
   */
  notifyDpnsNames() {
    if (!this.onDpnsNamesFound) return;

    // Extract names from DPNS domain documents
    const dpnsNames = this.documents
      .filter(doc => doc.documentType === 'domain' && doc.data?.label)
      .map(doc => `${doc.data.label}.dash`);

    if (dpnsNames.length > 0) {
      console.log(`[DocumentViewer] Extracted ${dpnsNames.length} DPNS names from domain documents`);
      this.onDpnsNamesFound(this.identityId, dpnsNames);
    }
  }

  /**
   * Fetch real documents from the SDK
   * Queries DashPay and DPNS contracts for documents owned by this identity
   */
  async fetchDocumentsFromSDK(identityId) {
    const documents = [];

    // Query DashPay profile documents
    try {
      const profileResult = await this.sdk.documents.query({
        contractId: DASHPAY_CONTRACT_ID,
        type: 'profile',
        where: [['$ownerId', '==', identityId]],
        limit: 100
      });
      if (profileResult && profileResult.length > 0) {
        documents.push(...profileResult.map(doc => this.transformSDKDocument(doc, 'dashpay', 'profile')));
      }
    } catch (e) {
      console.warn('[DocumentViewer] Could not fetch DashPay profiles:', e.message);
    }

    // Query DashPay contact requests
    try {
      const contactRequestResult = await this.sdk.documents.query({
        contractId: DASHPAY_CONTRACT_ID,
        type: 'contactRequest',
        where: [['$ownerId', '==', identityId]],
        limit: 100
      });
      if (contactRequestResult && contactRequestResult.length > 0) {
        documents.push(...contactRequestResult.map(doc => this.transformSDKDocument(doc, 'dashpay', 'contactRequest')));
      }
    } catch (e) {
      console.warn('[DocumentViewer] Could not fetch DashPay contact requests:', e.message);
    }

    // Query DPNS domain documents
    try {
      const domainResult = await this.sdk.documents.query({
        contractId: DPNS_CONTRACT_ID,
        type: 'domain',
        where: [['records.identity', '==', identityId]],
        limit: 100
      });
      if (domainResult && domainResult.length > 0) {
        // Sort by creation date (oldest first) - client-side since DPNS has no index for this
        const sortedDocs = domainResult.sort((a, b) => {
          const aTime = a.createdAt || a.getCreatedAt?.() || a.$createdAt || 0;
          const bTime = b.createdAt || b.getCreatedAt?.() || b.$createdAt || 0;
          return aTime - bTime;  // Ascending - oldest first
        });
        documents.push(...sortedDocs.map(doc => this.transformSDKDocument(doc, 'dpns', 'domain')));
      }
    } catch (e) {
      console.warn('[DocumentViewer] Could not fetch DPNS domains:', e.message);
    }

    console.log(`[DocumentViewer] Fetched ${documents.length} documents for identity ${identityId}`);
    return documents;
  }

  /**
   * Transform SDK document to the format expected by the component
   */
  transformSDKDocument(doc, contractId, documentType) {
    // SDK documents may be WASM objects or plain objects depending on how they're returned
    const id = doc.getId?.() ? doc.getId().base58() : (doc.id || doc.$id);
    const ownerId = doc.getOwnerId?.() ? doc.getOwnerId().base58() : (doc.ownerId || doc.$ownerId);
    const createdAt = doc.getCreatedAt?.() ? new Date(doc.getCreatedAt()).toISOString() : (doc.createdAt || doc.$createdAt || new Date().toISOString());
    const updatedAt = doc.getUpdatedAt?.() ? new Date(doc.getUpdatedAt()).toISOString() : (doc.updatedAt || doc.$updatedAt || createdAt);
    const data = doc.getProperties?.() || doc.data || doc;

    return {
      id: id || `${contractId}-${Date.now()}`,
      ownerId: ownerId || this.identityId,
      contractId,
      documentType,
      createdAt,
      updatedAt,
      data
    };
  }

  render() {
    if (!this.documents || this.documents.length === 0) {
      this.container.innerHTML = `
        <div class="empty-message">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin: 0 auto var(--space-3); opacity: 0.3;">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>No documents found</p>
        </div>
      `;
      return;
    }

    // Group documents by contract
    const documentsByContract = this.groupByContract(this.documents);

    // Separate DashPay documents from others
    const dashPayDocs = documentsByContract.get('dashpay') || [];
    const otherDocs = new Map(documentsByContract);
    otherDocs.delete('dashpay');

    // Get list of contracts this identity interacts with
    const relevantContracts = this.getRelevantContracts(documentsByContract);

    // Build DashPay section
    let dashPaySection = '';
    if (dashPayDocs.length > 0) {
      const dashPayContract = mockDataContracts.get('dashpay');
      const dashPayItems = dashPayDocs.map(doc => this.renderDashPayDocument(doc)).join('');

      dashPaySection = `
        <div class="dashpay-section">
          <div class="contract-header">
            <div class="contract-info">
              <h4 class="contract-name">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 8px;">
                  <path d="M17 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M12 12h.01M8 9h.01M16 9h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${dashPayContract?.name || 'DashPay'}
              </h4>
              ${dashPayContract?.description ? `<p class="contract-description">${dashPayContract.description}</p>` : ''}
            </div>
            <div class="document-count">${dashPayDocs.length} document${dashPayDocs.length !== 1 ? 's' : ''}</div>
          </div>
          <div class="dashpay-documents-list">
            ${dashPayItems}
          </div>
        </div>
      `;
    }

    // Build HTML for other document sections
    const contractSections = Array.from(otherDocs.entries()).map(([contractId, docs]) => {
      const contract = mockDataContracts.get(contractId);
      const contractName = contract ? contract.name : contractId;
      const contractDesc = contract ? contract.description : '';

      const documentItems = docs.map(doc => this.renderDocument(doc, contract)).join('');

      return `
        <div class="contract-section">
          <div class="contract-header">
            <div class="contract-info">
              <h4 class="contract-name">${contractName}</h4>
              ${contractDesc ? `<p class="contract-description">${contractDesc}</p>` : ''}
            </div>
            <div class="document-count">${docs.length} document${docs.length !== 1 ? 's' : ''}</div>
          </div>
          <div class="documents-list">
            ${documentItems}
          </div>
        </div>
      `;
    }).join('');

    // Build HTML for contracts view
    const contractsViewHTML = this.renderContractsView(relevantContracts);

    const isDocumentsActive = this.activeTab === 'documents';
    const isContractsActive = this.activeTab === 'contracts';

    this.container.innerHTML = `
      <div class="documents-viewer">
        <div class="documents-tabs">
          <button class="documents-tab ${isDocumentsActive ? 'active' : ''}" data-tab="documents">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            My Documents (${this.documents.length})
          </button>
          <button class="documents-tab ${isContractsActive ? 'active' : ''}" data-tab="contracts">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            My Contracts (${relevantContracts.length})
          </button>
        </div>

        <div class="documents-content">
          <div class="tab-panel ${isDocumentsActive ? 'active' : ''}" data-panel="documents" ${isDocumentsActive ? '' : 'hidden'}>
            ${dashPaySection}
            ${contractSections}
          </div>
          <div class="tab-panel ${isContractsActive ? 'active' : ''}" data-panel="contracts" ${isContractsActive ? '' : 'hidden'}>
            ${contractsViewHTML}
          </div>
        </div>
      </div>
    `;

    // Bind events
    this.bindEvents();
    this.bindTabEvents();
  }

  getRelevantContracts(documentsByContract) {
    const contracts = [];

    documentsByContract.forEach((docs, contractId) => {
      const contract = mockDataContracts.get(contractId);
      if (contract) {
        contracts.push({
          ...contract,
          id: contractId,
          documentCount: docs.length,
          isOwner: contract.owner === this.identityId
        });
      }
    });

    return contracts;
  }

  renderContractsView(contracts) {
    if (contracts.length === 0) {
      return `
        <div class="empty-message">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin: 0 auto var(--space-3); opacity: 0.3;">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>No contracts found</p>
        </div>
      `;
    }

    const contractCards = contracts.map(contract => `
      <div class="contract-card">
        <div class="contract-card-header">
          <div class="contract-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="contract-card-info">
            <h4 class="contract-card-name">${contract.name}</h4>
            ${contract.description ? `<p class="contract-card-description">${contract.description}</p>` : ''}
          </div>
          ${contract.isOwner ? '<span class="owner-badge">Owner</span>' : ''}
        </div>
        <div class="contract-card-stats">
          <div class="contract-stat">
            <span class="stat-label">Documents</span>
            <span class="stat-value">${contract.documentCount}</span>
          </div>
          <div class="contract-stat">
            <span class="stat-label">Version</span>
            <span class="stat-value">${contract.version}</span>
          </div>
          <div class="contract-stat">
            <span class="stat-label">Document Types</span>
            <span class="stat-value">${contract.documentTypes.length}</span>
          </div>
        </div>
        <div class="contract-card-details">
          <div class="contract-detail-item">
            <span class="detail-label">Contract ID:</span>
            <code class="detail-value">${contract.id}</code>
          </div>
          <div class="contract-detail-item">
            <span class="detail-label">Document Types:</span>
            <div class="document-types-list">
              ${contract.documentTypes.map(type => `<span class="document-type-tag">${type}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    return `<div class="contracts-grid">${contractCards}</div>`;
  }

  bindTabEvents() {
    const tabs = this.container.querySelectorAll('.documents-tab');
    const panels = this.container.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Save active tab to preserve on re-render
        this.activeTab = targetTab;

        // Update tab states
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === targetTab));

        // Update panel states
        panels.forEach(panel => {
          if (panel.dataset.panel === targetTab) {
            panel.hidden = false;
            panel.classList.add('active');
          } else {
            panel.hidden = true;
            panel.classList.remove('active');
          }
        });
      });
    });
  }

  renderDashPayDocument(doc) {
    const isExpanded = this.expandedDocuments.has(doc.id);
    const documentType = doc.documentType;
    const createdDate = formatTimestamp(doc.createdAt);
    const preview = this.getDashPayDocumentPreview(doc);
    const documentIcon = this.getDashPayDocumentIcon(documentType);

    return `
      <div class="dashpay-document-item ${isExpanded ? 'expanded' : ''}" data-doc-id="${doc.id}">
        <div class="dashpay-document-summary">
          <div class="dashpay-document-icon">
            ${documentIcon}
          </div>
          <div class="dashpay-document-info">
            <div class="dashpay-document-type">${documentType}</div>
            <div class="dashpay-document-preview">${preview}</div>
            <div class="dashpay-document-meta">Created: ${createdDate}</div>
          </div>
          <button class="document-toggle" aria-label="Expand document" data-toggle="${doc.id}">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="chevron">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="dashpay-document-details" ${isExpanded ? '' : 'hidden'}>
          <div class="document-json">
            <div class="json-label">Document Data:</div>
            <pre class="json-content">${JSON.stringify(doc.data, null, 2)}</pre>
          </div>
          <div class="dashpay-document-actions">
            <button class="btn-text copy-doc-json" data-copy-json="${doc.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
              </svg>
              Copy JSON
            </button>
            ${documentType === 'contactRequest' ? `
              <button class="btn-text btn-primary dashpay-action-btn" data-action="accept" data-doc-id="${doc.id}">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M5 10l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Accept
              </button>
              <button class="btn-text dashpay-action-btn" data-action="decline" data-doc-id="${doc.id}">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Decline
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderDocument(doc, contract) {
    const isExpanded = this.expandedDocuments.has(doc.id);
    const documentType = doc.documentType;
    const createdDate = formatTimestamp(doc.createdAt);

    // Get a preview based on document type
    const preview = this.getDocumentPreview(doc);

    return `
      <div class="document-item ${isExpanded ? 'expanded' : ''}" data-doc-id="${doc.id}">
        <div class="document-summary">
          <div class="document-icon">
            ${this.getDocumentIcon(documentType)}
          </div>
          <div class="document-info">
            <div class="document-type">${documentType}</div>
            <div class="document-preview">${preview}</div>
            <div class="document-meta">Created: ${createdDate}</div>
          </div>
          <button class="document-toggle" aria-label="Expand document" data-toggle="${doc.id}">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="chevron">
              <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="document-details" ${isExpanded ? '' : 'hidden'}>
          <div class="document-json">
            <div class="json-label">Document Data:</div>
            <pre class="json-content">${JSON.stringify(doc.data, null, 2)}</pre>
          </div>
          <div class="document-actions">
            <button class="btn-text copy-doc-json" data-copy-json="${doc.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
              </svg>
              Copy JSON
            </button>
          </div>
        </div>
      </div>
    `;
  }

  getDocumentIcon(documentType) {
    const icons = {
      domain: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M7 7h10l-1 10H8L7 7zM6 7h12M10 3h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      profile: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      note: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      contactRequest: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    };

    return icons[documentType] || icons.note;
  }

  getDashPayDocumentIcon(documentType) {
    const icons = {
      profile: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      contactRequest: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M18 9a3 3 0 00-3-3H5a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3M9 13h6M7 7h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      contact: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2a3 3 0 00-5.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2a3 3 0 015.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    };

    return icons[documentType] || icons.profile;
  }

  getDashPayDocumentPreview(doc) {
    switch (doc.documentType) {
      case 'profile':
        return doc.data.displayName || doc.data.publicMessage?.substring(0, 50) || 'Profile';
      case 'contactRequest':
        return `Request from ${doc.data.fromUserId?.substring(0, 8) || 'Unknown'}...`;
      case 'contact':
        return doc.data.displayName || `Contact: ${doc.data.userId?.substring(0, 8) || 'Unknown'}...`;
      default:
        return 'Document';
    }
  }

  getDocumentPreview(doc) {
    switch (doc.documentType) {
      case 'domain':
        return `${doc.data.label}.dash`;
      case 'profile':
        return doc.data.displayName || doc.data.publicMessage?.substring(0, 50) || 'Profile';
      case 'note':
        return doc.data.title || doc.data.content?.substring(0, 50) || 'Note';
      case 'contactRequest':
        return `Contact Request to ${doc.data.toUserId?.substring(0, 8)}...`;
      default:
        return 'Document';
    }
  }

  groupByContract(documents) {
    const groups = new Map();

    documents.forEach(doc => {
      if (!groups.has(doc.contractId)) {
        groups.set(doc.contractId, []);
      }
      groups.get(doc.contractId).push(doc);
    });

    // Sort documents within each group by creation date (newest first)
    groups.forEach((docs, contractId) => {
      docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });

    return groups;
  }

  bindEvents() {
    // Toggle buttons
    const toggleButtons = this.container.querySelectorAll('[data-toggle]');
    toggleButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const docId = btn.dataset.toggle;
        this.toggleDocument(docId);
      });
    });

    // Copy JSON buttons
    const copyButtons = this.container.querySelectorAll('[data-copy-json]');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.dataset.copyJson;
        const doc = this.documents.find(d => d.id === docId);
        if (doc) {
          const json = JSON.stringify(doc.data, null, 2);
          navigator.clipboard.writeText(json).then(() => {
            notifications.success('Document JSON copied to clipboard');
          }).catch(() => {
            notifications.error('Failed to copy');
          });
        }
      });
    });

    // Refresh button
    const refreshBtn = this.container.querySelector('.refresh-documents');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (this.identityId) {
          this.loadDocuments(this.identityId);
          notifications.success('Documents refreshed');
        }
      });
    }
  }

  toggleDocument(docId) {
    if (this.expandedDocuments.has(docId)) {
      this.expandedDocuments.delete(docId);
    } else {
      this.expandedDocuments.add(docId);
    }

    // Re-render
    this.render();
  }
}
