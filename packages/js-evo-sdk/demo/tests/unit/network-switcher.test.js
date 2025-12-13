/**
 * Network Switcher Component Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the notifications module
vi.mock('../../components/notifications.js', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  }
}));

import { NetworkSwitcher } from '../../components/network-switcher.js';
import { stateManager } from '../../state-manager.js';
import { notifications } from '../../components/notifications.js';

describe('NetworkSwitcher', () => {
  let container;
  let notificationContainer;
  let networkSwitcher;

  beforeEach(() => {
    // Clear mock call history
    vi.clearAllMocks();

    // Setup notification container (required by notifications module)
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    document.body.appendChild(notificationContainer);

    // Setup DOM
    container = document.createElement('div');
    container.id = 'network-switcher-container';
    container.innerHTML = `
      <button class="network-selector-trigger" aria-label="Select network" aria-expanded="false">
        <span class="network-indicator"></span>
        <span class="network-name" id="current-network-name">Testnet</span>
        <svg class="chevron-icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="network-dropdown" hidden>
        <button class="network-option" data-network="testnet">
          <span class="network-indicator"></span>
          <span class="network-label">Testnet</span>
          <svg class="checkmark-icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M5 10L8.5 13.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="network-option" data-network="mainnet">
          <span class="network-indicator network-indicator-mainnet"></span>
          <span class="network-label">Mainnet</span>
          <svg class="checkmark-icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M5 10L8.5 13.5L15 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;
    document.body.appendChild(container);

    // Clear localStorage
    localStorage.clear();

    // Reset state manager
    stateManager.reset();
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (notificationContainer && notificationContainer.parentNode) {
      notificationContainer.parentNode.removeChild(notificationContainer);
    }
    localStorage.clear();
  });

  it('should initialize with testnet as default network', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const networkName = container.querySelector('.network-name');
    expect(networkName.textContent).toBe('Testnet');

    const storedNetwork = localStorage.getItem('dash-network');
    expect(storedNetwork).toBe('testnet');
  });

  it('should initialize with stored network from localStorage', () => {
    localStorage.setItem('dash-network', 'mainnet');

    networkSwitcher = new NetworkSwitcher(container);

    const networkName = container.querySelector('.network-name');
    expect(networkName.textContent).toBe('Mainnet');
  });

  it('should toggle dropdown on trigger click', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const trigger = container.querySelector('.network-selector-trigger');
    const dropdown = container.querySelector('.network-dropdown');

    // Initially closed
    expect(dropdown.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    // Click to open
    trigger.click();
    expect(dropdown.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // Click to close
    trigger.click();
    expect(dropdown.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('should switch network when option is clicked', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const mainnetOption = container.querySelector('[data-network="mainnet"]');

    // Click mainnet option
    mainnetOption.click();

    const networkName = container.querySelector('.network-name');
    expect(networkName.textContent).toBe('Mainnet');

    const storedNetwork = localStorage.getItem('dash-network');
    expect(storedNetwork).toBe('mainnet');
  });

  it('should update selected state on options', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const testnetOption = container.querySelector('[data-network="testnet"]');
    const mainnetOption = container.querySelector('[data-network="mainnet"]');

    // Initially testnet is selected
    expect(testnetOption.classList.contains('selected')).toBe(true);
    expect(mainnetOption.classList.contains('selected')).toBe(false);

    // Switch to mainnet
    mainnetOption.click();

    expect(testnetOption.classList.contains('selected')).toBe(false);
    expect(mainnetOption.classList.contains('selected')).toBe(true);
  });

  it('should update network indicator color for mainnet', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const indicator = container.querySelector('.network-selector-trigger .network-indicator');
    const mainnetOption = container.querySelector('[data-network="mainnet"]');

    // Initially no mainnet class
    expect(indicator.classList.contains('network-indicator-mainnet')).toBe(false);

    // Switch to mainnet
    mainnetOption.click();

    expect(indicator.classList.contains('network-indicator-mainnet')).toBe(true);
  });

  it('should dispatch network-changed event when switching', () => {
    networkSwitcher = new NetworkSwitcher(container);

    let eventFired = false;
    let eventDetail = null;

    window.addEventListener('network-changed', (e) => {
      eventFired = true;
      eventDetail = e.detail;
    });

    const mainnetOption = container.querySelector('[data-network="mainnet"]');
    mainnetOption.click();

    expect(eventFired).toBe(true);
    expect(eventDetail).toEqual({ network: 'mainnet' });
  });

  it('should close dropdown when clicking outside', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const trigger = container.querySelector('.network-selector-trigger');
    const dropdown = container.querySelector('.network-dropdown');

    // Open dropdown
    trigger.click();
    expect(dropdown.hidden).toBe(false);

    // Click outside
    document.body.click();
    expect(dropdown.hidden).toBe(true);
  });

  it('should close dropdown on Escape key', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const trigger = container.querySelector('.network-selector-trigger');
    const dropdown = container.querySelector('.network-dropdown');

    // Open dropdown
    trigger.click();
    expect(dropdown.hidden).toBe(false);

    // Press Escape
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeEvent);

    expect(dropdown.hidden).toBe(true);
  });

  it('should return current network from getCurrentNetwork()', () => {
    networkSwitcher = new NetworkSwitcher(container);

    expect(networkSwitcher.getCurrentNetwork()).toBe('testnet');

    const mainnetOption = container.querySelector('[data-network="mainnet"]');
    mainnetOption.click();

    expect(networkSwitcher.getCurrentNetwork()).toBe('mainnet');
  });

  it('should show success notification when switching networks', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const mainnetOption = container.querySelector('[data-network="mainnet"]');
    mainnetOption.click();

    expect(notifications.success).toHaveBeenCalledWith('Switched to Mainnet');
  });

  it('should show warning notification when switching to mainnet', (done) => {
    networkSwitcher = new NetworkSwitcher(container);

    const mainnetOption = container.querySelector('[data-network="mainnet"]');
    mainnetOption.click();

    // Wait for the warning notification (shown after 500ms delay)
    setTimeout(() => {
      expect(notifications.warning).toHaveBeenCalledWith('You are now on Mainnet - real funds will be used!');
      done();
    }, 600);
  });

  it('should update state manager network', () => {
    networkSwitcher = new NetworkSwitcher(container);

    const mainnetOption = container.querySelector('[data-network="mainnet"]');
    mainnetOption.click();

    expect(stateManager.state.network).toBe('mainnet');
  });

  // Edge case tests
  describe('Edge Cases', () => {
    it('should handle concurrent network switch attempts', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const testnetOption = container.querySelector('[data-network="testnet"]');
      const mainnetOption = container.querySelector('[data-network="mainnet"]');

      // Rapidly switch between networks
      mainnetOption.click();
      testnetOption.click();
      mainnetOption.click();

      // Should end up on the last selected network (mainnet)
      expect(networkSwitcher.getCurrentNetwork()).toBe('mainnet');
      expect(stateManager.state.network).toBe('mainnet');
      expect(localStorage.getItem('dash-network')).toBe('mainnet');
    });

    it('should not crash when Escape is pressed with dropdown already closed', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const dropdown = container.querySelector('.network-dropdown');

      // Ensure dropdown is closed
      expect(dropdown.hidden).toBe(true);

      // Press Escape when dropdown is already closed
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      // Should remain closed without errors
      expect(dropdown.hidden).toBe(true);
    });

    it('should handle clicking outside when dropdown is already closed', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const dropdown = container.querySelector('.network-dropdown');

      // Ensure dropdown is closed
      expect(dropdown.hidden).toBe(true);

      // Click outside when dropdown is already closed
      document.body.click();

      // Should remain closed without errors
      expect(dropdown.hidden).toBe(true);
    });

    it('should not show notifications on initial load even if network is set', () => {
      // Pre-set network in localStorage
      localStorage.setItem('dash-network', 'mainnet');

      // Initialize component
      networkSwitcher = new NetworkSwitcher(container);

      // Notifications should not be called during initialization
      expect(notifications.success).not.toHaveBeenCalled();
      expect(notifications.warning).not.toHaveBeenCalled();
    });

    it('should handle switching to the same network gracefully', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const testnetOption = container.querySelector('[data-network="testnet"]');

      // Already on testnet, switch to testnet again
      testnetOption.click();

      // Should still be testnet
      expect(networkSwitcher.getCurrentNetwork()).toBe('testnet');
      expect(notifications.success).toHaveBeenCalledWith('Switched to Testnet');
    });

    it('should maintain state after multiple dropdown open/close cycles', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const trigger = container.querySelector('.network-selector-trigger');
      const dropdown = container.querySelector('.network-dropdown');
      const mainnetOption = container.querySelector('[data-network="mainnet"]');

      // Open and close dropdown multiple times
      trigger.click(); // Open
      trigger.click(); // Close
      trigger.click(); // Open
      document.body.click(); // Close by clicking outside
      trigger.click(); // Open

      // Should still be open
      expect(dropdown.hidden).toBe(false);

      // Switch network
      mainnetOption.click();

      // Should have switched successfully
      expect(networkSwitcher.getCurrentNetwork()).toBe('mainnet');
    });

    it('should handle rapid dropdown open/close without errors', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const trigger = container.querySelector('.network-selector-trigger');

      // Rapidly toggle dropdown
      for (let i = 0; i < 10; i++) {
        trigger.click();
      }

      // Should end up in a consistent state (closed after even number of clicks)
      const dropdown = container.querySelector('.network-dropdown');
      expect(dropdown.hidden).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
  });
});
