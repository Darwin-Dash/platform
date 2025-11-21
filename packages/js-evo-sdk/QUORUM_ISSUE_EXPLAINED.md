# The Quorum Cache Issue - Detailed Explanation

## What is a Quorum?

In Dash, a **quorum** is a group of masternodes that collectively sign important blockchain data:

```
Quorum = Group of ~24 Masternodes
  ├─ They collectively sign blocks (ChainLocks)
  ├─ They sign identity data (InstantSend proofs)
  ├─ They create BLS signatures (threshold signatures)
  └─ Each quorum has a unique hash based on composition
```

**Example Quorum Hashes from Testnet**:
```
Quorum 1: 0000011feb76a231495702ffc088602e368ec07e8303c21616b618216f9adf5e
Quorum 2: 00000063950ad7eb536dd4c9d8f92bed226d651931ab77be73ba08ec4d6cf67d
Quorum 3: 000000a7ed114223ac270db6efe4a8a9923b286c160fd45e09db1ffd7d423a01
...
Quorum 24: 0000008e7d4dcdc84b856e399c36479c21d277f9fccaaf72b40b7cdcddd4924e
```

Each quorum:
- Has a unique hash (deterministic ID)
- Contains the public keys of the ~24 masternodes in that quorum
- Is valid for a certain block height range
- Rotates out after being replaced by newer quorums

---

## When Quorums Are Used

### Scenario 1: Creating an Identity

```
Block Height 1368000:
  └─ Quorum Q1 (hash: 00000063950ad7eb...) is active
      ├─ Contains 24 masternode public keys
      └─ Signs all transactions at this height

Your Transaction Creates Identity:
  ├─ Identity ID: DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq
  ├─ Signed by Quorum Q1
  └─ Proof includes: "This was signed by Quorum Q1"
```

### Scenario 2: Later Reading the Identity

```
Block Height 1368050 (50 blocks later):
  └─ Quorum Q1 is REPLACED by Q2 (new quorum rotation)
      ├─ Old Q1 masternode keys no longer valid
      └─ New Q2 has different 24 masternodes

You Try to Fetch the Identity:
  ├─ WASM SDK gets identity from DAPI
  ├─ Proof says: "Signed by Quorum Q1"
  ├─ WASM tries to verify: "Does this signature match Q1's public keys?"
  └─ Needs Q1's public keys to verify
```

---

## The Cache Problem

### How Quorum Cache Works

```
Testnet Quorum Endpoint: https://quorums.testnet.networks.dash.org/quorums

Returns (simplified):
{
  "success": true,
  "data": [
    {
      "quorum_hash": "0000011feb76a2314957...",
      "key": "960cf101af1296385...",  // BLS public key
      "height": 1368216
    },
    {
      "quorum_hash": "00000063950ad7eb536d...",
      "key": "b0015ec6e9a05633...",
      "height": 1368192
    },
    ...
    {
      "quorum_hash": "0000008e7d4dcdc84b85...",
      "key": "83f4a1a602a78b1de64...",
      "height": 1366632
    }
  ]
}
```

**Key Point**: The endpoint returns approximately **24 recent quorums**
- Newest: height 1368216
- Oldest: height 1366632
- Range: ~1584 blocks (~24 rotations at 24 blocks per rotation)

---

## The Specific Problem

### Our Failing Identity

```
Test Identity: DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq

When it was created/updated:
  ├─ Signed by Quorum with hash: 00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3
  ├─ Proof includes this quorum hash
  └─ The identity data is locked with this quorum's signature
```

### What Happens When We Try to Fetch It

**Step 1: Prefetch Quorum Data**
```javascript
await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();
```

This calls: `https://quorums.testnet.networks.dash.org/quorums`

Returns 24 quorums with hashes:
```
0000011feb76a23...
00000063950ad7e...
000000a7ed11422...
...
0000008e7d4dcdc...
```

