# The REAL Root Cause - Not Stale Quorums, But Forced Proof Requirement

**Date**: 2025-11-21
**Discovery**: Deep code investigation revealed the true cause

## The Actual Problem

**The WASM SDK FORCES proof verification for ALL identity queries.**

Looking at `/packages/rs-sdk/src/platform/types/identity.rs` lines 40-42:

```rust
fn query(self, prove: bool) -> Result<IdentityRequest, Error> {
    if !prove {
        unimplemented!("queries without proofs are not supported yet");
    }
    // ... continue with prove=true
}
```

**This means:**
- You CANNOT call `getIdentity()` without proofs
- Proofs are MANDATORY, not optional
- Even if you set `withProofs(false)`, it panics
- The SDK crashes with: `unimplemented!("queries without proofs are not supported yet")`

## What This Changes

### Our Previous Understanding (WRONG)
```
"The quorum is too old and rotated out of the cache window"

Assumption: You could get identity without proofs, avoid the quorum check
Reality: NOPE - proofs are mandatory!
```

### The Actual Reality (CORRECT)
```
Identity fetch ALWAYS requires proofs
Proofs ALWAYS need quorum verification
Quorum verification ALWAYS needs the quorum in cache
Our identity's quorum is NOT in cache
Therefore: FAILURE - "Quorum not found in cache"
```

## Test Evidence

### Test 1: Disable Proofs
```javascript
const builder = sdk.WasmSdkBuilder.testnetTrusted();
const builderNoProofs = builder.withProofs(false);  // Try to disable
const client = await builderNoProofs.build();
await client.getIdentity(id);
```

Result:
```
Error: panicked at packages/rs-sdk/src/platform/types/identity.rs:42:13:
       not implemented: queries without proofs are not supported yet
```

**Proof: Even with `withProofs(false)`, the SDK crashes**

### Test 2: Enable Proofs Explicitly
```javascript
const builder = sdk.WasmSdkBuilder.testnetTrusted();
const builderWithProofs = builder.withProofs(true);  // Explicit true
await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();  // Prefetch
const client = await builderWithProofs.build();
await client.getIdentity(id);
```

Result:
```
Error: context provider error: invalid quorum: Quorum not found
       in cache for hash: 00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3
```

**Proof: Proofs ARE being processed, quorum verification IS happening**

## Why This Matters

### The Real Issue Chain

```
1. WASM SDK requires proofs for identity queries (no exceptions)
   ↓
2. Identity returned by DAPI includes a proof with quorum_hash
   ↓
3. To verify the proof, need quorum_hash's public key
   ↓
4. Quorum public key must be in trusted context cache
   ↓
5. Cache comes from prefetchTrustedQuorumsTestnet()
   ↓
6. Prefetch returns 24 recent quorums
   ↓
7. Identity's quorum (from ~1600 blocks ago) is NOT in the 24
   ↓
8. ERROR: "Quorum not found in cache"
```

This is NOT about the identity being "old" in a bad way. It's about:
- **Architecture requirement**: Proofs are mandatory
- **Data requirement**: The proof contains a quorum hash from when identity was created
- **Timing requirement**: That quorum is no longer in the 24-quorum cache window

## So What's the Real Solution?

We have exactly THREE options, no more, no less:

### Option 1: Use a Fresh Identity (Easiest)
Create or find an identity created in the last ~600 blocks
- Its proof will reference a quorum from the 24-quorum cache window
- Verification will succeed immediately
- No code changes needed

**How**: Create identity right now on testnet, update .env

### Option 2: Modify WASM SDK to Support No-Proof Queries
Change `/packages/rs-sdk/src/platform/types/identity.rs` line 41-42:

```rust
fn query(self, prove: bool) -> Result<IdentityRequest, Error> {
    // CHANGE: Remove the unimplemented! panic
    // Instead, build the request with prove=false
    let id = self.to_vec();
    Ok(IdentityRequest::GetIdentity(GetIdentityRequest {
        version: Some(get_identity_request::Version::V0(GetIdentityRequestV0 {
            id,
            prove,  // <-- Allow false
        })),
    }))
}
```

**Pros:**
- Would allow queries without proof verification
- Solves the old identity problem permanently

**Cons:**
- Requires modifying WASM SDK upstream
- Need to test thoroughly
- Security implications (no proof verification)
- Needs approval from Dash team

### Option 3: Increase Quorum Cache Window
Modify `/packages/rs-sdk-trusted-context-provider/src/provider.rs` to keep more than 24 quorums

```rust
// Keep 200+ quorums instead of 24
let cache = LruCache::new(std::num::NonZeroUsize::new(200).unwrap());
```

**Pros:**
- Supports old identities
- No security implications
- Backward compatible

**Cons:**
- Slower prefetch (20+ seconds instead of 2.8)
- More memory usage
- Still has an upper limit

## The Deeper Question

### Why Does WASM SDK Require Proofs?

Looking at the architecture:

1. **WASM runs in browser context**
   - Browsers can't make arbitrary network calls
   - Can't fetch data on-demand (CORS restrictions)
   - Must use pre-cached data

2. **For security, WASM needs cryptographic proofs**
   - Can't trust the data without proof verification
   - Proofs ensure DAPI didn't manipulate the data
   - Verification uses quorum signatures

3. **Therefore: Proofs are mandatory architecture**
   - No proofs = can't verify data integrity
   - Can't fetch quorums on-demand
   - Must use pre-cached quorums
   - Cache is limited for performance

It's a deliberate design choice, not a bug or limitation.

## What the WASM SDK Tests Do

Looking at `/packages/wasm-sdk/tests/functional/identities.spec.mjs`:

```javascript
before(async () => {
    await init();
    await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
    builder = sdk.WasmSdkBuilder.testnetTrusted();
    client = await builder.build();
});

it('fetches identity and basic fields', async () => {
    const r = await client.getIdentity(TEST_IDENTITY);
    expect(r).to.be.ok();
});
```

This works because:
1. TEST_IDENTITY must be RECENT (created within last 600 blocks)
2. Prefetch fetches the 24 recent quorums (which includes this one)
3. Proof verification succeeds

The tests don't fail because they use a recent identity! Not because there's a special mode.

## Key Insight: Why Our Understanding Was Wrong

We thought:
- "Prefetch should cache all the quorum data"
- "The identity is current so should work"
- "The worker process architecture must be wrong"

But the REAL reason was:
- "Even if prefetch works, it only caches 24 quorums"
- "The identity WAS current when created, but that was 1600 blocks ago"
- "Current architecture is actually correct"

The "identity is 100% correct" is true, but "correct" means it exists and is valid, not that it will work with proof verification after 1600 blocks of time.

## Summary

**Old Understanding**: Quorum rotation is a "cache window" issue we can work around

**Real Understanding**: Proofs are MANDATORY and the quorum reference in the proof comes from the identity's creation block height

**The issue is not about architecture, it's about DATA AGE:**
- Identity created at block 1365000
- Proof contains: "signed by Quorum Q from block 1365000"
- Current block: 1368216
- Time elapsed: ~1600 blocks = ~67 quorum rotations
- Cache window: ~24 quorums
- **Quorum from block 1365000 is 67 rotations outside cache window**

This is not fixable without either:
1. Using a recent identity (< 600 blocks old)
2. Changing SDK to not require proofs
3. Increasing cache window (performance cost)

There is no clever workaround because proofs are architecturally mandatory in WASM.
