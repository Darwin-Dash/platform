/**
 * DAPI-Only Transaction Helper
 *
 * Provides DAPI-only transaction building, signing, and broadcasting
 * using dashcore-lib for key derivation and TX construction.
 * No RPC node required.
 *
 * Extracted from scripts/dapi-multinode-poc.ts for reuse in tests.
 */

import DAPIClient from '@dashevo/dapi-client';
import dashcore from '@dashevo/dashcore-lib';

const { Transaction, Script, Mnemonic } = dashcore;

const SELF_SEND_FEE = 500; // 500 duffs (~0.000005 DASH)

export interface ChainedUTXO {
  txId: string;
  vout: number;
  satoshis: number;
  script: string;
  address: string;
}

export interface BuiltTransaction {
  txHex: string;
  txid: string;
  outputUtxo: ChainedUTXO;
}

/**
 * Derive the BIP44 private key from a mnemonic.
 * Path: m/44'/1'/0'/0/0 (testnet) or m/44'/5'/0'/0/0 (mainnet)
 */
export function derivePrivateKey(mnemonic: string, network: string): any {
  const mn = new Mnemonic(mnemonic);
  const hdKey = mn.toHDPrivateKey('', network);
  const coinType = network === 'mainnet' ? 5 : 1;
  const derived = hdKey.deriveChild(`m/44'/${coinType}'/0'/0/0`);
  return derived.privateKey;
}

/**
 * Get the address derived from a mnemonic.
 */
export function deriveAddress(mnemonic: string, network: string): string {
  const privateKey = derivePrivateKey(mnemonic, network);
  return privateKey.toAddress(network).toString();
}

/**
 * Build a self-send transaction (sends funds back to same address minus fee).
 * This is used for testing - creates a real TX on testnet.
 */
export function buildSelfSendTx(
  utxo: ChainedUTXO,
  privateKey: any,
  network: string,
): BuiltTransaction {
  const sendAmount = utxo.satoshis - SELF_SEND_FEE;
  if (sendAmount <= 0) {
    throw new Error(`UTXO too small: ${utxo.satoshis} duffs (need > ${SELF_SEND_FEE} for fee)`);
  }

  const address = privateKey.toAddress(network);
  const unspentOutput = new Transaction.UnspentOutput({
    txId: utxo.txId,
    outputIndex: utxo.vout,
    address: utxo.address,
    script: utxo.script || Script.buildPublicKeyHashOut(address).toString(),
    satoshis: utxo.satoshis,
  });

  const tx = new Transaction()
    .from(unspentOutput)
    .to(address.toString(), sendAmount)
    .sign(privateKey);

  const txHex = tx.toString();
  const txid = tx.hash;

  const outputUtxo: ChainedUTXO = {
    txId: txid,
    vout: 0,
    satoshis: sendAmount,
    script: Script.buildPublicKeyHashOut(address).toString(),
    address: address.toString(),
  };

  return { txHex, txid, outputUtxo };
}

/**
 * Broadcast a transaction via DAPI (no RPC needed).
 */
export async function broadcastViaDAPI(
  dapiClient: DAPIClient,
  txHex: string,
): Promise<string> {
  const txid = await (dapiClient as any).core.broadcastTransaction(
    Buffer.from(txHex, 'hex'),
  );
  return txid;
}

/**
 * Wait for InstantSend confirmation by polling getTransaction.
 */
export async function waitForInstantSend(
  dapiClient: DAPIClient,
  txid: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 2000,
): Promise<boolean> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    pollCount++;
    try {
      const txResponse = await (dapiClient as any).core.getTransaction(txid);
      if (txResponse?.isInstantLocked) {
        return true;
      }
    } catch {
      // TX may not be available yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

/**
 * Get the current best block height via DAPI.
 */
export async function getCurrentHeight(dapiClient: DAPIClient): Promise<number> {
  const status = await (dapiClient as any).core.getBlockchainStatus();
  return status.chain?.blocksCount || status.blocks;
}
