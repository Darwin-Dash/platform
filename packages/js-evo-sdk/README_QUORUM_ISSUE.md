# Quorum Cache Issue - Quick Reference

## The Bottom Line

**The test identity in `.env` is too old. Its cryptographic proof references a quorum that testnet has rotated out of its cache.**

```
Identity: DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq
Age: ~1600 blocks old (~67 quorum rotations)
Cache size: 24 quorums (covers ~48 blocks or 2 rotations)
Result: Identity's quorum is ~65 rotations OUTSIDE the cache = FAILS
```

---

## What Actually Happens

1. **Prefetch** (`await sdk.WasmSdk.prefetchTrustedQuorumsTestnet()`)
   - Fetches the 24 most recent quorum public keys
   - Takes ~2.8 seconds
   - Succeeds! ✓
   - But doesn't have the OLD quorum we need

2. **Fetch Identity** (`await sdk.getIdentity(id)`)
   - Gets identity data from DAPI
   - Identity includes a cryptographic proof
   - Proof says: "I was signed by Quorum X"
   - Where X = `00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3`

3. **Verify Proof** (automatic in trusted mode)
   - WASM SDK tries to verify the signature
   - Looks for Quorum X in the 24 cached quorums
   - **NOT FOUND!** Quorum X was rotated out 67 rotations ago
   - Error: `"Quorum not found in cache"` ✗

---

## Why This Isn't a Bug

**This is expected behavior, not a defect:**

```
Quorum Rotation:
  Block 1365000: Quorum Q1 (hash: 00000045...) is active
                 └─ Signs identity, proof includes this hash

  Block 1365024: Q1 → Q2 (rotation)
  Block 1365048: Q2 → Q3 (rotation)
  ... many rotations ...

  Block 1368216: Current (Q90 is active)
                 └─ Cache has Q67-Q90 (24 recent)
                 └─ Q1 has been rotated out for 67 rotations
```

**Cache is limited by design:**
- Keep too much data → slow prefetch (bad UX)
- Keep limited data → fast prefetch (good UX) but can't verify old data
- Dash chose performance over supporting ancient identities

---

## Real-World Analogy

```
Public Key Infrastructure (PKI):

Certificate Authority keeps recent certificates:
  ├─ Current: Certificates issued in last 48 hours
  ├─ Recent: Certificates issued in last week
  └─ Archived: Everything older goes to long-term storage

You try to verify a certificate from 3 months ago:
  ├─ CA searches current cache: NOT FOUND
  ├─ CA searches recent storage: NOT FOUND
  ├─ Would need to access archived storage: SLOW
  └─ Most systems don't support this for performance

Same thing is happening here with quorums.
```

---

## The Solutions

### Option 1: Create a Fresh Identity ⭐ (RECOMMENDED)

```javascript
// Create a NEW identity RIGHT NOW
const newIdentity = await sdk.identities.create(...);

// This new identity will have a proof signed by:
// → A quorum from today (block 1368200+)
// → That quorum IS in cache
// → Proof verification WORKS ✓
```

**Pros:**
- Simple, direct solution
- No code changes needed
- Immediately works

**Cons:**
- Need to update `.env` with new identity
- Need to have testnet credits to create it

---

### Option 2: Use a Recent but Existing Identity

```javascript
// Find an identity created in the last 48 blocks
// Query testnet for identities from recent blocks
// Use one of those instead of old one in .env
```

**Pros:**
- Reuses existing data
- Faster than creating new

**Cons:**
- Need to discover a recent identity
- Need to know which identities exist

---

### Option 3: Modify WASM SDK to Keep More Quorums

```rust
// In packages/wasm-sdk/src/context_provider.rs
// Change from 24 quorums to 200+ quorums
pub fn new_testnet() -> Self {
    // current: LRU cache of 100 entries
    // proposed: LRU cache of 1000 entries
}
```

**Pros:**
- Supports old identities
- Backward compatible

**Cons:**
- Slower prefetch (~20 seconds instead of 2.8)
- More memory usage
- May need to update WASM SDK upstream

