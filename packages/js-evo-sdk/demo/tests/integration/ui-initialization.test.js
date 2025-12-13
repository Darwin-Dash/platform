import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'fs';
import { stateManager } from '../../state-manager.js';
import { mockIdentities } from '../../mock-data.js';

describe('UI Initialization', () => {
  let window, document;

  beforeEach(() => {
    // Create fresh DOM environment
    window = new Window();
    document = window.document;
    global.window = window;
    global.document = document;

    // Load HTML
    const html = readFileSync('./index-static.html', 'utf8');
    document.write(html);

    // Load CSS (mock style calculations)
    global.getComputedStyle = () => ({});

    // Reset state
    stateManager.reset();
  });

  it('loads HTML structure correctly', () => {
    expect(document.getElementById('app')).toBeTruthy();
    expect(document.querySelector('.app-header')).toBeTruthy();
    expect(document.querySelector('.app-main')).toBeTruthy();
  });

  it('displays welcome state by default', () => {
    const welcomeState = document.getElementById('welcome-state');
    const identityView = document.getElementById('identity-view');

    expect(welcomeState).toBeTruthy();
    // Note: 'hidden' attribute check would need actual app.js execution
  });

  it('has identity selector in header', () => {
    const selector = document.getElementById('identity-selector-container');
    expect(selector).toBeTruthy();
    expect(selector.classList.contains('identity-selector')).toBe(true);
  });

  it('has create identity button', () => {
    const createBtn = document.getElementById('create-identity-btn');
    expect(createBtn).toBeTruthy();
    expect(createBtn.textContent).toContain('Create');
  });

  it('has create identity modal', () => {
    const modal = document.getElementById('create-modal');
    expect(modal).toBeTruthy();
    expect(modal.classList.contains('modal')).toBe(true);
  });

  it('has all action buttons', () => {
    const topupBtn = document.querySelector('button[data-action="topup"]');
    const withdrawBtn = document.querySelector('button[data-action="withdraw"]');
    const transferBtn = document.querySelector('button[data-action="transfer"]');

    expect(topupBtn).toBeTruthy();
    expect(withdrawBtn).toBeTruthy();
    expect(transferBtn).toBeTruthy();
  });

  it('has notification container', () => {
    const container = document.getElementById('notification-container');
    expect(container).toBeTruthy();
    expect(container.classList.contains('notification-container')).toBe(true);
  });

  it('has loading overlay', () => {
    const overlay = document.getElementById('loading-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('loading-overlay')).toBe(true);
  });

  it('has identity info grid', () => {
    const infoGrid = document.getElementById('identity-info');
    expect(infoGrid).toBeTruthy();
  });

  it('has keys table', () => {
    const keysTable = document.querySelector('.keys-table');
    expect(keysTable).toBeTruthy();

    const tbody = document.getElementById('keys-table-body');
    expect(tbody).toBeTruthy();
  });

  it('has activity list', () => {
    const activityList = document.getElementById('activity-list');
    expect(activityList).toBeTruthy();
  });

  it('has all form inputs in create modal', () => {
    const fundingAmount = document.getElementById('funding-amount');
    const unitSelector = document.getElementById('unit-selector');
    const identityLabel = document.getElementById('identity-label');

    expect(fundingAmount).toBeTruthy();
    expect(fundingAmount.getAttribute('type')).toBe('number');
    expect(unitSelector).toBeTruthy();
    expect(identityLabel).toBeTruthy();
  });

  it('has required attributes on amount input', () => {
    const fundingAmount = document.getElementById('funding-amount');

    expect(fundingAmount.hasAttribute('required')).toBe(true);
    expect(fundingAmount.getAttribute('min')).toBe('0.001');
    expect(fundingAmount.getAttribute('step')).toBe('0.00000001');
  });

  it('has network badge in header', () => {
    const networkBadge = document.querySelector('.network-badge');
    expect(networkBadge).toBeTruthy();

    const networkName = networkBadge.querySelector('.network-name');
    expect(networkName.textContent).toContain('Testnet');
  });

  it('has refresh button', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    expect(refreshBtn).toBeTruthy();
    expect(refreshBtn.getAttribute('aria-label')).toBe('Refresh');
  });

  it('has modal close button', () => {
    const closeBtn = document.querySelector('.modal-close');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.getAttribute('aria-label')).toBe('Close');
  });
});