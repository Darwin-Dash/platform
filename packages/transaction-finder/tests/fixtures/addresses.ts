/**
 * Mock addresses for testing
 * These are valid Dash addresses for testing purposes
 */

export const TESTNET_ADDRESSES = {
  // Standard testnet addresses (starting with 'y')
  address1: 'yNGKX6pL2t3AdrePDdn5qjBgVLhPtPwmKT',
  address2: 'yf1j1PKDDz3U7PjhRfPpGfeniz5gHuZChZ',
  address3: 'yML9arPR79wVhsQJF315ca3W5KPyx2b5GY',
  address4: 'yc9akeANwmZKyAV5sVyGBr2NxoGk5sE7bL',
  address5: 'yRyNbhYC2gpPQTtrzCGQHidTrXU6mgeEPn',
};

export const MAINNET_ADDRESSES = {
  // Standard mainnet addresses (starting with 'X')
  address1: 'Xo6Gr2vXptdbbXD5xCfvNUX97PnNqSsivy',
  address2: 'XmFByHMefekgg9kBXnw9MVSiyqKbCdbrLb',
  address3: 'XxwJpMbGanAzruWRiv7dY7NzEM6YfnfnUA',
};

export const REGTEST_ADDRESSES = {
  // Regtest addresses (testnet format)
  address1: 'yNGKX6pL2t3AdrePDdn5qjBgVLhPtPwmKT',
  address2: 'yf1j1PKDDz3U7PjhRfPpGfeniz5gHuZChZ',
};

export const INVALID_ADDRESSES = {
  tooShort: 'yJKL',
  invalidChecksum: 'yUGbKUTmhRWPu1UXmtgSdYHQTaD61XNHza', // Modified last char
  invalidFormat: 'not-a-valid-address',
  empty: '',
};
