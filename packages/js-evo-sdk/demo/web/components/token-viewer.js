/**
 * Token Viewer Component
 * Displays token balances, supply, status, and info for an identity
 */

import { notifications } from './notifications.js';

export class TokenViewer {
  constructor(containerElement, platformOps, sdk = null) {
    this.container = containerElement;
    this.platformOps = platformOps;
    this.sdk = sdk;
    this.identityId = null;
    this.tokenData = {
      balances: new Map(),
      supply: null,
      status: null,
      contractInfo: null
    };
    this.currentTab = 'balances';
    this.inputTokenId = '';
    this.inputContractId = '';
    this.isLoading = false;
  }

  /**
   * Set the SDK instance (can be set after construction when SDK is connected)
   */
  setSDK(sdk) {
    this.sdk = sdk;
  }

  /**
   * Set the identity ID to query tokens for
   */
  setIdentityId(identityId) {
    this.identityId = identityId;
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    this.isLoading = true;
    this.render();
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    this.isLoading = false;
    this.render();
  }

  /**
   * Query token balances for the identity
   */
  async loadBalances(tokenId) {
    if (!this.sdk || !this.identityId || !tokenId) {
      notifications.warning('SDK, identity, and token ID are required');
      return;
    }

    this.showLoading();
    try {
      const balances = await this.sdk.tokens.balances([this.identityId], tokenId);
      this.tokenData.balances = balances;
      this.inputTokenId = tokenId;
      this.currentTab = 'balances';
      notifications.success('Token balances loaded');
    } catch (error) {
      console.error('[TokenViewer] Failed to load balances:', error);
      notifications.error(`Failed to load balances: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Query token total supply
   */
  async loadSupply(tokenId) {
    if (!this.sdk || !tokenId) {
      notifications.warning('SDK and token ID are required');
      return;
    }

    this.showLoading();
    try {
      const supply = await this.sdk.tokens.totalSupply(tokenId);
      this.tokenData.supply = supply;
      this.inputTokenId = tokenId;
      this.currentTab = 'supply';
      notifications.success('Token supply loaded');
    } catch (error) {
      console.error('[TokenViewer] Failed to load supply:', error);
      notifications.error(`Failed to load supply: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Query token status
   */
  async loadStatus(tokenId) {
    if (!this.sdk || !tokenId) {
      notifications.warning('SDK and token ID are required');
      return;
    }

    this.showLoading();
    try {
      const statuses = await this.sdk.tokens.statuses([tokenId]);
      this.tokenData.status = statuses;
      this.inputTokenId = tokenId;
      this.currentTab = 'status';
      notifications.success('Token status loaded');
    } catch (error) {
      console.error('[TokenViewer] Failed to load status:', error);
      notifications.error(`Failed to load status: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Query token contract info
   */
  async loadContractInfo(contractId) {
    if (!this.sdk || !contractId) {
      notifications.warning('SDK and contract ID are required');
      return;
    }

    this.showLoading();
    try {
      const info = await this.sdk.tokens.contractInfo(contractId);
      this.tokenData.contractInfo = info;
      this.inputContractId = contractId;
      this.currentTab = 'contract';
      notifications.success('Token contract info loaded');
    } catch (error) {
      console.error('[TokenViewer] Failed to load contract info:', error);
      notifications.error(`Failed to load contract info: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Query direct purchase prices
   */
  async loadPrices(tokenId) {
    if (!this.sdk || !tokenId) {
      notifications.warning('SDK and token ID are required');
      return;
    }

    this.showLoading();
    try {
      const prices = await this.sdk.tokens.directPurchasePrices([tokenId]);
      this.tokenData.prices = prices;
      this.inputTokenId = tokenId;
      this.currentTab = 'prices';
      notifications.success('Token prices loaded');
    } catch (error) {
      console.error('[TokenViewer] Failed to load prices:', error);
      notifications.error(`Failed to load prices: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  render() {
    const tabs = [
      { id: 'balances', label: 'Balances', icon: this.getBalanceIcon() },
      { id: 'supply', label: 'Supply', icon: this.getSupplyIcon() },
      { id: 'status', label: 'Status', icon: this.getStatusIcon() },
      { id: 'contract', label: 'Contract', icon: this.getContractIcon() },
      { id: 'prices', label: 'Prices', icon: this.getPriceIcon() }
    ];

    const tabsHtml = tabs.map(tab => `
      <button class="token-tab ${this.currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
        ${tab.icon}
        ${tab.label}
      </button>
    `).join('');

    this.container.innerHTML = `
      <div class="token-viewer">
        <div class="token-tabs">
          ${tabsHtml}
        </div>
        <div class="token-content">
          ${this.isLoading ? this.renderLoading() : this.renderContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderLoading() {
    return `
      <div class="token-loading">
        <div class="spinner"></div>
        <p>Loading token data...</p>
      </div>
    `;
  }

  renderContent() {
    switch (this.currentTab) {
      case 'balances':
        return this.renderBalancesTab();
      case 'supply':
        return this.renderSupplyTab();
      case 'status':
        return this.renderStatusTab();
      case 'contract':
        return this.renderContractTab();
      case 'prices':
        return this.renderPricesTab();
      default:
        return this.renderBalancesTab();
    }
  }

  renderBalancesTab() {
    const hasBalances = this.tokenData.balances && this.tokenData.balances.size > 0;

    return `
      <div class="token-panel">
        <div class="token-input-group">
          <label for="balance-token-id">Token ID</label>
          <input type="text" id="balance-token-id" class="token-input"
            placeholder="Enter token ID" value="${this.escapeHtml(this.inputTokenId)}" />
          <button class="btn btn-primary btn-sm" id="load-balances-btn">Load Balances</button>
        </div>

        ${hasBalances ? this.renderBalancesList() : `
          <div class="token-empty">
            <p>Enter a token ID and click "Load Balances" to view your token holdings.</p>
          </div>
        `}
      </div>
    `;
  }

  renderBalancesList() {
    const entries = [];
    for (const [key, value] of this.tokenData.balances) {
      const id = key.toString ? key.toString() : key;
      entries.push({ id, balance: value.toString() });
    }

    if (entries.length === 0) {
      return `<div class="token-empty"><p>No balance found for this token.</p></div>`;
    }

    return `
      <div class="token-results">
        <h4>Token Balances</h4>
        <div class="token-list">
          ${entries.map(entry => `
            <div class="token-item">
              <span class="token-label">Identity:</span>
              <code class="token-value">${this.truncateId(entry.id)}</code>
              <span class="token-label">Balance:</span>
              <span class="token-value token-balance">${entry.balance}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderSupplyTab() {
    const supply = this.tokenData.supply;

    return `
      <div class="token-panel">
        <div class="token-input-group">
          <label for="supply-token-id">Token ID</label>
          <input type="text" id="supply-token-id" class="token-input"
            placeholder="Enter token ID" value="${this.escapeHtml(this.inputTokenId)}" />
          <button class="btn btn-primary btn-sm" id="load-supply-btn">Load Supply</button>
        </div>

        ${supply ? `
          <div class="token-results">
            <h4>Total Supply</h4>
            <div class="token-stat">
              <span class="token-label">Token ID:</span>
              <code class="token-value">${this.truncateId(this.inputTokenId)}</code>
            </div>
            <div class="token-stat">
              <span class="token-label">Total Supply:</span>
              <span class="token-value token-supply">${supply.amount?.toString() || '0'}</span>
            </div>
          </div>
        ` : `
          <div class="token-empty">
            <p>Enter a token ID and click "Load Supply" to view the total supply.</p>
          </div>
        `}
      </div>
    `;
  }

  renderStatusTab() {
    const statuses = this.tokenData.status;
    const hasStatus = statuses && statuses.size > 0;

    return `
      <div class="token-panel">
        <div class="token-input-group">
          <label for="status-token-id">Token ID</label>
          <input type="text" id="status-token-id" class="token-input"
            placeholder="Enter token ID" value="${this.escapeHtml(this.inputTokenId)}" />
          <button class="btn btn-primary btn-sm" id="load-status-btn">Load Status</button>
        </div>

        ${hasStatus ? this.renderStatusList() : `
          <div class="token-empty">
            <p>Enter a token ID and click "Load Status" to view the token status.</p>
          </div>
        `}
      </div>
    `;
  }

  renderStatusList() {
    const entries = [];
    for (const [key, value] of this.tokenData.status) {
      const id = key.toString ? key.toString() : key;
      entries.push({ id, status: value });
    }

    return `
      <div class="token-results">
        <h4>Token Status</h4>
        <div class="token-list">
          ${entries.map(entry => `
            <div class="token-item">
              <span class="token-label">Token:</span>
              <code class="token-value">${this.truncateId(entry.id)}</code>
              <span class="token-label">Status:</span>
              <span class="token-value token-status">${JSON.stringify(entry.status)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderContractTab() {
    const info = this.tokenData.contractInfo;

    return `
      <div class="token-panel">
        <div class="token-input-group">
          <label for="contract-id">Contract ID</label>
          <input type="text" id="contract-id" class="token-input"
            placeholder="Enter contract ID" value="${this.escapeHtml(this.inputContractId)}" />
          <button class="btn btn-primary btn-sm" id="load-contract-btn">Load Contract</button>
        </div>

        ${info ? `
          <div class="token-results">
            <h4>Token Contract Info</h4>
            <div class="token-stat">
              <span class="token-label">Contract ID:</span>
              <code class="token-value">${this.truncateId(this.inputContractId)}</code>
            </div>
            ${info.ownerId ? `
              <div class="token-stat">
                <span class="token-label">Owner ID:</span>
                <code class="token-value">${this.truncateId(info.ownerId)}</code>
              </div>
            ` : ''}
            <div class="token-stat">
              <span class="token-label">Contract Data:</span>
              <pre class="token-json">${JSON.stringify(info, null, 2)}</pre>
            </div>
          </div>
        ` : `
          <div class="token-empty">
            <p>Enter a contract ID and click "Load Contract" to view the token contract info.</p>
          </div>
        `}
      </div>
    `;
  }

  renderPricesTab() {
    const prices = this.tokenData.prices;
    const hasPrices = prices && prices.size > 0;

    return `
      <div class="token-panel">
        <div class="token-input-group">
          <label for="prices-token-id">Token ID</label>
          <input type="text" id="prices-token-id" class="token-input"
            placeholder="Enter token ID" value="${this.escapeHtml(this.inputTokenId)}" />
          <button class="btn btn-primary btn-sm" id="load-prices-btn">Load Prices</button>
        </div>

        ${hasPrices ? this.renderPricesList() : `
          <div class="token-empty">
            <p>Enter a token ID and click "Load Prices" to view direct purchase prices.</p>
          </div>
        `}
      </div>
    `;
  }

  renderPricesList() {
    const entries = [];
    for (const [key, value] of this.tokenData.prices) {
      const id = key.toString ? key.toString() : key;
      entries.push({ id, priceInfo: value });
    }

    return `
      <div class="token-results">
        <h4>Direct Purchase Prices</h4>
        <div class="token-list">
          ${entries.map(entry => `
            <div class="token-item">
              <span class="token-label">Token:</span>
              <code class="token-value">${this.truncateId(entry.id)}</code>
              <span class="token-label">Price:</span>
              <span class="token-value token-price">${entry.priceInfo?.price?.toString() || 'N/A'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Tab switching
    const tabs = this.container.querySelectorAll('.token-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        this.render();
      });
    });

    // Load buttons
    const loadBalancesBtn = this.container.querySelector('#load-balances-btn');
    if (loadBalancesBtn) {
      loadBalancesBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#balance-token-id');
        if (input && input.value.trim()) {
          this.loadBalances(input.value.trim());
        } else {
          notifications.warning('Please enter a token ID');
        }
      });
    }

    const loadSupplyBtn = this.container.querySelector('#load-supply-btn');
    if (loadSupplyBtn) {
      loadSupplyBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#supply-token-id');
        if (input && input.value.trim()) {
          this.loadSupply(input.value.trim());
        } else {
          notifications.warning('Please enter a token ID');
        }
      });
    }

    const loadStatusBtn = this.container.querySelector('#load-status-btn');
    if (loadStatusBtn) {
      loadStatusBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#status-token-id');
        if (input && input.value.trim()) {
          this.loadStatus(input.value.trim());
        } else {
          notifications.warning('Please enter a token ID');
        }
      });
    }

    const loadContractBtn = this.container.querySelector('#load-contract-btn');
    if (loadContractBtn) {
      loadContractBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#contract-id');
        if (input && input.value.trim()) {
          this.loadContractInfo(input.value.trim());
        } else {
          notifications.warning('Please enter a contract ID');
        }
      });
    }

    const loadPricesBtn = this.container.querySelector('#load-prices-btn');
    if (loadPricesBtn) {
      loadPricesBtn.addEventListener('click', () => {
        const input = this.container.querySelector('#prices-token-id');
        if (input && input.value.trim()) {
          this.loadPrices(input.value.trim());
        } else {
          notifications.warning('Please enter a token ID');
        }
      });
    }
  }

  // Helper methods
  truncateId(id, length = 20) {
    if (!id) return 'Unknown';
    const str = id.toString();
    if (str.length <= length) return str;
    return `${str.substring(0, length / 2)}...${str.substring(str.length - length / 2)}`;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Icon methods
  getBalanceIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  getSupplyIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
      <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  getStatusIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  getContractIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  getPriceIcon() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M7 7h10v10M7 17L17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
}
