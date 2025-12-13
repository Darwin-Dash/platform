/**
 * Wallet Funding Flow Component
 * Handles the complete wallet funding workflow before identity creation
 * Integrates with TransactionFinderService for real blockchain scanning and monitoring
 */

import { stateManager } from '../state-manager.js';
import { notifications } from './notifications.js';
import {
  generateQRCode,
  formatBalanceForDisplay,
  validateFundingBalance,
  getEstimatedSyncTime
} from '../utils/wallet-funding-helper.js';
import { getTransactionFinderService } from '../services/transaction-finder-service.js';

export class WalletFundingFlow {
  constructor(platformOps, options = {}) {
    this.platformOps = platformOps;
    this.monitoringCleanup = null;
    this.fundingAddress = null;
    this.context = 'create'; // 'create' or 'topup'

    // Initialize transaction finder service
    this.txFinderService = getTransactionFinderService({
      useMockMode: options.useMockMode ?? false,
      network: options.network || 'testnet'
    });

    // Bind service event handlers
    this._bindServiceEvents();
  }

  /**
   * Bind TransactionFinderService events to UI updates
   */
  _bindServiceEvents() {
    // Scan progress events for historic mode
    this.txFinderService.on('scan-progress', (progress) => {
      stateManager.setScanProgress(
        progress.progress,
        progress.syncedBlocks,
        progress.totalBlocks
      );
      this._updateScanProgressUI(progress);
    });

    // Transaction detected
    this.txFinderService.on('transaction-detected', (tx) => {
      const balance = this._extractBalanceFromTx(tx);
      stateManager.setDetectedTransaction(tx.txid, balance);
      this._updateMonitoringUI('transaction-detected', { txid: tx.txid, balance });
      notifications.info('Transaction detected! Waiting for InstantLock...');
    });

    // InstantLock received
    this.txFinderService.on('instantlock-received', (lock) => {
      stateManager.setInstantLockConfirmed(lock.timestamp);
      this._updateMonitoringUI('instantlock-received', lock);
      notifications.success(`InstantLock confirmed! (~${(lock.latency / 1000).toFixed(1)}s)`);
    });

    // ChainLock received
    this.txFinderService.on('chainlock-received', (cl) => {
      stateManager.setChainLockConfirmed(cl.timestamp, cl.blockHeight);
      this._updateMonitoringUI('chainlock-received', cl);
      notifications.success('ChainLock confirmed! Funds are fully confirmed.');

      // Auto-proceed to confirmation after ChainLock
      const balance = stateManager.getState().fundingFlow.detectedBalance;
      this.showConfirmationStep(balance);
    });
  }

  /**
   * Extract balance from transaction outputs
   */
  _extractBalanceFromTx(tx) {
    // In mock mode, tx may have outputs array
    if (tx.outputs) {
      return tx.outputs.reduce((sum, out) => sum + (out.satoshis || 0), 0);
    }
    // Default mock balance
    return 5000000; // 0.05 DASH
  }

  /**
   * Show the funding modal and initialize the flow
   * @param {string} context - 'create' or 'topup'
   */
  async show(context = 'create') {
    this.context = context;
    const modal = document.getElementById('wallet-funding-modal');
    if (!modal) {
      console.error('Wallet funding modal not found in DOM');
      return;
    }

    // Reset funding flow state
    stateManager.resetFundingFlow();

    // Show modal
    modal.hidden = false;
    stateManager.setModalOpen(true);

    // Show initial step
    this.showInitialStep();

    // Bind event handlers
    this.bindEventHandlers();
  }

  /**
   * Hide the funding modal
   */
  hide() {
    const modal = document.getElementById('wallet-funding-modal');
    if (modal) {
      modal.hidden = true;
      stateManager.setModalOpen(false);
    }

    // Stop any active monitoring
    this.stopMonitoring();

    // Reset state
    stateManager.resetFundingFlow();
  }

