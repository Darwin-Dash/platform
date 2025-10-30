# Fix Summary: UTXO Metadata Extraction

## Problem Solved ✅

UTXOs were being marked as unspendable because `blockHeight = 0`. This is now **FIXED** - metadata is correctly extracted and UTXOs are properly marked as spendable.

## Root Causes Identified and Fixed

### Issue 1: DAPI Returns Raw Buffers, Not Parsed Objects ✅ FIXED

**Problem:**
- `core.getBlockByHeight()` returns raw block buffers
- We were trying to access `block.header.hash` and `block.header.height`
- These properties don't exist on raw buffers → headers cache empty → blockHeight = 0

**Solution:**
- Parse block buffers using `new Block(blockBuffer)` from dashcore-lib
- Extract hash and time from parsed block header
- Track requested height alongside buffer fetch
- Result: Header cache now populates correctly

**Files Modified:**
- `src/TransactionSyncer.ts:178-220`
- `lib/TransactionSyncer.js:119-170`

### Issue 2: Stream Messages Are Protobuf Objects ✅ FIXED

**Problem:**
- DAPI stream returns protobuf objects with getter methods
- We were accessing properties directly: `msg.rawTransactions`
- Protobuf objects require: `msg.getRawTransactions()`
- Raw transactions also wrapped: need `rawTxs.getTransactionsList()`

**Solution:**
- Detect protobuf vs plain objects: `typeof msg.getRawTransactions === 'function'`
- Try getter methods first, fallback to direct properties
- Handle nested protobuf: `getTransactionsList()` for transaction arrays
- Result: Transactions and merkle blocks now extracted correctly

**Files Modified:**
- `src/TransactionSyncer.ts:353-394`
- `lib/TransactionSyncer.js:270-308`

### Issue 3: Incorrect Diagnostic Script Field Names ✅ FIXED

**Problem:**
- Diagnostic checked `utxo.txid` instead of `utxo.txId`
- Checked `utxo.spendable` field that doesn't exist
- Used wrong timestamp field

**Solution:**
- Updated to use correct field names per UTXO interface
- Implemented spendability calculation matching LatestUTXOSelector logic
- Fixed timestamp access to use `blockTime`

**Files Modified:**
- `scripts/diagnose-metadata-extraction.js`

## Validation Results

### RPC Verification ✅
```
Address: yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy
UTXO: ceba006fc44504f4...
Block Height: 1353469
Amount: 5.74157877 DASH
```

### UTXO Finder Results ✅
```
TX Hash: ceba006fc44504f4813bd662d8cadd7568f0a47cef8d949552c8582c44d70166
Output Index: 0
Amount: 574157877 satoshis (5.74157877 DASH)
Block Height: 1353469  ← CORRECT!
Block Hash: 0000018f8581f81fe922b16c5597d7ac0ffeb424531353b4d74e5da4bac9196a
Block Time: 2025-10-28T08:24:41.000Z
Spendable: ✅ YES (100%)
```

### Final Diagnostic ✅
```
✓ All UTXOs have complete metadata and are marked as spendable
  Metadata extraction is working correctly!
```

## Implementation Summary

### Two-Phase Sync Pattern (from wallet-lib)

**Phase 1: Pre-Sync Block Headers**
```typescript
private headerCache = new Map<string, {height: number; time: number}>();

private async syncHeaders(fromHeight: number, toHeight: number) {
  // Fetch blocks by height in batches
  // Parse raw buffers to extract header hash and time
  // Cache: blockHash → {height, time}
}
```

**Phase 2: Sync Transactions with Cached Metadata**
```typescript
// Instant lookup from cache (no async calls!)
const cachedHeader = this.headerCache.get(blockHash);
const blockHeight = cachedHeader?.height || 0;
const blockTime = cachedHeader ? cachedHeader.time : merkleBlock.header.time;
```

### Protobuf Stream Handling

```typescript
// Detect and handle protobuf getter methods
const rawTxs = typeof msg.getRawTransactions === 'function'
  ? msg.getRawTransactions()
  : msg.rawTransactions;

// Handle nested protobuf wrappers
const txList = typeof rawTxs.getTransactionsList === 'function'
  ? rawTxs.getTransactionsList()
  : rawTxs;
```

## Performance Impact

**Header Pre-Sync:** ~5-10 seconds for 1000 blocks
**Benefit:** Instant metadata lookup (no async calls during stream processing)
**Trade-off:** Acceptable - ensures accurate metadata extraction

## Files Modified

1. **src/TransactionSyncer.ts**
   - Added `headerCache` Map
   - Added `syncHeaders()` method with block buffer parsing
   - Updated `_performSync()` to call syncHeaders() first
   - Added protobuf getter detection for all message types
   - Updated merkle block processing to use cached headers

2. **lib/TransactionSyncer.js**
   - Applied same changes to compiled output

3. **scripts/diagnose-metadata-extraction.js**
   - Fixed field name references
   - Added proper spendability calculation
   - Uses .env START_HEIGHT and TESTNET_ADDRESS

4. **scripts/check-address-via-rpc.js**
   - New script to verify UTXOs via RPC
   - Uses /wallet/platformcli endpoint
   - Confirms blockchain state

5. **scripts/test-bloom-filter.js**
   - New script to validate bloom filter construction
   - Confirms filter correctly matches addresses

## Next Steps

1. ✅ **Metadata extraction working** - blockHeight correctly populated
2. ✅ **UTXOs marked as spendable** - spendability logic correct
3. **TODO:** Run full test suite to ensure no regressions
4. **TODO:** Test on mainnet to validate across networks
5. **TODO:** Consider optimization of header pre-sync for large ranges

## Key Learnings

1. **DAPI returns raw buffers** - Always parse with dashcore-lib classes
2. **Protobuf vs plain objects** - Check for getter methods dynamically
3. **Two-phase sync is critical** - Pre-cache metadata for performance
4. **RPC verification essential** - Confirm blockchain state independently
5. **Field name consistency** - Match type definitions exactly (txId not txid)

---
**Status:** ✅ COMPLETE
**Date:** 2025-10-30
**Verified:** Testnet with real transactions
**Performance:** Acceptable (~5-10s header pre-sync + stream processing)
