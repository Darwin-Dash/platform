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

  selectNetwork(network) {
    this.setNetwork(network, true);
    this.closeDropdown();
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

    // Show notification
    if (showNotification) {
      const networkName = network.charAt(0).toUpperCase() + network.slice(1);
      notifications.success(`Switched to ${networkName}`);

      // Warn if switching to mainnet
      if (network === 'mainnet') {
        setTimeout(() => {
          notifications.warning('You are now on Mainnet - real funds will be used!');
        }, 500);
      }
    }

    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('network-changed', {
      detail: { network }
    }));
  }

  getCurrentNetwork() {
    return localStorage.getItem('dash-network') || 'testnet';
  }
}
