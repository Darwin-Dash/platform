/**
 * Vitest global setup
 * Runs before all tests
 */

// Mock localStorage for tests
class LocalStorageMock {
  constructor() {
    this.store = new Map();
  }

  clear() {
    this.store.clear();
  }

  getItem(key) {
    return this.store.get(key) || null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }
}

global.localStorage = new LocalStorageMock();

// Mock navigator.clipboard for copy tests
if (!global.navigator) {
  global.navigator = {};
}

// Use Object.defineProperty to override read-only clipboard property
if (global.navigator) {
  Object.defineProperty(global.navigator, 'clipboard', {
    writable: true,
    value: {
      writeText: (text) => Promise.resolve(),
      readText: () => Promise.resolve('')
    }
  });
}

// Mock window.matchMedia for responsive tests
global.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

// Setup notification container globally before any tests run
// This ensures the notifications singleton can initialize properly
// Only run in browser-like environments
beforeEach(() => {
  if (typeof document !== 'undefined' && document.body) {
    // Create notification container if it doesn't exist
    if (!document.getElementById('notification-container')) {
      const notificationContainer = document.createElement('div');
      notificationContainer.id = 'notification-container';
      document.body.appendChild(notificationContainer);
    }
  }
});

// Suppress console errors during tests (optional)
// global.console = {
//   ...console,
//   error: vi.fn(),
//   warn: vi.fn(),
// };

// Clean up after each test
afterEach(() => {
  global.localStorage.clear();
});