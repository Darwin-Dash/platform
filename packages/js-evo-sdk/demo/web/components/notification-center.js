/**
 * Notification Center Component
 * Shows in-progress operations with status
 */

import { stateManager } from '../state-manager.js';
import { formatDuffs } from '../utils/formatter.js';

export class NotificationCenter {
  constructor(bellButton, dropdown) {
    this.bellButton = bellButton;
    this.dropdown = dropdown;
    this.isOpen = false;
    this.autoClearTimer = null;

    this.bindEvents();
    this.subscribeToOperations();
    this.updateBadge();
  }

  bindEvents() {
    // Toggle dropdown on bell click
    this.bellButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.dropdown.contains(e.target) && !this.bellButton.contains(e.target)) {
        this.close();
      }
    });
  }

  subscribeToOperations() {
    // Update on operation events
    stateManager.on('operation-started', () => {
      this.updateBadge();
      this.renderOperationsList();
    });

    stateManager.on('operation-progress', () => {
      if (this.isOpen) {
        this.renderOperationsList();
      }
    });

    stateManager.on('operation-completed', () => {
      this.updateBadge();
      if (this.isOpen) {
        this.renderOperationsList();
      }
    });

    stateManager.on('operation-failed', () => {
      this.updateBadge();
      if (this.isOpen) {
        this.renderOperationsList();
      }
    });

    stateManager.on('operations-marked-read', () => {
      this.updateBadge();
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.dropdown.hidden = false;
    this.isOpen = true;
    this.bellButton.setAttribute('aria-expanded', 'true');

    // Mark all as read
    stateManager.markAllOperationsAsRead();
    this.updateBadge();

    // Render current operations
    this.renderOperationsList();

    // Start auto-clear timer for completed operations (30 seconds)
    this.startAutoClearTimer();
  }

  close() {
    this.dropdown.hidden = true;
    this.isOpen = false;
    this.bellButton.setAttribute('aria-expanded', 'false');

    // Cancel auto-clear timer
    if (this.autoClearTimer) {
      clearTimeout(this.autoClearTimer);
      this.autoClearTimer = null;
    }
  }

  startAutoClearTimer() {
    // Clear any existing timer
    if (this.autoClearTimer) {
      clearTimeout(this.autoClearTimer);
    }

    // After 30 seconds, remove completed operations
    this.autoClearTimer = setTimeout(() => {
      const operations = stateManager.getAllOperations();
      operations.forEach(op => {
        if (op.status === 'completed' || op.status === 'failed') {
          stateManager.removeOperation(op.id);
        }
      });

      // Refresh list
      this.renderOperationsList();
      this.autoClearTimer = null;
    }, 30000);
  }

  updateBadge() {
    const badge = this.bellButton.querySelector('.notification-badge');
    const count = stateManager.getUnreadOperationsCount();

    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
  }

  renderOperationsList() {
    const list = this.dropdown.querySelector('.operations-list');
    if (!list) return;

    const operations = stateManager.getActiveOperations();

    if (operations.length === 0) {
      list.innerHTML = '<p class="empty-message">No ongoing operations</p>';
      return;
    }

    list.innerHTML = '';
    operations.forEach(operation => {
      const item = this.createOperationItem(operation);
      list.appendChild(item);
    });
  }

  createOperationItem(operation) {
    const item = document.createElement('div');
    item.className = 'notification-center-item';
    item.dataset.operationId = operation.id;

    const typeLabels = {
      create: 'Creating Identity',
      topup: 'Topping Up',
      withdraw: 'Withdrawing',
      transfer: 'Transferring'
    };

    const typeLabel = typeLabels[operation.type] || operation.type;
    const statusIcon = operation.status === 'in-progress' ? '<div class="spinner-tiny"></div>' :
                       operation.status === 'completed' ? '✓' : '✕';

    item.innerHTML = `
      <div class="notification-item-header">
        <div class="notification-item-icon ${operation.status}">
          ${statusIcon}
        </div>
        <div class="notification-item-content">
          <span class="notification-item-title">${typeLabel}</span>
          <span class="notification-item-amount">${operation.amount ? formatDuffs(operation.amount) : ''}</span>
        </div>
      </div>
      <div class="notification-item-message">${operation.message}</div>
      ${operation.status === 'in-progress' ? `
        <div class="notification-item-progress">
          <div class="notification-item-progress-fill" style="width: ${operation.progress || 0}%"></div>
        </div>
      ` : ''}
    `;

    // Make clickable to show progress modal
    if (operation.status === 'in-progress') {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        this.close();
        window.dispatchEvent(new CustomEvent('show-operation-progress', {
          detail: { operationId: operation.id }
        }));
      });
    }

    return item;
  }
}