  /**
   * Show the initial step: "Have you already funded?"
   */
  showInitialStep() {
    const container = document.getElementById('funding-flow-content');
    if (!container) return;

    // Context-specific messaging
    const messages = {
      create: {
        title: 'Fund Your Wallet',
        description: 'To create an identity on Dash Platform, you need to fund your wallet with DASH.'
      },
      topup: {
        title: 'Fund Your Wallet',
        description: 'To top up your identity on Dash Platform, you need to fund your wallet with DASH.'
      }
    };

    const msg = messages[this.context] || messages.create;

    container.innerHTML = `
      <div class="funding-step funding-initial">
        <h2>${msg.title}</h2>
        <p class="funding-description">
          ${msg.description}
        </p>
        <div class="funding-question">
          <p class="question-text">Have you already sent DASH to your wallet?</p>
          <div class="funding-choice-buttons">
            <button class="btn btn-primary btn-large" id="already-funded-btn">
              Yes, I sent it
            </button>
            <button class="btn btn-secondary btn-large" id="sending-now-btn">
              No, sending now
            </button>
          </div>
        </div>
        <div class="funding-help">
          <button class="btn btn-link" id="need-help-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-right: var(--space-2);">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor">?</text>
            </svg>
            💡 Need help? Learn how to get testnet DASH from faucets
          </button>
        </div>
        <button class="btn btn-ghost modal-cancel">Cancel</button>
      </div>
    `;

    stateManager.setFundingStep('initial');
  }

  /**
   * Show timeframe selection for already-funded wallets
   */
  async showTimeframeStep() {
    const container = document.getElementById('funding-flow-content');
    if (!container) return;

    stateManager.setFundingMode('already-funded');
    stateManager.setFundingStep('timeframe');

    container.innerHTML = `
      <div class="funding-step funding-timeframe">
        <h2>When did you send the transaction?</h2>
        <p class="funding-description">
          Select the timeframe to optimize blockchain scanning. Recent transactions sync much faster!
        </p>
        <div class="timeframe-options">
          <label class="timeframe-option" data-timeframe="hour">
            <input type="radio" name="timeframe" value="hour" checked />
            <div class="timeframe-card">
              <div class="timeframe-icon">⚡</div>
              <div class="timeframe-label">Within the last hour</div>
              <div class="timeframe-detail">Fastest - ~60 blocks to scan</div>
              <div class="timeframe-estimate">Estimated: ${getEstimatedSyncTime('hour')}</div>
            </div>
          </label>
          <label class="timeframe-option" data-timeframe="day">
            <input type="radio" name="timeframe" value="day" />
            <div class="timeframe-card">
              <div class="timeframe-icon">🕐</div>
              <div class="timeframe-label">Within the last day</div>
              <div class="timeframe-detail">Medium - ~576 blocks to scan</div>
              <div class="timeframe-estimate">Estimated: ${getEstimatedSyncTime('day')}</div>
            </div>
          </label>
          <label class="timeframe-option" data-timeframe="week">
            <input type="radio" name="timeframe" value="week" />
            <div class="timeframe-card">
              <div class="timeframe-icon">📅</div>
              <div class="timeframe-label">Within the last week</div>
              <div class="timeframe-detail">Slower - ~4,032 blocks to scan</div>
              <div class="timeframe-estimate">Estimated: ${getEstimatedSyncTime('week')}</div>
            </div>
          </label>
        </div>
        <div class="funding-actions">
          <button class="btn btn-primary btn-large" id="timeframe-continue-btn">
            Continue with Selected Timeframe
          </button>
          <button class="btn btn-ghost" id="timeframe-back-btn">Back</button>
        </div>
      </div>
    `;
  }

