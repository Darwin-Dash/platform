/**
 * Activity Panel Component
 * Displays all operations (in-progress, completed, failed) in a dismissible panel
 */

import { stateManager } from '../state-manager.js';
import { formatDuffs, formatTimestamp } from '../utils/formatter.js';

export class ActivityPanel {
  constructor(container) {
    this.container = container;
    this.isExpanded = false;
    this.selectedOperationId = null;

    this.render();
    this.bindEvents();
    this.subscribeToOperations();
  }

  render() {
    this.container.innerHTML = `
      <div class="activity-panel-header">
        <h3>Operations</h3>
        <span class="operation-count" id="operation-count">0</span>
        <button class="btn-icon" id="activity-panel-toggle" aria-label="Toggle operations panel">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 7.5L10 12.5L5 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="activity-panel-body">
        <div class="operations-list" id="operations-list">
          <p class="empty-message">No operations</p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Toggle panel
    const toggleBtn = this.container.querySelector('#activity-panel-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }

    // Handle operation clicks (delegated)
    const operationsList = this.container.querySelector('#operations-list');
    if (operationsList) {
      operationsList.addEventListener('click', (e) => {
        const operationItem = e.target.closest('.operation-item');
        if (operationItem) {
          const operationId = operationItem.dataset.operationId;
          this.handleOperationClick(operationId);
        }
      });
    }
  }

  subscribeToOperations() {
    // Update on operation events
    stateManager.on('operation-started', () => this.updateOperationsList());
    stateManager.on('operation-progress', () => this.updateOperationsList());
    stateManager.on('operation-completed', () => this.updateOperationsList());
    stateManager.on('operation-failed', () => this.updateOperationsList());
    stateManager.on('operation-removed', () => this.updateOperationsList());

    // Initial render
    this.updateOperationsList();
  }

  updateOperationsList() {
    const operationsList = this.container.querySelector('#operations-list');
    const operationCount = this.container.querySelector('#operation-count');
    if (!operationsList) return;

    const operations = stateManager.getAllOperations(20); // Show last 20 operations
    const activeCount = stateManager.getActiveOperations().length;

    // Update count badge
    if (operationCount) {
      operationCount.textContent = activeCount > 0 ? activeCount : '0';
      operationCount.style.display = activeCount > 0 ? 'flex' : 'none';
    }

    if (operations.length === 0) {
      operationsList.innerHTML = '<p class="empty-message">No operations</p>';
      return;
    }

    operationsList.innerHTML = '';
    operations.forEach(operation => {
      const item = this.createOperationItem(operation);
      operationsList.appendChild(item);
    });

    // Auto-expand if there are active operations
    if (activeCount > 0 && !this.isExpanded) {
      this.expand();
    }
  }

  createOperationItem(operation) {
    const item = document.createElement('div');
    item.className = `operation-item operation-${operation.status}`;
    item.dataset.operationId = operation.id;

    const statusIcon = this.getStatusIcon(operation.status);
    const typeLabel = this.getTypeLabel(operation.type);
    const elapsed = this.getElapsedTime(operation);

    item.innerHTML = `
      <div class="operation-icon ${operation.status}">
        ${statusIcon}
      </div>
      <div class="operation-details">
        <div class="operation-header">
          <span class="operation-type">${typeLabel}</span>
          <span class="operation-time">${elapsed}</span>
        </div>
        <div class="operation-message">${operation.message}</div>
        ${operation.status === 'in-progress' ? `
          <div class="operation-progress-bar">
            <div class="operation-progress-fill" style="width: ${operation.progress || 0}%"></div>
          </div>
        ` : ''}
        ${operation.status === 'failed' && operation.error ? `
          <div class="operation-error">${operation.error}</div>
        ` : ''}
      </div>
      <div class="operation-amount">
        ${operation.amount ? formatDuffs(operation.amount) : ''}
      </div>
    `;

    return item;
  }

  getStatusIcon(status) {
    switch (status) {
      case 'in-progress':
        return '<div class="spinner-small"></div>';
      case 'completed':
        return '✓';
      case 'failed':
        return '✕';
      default:
        return '';
    }
  }

  getTypeLabel(type) {
    const labels = {
      create: 'Create Identity',
      topup: 'Top Up',
      withdraw: 'Withdraw',
      transfer: 'Transfer'
    };
    return labels[type] || type;
  }

  getElapsedTime(operation) {
    const now = Date.now();
    const start = operation.startedAt;
    const elapsed = now - start;

    if (operation.status !== 'in-progress') {
      // Show completion time for completed/failed operations
      return formatTimestamp(operation.completedAt || operation.updatedAt);
    }

    // Show elapsed time for in-progress operations
    if (elapsed < 1000) return 'Just now';
    if (elapsed < 60000) return `${Math.floor(elapsed / 1000)}s`;
    if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m`;
    return `${Math.floor(elapsed / 3600000)}h`;
  }

  handleOperationClick(operationId) {
    const operation = stateManager.getOperation(operationId);
    if (!operation) return;

    this.selectedOperationId = operationId;

    // Emit event for app to handle (e.g., show detail modal)
    window.dispatchEvent(new CustomEvent('operation-detail-request', {
      detail: { operation }
    }));
  }

  toggle() {
    if (this.isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  expand() {
    this.container.classList.add('expanded');
    this.isExpanded = true;

    const toggleBtn = this.container.querySelector('#activity-panel-toggle svg');
    if (toggleBtn) {
      toggleBtn.style.transform = 'rotate(180deg)';
    }
  }

  collapse() {
    this.container.classList.remove('expanded');
    this.isExpanded = false;

    const toggleBtn = this.container.querySelector('#activity-panel-toggle svg');
    if (toggleBtn) {
      toggleBtn.style.transform = 'rotate(0deg)';
    }
  }

  // Get current state
  getState() {
    return {
      isExpanded: this.isExpanded,
      selectedOperationId: this.selectedOperationId
    };
  }
}
