/**
 * Identity Selector Component
 * Dropdown selector for switching between identities
 */

import { stateManager } from '../state-manager.js';
import { formatIdentityId, formatDuffs } from '../utils/formatter.js';

export class IdentitySelector {
  constructor(containerElement) {
    this.container = containerElement;
    this.isOpen = false;
    this.searchTerm = '';

    this.init();
    this.bindEvents();
    this.subscribeToState();
  }

  init() {
    // Get elements
    this.trigger = this.container.querySelector('.selector-trigger');
    this.dropdown = this.container.querySelector('.selector-dropdown');
    this.searchInput = this.container.querySelector('.search-input');
    this.identityList = this.container.querySelector('.identity-list');

    // Set initial state
    this.updateDisplay();
  }

  bindEvents() {
    // Toggle dropdown
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Search functionality
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.toLowerCase();
        this.renderIdentityList();
      });

      // Prevent dropdown from closing when clicking search
      this.searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target) && this.isOpen) {
        this.close();
      }
    });

    // Keyboard navigation
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  subscribeToState() {
    // Update when identities change
    stateManager.on('identity-updated', () => {
      this.renderIdentityList();
      this.updateDisplay();
    });

    // Update when identity is selected
    stateManager.on('identity-selected', () => {
      this.updateDisplay();
      this.close();
    });

    // Update when identity is removed
    stateManager.on('identity-removed', () => {
      this.renderIdentityList();
      this.updateDisplay();
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    if (this.isOpen) return;

    this.isOpen = true;
    this.dropdown.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.dropdown.classList.add('dropdown-enter');

    // Focus search input if available
    if (this.searchInput) {
      setTimeout(() => this.searchInput.focus(), 100);
    }

    // Render fresh list
    this.renderIdentityList();
  }

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.dropdown.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.dropdown.classList.remove('dropdown-enter');

    // Clear search
    if (this.searchInput) {
      this.searchInput.value = '';
      this.searchTerm = '';
    }
  }

  updateDisplay() {
    const selectedIdentity = stateManager.getSelectedIdentity();
    const preview = this.trigger.querySelector('.identity-preview');

    if (selectedIdentity) {
      const idDisplay = formatIdentityId(selectedIdentity.id);
      const balanceDisplay = formatDuffs(selectedIdentity.balance);

      // Display priority: custom label > first DPNS name > formatted ID
      const displayName = selectedIdentity.label ||
                         (selectedIdentity.dpnsNames && selectedIdentity.dpnsNames.length > 0 ? selectedIdentity.dpnsNames[0] : null) ||
                         idDisplay;

      preview.innerHTML = `
        <span class="identity-label">${displayName}</span>
        <span class="identity-balance">${balanceDisplay}</span>
      `;
    } else {
      preview.innerHTML = `
        <span class="identity-label">Select Identity</span>
        <span class="identity-balance">--</span>
      `;
    }
  }

  renderIdentityList() {
    const identities = stateManager.getAllIdentities();
    const selectedId = stateManager.getState().ui.selectedIdentityId;

    // Filter by search term
    const filtered = this.searchTerm
      ? identities.filter(id => {
          const dpnsNamesString = (id.dpnsNames || []).join(' ');
          const searchTarget = `${id.id} ${id.label || ''} ${dpnsNamesString}`.toLowerCase();
          return searchTarget.includes(this.searchTerm);
        })
      : identities;

    // Clear list
    this.identityList.innerHTML = '';

    // Render filtered identities
    filtered.forEach(identity => {
      const li = document.createElement('li');
      li.className = 'identity-item';
      if (identity.id === selectedId) {
        li.classList.add('selected');
      }

      const idDisplay = formatIdentityId(identity.id);
      const balanceDisplay = formatDuffs(identity.balance);

      // Display priority: custom label > first DPNS name > formatted ID
      const displayName = identity.label ||
                         (identity.dpnsNames && identity.dpnsNames.length > 0 ? identity.dpnsNames[0] : null) ||
                         idDisplay;

      li.innerHTML = `
        <div class="identity-item-content">
          <span class="identity-id">${displayName}</span>
          <span class="identity-balance">${balanceDisplay}</span>
        </div>
        ${displayName !== idDisplay ? `<span class="identity-id-full">${idDisplay}</span>` : ''}
      `;

      li.addEventListener('click', () => {
        this.selectIdentity(identity.id);
      });

      this.identityList.appendChild(li);
    });

    // Show empty state if no identities
    if (filtered.length === 0 && !this.searchTerm) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty-state';
      emptyLi.textContent = 'No identities yet - use Actions menu to create one';
      this.identityList.appendChild(emptyLi);
    } else if (filtered.length === 0 && this.searchTerm) {
      const noResultsLi = document.createElement('li');
      noResultsLi.className = 'no-results';
      noResultsLi.textContent = 'No matching identities';
      this.identityList.appendChild(noResultsLi);
    }
  }

  selectIdentity(identityId) {
    stateManager.selectIdentity(identityId);
  }

  // Public methods for external control
  setIdentity(identityId) {
    this.selectIdentity(identityId);
  }

  refresh() {
    this.renderIdentityList();
    this.updateDisplay();
  }
}