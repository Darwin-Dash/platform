const TransactionEstimator = require('../TransactionEstimator');

/**
 * Latest Spendable UTXO Strategy (PRD Compliant)
 *
 * Uses only the latest (most recent) spendable UTXO that has sufficient funds.
 * This eliminates transaction conflicts by using single UTXOs with proper spendability validation.
 *
 * Algorithm:
 * 1. Filter UTXOs for spendability (confirmed OR ChainLocked OR InstantSend)
 * 2. Sort by blockchain chronological order: block height (desc), then timestamp (desc)
 * 3. Select the chronologically latest spendable UTXO
 * 4. If sufficient funds: use only that UTXO (no conflicts possible)
 * 5. If insufficient: fail with clear error message
 *
 * Spendability Rules (Dash Network):
 * - Confirmed UTXOs: blockHeight > 0
 * - ChainLocked UTXOs: isChainLocked = true (spendable immediately)
 * - InstantSend UTXOs: isInstantLocked = true (spendable immediately)
 *
 * Benefits:
 * - PRD compliant: uses true blockchain chronological order
 * - Spendability-aware: respects Dash network spendability rules
 * - Eliminates tx-txlock-conflict errors (single UTXO = no conflicts)
 * - Uses most recent spendable funds (latest spendable UTXO)
 * - Clear error handling for insufficient funds
 */
const latestSpendableUTXO = (utxosList, outputsList, deductFee = false, feeCategory = 'normal') => {
  const txEstimator = new TransactionEstimator(feeCategory);

  // Add outputs to estimate required amount
  txEstimator.addOutputs(outputsList);
  const totalOutputValue = txEstimator.getTotalOutputValue();

  // Filter for spendable UTXOs first (confirmed OR ChainLocked OR InstantSend)
  const spendableUTXOs = utxosList.filter(utxo => {
    // UTXO is spendable if it has confirmations OR is ChainLocked OR is InstantLocked
    const hasConfirmations = utxo.blockHeight && utxo.blockHeight > 0;
    const isChainLocked = utxo.isChainLocked === true;
    const isInstantLocked = utxo.isInstantLocked === true;
    const spendable = hasConfirmations || isChainLocked || isInstantLocked;

    // Debug logging enabled for troubleshooting UTXO selection
    console.log(`🔍 UTXO Spendability Check: ${utxo.txId}:${utxo.vout} = ${utxo.satoshis} duffs`);
    console.log(`   blockHeight: ${utxo.blockHeight} (confirmed: ${hasConfirmations})`);
    console.log(`   isChainLocked: ${utxo.isChainLocked} (chainLocked: ${isChainLocked})`);
    console.log(`   isInstantLocked: ${utxo.isInstantLocked} (instantLocked: ${isInstantLocked})`);
    console.log(`   → Spendable: ${spendable}`);

    return spendable;
  });

  console.log(`📊 Spendability Results: ${spendableUTXOs.length}/${utxosList.length} UTXOs are spendable`);

  if (spendableUTXOs.length === 0) {
    throw new Error('No spendable UTXOs available (need confirmations, ChainLock, or InstantSend)');
  }

  // Sort spendable UTXOs by blockchain chronological order (blockHeight primary)
  // This ensures we select the most recent UTXO based on block position, not timestamp
  console.log(`🎯 Sorting ${spendableUTXOs.length} spendable UTXOs by blockHeight/blockTime/value...`);
  const chronologicallySortedUTXOs = spendableUTXOs.sort((a, b) => {
    // PRIMARY: Block height descending (true blockchain chronological order - highest block = latest)
    if (a.blockHeight !== b.blockHeight) {
      return b.blockHeight - a.blockHeight;
    }
    // SECONDARY: Block time descending (tiebreaker for UTXOs in same block)
    if (a.blockTime !== b.blockTime) {
      return b.blockTime - a.blockTime;
    }
    // TERTIARY: Value descending (prefer larger UTXOs when height and time equal)
    return b.satoshis - a.satoshis;
  });

  // Debug: Show sorted results with TRUE chronological order
  chronologicallySortedUTXOs.forEach((utxo, i) => {
    console.log(`   ${i}: ${utxo.txId}:${utxo.vout} = ${utxo.satoshis} duffs (time: ${utxo.blockTime}, height: ${utxo.blockHeight})`);
  });

  // Select the chronologically latest (first in sorted array)
  const latestUTXO = chronologicallySortedUTXOs[0];
  console.log(`🎯 Selected latest UTXO: ${latestUTXO.txId}:${latestUTXO.vout} = ${latestUTXO.satoshis} duffs`);
  let selectedUTXO = null;

  // Estimate fee using the latest UTXO to get accurate fee calculation
  const tempTxEstimator = new TransactionEstimator(feeCategory);
  tempTxEstimator.addOutputs(outputsList);
  tempTxEstimator.addInputs([latestUTXO]);
  const preliminaryFee = tempTxEstimator.getFeeEstimate();
  const totalRequiredWithFee = deductFee ? totalOutputValue : totalOutputValue + preliminaryFee;

  // Check if the latest UTXO has sufficient funds for output + fee
  console.log(`💰 Funds validation:`);
  console.log(`   Latest UTXO has: ${latestUTXO.satoshis} sats`);
  console.log(`   Total required: ${totalRequiredWithFee} sats (${totalOutputValue} output + ${preliminaryFee} fee)`);
  console.log(`   Sufficient funds: ${latestUTXO.satoshis >= totalRequiredWithFee}`);

  if (latestUTXO.satoshis >= totalRequiredWithFee) {
    selectedUTXO = latestUTXO;
    console.log(`✅ Selected UTXO has sufficient funds`);
  } else {
    console.log(`❌ Latest UTXO has insufficient funds`);
  }

  // If latest UTXO has insufficient funds, fail with clear error
  if (!selectedUTXO) {
    const errorMsg = `Insufficient funds in latest spendable UTXO. ` +
      `Latest UTXO has ${latestUTXO.satoshis} sats, but ${totalRequiredWithFee} sats required ` +
      `(${totalOutputValue} for output + ${preliminaryFee} for fee). ` +
      `Use a single UTXO with sufficient funds to avoid transaction conflicts.`;
    throw new Error(errorMsg);
  }

  // Use only the selected UTXO (single UTXO = no conflicts)
  txEstimator.addInputs([selectedUTXO]);

  const estimatedFee = txEstimator.getFeeEstimate();

  if (deductFee === true) {
    // Check if we have enough for both output and fee
    const inValue = txEstimator.getInValue();
    const outValue = txEstimator.getOutValue();

    if (inValue < outValue + estimatedFee) {
      // Reduce output to accommodate fee
      txEstimator.reduceFeeFromOutput((outValue + estimatedFee) - inValue);
    }
  } else {
    // Check if UTXO has enough for output + fee
    if (selectedUTXO.satoshis < totalOutputValue + estimatedFee) {
      const shortfall = (totalOutputValue + estimatedFee) - selectedUTXO.satoshis;
      const errorMsg = `Insufficient funds in latest spendable UTXO for transaction + fee. ` +
        `Latest UTXO has ${selectedUTXO.satoshis} sats, but ${totalOutputValue + estimatedFee} sats required ` +
        `(${totalOutputValue} for output + ${estimatedFee} for fee). Short by ${shortfall} sats.`;
      throw new Error(errorMsg);
    }
  }

  return {
    utxos: txEstimator.getInputs(),
    outputs: txEstimator.getOutputs(),
    feeCategory,
    estimatedFee,
    utxosValue: txEstimator.getInValue(),
  };
};

module.exports = latestSpendableUTXO;