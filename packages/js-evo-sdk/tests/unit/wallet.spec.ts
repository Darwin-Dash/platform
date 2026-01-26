import { describe, it, expect } from 'vitest';
import { wallet } from '../../dist/sdk.js';

describe('wallet namespace', () => {
  const exportedFns = [
    'generateMnemonic',
    'validateMnemonic',
    'mnemonicToSeed',
    'deriveKeyFromSeedPhrase',
    'deriveKeyFromSeedWithPath',
    'deriveKeyFromSeedWithExtendedPath',
    'deriveDashpayContactKey',
    'derivationPathBip44Mainnet',
    'derivationPathBip44Testnet',
    'derivationPathDip9Mainnet',
    'derivationPathDip9Testnet',
    'derivationPathDip13Mainnet',
    'derivationPathDip13Testnet',
    'deriveChildPublicKey',
    'xprvToXpub',
    'generateKeyPair',
    'generateKeyPairs',
    'keyPairFromWif',
    'keyPairFromHex',
    'pubkeyToAddress',
    'validateAddress',
    'signMessage',
  ];

  it('exposes the expected helper functions', () => {
    exportedFns.forEach((fn) => {
      expect(wallet).toHaveProperty(fn);
      expect(typeof wallet[fn]).toBe('function');
    });
  });
});