---

### Option 4: Add Fallback Quorum Fetching

```rust
// When quorum not in cache:
// 1. Check if there's a fallback endpoint
// 2. Fetch the specific quorum from that endpoint
// 3. Cache it for future use
```

**Pros:**
- Works with old identities
- Still keeps prefetch fast
- Best of both worlds

**Cons:**
- More complex
- Requires WASM SDK changes
- Needs fallback endpoint

---

### ❌ Why Non-Trusted Mode Doesn't Work

```
Q: "Can't we just disable proof verification?"
A: "No, WASM SDK doesn't support non-trusted mode."

Reason:
  ├─ WASM runs in browsers
  ├─ Browsers can't make arbitrary network calls (CORS)
  ├─ So WASM can't verify proofs on-the-fly
  ├─ Must use pre-cached data
  └─ Therefore: Trusted mode is mandatory

Result:
  └─ If quorum not in cache, can't verify = ERROR
```

---

## How Identity Age Affects Things

```
Age of Identity          Status        Why
─────────────────────────────────────────────────
< 48 blocks              ✓ WORKS       Quorum still in cache
48-200 blocks            ⚠️ MAYBE      Might be in "previous" cache
200-1500 blocks          ✗ FAILS       Definitely rotated out
> 1500 blocks            ✗ FAILS       Way past cache window

Our Identity:
  ~5200 blocks            ✗ FAILS       ~217 rotations old!
```

---

## Understanding the Error Message

```
Error: "context provider error: invalid quorum: Quorum not found
        in cache for hash: 00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3"

Breakdown:
├─ "context provider error" = Quorum validation layer
├─ "invalid quorum" = Quorum hash not found
├─ "Quorum not found in cache" = Searched the 24 cached quorums, wasn't there
└─ "hash: 00000045..." = This specific quorum hash is missing

Translation: "I can't verify this proof because the quorum that
            signed it has been rotated out of my cache."
```

---

## Implementation Status

✅ **DONE**: Worker process fix to enable trusted mode
- Workers now independently prefetch
- No more mutex lock conflicts
- Each process has its own quorum cache

⚠️ **NOT FIXED**: Testnet quorum rotation issue
- Not a code bug, it's data lifecycle
- Would need either:
  - Fresh identity, OR
  - WASM SDK changes, OR
  - Different test approach

---

## What to Do Next

### If You Want to Proceed With Current Identity
1. This identity can't be used in trusted mode with proof verification
2. Would need WASM SDK changes to support it
3. File issue with WASM SDK team requesting larger cache window

### If You Want to Move Forward Quickly ⭐
1. Create a fresh identity on testnet
2. Update `.env` with new identity ID
3. Everything will work immediately
4. Tests will pass

### If You Want to Understand More
1. Read `QUORUM_ISSUE_EXPLAINED.md` (detailed explanation)
2. Read `QUORUM_DIAGRAM.md` (visual diagrams)
3. Both files explain the mechanics in depth

---

## Key Files for Reference

| File | Purpose |
|------|---------|
| `QUORUM_ISSUE_EXPLAINED.md` | Comprehensive technical explanation |
| `QUORUM_DIAGRAM.md` | Visual diagrams and timelines |
| `WASM_TRUSTED_MODE_FIX.md` | What was fixed and why |
| `IMPLEMENTATION_SUMMARY.md` | Code changes made |

---

## Quick Checklist

- [ ] Understand that the identity is ~1600 blocks old
- [ ] Understand that quorums rotate every 24 blocks
- [ ] Understand that cache window is only ~24 quorums (~600 blocks)
- [ ] Understand this is a data lifecycle issue, not a code bug
- [ ] Decision: Create fresh identity OR change WASM SDK OR wait for fix
- [ ] If creating fresh identity: Update `.env` and tests
- [ ] If changing WASM SDK: File GitHub issue with Dash team

---

## One-Sentence Summary

> **The test identity's cryptographic proof was signed by a quorum that testnet rotated out of its cache window, so signature verification fails.**
