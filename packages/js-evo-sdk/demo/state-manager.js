/**
 * State Manager - Centralized state management for the identity management app
 * Implements a simple event-driven state management system
 */

export class StateManager {
  constructor() {
    // Initialize application state
    this.state = {
      // UI State
      ui: {
        selectedIdentityId: null,
        activePanel: null, // 'topup' | 'withdraw' | 'transfer' | null
        isCreating: false,
        isLoading: false,
        loadingMessage: '',
        modalOpen: false
      },

      // Wallet Funding Flow State
      fundingFlow: {
        mode: null,  // 'already-funded' | 'waiting-for-tx' | null
        step: 'initial',  // 'initial' | 'timeframe' | 'scanning' | 'monitoring' | 'instantlocked' | 'chainlocked' | 'confirmed'
        address: null,
        timeframe: null,  // 'hour' | 'day' | 'week' | null
        detectedBalance: 0,
        isMonitoring: false,
        // Transaction-finder integration fields
        scanProgress: 0,        // 0-100 for historic blockchain scan
        blocksScanned: 0,       // Number of blocks scanned
        totalBlocks: 0,         // Total blocks to scan
        detectedTxid: null,     // Transaction ID when detected
        instantLockTime: null,  // Timestamp of InstantLock confirmation
        chainLockTime: null,    // Timestamp of ChainLock confirmation
        confirmationStatus: null, // 'waiting' | 'instantlocked' | 'chainlocked'
        utxos: []               // Found UTXOs for funding
      },

      // Data State
      identities: new Map(), // Map<identityId, identityData>
      transactions: new Map(), // Map<transactionId, transactionData>
      operations: new Map(), // Map<operationId, operationData> - Track in-progress and recent operations

      // Network State
      network: 'testnet',
      isConnected: false,
      syncProgress: 0,
      connectionStatus: 'disconnected' // 'connected' | 'connecting' | 'disconnected' | 'error'
    };

    // Event listeners registry
    this.listeners = new Map();
  }

  // State getter - returns immutable copy
  getState() {
    return {
      ...this.state,
      identities: new Map(this.state.identities),
      transactions: new Map(this.state.transactions)
    };
  }

  // Selected identity getter
  getSelectedIdentity() {
    if (!this.state.ui.selectedIdentityId) return null;
    return this.state.identities.get(this.state.ui.selectedIdentityId);
  }

  // Update UI state
  updateUI(updates) {
    this.state.ui = { ...this.state.ui, ...updates };
    this.emit('ui-update', this.state.ui);
  }

  // Set selected identity
  selectIdentity(identityId) {
    if (!identityId) {
      this.state.ui.selectedIdentityId = null;
      this.state.ui.activePanel = null;
      this.emit('identity-selected', null);
      return;
    }

    const identity = this.state.identities.get(identityId);
    if (identity) {
      this.state.ui.selectedIdentityId = identityId;
      this.state.ui.activePanel = null; // Reset active panel
      this.emit('identity-selected', identity);
    }
  }

  // Add or update identity
  setIdentity(identityId, identityData) {
    this.state.identities.set(identityId, {
      ...identityData,
      lastUpdated: Date.now()
    });
    this.emit('identity-updated', identityData);

    // If this is the selected identity, emit selection update
    if (this.state.ui.selectedIdentityId === identityId) {
      this.emit('identity-selected', identityData);
    }
  }

  // Update identity label
  updateIdentityLabel(identityId, newLabel) {
    const identity = this.state.identities.get(identityId);
    if (!identity) return;

    const oldLabel = identity.label;

    // Update the identity with new label
    const updatedIdentity = {
      ...identity,
      label: newLabel || null, // null if empty string
      lastUpdated: Date.now()
    };

    this.state.identities.set(identityId, updatedIdentity);

    // Emit specific event for label updates
    this.emit('identity-label-updated', {
      identityId,
      oldLabel,
      newLabel: newLabel || null,
      identity: updatedIdentity
    });

    // Also emit general identity-updated event
    this.emit('identity-updated', updatedIdentity);

    // If this is the selected identity, emit selection update
    if (this.state.ui.selectedIdentityId === identityId) {
      this.emit('identity-selected', updatedIdentity);
    }
  }