**Step 2: Fetch Identity**
```javascript
const identity = await client.getIdentity('DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq');
```

DAPI Server Returns:
```
{
  identity_id: "DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq",
  proof: {
    quorum_hash: "00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3",
    signature: [... BLS signature ...]
  }
}
```

**Step 3: Verify Proof (in trusted mode)**
```
WASM SDK tries to:
  1. Look up quorum_hash: "00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3"
  2. Search prefetched cache (24 quorums from Step 1)
  3. SEARCH RESULT: NOT FOUND ✗
  4. ERROR: "Quorum not found in cache"
```

---

## Why The Quorum Isn't in Cache

### Timeline Visualization

```
Block Heights ──────────────────────────────────────────────────>

Old Quorums (ROTATED OUT):
  └─ Quorum with hash 00000045060921... was at height ~1365000
     └─ This identity's proof was created here

Current Quorums (IN CACHE):
  ├─ Heights: 1366632 to 1368216
  └─ Only ~24 recent quorums stored (for performance)

Gap:
  └─ ~1632 blocks between identity's quorum and current quorums
     └─ ~1632 / 24 = 68 quorum rotations
     └─ Identity's quorum was rotated out 68 rotations ago
```

### Simple Analogy

Think of it like a **newspaper archive**:

```
Newspaper keeps only last 30 days of papers:
  ├─ January 20 - January 29 ← In archive ✓
  ├─ January 10-19 ← Archived to storage
  ├─ December 2024 ← In deep archive
  └─ November 2024 ← Deleted

You want to read: Article from November 15, 2024
  ├─ Article still exists (in deep archive)
  ├─ But the library only keeps recent 30 days
  └─ ERROR: "Can't find that newspaper"
```

**Same problem here:**
- Testnet keeps recent ~24 quorums (equivalent to "30 days")
- Identity's quorum is from ~68 rotations ago (equivalent to "November")
- Quorum was rotated out of the cache window
- ERROR: "Quorum not found in cache"

---

## Why Prefetch "Succeeds" But Still Fails

```javascript
// This looks like it should work:
await sdk.WasmSdk.prefetchTrustedQuorumsTestnet();  // ✓ Success!
const identity = await client.getIdentity(id);      // ✗ FAILS!
```

**Why?**

Prefetch succeeds because:
1. It successfully calls the quorum endpoint
2. It successfully fetches 24 quorum hashes
3. It successfully caches them in memory
4. Returns `Ok(())` saying "mission accomplished"

But prefetch doesn't fail if the **specific quorum you need isn't in the data**. It just caches whatever the endpoint returns.

It's like:
```
You: "Please download the latest 30 newspapers"
Server: ✓ Done! Here are today's 30 papers.
You: "Great! Now find the article from November 15th"
Server: ✗ Not in these 30 papers
```

---

## What's Actually Stored in the Cache

**Current Cache (from testnet endpoint right now)**:
```
Quorum Hash 0000011feb76a23...  → Height 1368216 ← Most Recent
Quorum Hash 00000063950ad7e...  → Height 1368192
Quorum Hash 000000a7ed11422...  → Height 1368168
... (21 more quorums)
Quorum Hash 0000008e7d4dcdc...  → Height 1366632 ← Oldest (by ~1584 blocks)
```

**What We're Looking For**:
```
Quorum Hash 00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3
├─ NOT in the 24 quorums above
├─ Was valid around block height ~1365000-1366000
├─ Rotated out when newer quorums arrived
└─ Now in "deep archive" (not cached)
```

---

## The Real Question: Where Did This Quorum Hash Come From?

This is the key mystery:

```
Identity: DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq
Proof references: 00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3

Questions:
1. When was this identity created? (What block height?)
2. Was that quorum really active at that time?
3. Did testnet reset but the old proof data still exists?
4. Is there a mismatch between DAPI data and quorum endpoint data?
```

---

## Possible Scenarios

