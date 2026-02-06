/**
 * Name Resolver Component
 * Bidirectional DPNS name lookup:
 * - Username → Identity ID (forward resolution)
 * - Identity ID → All owned names (reverse resolution)
 */

import { stateManager } from '../state-manager.js';
import { notifications } from './notifications.js';
import { escapeHtml, formatIdentityId } from '../utils/formatter.js';
import { validateIdentityId } from '../utils/validator.js';

export class NameResolver {
  constructor(containerElement, mockPlatformOps) {
    this.container = containerElement;
    this.platformOps = mockPlatformOps;
    this.sdk = null; // Will be set via setSDK()
    this.isOpen = false;
    this.currentMode = 'forward'; // 'forward' or 'reverse'

    this.render();
    this.bindEvents();
  }

  /**
   * Set the SDK instance for network queries
   * @param {Object} sdk - EvoSDK instance
   */
  setSDK(sdk) {
    this.sdk = sdk;
  }

  render() {
    this.container.innerHTML = `
      <div class="name-resolver">
        <button class="name-resolver-trigger" aria-label="DPNS Name Resolver" title="DPNS Name Resolver">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="name-resolver-label">Name Lookup</span>
        </button>
        <div class="name-resolver-dropdown" hidden>
          <div class="name-resolver-header">
            <h3>DPNS Name Resolver</h3>
            <button class="name-resolver-close" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="name-resolver-mode-tabs">
            <button class="mode-tab active" data-mode="forward">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M17 8l4 4m0 0l-4 4m4-4H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Name → ID
            </button>
            <button class="mode-tab" data-mode="reverse">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M7 16l-4-4m0 0l4-4m-4 4h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ID → Names
            </button>
          </div>

          <div class="name-resolver-content">
            <!-- Forward Resolution Mode -->
            <div class="resolver-mode" data-mode="forward">
              <div class="form-group">
                <label for="name-lookup-input">DPNS Name</label>
                <input type="text"
                       id="name-lookup-input"
                       class="resolver-input"
                       placeholder="alice.dash or alice"
                       autocomplete="off" />
                <span class="input-help">Enter a username with or without .dash extension</span>
              </div>
              <button class="btn btn-primary btn-sm resolve-btn" data-action="resolve-name">
                <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Resolve
              </button>
            </div>

            <!-- Reverse Resolution Mode -->
            <div class="resolver-mode" data-mode="reverse" hidden>
              <div class="form-group">
                <label for="identity-lookup-input">Identity ID</label>
                <input type="text"
                       id="identity-lookup-input"
                       class="resolver-input"
                       placeholder="44-character identity ID"
                       maxlength="44"
                       autocomplete="off" />
                <span class="input-help">Enter a complete identity ID (base58, 44 characters)</span>
                <div id="identity-validation-status" class="identity-validation-status"></div>
              </div>
              <button class="btn btn-primary btn-sm resolve-btn" data-action="resolve-identity">
                <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Lookup
              </button>
            </div>

            <!-- Results Area -->
            <div class="resolver-results" id="resolver-results" hidden>
              <div class="results-header">
                <h4>Results</h4>
                <button class="btn-text clear-results-btn">Clear</button>
              </div>
              <div class="results-content">
                <!-- Dynamically populated -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Trigger button
    const trigger = this.container.querySelector('.name-resolver-trigger');
    trigger?.addEventListener('click', () => this.toggle());

    // Close button
    const closeBtn = this.container.querySelector('.name-resolver-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Close on backdrop click
    const dropdown = this.container.querySelector('.name-resolver-dropdown');
    dropdown?.addEventListener('click', (e) => {
      if (e.target === dropdown) {
        this.close();
      }
    });

    // Mode tabs
    const modeTabs = this.container.querySelectorAll('.mode-tab');
    modeTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchMode(tab.dataset.mode));
    });

    // Resolve buttons
    const resolveNameBtn = this.container.querySelector('[data-action="resolve-name"]');
    resolveNameBtn?.addEventListener('click', () => this.resolveName());

    const resolveIdentityBtn = this.container.querySelector('[data-action="resolve-identity"]');
    resolveIdentityBtn?.addEventListener('click', () => this.resolveIdentity());

    // Enter key support
    const nameInput = this.container.querySelector('#name-lookup-input');
    nameInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.resolveName();
    });

    const identityInput = this.container.querySelector('#identity-lookup-input');
    identityInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.resolveIdentity();
    });

    // Live validation for identity ID input
    identityInput?.addEventListener('input', (e) => {
      this.validateIdentityIdLive(e.target.value);
    });

    // Clear results
    const clearBtn = this.container.querySelector('.clear-results-btn');
    clearBtn?.addEventListener('click', () => this.clearResults());
  }

  validateIdentityIdLive(identityId) {
    const validationStatus = this.container.querySelector('#identity-validation-status');
    if (!validationStatus) return;

    if (!identityId || identityId.length === 0) {
      validationStatus.innerHTML = '';
      return;
    }

    const charCount = identityId.length;
    const validation = validateIdentityId(identityId);

    if (validation.valid) {
      validationStatus.innerHTML = `
        <div class="validation-message validation-success">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="currentColor"/>
          </svg>
          <span><strong>Valid Format</strong> - ${charCount}/44 characters</span>
        </div>
      `;
    } else {
      validationStatus.innerHTML = `
        <div class="validation-message validation-error">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="currentColor"/>
          </svg>
          <span><strong>${validation.error}</strong> - ${charCount}/44 characters</span>
        </div>
      `;
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    const dropdown = this.container.querySelector('.name-resolver-dropdown');
    if (dropdown) {
      dropdown.hidden = false;
      this.isOpen = true;
    }
  }

  close() {
    const dropdown = this.container.querySelector('.name-resolver-dropdown');
    if (dropdown) {
      dropdown.hidden = true;
      this.isOpen = false;
    }
  }

  switchMode(mode) {
    this.currentMode = mode;

    // Update tab states
    const tabs = this.container.querySelectorAll('.mode-tab');
    tabs.forEach(tab => {
      if (tab.dataset.mode === mode) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Show/hide mode panels
    const modePanels = this.container.querySelectorAll('.resolver-mode');
    modePanels.forEach(panel => {
      panel.hidden = panel.dataset.mode !== mode;
    });

    // Clear inputs and results
    this.clearInputs();
    this.clearResults();
  }

  clearInputs() {
    const nameInput = this.container.querySelector('#name-lookup-input');
    const identityInput = this.container.querySelector('#identity-lookup-input');
    if (nameInput) nameInput.value = '';
    if (identityInput) identityInput.value = '';
  }

  clearResults() {
    const resultsArea = this.container.querySelector('#resolver-results');
    if (resultsArea) {
      resultsArea.hidden = true;
      const content = resultsArea.querySelector('.results-content');
      if (content) content.innerHTML = '';
    }
  }

  async resolveName() {
    const input = this.container.querySelector('#name-lookup-input');
    if (!input) return;

    let name = input.value.trim().toLowerCase();
    if (!name) {
      notifications.error('Please enter a name to resolve');
      return;
    }

    // Normalize input: add .dash if not present
    if (!name.endsWith('.dash')) {
      name = `${name}.dash`;
    }

    try {
      // Search through all identities for this name
      const identities = stateManager.getAllIdentities();
      const owner = identities.find(identity =>
        identity.dpnsNames && identity.dpnsNames.includes(name)
      );

      const resultsArea = this.container.querySelector('#resolver-results');
      const resultsContent = resultsArea?.querySelector('.results-content');

      if (!resultsContent) return;

      if (owner) {
        // Name found - show owner
        resultsContent.innerHTML = `
          <div class="result-item result-success">
            <div class="result-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="color: var(--color-success);">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="result-details">
              <div class="result-title">Name Resolved</div>
              <div class="result-name">${escapeHtml(name)}</div>
              <div class="result-label">Owner Identity:</div>
              <div class="result-identity">
                <code class="monospace">${escapeHtml(owner.id)}</code>
                <button class="copy-btn" data-copy="${escapeHtml(owner.id)}" title="Copy ID">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
              </div>
              ${owner.label ? `<div class="result-label-tag">${escapeHtml(owner.label)}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        // Name not found
        resultsContent.innerHTML = `
          <div class="result-item result-error">
            <div class="result-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="color: var(--color-error);">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="result-details">
              <div class="result-title">Name Not Found</div>
              <div class="result-name">${escapeHtml(name)}</div>
              <p class="result-message">This name is not registered or not in your local identities.</p>
            </div>
          </div>
        `;
      }

      // Show results area
      resultsArea.hidden = false;

      // Bind copy buttons
      this.bindCopyButtons();

    } catch (error) {
      console.error('Name resolution error:', error);
      notifications.error(`Resolution failed: ${error.message}`);
    }
  }

  async resolveIdentity() {
    const input = this.container.querySelector('#identity-lookup-input');
    if (!input) return;

    const identityId = input.value.trim();
    if (!identityId) {
      notifications.error('Please enter an identity ID');
      return;
    }

    // Validate ID format
    const validation = validateIdentityId(identityId);
    if (!validation.valid) {
      notifications.error(validation.error);
      return;
    }

    const resultsArea = this.container.querySelector('#resolver-results');
    const resultsContent = resultsArea?.querySelector('.results-content');

    if (!resultsContent) return;

    try {
      // Look up identity in local cache first
      const identities = stateManager.getAllIdentities();
      const identity = identities.find(id => id.id === identityId);
      let names = identity?.dpnsNames || [];
      let identityLabel = identity?.label || null;

      // If SDK is available and no cached names, query DPNS network
      if (this.sdk && names.length === 0) {
        console.log('[NameResolver] Querying DPNS network for identity:', identityId);
        resultsContent.innerHTML = `
          <div class="result-item result-loading">
            <div class="result-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="spinner">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
                <path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="result-details">
              <div class="result-title">Querying DPNS Network...</div>
            </div>
          </div>
        `;
        resultsArea.hidden = false;

        try {
          const fetchedNames = await this.sdk.dpns.usernames({ identityId });
          names = (fetchedNames || []).map(n => n.endsWith('.dash') ? n : `${n}.dash`);
          console.log(`[NameResolver] DPNS returned ${names.length} names for ${identityId}`);

          // Update cached data if identity exists in state
          if (identity && names.length > 0) {
            identity.dpnsNames = names;
          }
        } catch (dpnsError) {
          console.warn('[NameResolver] DPNS query failed:', dpnsError.message);
          // Continue with empty names - will show appropriate message
        }
      }

      const namesList = names.length > 0
        ? names.map(name => `
            <div class="name-item">
              <span class="name-value">${escapeHtml(name)}</span>
              <button class="copy-btn" data-copy="${escapeHtml(name)}" title="Copy name">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                </svg>
              </button>
            </div>
          `).join('')
        : '<p class="empty-message">No names registered</p>';

      // Show result - identity found or just DPNS results
      if (identity || names.length > 0) {
        resultsContent.innerHTML = `
          <div class="result-item result-success">
            <div class="result-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="color: var(--color-success);">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="result-details">
              <div class="result-title">${identity ? 'Identity Found' : 'DPNS Lookup Complete'}</div>
              <div class="result-identity-short">
                <code class="monospace">${formatIdentityId(identityId)}</code>
                ${identityLabel ? `<span class="result-label-tag">${escapeHtml(identityLabel)}</span>` : ''}
              </div>
              <div class="result-label">Registered Names (${names.length}):</div>
              <div class="names-list">
                ${namesList}
              </div>
            </div>
          </div>
        `;
      } else {
        // Identity not found and no names from DPNS
        const noSdkMessage = !this.sdk
          ? 'Connect to a network to query DPNS.'
          : 'No DPNS names found for this identity.';
        resultsContent.innerHTML = `
          <div class="result-item result-error">
            <div class="result-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="color: var(--color-error);">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="result-details">
              <div class="result-title">Identity Not Found</div>
              <div class="result-identity-short">
                <code class="monospace">${formatIdentityId(identityId)}</code>
              </div>
              <p class="result-message">${noSdkMessage}</p>
            </div>
          </div>
        `;
      }

      // Show results area
      resultsArea.hidden = false;

      // Bind copy buttons
      this.bindCopyButtons();

    } catch (error) {
      console.error('Identity resolution error:', error);
      notifications.error(`Lookup failed: ${error.message}`);
    }
  }

  bindCopyButtons() {
    const copyButtons = this.container.querySelectorAll('[data-copy]');
    copyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          notifications.success('Copied to clipboard');
        }).catch(() => {
          notifications.error('Failed to copy');
        });
      });
    });
  }
}
