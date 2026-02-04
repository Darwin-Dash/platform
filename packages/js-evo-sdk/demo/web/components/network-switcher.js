/**
 * Network Switcher Component
 * Handles network selection (testnet/mainnet) with dropdown UI
 */

import { stateManager } from '../state-manager.js';
import { notifications } from './notifications.js';

export class NetworkSwitcher {
  constructor(containerElement) {
    this.container = containerElement;
    this.trigger = containerElement.querySelector('.network-selector-trigger');
    this.dropdown = containerElement.querySelector('.network-dropdown');
    this.networkNameEl = containerElement.querySelector('.network-name');
    this.options = containerElement.querySelectorAll('.network-option');

    this.init();
  }

  init() {
    // Initialize with stored network or default to testnet
    const storedNetwork = localStorage.getItem('dash-network') || 'testnet';
    this.setNetwork(storedNetwork, false); // Don't show notification on init

    // Bind event handlers
    this.bindEvents();
  }

  bindEvents() {
    // Toggle dropdown on trigger click
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Handle network selection
    this.options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const network = option.dataset.network;
        this.selectNetwork(network);
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Close dropdown on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.dropdown.hidden) {
        this.closeDropdown();
      }
    });
  }

  toggleDropdown() {
    const isExpanded = this.trigger.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    this.trigger.setAttribute('aria-expanded', 'true');
    this.dropdown.hidden = false;
    this.dropdown.classList.add('dropdown-enter');
  }

  closeDropdown() {
    this.trigger.setAttribute('aria-expanded', 'false');
    this.dropdown.hidden = true;
    this.dropdown.classList.remove('dropdown-enter');
  }

  async selectNetwork(network) {
    // If switching to mainnet, show confirmation dialog first
    if (network === 'mainnet' && this.getCurrentNetwork() !== 'mainnet') {
      const confirmed = await this.showMainnetConfirmDialog();
      if (!confirmed) {
        this.closeDropdown();
        return;
      }
    }

    this.setNetwork(network, true);
    this.closeDropdown();
  }

  /**
   * Show confirmation dialog before switching to mainnet
   * @returns {Promise<boolean>} True if confirmed, false if cancelled
   */
  showMainnetConfirmDialog() {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay mainnet-confirm-overlay';
      overlay.innerHTML = `
        <div class="modal mainnet-confirm-modal">
          <div class="modal-content">
            <div class="modal-header">
              <div class="mainnet-warning-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="color: var(--color-warning);">
                  <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/>
                </svg>
              </div>
              <h2>Switch to Mainnet?</h2>
            </div>
            <div class="modal-body">
              <p class="mainnet-warning-text">
                <strong>Warning:</strong> You are about to switch to Mainnet where <strong>real DASH</strong> will be used.
              </p>
              <ul class="mainnet-warning-list">
                <li>All transactions will use real funds</li>
                <li>Identity creation costs real DASH</li>
                <li>Actions cannot be reversed</li>
              </ul>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" id="mainnet-cancel-btn">Stay on Testnet</button>
              <button class="btn btn-warning" id="mainnet-confirm-btn">Yes, Switch to Mainnet</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Focus the cancel button for safety
      setTimeout(() => {
        const cancelBtn = document.getElementById('mainnet-cancel-btn');
        if (cancelBtn) cancelBtn.focus();
      }, 100);

      // Handle confirm
      const confirmBtn = document.getElementById('mainnet-confirm-btn');
      confirmBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      // Handle cancel
      const cancelBtn = document.getElementById('mainnet-cancel-btn');
      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });

      // Handle escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEscape);

      // Handle backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }

  setNetwork(network, showNotification = true) {
    // Update localStorage
    localStorage.setItem('dash-network', network);

    // Update UI - network name
    this.networkNameEl.textContent = network.charAt(0).toUpperCase() + network.slice(1);

    // Update selected state on options
    this.options.forEach(option => {
      if (option.dataset.network === network) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });

    // Update network indicator color based on network
    const indicator = this.trigger.querySelector('.network-indicator');
    if (network === 'mainnet') {
      indicator.classList.add('network-indicator-mainnet');
    } else {
      indicator.classList.remove('network-indicator-mainnet');
    }

    // Update state manager
    stateManager.setNetwork(network);

    // Show single consolidated notification (Fix 2.2: prevent duplicate notifications)
    if (showNotification) {
      const networkName = network.charAt(0).toUpperCase() + network.slice(1);
      if (network === 'mainnet') {
        notifications.warning(`Switched to ${networkName} - real funds will be used!`);
      } else {
        notifications.success(`Switched to ${networkName}`);
      }
    }

    // Note: stateManager.setNetwork() already emits 'network-changed' via the event emitter.
    // Components should listen to stateManager events for state changes.
  }

  getCurrentNetwork() {
    return localStorage.getItem('dash-network') || 'testnet';
  }
}