  // Remove identity
  removeIdentity(identityId) {
    const wasSelected = this.state.ui.selectedIdentityId === identityId;
    this.state.identities.delete(identityId);

    if (wasSelected) {
      this.state.ui.selectedIdentityId = null;
      this.state.ui.activePanel = null;
      this.emit('identity-removed', identityId);
      this.emit('identity-selected', null);
    } else {
      this.emit('identity-removed', identityId);
    }
  }

  // Get all identities as array
  getAllIdentities() {
    return Array.from(this.state.identities.values());
  }

  // Add transaction
  addTransaction(transaction) {
    this.state.transactions.set(transaction.id, {
      ...transaction,
      timestamp: transaction.timestamp || Date.now()
    });
    this.emit('transaction-added', transaction);
  }

  // Update transaction status
  updateTransaction(transactionId, updates) {
    const transaction = this.state.transactions.get(transactionId);
    if (transaction) {
      const updatedTransaction = { ...transaction, ...updates };
      this.state.transactions.set(transactionId, updatedTransaction);
      this.emit('transaction-updated', updatedTransaction);
    }
  }

  // Get transactions for identity
  getIdentityTransactions(identityId, limit = 10) {
    const transactions = [];
    for (const [id, tx] of this.state.transactions) {
      if (tx.identityId === identityId || tx.recipientId === identityId) {
        // Fix transfer direction from recipient's perspective
        // If current identity is the recipient, flip the direction
        if (tx.recipientId === identityId && tx.type === 'transfer') {
          transactions.push({
            ...tx,
            direction: 'in'  // Recipient sees incoming transfer
          });
        } else {
          transactions.push(tx);
        }
      }
    }
    return transactions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Add operation (for tracking long-running operations like create, topup)
  addOperation(operationData) {
    const operation = {
      id: operationData.id || 'op_' + Date.now(),
      type: operationData.type, // 'create' | 'topup' | 'withdraw' | 'transfer'
      identityId: operationData.identityId,
      status: 'in-progress', // 'in-progress' | 'completed' | 'failed'
      progress: 0,
      message: operationData.message || 'Starting...',
      amount: operationData.amount,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      error: null,
      result: null,
      unread: true, // New operations are unread
      ...operationData
    };

    this.state.operations.set(operation.id, operation);
    this.emit('operation-started', operation);
    return operation.id;
  }

  // Update operation progress
  updateOperation(operationId, updates) {
    const operation = this.state.operations.get(operationId);
    if (!operation) return;

    const updatedOperation = {
      ...operation,
      ...updates,
      updatedAt: Date.now()
    };

    // Set completedAt when status changes to completed or failed
    if (updates.status === 'completed' || updates.status === 'failed') {
      updatedOperation.completedAt = Date.now();
    }

    this.state.operations.set(operationId, updatedOperation);
    this.emit('operation-progress', updatedOperation);

    if (updates.status === 'completed') {
      this.emit('operation-completed', updatedOperation);
    } else if (updates.status === 'failed') {
      this.emit('operation-failed', updatedOperation);
    }
  }

  // Remove operation (cleanup)
  removeOperation(operationId) {
    const operation = this.state.operations.get(operationId);
    if (operation) {
      this.state.operations.delete(operationId);
      this.emit('operation-removed', operationId);
    }
  }

  // Get all active (in-progress) operations
  getActiveOperations() {
    const operations = [];
    for (const [id, operation] of this.state.operations) {
      if (operation.status === 'in-progress') {
        operations.push(operation);
      }
    }
    return operations.sort((a, b) => b.startedAt - a.startedAt);
  }

  // Get all operations (recent history)
  getAllOperations(limit = 50) {
    return Array.from(this.state.operations.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  // Get specific operation
  getOperation(operationId) {
    return this.state.operations.get(operationId);
  }

  // Get operations for specific identity
  getIdentityOperations(identityId, limit = 10) {
    const operations = [];
    for (const [id, operation] of this.state.operations) {
      if (operation.identityId === identityId) {
        operations.push(operation);
      }
    }
    return operations
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  // Get unread in-progress operations count
  getUnreadOperationsCount() {
    let count = 0;
    for (const [id, operation] of this.state.operations) {
      if (operation.status === 'in-progress' && operation.unread) {
        count++;
      }
    }
    return count;
  }

  // Mark all operations as read
  markAllOperationsAsRead() {
    for (const [id, operation] of this.state.operations) {
      if (operation.unread) {
        operation.unread = false;
      }
    }
    this.emit('operations-marked-read', null);
  }

  // Mark specific operation as read
  markOperationAsRead(operationId) {
    const operation = this.state.operations.get(operationId);
    if (operation && operation.unread) {
      operation.unread = false;
      this.emit('operation-marked-read', operation);
    }
  }

  // Set active action panel
  setActivePanel(panelType) {
    this.state.ui.activePanel = panelType;
    this.emit('panel-changed', panelType);
  }

  // Loading state management
  setLoading(isLoading, message = '') {
    this.state.ui.isLoading = isLoading;
    this.state.ui.loadingMessage = message;
    this.emit('loading-state', { isLoading, message });
  }

  // Modal state management
  setModalOpen(isOpen) {
    this.state.ui.modalOpen = isOpen;
    this.emit('modal-state', isOpen);
  }

  // Network state management
  setNetwork(network) {
    this.state.network = network;
    this.emit('network-changed', network);
  }

  setNetworkStatus(status) {
    this.state.connectionStatus = status;
    this.state.isConnected = status === 'connected';
    this.emit('network-status', status);
  }

  // Sync progress
  setSyncProgress(progress) {
    this.state.syncProgress = Math.min(100, Math.max(0, progress));
    this.emit('sync-progress', this.state.syncProgress);
  }

  // Event emitter implementation
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Funding flow state management
  setFundingMode(mode) {
    this.state.fundingFlow.mode = mode;
    this.emit('funding-mode-changed', mode);
  }

  setFundingStep(step) {
    this.state.fundingFlow.step = step;
    this.emit('funding-step-changed', step);
  }

  setFundingAddress(address) {
    this.state.fundingFlow.address = address;
    this.emit('funding-address-set', address);
  }

  setFundingTimeframe(timeframe) {
    this.state.fundingFlow.timeframe = timeframe;
    this.emit('funding-timeframe-set', timeframe);
  }

  setFundingBalance(balance) {
    this.state.fundingFlow.detectedBalance = balance;
    this.emit('funding-balance-detected', balance);
  }

  setFundingMonitoring(isMonitoring) {
    this.state.fundingFlow.isMonitoring = isMonitoring;
    this.emit('funding-monitoring-changed', isMonitoring);
  }

  // Scan progress for historic mode
  setScanProgress(progress, blocksScanned, totalBlocks) {
    this.state.fundingFlow.scanProgress = progress;
    this.state.fundingFlow.blocksScanned = blocksScanned || 0;
    this.state.fundingFlow.totalBlocks = totalBlocks || 0;
    this.emit('funding-scan-progress', { progress, blocksScanned, totalBlocks });
  }

  // Transaction detection
  setDetectedTransaction(txid, balance) {
    this.state.fundingFlow.detectedTxid = txid;
    this.state.fundingFlow.detectedBalance = balance;
    this.state.fundingFlow.confirmationStatus = 'waiting';
    this.emit('funding-transaction-detected', { txid, balance });
  }

  // InstantLock confirmation
  setInstantLockConfirmed(timestamp) {
    this.state.fundingFlow.instantLockTime = timestamp;
    this.state.fundingFlow.confirmationStatus = 'instantlocked';
    this.state.fundingFlow.step = 'instantlocked';
    this.emit('funding-instantlock-confirmed', { timestamp });
  }

  // ChainLock confirmation
  setChainLockConfirmed(timestamp, blockHeight) {
    this.state.fundingFlow.chainLockTime = timestamp;
    this.state.fundingFlow.confirmationStatus = 'chainlocked';
    this.state.fundingFlow.step = 'chainlocked';
    this.emit('funding-chainlock-confirmed', { timestamp, blockHeight });
  }

  // Set UTXOs found during scan
  setFundingUTXOs(utxos) {
    this.state.fundingFlow.utxos = utxos || [];
    const totalBalance = utxos.reduce((sum, utxo) => sum + (utxo.satoshis || 0), 0);
    this.state.fundingFlow.detectedBalance = totalBalance;
    this.emit('funding-utxos-found', { utxos, totalBalance });
  }

  // Full confirmation complete
  setFundingConfirmed() {
    this.state.fundingFlow.step = 'confirmed';
    this.emit('funding-confirmed', this.state.fundingFlow);
  }

  resetFundingFlow() {
    this.state.fundingFlow = {
      mode: null,
      step: 'initial',
      address: null,
      timeframe: null,
      detectedBalance: 0,
      isMonitoring: false,
      scanProgress: 0,
      blocksScanned: 0,
      totalBlocks: 0,
      detectedTxid: null,
      instantLockTime: null,
      chainLockTime: null,
      confirmationStatus: null,
      utxos: []
    };
    this.emit('funding-flow-reset', null);
  }

  // Clear all state (reset)
  reset() {
    this.state = {
      ui: {
        selectedIdentityId: null,
        activePanel: null,
        isCreating: false,
        isLoading: false,
        loadingMessage: '',
        modalOpen: false
      },
      fundingFlow: {
        mode: null,
        step: 'initial',
        address: null,
        timeframe: null,
        detectedBalance: 0,
        isMonitoring: false,
        scanProgress: 0,
        blocksScanned: 0,
        totalBlocks: 0,
        detectedTxid: null,
        instantLockTime: null,
        chainLockTime: null,
        confirmationStatus: null,
        utxos: []
      },
      identities: new Map(),
      transactions: new Map(),
      operations: new Map(),
      network: 'testnet',
      isConnected: false,
      syncProgress: 0,
      connectionStatus: 'disconnected'
    };
    this.emit('state-reset', null);
  }

  // Persist state to localStorage
  persist() {
    try {
      const serializable = {
        ui: this.state.ui,
        identities: Array.from(this.state.identities.entries()),
        transactions: Array.from(this.state.transactions.entries()),
        operations: Array.from(this.state.operations.entries()),
        network: this.state.network
      };
      localStorage.setItem('dash-identity-state', JSON.stringify(serializable));
      return true;
    } catch (error) {
      console.error('Failed to persist state:', error);
      return false;
    }
  }

  // Restore state from localStorage
  restore() {
    try {
      const stored = localStorage.getItem('dash-identity-state');
      if (!stored) return false;

      const parsed = JSON.parse(stored);

      // Restore identities
      if (parsed.identities) {
        this.state.identities = new Map(parsed.identities);
      }

      // Restore transactions
      if (parsed.transactions) {
        this.state.transactions = new Map(parsed.transactions);
      }

      // Restore operations (but mark in-progress operations as failed)
      if (parsed.operations) {
        const operations = new Map(parsed.operations);
        // Any in-progress operations should be marked as failed after page reload
        for (const [id, operation] of operations) {
          if (operation.status === 'in-progress') {
            operation.status = 'failed';
            operation.error = 'Operation interrupted by page reload';
            operation.completedAt = Date.now();
          }
        }
        this.state.operations = operations;
      }

      // Restore UI state (but reset transient states)
      if (parsed.ui) {
        this.state.ui = {
          ...parsed.ui,
          isLoading: false,
          loadingMessage: '',
          modalOpen: false,
          activePanel: null
        };
      }

      // Restore network
      if (parsed.network) {
        this.state.network = parsed.network;
      }

      this.emit('state-restored', this.state);
      return true;
    } catch (error) {
      console.error('Failed to restore state:', error);
      return false;
    }
  }
}

// Create singleton instance
export const stateManager = new StateManager();

// Auto-persist state changes
let persistTimeout;
stateManager.on('identity-updated', () => {
  clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => stateManager.persist(), 1000);
});

stateManager.on('transaction-added', () => {
  clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => stateManager.persist(), 1000);
});

stateManager.on('operation-progress', () => {
  clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => stateManager.persist(), 1000);
});