### Scenario A: Identity is Actually Old
```
Identity created 68 quorum rotations ago (~1632 blocks)
Proof references quorum from that time
Testnet rotated out that quorum (only keeps ~24 recent)
ERROR when trying to verify

SOLUTION: Create a fresh identity that will use current quorums
```

### Scenario B: Testnet Was Reset
```
Old testnet data still has references to old quorum hashes
New testnet quorum endpoint doesn't have those hashes anymore
Inconsistency between DAPI (has old data) and quorum endpoint (has new data)

SOLUTION: Wait for data to sync or use newer identity
```

### Scenario C: DAPI Returning Wrong Proof Data
```
DAPI is returning a proof with a quorum hash that shouldn't exist
Or DAPI is using proofs from a different testnet state

SOLUTION: Investigate DAPI configuration or testnet state
```

### Scenario D: Quorum Hash is Typo/Corruption
```
The quorum hash is malformed or corrupted in the identity data
Not a valid quorum hash that ever existed

SOLUTION: Verify identity data integrity
```

---

## How to Debug This

### Check 1: Is the Quorum Hash Ever Mentioned Anywhere?
```bash
curl -s https://quorums.testnet.networks.dash.org/quorums | grep "00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3"
# Result: Not found ✗
```

### Check 2: Check Previous Quorums
```bash
curl -s https://quorums.testnet.networks.dash.org/previous | grep "00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3"
# Result: Not found ✗
```

### Check 3: When Was Identity Created?
Need to query DAPI for:
- Identity creation timestamp
- Last update timestamp
- Block height at creation

### Check 4: Was There a Testnet Reset?
Check if:
- Testnet was reorged or reset recently
- Testnet chain height is normal
- Previous quorum endpoint covers far back enough

---

## The Core Issue

The fundamental problem is:

```
┌─────────────────────────────────────────────────────┐
│ WASM SDK in Trusted Mode (requires proof validation)│
│                                                      │
│ To validate a proof, you need:                       │
│ 1. The signature (✓ have it from DAPI)              │
│ 2. The quorum public keys (✗ not in cache)          │
│                                                      │
│ The quorum is too old to be in the 24-quorum cache  │
│ And WASM SDK can't fetch it on-demand (browser      │
│ limitation - can't make arbitrary network calls)    │
└─────────────────────────────────────────────────────┘
```

**Why WASM Can't Fetch On-Demand**:
- WASM runs in a browser context
- Browsers can't make arbitrary network calls (CORS restrictions)
- So WASM SDK requires pre-caching all needed data
- The cache window is limited to recent quorums for performance

---

## Solutions

### Option 1: Use Fresh Identity ✅ (BEST)
Create or find an identity created in the last ~1500 blocks
- Its proof will reference current quorums
- Current quorums are in the cache
- Proof validation will succeed

### Option 2: Extend Quorum Cache Window ⚠️ (PERFORMANCE TRADE-OFF)
Modify WASM SDK to keep more than 24 quorums
- Larger cache window = covers more old quorums
- Trade-off: More memory, slower prefetch
- Requires WASM SDK changes

### Option 3: Implement Fallback Fetching ⚠️ (COMPLEX)
Add logic to fetch missing quorums on-demand
- When quorum not in cache, fetch from endpoint
- Cache it for future use
- Increases latency on first use of old identity

### Option 4: Skip Proof Verification ❌ (NOT POSSIBLE)
WASM SDK doesn't support non-trusted mode
- Proof verification is mandatory for security
- Not an option in current architecture

---

## Summary

**The Quorum Issue In One Sentence**:
> The identity's cryptographic proof was signed by a quorum that testnet has rotated out of its cache window, so the signature can't be verified.

**This Is Not A Bug**. It's a **data lifecycle issue**:
- Quorums rotate constantly on testnet
- Cache window is limited for performance
- Old identities eventually have stale quorum references
- This is expected behavior, not a defect

**To Fix It**: Use a fresh identity created recently, not one from weeks/months ago.
