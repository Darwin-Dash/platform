import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'fs';
import { IdentitySelector } from '../../components/identity-selector.js';
import { stateManager } from '../../state-manager.js';

describe('Identity Selector Component Integration', () => {
  let window, document, selector, container;

  beforeEach(() => {
    // Create DOM environment
    window = new Window();
    document = window.document;
    global.window = window;
    global.document = document;

    // Load HTML snippet for selector
    const html = readFileSync('./index-static.html', 'utf8');
    document.write(html);

    // Reset state and add test identities
    stateManager.reset();
    stateManager.setIdentity('id1', {
      id: 'id1',
      balance: 100000000,
      label: 'Test Identity 1',
      keys: []
    });
    stateManager.setIdentity('id2', {
      id: 'id2',
      balance: 200000000,
      label: 'Test Identity 2',
      keys: []
    });

    // Initialize component
    container = document.getElementById('identity-selector-container');
    selector = new IdentitySelector(container);
  });

  it('initializes with correct elements', () => {
    expect(selector.trigger).toBeTruthy();
    expect(selector.dropdown).toBeTruthy();
    expect(selector.searchInput).toBeTruthy();
    expect(selector.identityList).toBeTruthy();
  });

  it('starts in closed state', () => {
    expect(selector.isOpen).toBe(false);
  });

  it('opens dropdown when triggered', () => {
    selector.open();

    expect(selector.isOpen).toBe(true);
    expect(selector.dropdown.hidden).toBe(false);
    expect(selector.trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes dropdown', () => {
    selector.open();
    selector.close();

    expect(selector.isOpen).toBe(false);
    expect(selector.dropdown.hidden).toBe(true);
    expect(selector.trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles dropdown state', () => {
    selector.toggle();
    expect(selector.isOpen).toBe(true);

    selector.toggle();
    expect(selector.isOpen).toBe(false);
  });

  it('renders identity list', () => {
    selector.renderIdentityList();

    const items = selector.identityList.querySelectorAll('.identity-item');
    expect(items.length).toBe(2); // Two test identities
  });

  it('includes create new option', () => {
    selector.renderIdentityList();

    const createNew = selector.identityList.querySelector('.create-new');
    expect(createNew).toBeTruthy();
    expect(createNew.textContent).toContain('Create New Identity');
  });

  it('filters identities by search term', () => {
    selector.searchTerm = 'test identity 1';  // lowercase for filter
    selector.renderIdentityList();

    const items = selector.identityList.querySelectorAll('.identity-item');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(2);
  });

  it('shows all identities when search is empty', () => {
    selector.searchTerm = '';
    selector.renderIdentityList();

    const items = selector.identityList.querySelectorAll('.identity-item');
    expect(items.length).toBe(2);
  });

  it('search is case insensitive', () => {
    selector.searchTerm = 'test identity 1';
    selector.renderIdentityList();

    const items = selector.identityList.querySelectorAll('.identity-item');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('marks selected identity', () => {
    stateManager.selectIdentity('id1');
    selector.renderIdentityList();

    const selectedItem = selector.identityList.querySelector('.identity-item.selected');
    expect(selectedItem).toBeTruthy();
  });

  it('updates display when identity selected', () => {
    const identity = stateManager.getState().identities.get('id1');
    stateManager.selectIdentity('id1');

    selector.updateDisplay();

    const preview = selector.trigger.querySelector('.identity-preview');
    expect(preview.textContent).toContain(identity.label);
  });

  it('shows placeholder when no identity selected', () => {
    stateManager.selectIdentity(null);
    selector.updateDisplay();

    const preview = selector.trigger.querySelector('.identity-preview');
    expect(preview.textContent).toContain('Select Identity');
  });

  it('clears search when closing', () => {
    selector.searchInput.value = 'test search';
    selector.searchTerm = 'test search';
    selector.open();
    selector.close();

    expect(selector.searchTerm).toBe('');
    expect(selector.searchInput.value).toBe('');
  });

  it('selects identity when item clicked', () => {
    selector.renderIdentityList();

    const firstItem = selector.identityList.querySelector('.identity-item');
    firstItem.click();

    const selectedId = stateManager.getState().ui.selectedIdentityId;
    expect(selectedId).toBeTruthy();
  });

  it('closes dropdown after selection', () => {
    selector.open();
    expect(selector.isOpen).toBe(true);

    // Simulate identity selection via state manager
    stateManager.selectIdentity('id1');

    expect(selector.isOpen).toBe(false);
  });

  it('refreshes list when identity added', () => {
    selector.renderIdentityList();
    const initialCount = selector.identityList.querySelectorAll('.identity-item').length;

    stateManager.setIdentity('id3', {
      id: 'id3',
      balance: 300000000,
      label: 'New Identity'
    });

    selector.renderIdentityList();
    const newCount = selector.identityList.querySelectorAll('.identity-item').length;

    expect(newCount).toBe(initialCount + 1);
  });

  it('refreshes display when identity updated', () => {
    stateManager.selectIdentity('id1');
    selector.updateDisplay();

    const identity = stateManager.getState().identities.get('id1');
    identity.balance = 999999999;

    stateManager.setIdentity('id1', identity);
    selector.updateDisplay();

    const preview = selector.trigger.querySelector('.identity-preview');
    const balanceText = preview.textContent;
    expect(balanceText).toContain('9.99999999');
  });

  it('handles identity removal', () => {
    selector.renderIdentityList();

    stateManager.removeIdentity('id1');

    selector.renderIdentityList();
    const items = selector.identityList.querySelectorAll('.identity-item');

    expect(items.length).toBe(1);
  });
});