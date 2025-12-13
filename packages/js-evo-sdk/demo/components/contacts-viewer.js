/**
 * DashPay Contacts Viewer Component
 * Displays accepted contacts with profiles and DPNS names
 */

import { stateManager } from '../state-manager.js';
import { notifications } from './notifications.js';
import { formatIdentityId } from '../utils/formatter.js';
import { DashPayManager } from './dashpay-manager.js';

export class ContactsViewer {
  constructor(containerElement, platformOps) {
    this.container = containerElement;
    this.platformOps = platformOps;
    this.dashpay = new DashPayManager(platformOps);
    this.contacts = [];

    this.render();
  }

  async loadContacts(identityId) {
    try {
      // Get accepted contacts (contactInfo documents)
      const contacts = await this.dashpay.getAcceptedContacts(identityId);

      // For each contact, try to resolve their identity and profile
      this.contacts = await Promise.all(contacts.map(async (contact) => {
        // In a real implementation, we'd decrypt the contact data to get their identity ID
        // For mock, we'll use the document owner ID as a placeholder

        // Try to find the identity in our local data
        const allIdentities = stateManager.getAllIdentities();
        const contactIdentity = allIdentities.find(id => id.id === contact.ownerId);

        // Get profile if available
        const profile = await this.dashpay.getProfile(contact.ownerId);

        return {
          id: contact.id,
          identityId: contact.ownerId,
          displayName: profile?.data?.displayName || contactIdentity?.label || 'Unknown',
          dpnsNames: contactIdentity?.dpnsNames || [],
          publicMessage: profile?.data?.publicMessage || '',
          avatarUrl: profile?.data?.avatarUrl || '',
          createdAt: contact.createdAt
        };
      }));

      this.renderContacts();
    } catch (error) {
      console.error('Failed to load contacts:', error);
      this.renderError(error.message);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="contacts-viewer">
        <div class="contacts-list" id="contacts-list">
          <p class="empty-message">Loading contacts...</p>
        </div>
      </div>
    `;
  }

  renderContacts() {
    const list = this.container.querySelector('#contacts-list');
    if (!list) return;

    if (this.contacts.length === 0) {
      list.innerHTML = '<p class="empty-message">No contacts yet. Send a contact request to get started!</p>';
      return;
    }

    list.innerHTML = this.contacts.map(contact => `
      <div class="contact-card" data-contact-id="${contact.id}">
        <div class="contact-avatar">
          ${contact.avatarUrl ? `<img src="${contact.avatarUrl}" alt="${contact.displayName}" />` : `
            <div class="contact-avatar-placeholder">
              ${contact.displayName.charAt(0).toUpperCase()}
            </div>
          `}
        </div>
        <div class="contact-info">
          <div class="contact-name">${contact.displayName}</div>
          ${contact.dpnsNames.length > 0 ? `
            <div class="contact-dpns">
              ${contact.dpnsNames.map(name => `<span class="dpns-badge">${name}</span>`).join('')}
            </div>
          ` : ''}
          ${contact.publicMessage ? `
            <div class="contact-message">${contact.publicMessage}</div>
          ` : ''}
          <div class="contact-id">
            <span class="monospace">${formatIdentityId(contact.identityId)}</span>
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn btn-secondary btn-sm" data-action="view-profile" data-identity="${contact.identityId}">
            View Profile
          </button>
          <button class="btn btn-secondary btn-sm" data-action="send-credits" data-identity="${contact.identityId}">
            Send Credits
          </button>
          <button class="btn btn-danger btn-sm" data-action="remove-contact" data-contact-id="${contact.id}">
            <svg class="icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v12a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" fill="currentColor"/>
            </svg>
            Remove
          </button>
        </div>
      </div>
    `).join('');

    // Bind action buttons
    this.bindContactActions();
  }

  bindContactActions() {
    const list = this.container.querySelector('#contacts-list');
    if (!list) return;

    // View profile buttons
    const viewBtns = list.querySelectorAll('[data-action="view-profile"]');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const identityId = btn.dataset.identity;
        // Navigate to identity view
        stateManager.selectIdentity(identityId);
      });
    });

    // Send credits buttons
    const sendBtns = list.querySelectorAll('[data-action="send-credits"]');
    sendBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const identityId = btn.dataset.identity;
        // Trigger transfer modal with pre-filled recipient
        window.dispatchEvent(new CustomEvent('open-transfer-modal', {
          detail: { recipientId: identityId }
        }));
      });
    });

    // Remove contact buttons
    const removeBtns = list.querySelectorAll('[data-action="remove-contact"]');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const contactId = btn.dataset.contactId;
        await this.handleRemoveContact(contactId);
      });
    });
  }

  async handleRemoveContact(contactId) {
    const confirmed = confirm('Are you sure you want to remove this contact?');
    if (!confirmed) return;

    try {
      const identity = stateManager.getSelectedIdentity();
      if (!identity) return;

      await this.dashpay.removeContact(identity.id, contactId);

      // Reload contacts
      await this.loadContacts(identity.id);
    } catch (error) {
      notifications.error(`Failed to remove contact: ${error.message}`);
    }
  }

  showAddContactDialog() {
    // Dispatch event to show add contact dialog (could be handled by parent)
    window.dispatchEvent(new CustomEvent('show-add-contact-dialog'));
    notifications.info('Send a contact request to add someone to your contacts');
  }

  renderError(message) {
    const list = this.container.querySelector('#contacts-list');
    if (list) {
      list.innerHTML = `<p class="error-message">Failed to load contacts: ${message}</p>`;
    }
  }
}
