/**
 * Test State Persistence
 *
 * Persists scan state between test runs so that subsequent runs can
 * start scanning from the last known transaction block height instead
 * of scanning from a fixed start height.
 *
 * State file: .test-state.json (gitignored)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '../../.test-state.json');

export interface TestState {
  /** Last block height where a TX involving our address was found */
  lastTxBlockHeight: number;
  /** Last known UTXO details */
  lastUtxo: {
    txId: string;
    vout: number;
    satoshis: number;
    script: string;
    address: string;
    blockHeight: number;
  } | null;
  /** Timestamp of last successful test run */
  lastRunTimestamp: string;
  /** Number of blocks to scan (can be adjusted based on success) */
  scanWindow: number;
}

const DEFAULT_STATE: TestState = {
  lastTxBlockHeight: 0,
  lastUtxo: null,
  lastRunTimestamp: '',
  scanWindow: 500,
};

/**
 * Load persisted test state, or return defaults if no state file exists.
 */
export function loadTestState(): TestState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return { ...DEFAULT_STATE, ...data };
    }
  } catch {
    // Corrupt or missing - use defaults
  }
  return { ...DEFAULT_STATE };
}

/**
 * Save test state to disk for next run.
 */
export function saveTestState(state: TestState): void {
  state.lastRunTimestamp = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Calculate the optimal start height for scanning.
 *
 * Priority:
 * 1. If we have a lastTxBlockHeight from a previous run, scan from there minus a small buffer
 * 2. If START_HEIGHT env var is set, use that
 * 3. Fall back to currentHeight - scanWindow
 */
export function getOptimalStartHeight(
  currentHeight: number,
  envStartHeight: number,
  state: TestState,
): number {
  // If we have state from a previous run, use it with a small buffer
  if (state.lastTxBlockHeight > 0) {
    const startFrom = Math.max(1, state.lastTxBlockHeight - 10);
    console.log(`[state] Using persisted state: scanning from block ${startFrom} (last TX at ${state.lastTxBlockHeight})`);
    return startFrom;
  }

  // Fall back to dynamic window from current height
  const dynamicStart = Math.max(1, currentHeight - state.scanWindow);
  console.log(`[state] No previous state, scanning last ${state.scanWindow} blocks from ${dynamicStart}`);
  return dynamicStart;
}
