/**
 * DashPay Contact Requests Component
 * Manages inbound and outbound contact requests
 * - Display inbound requests with approve/reject buttons
 * - Display outbound requests with status
 * - Send new contact requests
 */

import { stateManager } from '../state-manager.js';
import { notifications } from './notifications.js';
import { escapeHtml, formatIdentityId, formatTimestamp } from '../utils/formatter.js';
import { DashPayManager } from './dashpay-manager.js';

export class ContactRequestsManager {
  constructor(containerElement, platformOps) {
    this.container = containerElement;
    this.platformOps = platformOps;
    this.dashpay = new DashPayManager(platformOps);
    this._app = null;
    this.inboundRequests = [];
    this.outboundRequests = [];
    // Store original documents for SDK operations
    this.inboundDocuments = new Map();
    this.outboundDocuments = new Map();

    this.render();
  }

  /**
   * Update SDK reference (called when SDK is initialized)
   */
  setSDK(sdk, mnemonic) {
    this.dashpay.setSDK(sdk, mnemonic);
  }

  /**
   * Set the app reference to avoid window.app coupling
   */
  setApp(app) {
    this._app = app;
  }

  async loadContactRequests(identityId) {
    // Guard against concurrent loads (Issue 9: prevents duplicate rendering)
    if (this._loadingForIdentity === identityId) return;
    this._loadingForIdentity = identityId;

    try {
      // Load both inbound and outbound requests
      const [inbound, outbound] = await Promise.all([
        this.dashpay.getInboundContactRequests(identityId),
        this.dashpay.getOutboundContactRequests(identityId)
      ]);

      // Clear document maps
      this.inboundDocuments.clear();
      this.outboundDocuments.clear();

      // Enhance with sender/recipient information
      this.inboundRequests = await Promise.all(inbound.map(async (req) => {
        // Store original document for SDK operations
        this.inboundDocuments.set(req.id, req);

        // Get sender's identity and profile
        const allIdentities = stateManager.getAllIdentities();
        const sender = allIdentities.find(id => id.id === req.ownerId);
        const profile = await this.dashpay.getProfile(req.ownerId);

        return {
          id: req.id,
          senderId: req.ownerId,
          senderName: profile?.data?.displayName || sender?.label || formatIdentityId(req.ownerId),
          senderDpnsNames: sender?.dpnsNames || [],
          senderMessage: profile?.data?.publicMessage || '',
          createdAt: req.createdAt
        };
      }));

      this.outboundRequests = await Promise.all(outbound.map(async (req) => {
        // Store original document for SDK operations
        this.outboundDocuments.set(req.id, req);

        // Get recipient's identity info if available
        const allIdentities = stateManager.getAllIdentities();
        const recipient = allIdentities.find(id => id.id === req.data.toUserId);
        const profile = await this.dashpay.getProfile(req.data.toUserId);

        return {
          id: req.id,
          recipientId: req.data.toUserId,
          recipientName: profile?.data?.displayName || recipient?.label || formatIdentityId(req.data.toUserId),
          recipientDpnsNames: recipient?.dpnsNames || [],
          status: 'pending',
          createdAt: req.createdAt
        };
      }));

      this.renderRequests();
    } catch (error) {
      console.error('Failed to load contact requests:', error);
      this.renderError(error.message);
    } finally {
      this._loadingForIdentity = null;
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="contact-requests-viewer">
        <div class="requests-tabs">
          <button class="request-tab active" data-tab="inbound">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Inbound (<span id="inbound-count">0</span>)
          </button>
          <button class="request-tab" data-tab="outbound">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 10l7-7m0 0l7 7m-7-7v18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Outbound (<span id="outbound-count">0</span>)
          </button>
        </div>

        <div class="requests-content">
          <!-- Inbound Requests -->
          <div class="requests-panel" data-panel="inbound">
            <div class="panel-header">
              <h4>Received Contact Requests</h4>
            </div>
            <div class="requests-list" id="inbound-requests-list">
              <p class="empty-message">Loading...</p>
            </div>
          </div>

          <!-- Outbound Requests -->
          <div class="requests-panel" data-panel="outbound" hidden>
            <div class="panel-header">
              <h4>Sent Contact Requests</h4>
            </div>
            <div class="requests-list" id="outbound-requests-list">
              <p class="empty-message">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Tab switching
    const tabs = this.container.querySelectorAll('.request-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
  }

  switchTab(tabName) {
    // Update tab states
    const tabs = this.container.querySelectorAll('.request-tab');
    tabs.forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Show/hide panels
    const panels = this.container.querySelectorAll('.requests-panel');
    panels.forEach(panel => {
      panel.hidden = panel.dataset.panel !== tabName;
    });
  }

  renderRequests() {
    // Update counts
    const inboundCount = this.container.querySelector('#inbound-count');
    const outboundCount = this.container.querySelector('#outbound-count');
    if (inboundCount) inboundCount.textContent = this.inboundRequests.length;
    if (outboundCount) outboundCount.textContent = this.outboundRequests.length;

    // Render inbound requests
    this.renderInboundRequests();

    // Render outbound requests
    this.renderOutboundRequests();
  }

  renderInboundRequests() {
    const list = this.container.querySelector('#inbound-requests-list');
    if (!list) return;

    if (this.inboundRequests.length === 0) {
      list.innerHTML = '<p class="empty-message">No pending contact requests</p>';
      return;
    }

    list.innerHTML = this.inboundRequests.map(req => `
      <div class="contact-request-card request-inbound" data-request-id="${req.id}">
        <div class="request-avatar">
          <div class="contact-avatar-placeholder">
            ${escapeHtml(req.senderName.charAt(0).toUpperCase())}
          </div>
        </div>
        <div class="request-info">
          <div class="request-sender-name">${escapeHtml(req.senderName)}</div>
          ${req.senderDpnsNames.length > 0 ? `
            <div class="request-dpns">
              ${req.senderDpnsNames.map(name => `<span class="dpns-badge">${escapeHtml(name)}</span>`).join('')}
            </div>
          ` : ''}
          ${req.senderMessage ? `
            <div class="request-message">${escapeHtml(req.senderMessage)}</div>
          ` : ''}
          <div class="request-meta">
            <span class="request-id">${formatIdentityId(req.senderId)}</span>
            <span class="request-time">${formatTimestamp(req.createdAt)}</span>
          </div>
        </div>
        <div class="request-actions">
          <button class="btn btn-primary btn-sm" data-action="accept" data-request-id="${req.id}">
            <svg class="icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="currentColor"/>
            </svg>
            Accept
          </button>
          <button class="btn btn-danger btn-sm" data-action="reject" data-request-id="${req.id}">
            <svg class="icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="currentColor"/>
            </svg>
            Reject
          </button>
        </div>
      </div>
    `).join('');

    // Bind action buttons
    this.bindInboundActions();
  }

  renderOutboundRequests() {
    const list = this.container.querySelector('#outbound-requests-list');
    if (!list) return;

    if (this.outboundRequests.length === 0) {
      list.innerHTML = '<p class="empty-message">No sent contact requests</p>';
      return;
    }

    list.innerHTML = this.outboundRequests.map(req => `
      <div class="contact-request-card request-outbound" data-request-id="${req.id}">
        <div class="request-avatar">
          <div class="contact-avatar-placeholder">
            ${escapeHtml(req.recipientName.charAt(0).toUpperCase())}
          </div>
        </div>
        <div class="request-info">
          <div class="request-sender-name">${escapeHtml(req.recipientName)}</div>
          ${req.recipientDpnsNames.length > 0 ? `
            <div class="request-dpns">
              ${req.recipientDpnsNames.map(name => `<span class="dpns-badge">${escapeHtml(name)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="request-meta">
            <span class="request-id">${formatIdentityId(req.recipientId)}</span>
            <span class="request-time">${formatTimestamp(req.createdAt)}</span>
          </div>
        </div>
        <div class="request-status">
          <span class="status-badge status-pending">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M10 6v4l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Pending
          </span>
        </div>
      </div>
    `).join('');
  }

  bindInboundActions() {
    const list = this.container.querySelector('#inbound-requests-list');
    if (!list) return;

    // Accept buttons
    const acceptBtns = list.querySelectorAll('[data-action="accept"]');
    acceptBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const requestId = btn.dataset.requestId;
        await this.handleAcceptRequest(requestId);
      });
    });

    // Reject buttons
    const rejectBtns = list.querySelectorAll('[data-action="reject"]');
    rejectBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const requestId = btn.dataset.requestId;
        await this.handleRejectRequest(requestId);
      });
    });
  }

  async handleAcceptRequest(requestId) {
    try {
      const identity = stateManager.getSelectedIdentity();
      if (!identity) return;

      stateManager.setLoading(true, 'Accepting contact request...');

      // Get the original contact request document
      const contactRequestDoc = this.inboundDocuments.get(requestId);
      if (!contactRequestDoc) {
        throw new Error('Contact request document not found');
      }

      // Get private key for signing (if real SDK mode and identity has index)
      let privateKeyWif = null;
      if (this.dashpay.canUseRealSDK() && identity.index !== undefined) {
        try {
          // Use platformOps to get private key for the identity
          privateKeyWif = await this._app?.platformOps?.getPrivateKeyForIdentity?.(identity.index, 1);
        } catch (keyError) {
          console.warn('[ContactRequests] Could not get private key:', keyError);
        }
      }

      await this.dashpay.acceptContactRequest(identity.id, contactRequestDoc, privateKeyWif);

      // Remove from inbound list and document map
      this.inboundRequests = this.inboundRequests.filter(req => req.id !== requestId);
      this.inboundDocuments.delete(requestId);

      // Re-render
      this.renderRequests();

    } catch (error) {
      notifications.error(`Failed to accept request: ${error.message}`);
    } finally {
      stateManager.setLoading(false);
    }
  }

  async handleRejectRequest(requestId) {
    try {
      const identity = stateManager.getSelectedIdentity();
      if (!identity) return;

      stateManager.setLoading(true, 'Rejecting contact request...');

      // Get the original contact request document
      const contactRequestDoc = this.inboundDocuments.get(requestId);
      if (!contactRequestDoc) {
        throw new Error('Contact request document not found');
      }

      // Get private key (optional for reject, but pass for consistency)
      let privateKeyWif = null;
      if (this.dashpay.canUseRealSDK() && identity.index !== undefined) {
        try {
          privateKeyWif = await this._app?.platformOps?.getPrivateKeyForIdentity?.(identity.index, 1);
        } catch (keyError) {
          console.warn('[ContactRequests] Could not get private key:', keyError);
        }
      }

      await this.dashpay.rejectContactRequest(identity.id, contactRequestDoc, privateKeyWif);

      // Remove from inbound list and document map
      this.inboundRequests = this.inboundRequests.filter(req => req.id !== requestId);
      this.inboundDocuments.delete(requestId);

      // Re-render
      this.renderRequests();

    } catch (error) {
      notifications.error(`Failed to reject request: ${error.message}`);
    } finally {
      stateManager.setLoading(false);
    }
  }

  showSendRequestDialog() {
    // Dispatch event to show send request dialog
    window.dispatchEvent(new CustomEvent('show-send-contact-request-dialog'));
  }

  renderError(message) {
    const inboundList = this.container.querySelector('#inbound-requests-list');
    const outboundList = this.container.querySelector('#outbound-requests-list');

    if (inboundList) {
      inboundList.innerHTML = `<p class="error-message">Failed to load: ${escapeHtml(message)}</p>`;
    }
    if (outboundList) {
      outboundList.innerHTML = `<p class="error-message">Failed to load: ${escapeHtml(message)}</p>`;
    }
  }
}
