/**
 * Network Switcher Integration Tests
 * Tests network switcher integration with app.js, state manager, and notification system
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

describe('Network Switcher Integration', () => {
  let container;
  let networkSwitcher;
  let networkChangedHandler;

  beforeEach(() => {
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

    // Setup event listener spy
    networkChangedHandler = vi.fn();
    window.addEventListener('network-changed', networkChangedHandler);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    window.removeEventListener('network-changed', networkChangedHandler);
    localStorage.clear();
  });

  describe('State Manager Integration', () => {
    it('should sync network state with state manager', () => {
      networkSwitcher = new NetworkSwitcher(container);

      expect(stateManager.state.network).toBe('testnet');

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      expect(stateManager.state.network).toBe('mainnet');
    });

    it('should emit state manager network-changed event', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const eventSpy = vi.fn();
      const unsubscribe = stateManager.on('network-changed', eventSpy);

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      expect(eventSpy).toHaveBeenCalledWith('mainnet');
      unsubscribe();
    });
  });

  describe('Notification System Integration', () => {
    it('should show notifications when switching networks', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      expect(notifications.success).toHaveBeenCalledWith('Switched to Mainnet');
    });

    it('should not show notifications on initial load', () => {
      // Clear any previous calls
      vi.clearAllMocks();

      networkSwitcher = new NetworkSwitcher(container);

      expect(notifications.success).not.toHaveBeenCalled();
      expect(notifications.warning).not.toHaveBeenCalled();
    });

    it('should show warning when switching to mainnet', (done) => {
      networkSwitcher = new NetworkSwitcher(container);

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      setTimeout(() => {
        expect(notifications.warning).toHaveBeenCalledWith('You are now on Mainnet - real funds will be used!');
        done();
      }, 600);
    });

    it('should not show warning when switching to testnet', () => {
      // Start with mainnet
      localStorage.setItem('dash-network', 'mainnet');
      networkSwitcher = new NetworkSwitcher(container);

      vi.clearAllMocks();

      const testnetOption = container.querySelector('[data-network="testnet"]');
      testnetOption.click();

      expect(notifications.success).toHaveBeenCalledWith('Switched to Testnet');
      // Warning should only be shown for mainnet
      expect(notifications.warning).not.toHaveBeenCalled();
    });
  });

  describe('Custom Event Integration', () => {
    it('should dispatch global network-changed event', () => {
      networkSwitcher = new NetworkSwitcher(container);

      // Clear any calls from init
      networkChangedHandler.mockClear();

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      expect(networkChangedHandler).toHaveBeenCalled();
      expect(networkChangedHandler.mock.calls[0][0].detail).toEqual({ network: 'mainnet' });
    });

    it('should allow other components to listen for network changes', () => {
      networkSwitcher = new NetworkSwitcher(container);

      let capturedNetwork = null;
      window.addEventListener('network-changed', (e) => {
        capturedNetwork = e.detail.network;
      });

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      expect(capturedNetwork).toBe('mainnet');
    });
  });

  describe('LocalStorage Persistence Integration', () => {
    it('should persist network selection across page reloads', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      // Simulate page reload by creating new instance
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }

      const newContainer = document.createElement('div');
      newContainer.innerHTML = container.innerHTML;
      document.body.appendChild(newContainer);

      const newNetworkSwitcher = new NetworkSwitcher(newContainer);

      expect(newNetworkSwitcher.getCurrentNetwork()).toBe('mainnet');
      expect(localStorage.getItem('dash-network')).toBe('mainnet');

      // Cleanup
      if (newContainer && newContainer.parentNode) {
        newContainer.parentNode.removeChild(newContainer);
      }
    });

    it('should restore network from localStorage on init', () => {
      localStorage.setItem('dash-network', 'mainnet');

      networkSwitcher = new NetworkSwitcher(container);

      const networkName = container.querySelector('.network-name');
      expect(networkName.textContent).toBe('Mainnet');
      expect(stateManager.state.network).toBe('mainnet');
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete full network switch workflow', () => {
      networkSwitcher = new NetworkSwitcher(container);

      // Verify initial state
      expect(stateManager.state.network).toBe('testnet');
      expect(localStorage.getItem('dash-network')).toBe('testnet');
      expect(networkSwitcher.getCurrentNetwork()).toBe('testnet');

      // Open dropdown
      const trigger = container.querySelector('.network-selector-trigger');
      trigger.click();

      const dropdown = container.querySelector('.network-dropdown');
      expect(dropdown.hidden).toBe(false);

      // Switch to mainnet
      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      // Verify state changes
      expect(stateManager.state.network).toBe('mainnet');
      expect(localStorage.getItem('dash-network')).toBe('mainnet');
      expect(networkSwitcher.getCurrentNetwork()).toBe('mainnet');

      // Verify UI updates
      const networkName = container.querySelector('.network-name');
      expect(networkName.textContent).toBe('Mainnet');

      // Verify dropdown closed
      expect(dropdown.hidden).toBe(true);

      // Verify events fired
      expect(networkChangedHandler).toHaveBeenCalled();
    });

    it('should handle rapid network switching correctly', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const testnetOption = container.querySelector('[data-network="testnet"]');
      const mainnetOption = container.querySelector('[data-network="mainnet"]');

      // Rapid switching
      mainnetOption.click();
      testnetOption.click();
      mainnetOption.click();

      // Final state should be mainnet
      expect(stateManager.state.network).toBe('mainnet');
      expect(localStorage.getItem('dash-network')).toBe('mainnet');
      expect(networkSwitcher.getCurrentNetwork()).toBe('mainnet');
    });

    it('should maintain consistency across all integrated systems', () => {
      networkSwitcher = new NetworkSwitcher(container);

      const mainnetOption = container.querySelector('[data-network="mainnet"]');
      mainnetOption.click();

      // All systems should agree on network state
      const network = 'mainnet';
      expect(stateManager.state.network).toBe(network);
      expect(localStorage.getItem('dash-network')).toBe(network);
      expect(networkSwitcher.getCurrentNetwork()).toBe(network);

      // UI should reflect the state
      const networkName = container.querySelector('.network-name');
      expect(networkName.textContent).toBe('Mainnet');

      const indicator = container.querySelector('.network-selector-trigger .network-indicator');
      expect(indicator.classList.contains('network-indicator-mainnet')).toBe(true);
    });
  });
});