  /**
   * Show monitoring step for new transactions (InstantSend + ChainLock)
   */
  async showMonitoringStep() {
    const container = document.getElementById('funding-flow-content');
    if (!container) return;

    stateManager.setFundingMode('waiting-for-tx');
    stateManager.setFundingStep('monitoring');

    // Generate funding address
    this.fundingAddress = await this.platformOps.generateFundingAddress();
    stateManager.setFundingAddress(this.fundingAddress);

    const qrCodeUrl = generateQRCode(this.fundingAddress);

    container.innerHTML = `
      <div class="funding-step funding-monitoring">
        <h2>Waiting for Your Transaction</h2>
        <p class="funding-description">
          Send DASH to the address below. We'll detect it via InstantSend and confirm with ChainLock!
        </p>
        <div class="funding-address-display">
          <label>Send DASH to this address:</label>
          <div class="address-box">
            <code class="address-text funding-address">${this.fundingAddress}</code>
            <button class="btn btn-icon copy-address-btn" data-copy="${this.fundingAddress}" title="Copy address">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>
          <div class="qr-code-container">
            <img src="${qrCodeUrl}" alt="QR Code" class="qr-code address-qr" />
          </div>
        </div>
        <div class="monitoring-status" id="monitoring-status">
          <div class="status-icon status-waiting">
            <div class="spinner-small"></div>
          </div>
          <p class="status-text">Listening for InstantSend transaction...</p>
          <p class="monitoring-help">We'll notify you when funds arrive!</p>
        </div>
        <div class="confirmation-progress" id="confirmation-progress" style="display: none;">
          <div class="progress-stages">
            <div class="stage stage-tx" id="stage-tx">
              <span class="stage-icon">⏳</span>
              <span class="stage-label">Transaction</span>
            </div>
            <div class="stage-connector"></div>
            <div class="stage stage-is" id="stage-is">
              <span class="stage-icon">⏳</span>
              <span class="stage-label">InstantLock</span>
            </div>
            <div class="stage-connector"></div>
            <div class="stage stage-cl" id="stage-cl">
              <span class="stage-icon">⏳</span>
              <span class="stage-label">ChainLock</span>
            </div>
          </div>
        </div>
        <div class="funding-requirements">
          <p><strong>Minimum:</strong> 0.001 DASH</p>
          <p><strong>Recommended:</strong> 0.01+ DASH for multiple operations</p>
        </div>
        <div class="funding-actions">
          <button class="btn btn-ghost" id="monitoring-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    // Start monitoring for incoming transactions
    this.startMonitoring();
  }

  /**
   * Update monitoring UI based on confirmation stage
   */
  _updateMonitoringUI(event, data) {
    const statusEl = document.getElementById('monitoring-status');
    const progressEl = document.getElementById('confirmation-progress');
    if (!statusEl) return;

    // Show progress stages once transaction is detected
    if (progressEl && event === 'transaction-detected') {
      progressEl.style.display = 'block';
    }

    switch (event) {
      case 'transaction-detected':
        statusEl.innerHTML = `
          <div class="status-icon status-tx-detected">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="status-text">Transaction detected!</p>
          <p class="monitoring-help">Waiting for InstantLock confirmation...</p>
          <p class="tx-id">TX: ${data.txid.substring(0, 16)}...</p>
        `;
        this._updateStage('stage-tx', 'complete');
        break;

      case 'instantlock-received':
        statusEl.innerHTML = `
          <div class="status-icon status-instantlocked">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 7v6c0 5.5 3.5 10.5 8 12 4.5-1.5 8-6.5 8-12V7l-8-5z" stroke="currentColor" stroke-width="2"/>
              <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="status-text">InstantLock confirmed! (~${(data.latency / 1000).toFixed(1)}s)</p>
          <p class="monitoring-help">Waiting for ChainLock (~2 minutes)...</p>
        `;
        this._updateStage('stage-is', 'complete');
        break;

      case 'chainlock-received':
        statusEl.innerHTML = `
          <div class="status-icon status-chainlocked">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="16" r="1" fill="currentColor"/>
            </svg>
          </div>
          <p class="status-text">ChainLock confirmed!</p>
          <p class="monitoring-help">Funds are fully confirmed and ready.</p>
        `;
        this._updateStage('stage-cl', 'complete');
        break;
    }
  }

  /**
   * Update stage indicator in progress display
   */
  _updateStage(stageId, status) {
    const stageEl = document.getElementById(stageId);
    if (!stageEl) return;

    const iconEl = stageEl.querySelector('.stage-icon');
    if (iconEl) {
      iconEl.textContent = status === 'complete' ? '✓' : '⏳';
    }
    stageEl.classList.toggle('stage-complete', status === 'complete');
  }

  /**
   * Update scan progress UI for historic mode
   */
  _updateScanProgressUI(progress) {
    const fillEl = document.getElementById('scan-progress-fill');
    const scannedEl = document.getElementById('scan-blocks-scanned');
    const totalEl = document.getElementById('scan-blocks-total');
    const percentEl = document.getElementById('scan-progress-percent');

    if (fillEl) fillEl.style.width = `${progress.progress}%`;
    if (scannedEl) scannedEl.textContent = progress.syncedBlocks;
    if (totalEl) totalEl.textContent = progress.totalBlocks;
    if (percentEl) percentEl.textContent = `${Math.round(progress.progress)}%`;
  }

  /**
   * Show confirmation step after funds detected
   */
  showConfirmationStep(balance) {
    const container = document.getElementById('funding-flow-content');
    if (!container) return;

    stateManager.setFundingStep('confirmed');
    stateManager.setFundingBalance(balance);

    const validation = validateFundingBalance(balance);
    const balanceDisplay = formatBalanceForDisplay(balance);

    // Context-specific button text
    const buttonText = this.context === 'topup'
      ? 'Continue to Identity Top-Up'
      : 'Continue to Identity Creation';

    container.innerHTML = `
      <div class="funding-step funding-confirmed">
        <div class="success-icon">✅</div>
        <h2>Funds Received!</h2>
        <p class="funding-description">
          Your wallet has been funded successfully.
        </p>
        <div class="balance-display-large">
          <label>Detected Balance:</label>
          <div class="balance-amount detected-balance">${balanceDisplay}</div>
        </div>
        ${validation.warning ? `
          <div class="funding-warning">
            ⚠️ ${validation.message}
          </div>
        ` : ''}
        <div class="funding-actions">
          <button class="btn btn-primary btn-large" id="proceed-to-create-btn">
            ${buttonText}
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Start monitoring for incoming transactions using TransactionFinderService
   */
  async startMonitoring() {
    stateManager.setFundingMonitoring(true);

    try {
      // Use TransactionFinderService for real-time monitoring
      // Events are handled by _bindServiceEvents()
      this.monitoringCleanup = await this.txFinderService.monitorAddress(
        this.fundingAddress,
        {
          // Callbacks handled via service events bound in constructor
          onTransaction: () => {}, // Event emitter handles this
          onInstantLock: () => {},
          onChainLock: () => {}
        }
      );

      // Also listen for global InstantSend events (for legacy compatibility)
      window.addEventListener('instantsend-received', this.handleInstantSendReceived);
    } catch (error) {
      console.error('Failed to start monitoring:', error);
      notifications.error(`Monitoring failed: ${error.message}`);
      stateManager.setFundingMonitoring(false);
    }
  }

  /**
   * Stop monitoring for incoming transactions
   */
  stopMonitoring() {
    stateManager.setFundingMonitoring(false);

    // Clean up TransactionFinderService monitoring
    if (this.monitoringCleanup) {
      this.monitoringCleanup();
      this.monitoringCleanup = null;
    }
    this.txFinderService.stop();

    // Remove legacy event listener
    window.removeEventListener('instantsend-received', this.handleInstantSendReceived);
  }

  /**
   * Handle InstantSend received event (legacy compatibility)
   */
  handleInstantSendReceived = (event) => {
    const transaction = event.detail;
    if (transaction.address === this.fundingAddress) {
      this.stopMonitoring();
      notifications.success(`Received ${formatBalanceForDisplay(transaction.balance)}!`);
      this.showConfirmationStep(transaction.balance);
    }
  }

  /**
   * Proceed to identity creation with optimized sync
   */
  async proceedToIdentityCreation() {
    const mode = stateManager.getState().fundingFlow.mode;
    const timeframe = stateManager.getState().fundingFlow.timeframe;
    const balance = stateManager.getState().fundingFlow.detectedBalance;
    const utxos = stateManager.getState().fundingFlow.utxos || [];

    // Validate balance
    const validation = validateFundingBalance(balance);
    if (!validation.valid) {
      notifications.error(validation.message);
      return;
    }

    // Store context before hiding (in case hide resets state)
    const context = this.context;

    // Hide funding modal
    this.hide();

    // Trigger next step based on context with optimized sync parameters
    // Include UTXOs so that identity creation can use createWithUTXO (modular flow)
    // instead of createWithWallet (which rescans the blockchain)
    const proceedEvent = new CustomEvent('wallet-funded-proceed', {
      detail: {
        context: context,
        mode,
        timeframe,
        balance,
        address: this.fundingAddress,
        utxos  // Pre-found UTXOs from TransactionFinderService
      }
    });

    console.log('🎯 Dispatching wallet-funded-proceed event:', { context, mode, timeframe, balance, utxoCount: utxos.length });
    window.dispatchEvent(proceedEvent);
  }

  /**
   * Bind event handlers
   */
  bindEventHandlers() {
    const modal = document.getElementById('wallet-funding-modal');
    if (!modal) return;

    // Use event delegation for dynamically created buttons
    modal.addEventListener('click', async (e) => {
      // Cancel button
      if (e.target.matches('.modal-cancel, #monitoring-cancel-btn')) {
        this.hide();
      }

      // Already funded path
      if (e.target.matches('#already-funded-btn')) {
        await this.showTimeframeStep();
      }

      // Sending now path
      if (e.target.matches('#sending-now-btn')) {
        await this.showMonitoringStep();
      }

      // Back button in timeframe selection
      if (e.target.matches('#timeframe-back-btn')) {
        this.showInitialStep();
      }

      // Continue with timeframe
      if (e.target.matches('#timeframe-continue-btn')) {
        const selectedTimeframe = modal.querySelector('input[name="timeframe"]:checked')?.value;
        if (selectedTimeframe) {
          stateManager.setFundingTimeframe(selectedTimeframe);
          // In already-funded mode, check balance immediately
          await this.checkExistingBalance(selectedTimeframe);
        }
      }

      // Proceed to create
      if (e.target.matches('#proceed-to-create-btn')) {
        await this.proceedToIdentityCreation();
      }

      // Copy address button
      if (e.target.matches('.copy-address-btn') || e.target.closest('.copy-address-btn')) {
        const btn = e.target.closest('.copy-address-btn') || e.target;
        const address = btn.dataset.copy;
        if (address) {
          try {
            await navigator.clipboard.writeText(address);
            notifications.success('Address copied to clipboard!');
          } catch (err) {
            notifications.error('Failed to copy address');
          }
        }
      }

      // Need help button
      if (e.target.matches('#need-help-btn') || e.target.closest('#need-help-btn')) {
        this.showHelpModal();
      }
    });

    // Close modal on backdrop click
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.hide());
    }
  }

  /**
   * Show help modal with testnet DASH faucet information
   */
  showHelpModal() {
    // Create help modal element
    const helpModal = document.createElement('div');
    helpModal.className = 'modal help-modal';
    helpModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>Getting Testnet DASH</h2>
          <button class="btn-icon modal-close" aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="help-section">
            <h3>🚰 Testnet Faucets</h3>
            <p>Use one of these faucets to get free testnet DASH for testing:</p>
            <ul class="faucet-list">
              <li>
                <strong>Official Dash Testnet Faucet</strong>
                <p>Get testnet DASH directly from the Dash project</p>
                <a href="https://testnet-faucet.dash.org" target="_blank" rel="noopener">testnet-faucet.dash.org</a>
              </li>
              <li>
                <strong>Dash Platform Testnet Faucet</strong>
                <p>Specifically for Dash Platform testing</p>
                <a href="https://platform-testnet-faucet.dash.org" target="_blank" rel="noopener">platform-testnet-faucet.dash.org</a>
              </li>
            </ul>
          </div>

          <div class="help-section">
            <h3>💡 Tips</h3>
            <ul class="tips-list">
              <li>Minimum amount needed: 0.001 DASH to create an identity</li>
              <li>Recommended amount: 0.01+ DASH for multiple operations</li>
              <li>Transactions typically confirm within a few seconds</li>
              <li>You can request funds multiple times (with rate limiting)</li>
            </ul>
          </div>

          <div class="help-section">
            <h3>📱 Steps</h3>
            <ol class="steps-list">
              <li>Copy your wallet address from above</li>
              <li>Visit one of the faucet links</li>
              <li>Paste your address and request DASH</li>
              <li>Wait for the transaction to arrive (usually instant with InstantSend)</li>
              <li>Proceed with identity creation</li>
            </ol>
          </div>

          <div class="help-section">
            <h3>❓ Common Questions</h3>
            <div class="faq">
              <div class="faq-item">
                <strong>How much DASH do I need?</strong>
                <p>At least 0.001 DASH for a basic identity. More if you plan multiple operations.</p>
              </div>
              <div class="faq-item">
                <strong>How long does it take?</strong>
                <p>With InstantSend, usually less than a second. Without it, ~2.6 minutes per block.</p>
              </div>
              <div class="faq-item">
                <strong>Can I use mainnet DASH?</strong>
                <p>No, you need testnet DASH. Testnet and mainnet currencies are separate.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary modal-close-help">Got it, thanks!</button>
        </div>
      </div>
    `;

    document.body.appendChild(helpModal);

    // Bind close handlers
    helpModal.addEventListener('click', (e) => {
      // Handle X button, backdrop, and "Got it" button
      if (e.target.matches('.modal-close, .modal-backdrop, .modal-close-help') ||
          e.target.closest('.modal-close')) {
        helpModal.remove();
      }
    });
  }

  /**
   * Check existing balance for already-funded wallets using TransactionFinderService
   */
  async checkExistingBalance(timeframe) {
    const container = document.getElementById('funding-flow-content');
    if (!container) return;

    stateManager.setFundingStep('scanning');

    // Show scanning UI with progress bar
    container.innerHTML = `
      <div class="funding-step funding-scanning">
        <div class="spinner-large"></div>
        <h2>Scanning Blockchain</h2>
        <p class="funding-description">
          Looking for your transaction in the last ${timeframe}...
        </p>
        <div class="scan-progress-container">
          <div class="scan-progress-bar">
            <div class="scan-progress-fill" id="scan-progress-fill" style="width: 0%"></div>
          </div>
          <p class="scan-progress-text">
            <span id="scan-blocks-scanned">0</span> / <span id="scan-blocks-total">0</span> blocks
            (<span id="scan-progress-percent">0</span>%)
          </p>
        </div>
        <p class="scanning-info">Estimated time: ${getEstimatedSyncTime(timeframe)}</p>
        <div class="funding-actions">
          <button class="btn btn-ghost" id="scanning-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    // Bind cancel button
    const cancelBtn = document.getElementById('scanning-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.txFinderService.stop();
        this.showInitialStep();
      });
    }

    try {
      // Generate address
      this.fundingAddress = await this.platformOps.generateFundingAddress();
      stateManager.setFundingAddress(this.fundingAddress);

      // Use TransactionFinderService for historic scan
      const utxos = await this.txFinderService.findUTXOs(
        [this.fundingAddress],
        {
          timeframe,
          onProgress: (progress) => {
            // Progress updates handled by _updateScanProgressUI via service events
          }
        }
      );

      // Calculate total balance
      const totalBalance = this.txFinderService.calculateBalance(utxos);

      // Store UTXOs in state for later use
      stateManager.setFundingUTXOs(utxos);

      if (totalBalance > 0) {
        // Show confirmation with found balance
        this.showConfirmationStep(totalBalance);
      } else {
        // No funds found - show option to retry or adjust timeframe
        this.showNoFundsFound(timeframe);
      }
    } catch (error) {
      console.error('Scan failed:', error);
      notifications.error(`Scan failed: ${error.message}`);
      this.showInitialStep();
    }
  }

  /**
   * Show "No funds found" step with retry options
   */
  showNoFundsFound(timeframe) {
    const container = document.getElementById('funding-flow-content');
    if (!container) return;

    container.innerHTML = `
      <div class="funding-step no-funds-found">
        <div class="no-funds-icon">🔍</div>
        <h2>No Funds Found</h2>
        <p class="funding-description">
          We couldn't find any transactions in the last ${timeframe} for your wallet address.
        </p>
        <div class="no-funds-options">
          <p>Try one of these options:</p>
          <ul>
            <li>Extend the search timeframe</li>
            <li>Send new funds now</li>
            <li>Double-check that you sent to the correct address</li>
          </ul>
        </div>
        <div class="funding-actions">
          <button class="btn btn-primary" id="retry-scan-btn">
            Try Different Timeframe
          </button>
          <button class="btn btn-secondary" id="send-now-instead-btn">
            Send Funds Now
          </button>
          <button class="btn btn-ghost" id="no-funds-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    // Bind event handlers
    const retryBtn = document.getElementById('retry-scan-btn');
    const sendNowBtn = document.getElementById('send-now-instead-btn');
    const cancelBtn = document.getElementById('no-funds-cancel-btn');

    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.showTimeframeStep());
    }
    if (sendNowBtn) {
      sendNowBtn.addEventListener('click', () => this.showMonitoringStep());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hide());
    }
  }
}
