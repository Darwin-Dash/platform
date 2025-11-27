# Known DAPI Client Issues

This document tracks issues discovered in `@dashevo/dapi-client` and potential workarounds.

---

## Issue #1: NOT_FOUND Errors Are Not Retriable

**Date Discovered:** 2025-11-27
**Status:** Workaround implemented in TransactionSyncer
**Severity:** High

### Problem

When a DAPI node returns a gRPC `NOT_FOUND` (code 5) error for block-related requests (e.g., "Block 1363038 not found"), the error is thrown immediately **without retrying on another node**.

This is problematic because:
- Some masternodes may be pruned and lack historical blocks
- Different nodes have different data availability
- DAPI should try another node when one returns "not found" for block data

### Root Cause

In `@dashevo/dapi-client`, `NotFoundError` extends `ResponseError` (not `RetriableResponseError`):

```javascript
// node_modules/@dashevo/dapi-client/lib/transport/GrpcTransport/errors/NotFoundError.js
class NotFoundError extends ResponseError {
  constructor(message, data, dapiAddress) {
    super(grpcErrorCodes.NOT_FOUND, message, data, dapiAddress);
  }
}
```

Only `RetriableResponseError` instances trigger node retry in `GrpcTransport.js`:

```javascript
// node_modules/@dashevo/dapi-client/lib/transport/GrpcTransport/GrpcTransport.js
if (!(responseError instanceof RetriableResponseError)) {
  throw responseError;  // NOT_FOUND ends up here - no retry!
}
```

### Impact

- Historical block scanning fails if first node contacted doesn't have the block
- `TransactionFinder.findUTXOs()` fails with "Block X not found" even when other nodes have the data
- Users cannot reliably scan from older START_HEIGHT values
- UTXO finder fails intermittently depending on which node is contacted first

### Workaround

Added retry logic in `packages/transaction-finder/src/core/TransactionSyncer.ts`:
- Catches NOT_FOUND errors on stream creation
- Retries up to 3 times with exponential backoff (1s, 2s, 4s)
- Allows different DAPI nodes to be tried on each attempt

### Upstream Fix Needed

`@dashevo/dapi-client` should make block-related NOT_FOUND errors retriable. Options:
1. Change `NotFoundError` to extend `RetriableResponseError` for block operations
2. Add special-case handling in `GrpcTransport.js` for block NOT_FOUND errors

### Related Files

- `node_modules/@dashevo/dapi-client/lib/transport/GrpcTransport/GrpcTransport.js`
- `node_modules/@dashevo/dapi-client/lib/transport/GrpcTransport/errors/NotFoundError.js`
- `node_modules/@dashevo/dapi-client/lib/transport/GrpcTransport/errors/RetriableResponseError.js`
- `packages/transaction-finder/src/core/TransactionSyncer.ts` (workaround location)

---

## Template for New Issues

### Issue #N: [Title]

**Date Discovered:** YYYY-MM-DD
**Status:** Open | In Progress | Fixed | Won't Fix
**Severity:** Low | Medium | High | Critical

#### Problem
[Description of the problem]

#### Root Cause
[Technical explanation of why this happens]

#### Impact
[How this affects users/developers]

#### Workaround
[Any temporary solutions]

#### Upstream Fix Needed
[Suggested permanent solution]

#### Related Files
[List of relevant files]
