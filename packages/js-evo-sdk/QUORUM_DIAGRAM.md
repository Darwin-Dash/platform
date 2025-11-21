# Quorum Cache Issue - Visual Diagrams

## Timeline: Block Heights and Quorum Rotation

```
Block Heights: ────────────────────────────────────────────────────────→

Old (Rotated Out - NOT in cache):
  1365000     1365024      1365048      1365072
  ├─ Q1 ──────┤ Q2 ──────┤ Q3 ──────┤ Q4 ...
  └─ Hash: 00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3
     (Our identity's proof references THIS)

              ...many more rotations...

                                     Current (IN CACHE):
                                     1366632     1366656      1368192    1368216
                                     ├─ Q67 ───┤ Q68 ───────... Q89 ───┤ Q90
                                     └─ Only these ~24 are cached

Gap: ~1632 blocks = ~68 quorum rotations
     Identity's quorum has aged out of the cache window
```

---

## The Problem Flow

```
┌────────────────────────────────────────────────────────────┐
│ Step 1: You Call prefetchTrustedQuorumsTestnet()           │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  HTTP GET https://quorums.testnet.networks.dash.org/q...   │
│      │                                                      │
│      └─→ Returns 24 Quorum Hashes (heights 1366632-1368216)│
│             ├─ 0000011feb76a23...  (height 1368216) ← NEW  │
│             ├─ 00000063950ad7e...  (height 1368192)        │
│             ├─ 000000a7ed11422...  (height 1368168)        │
│             └─ ...                                          │
│             └─ 0000008e7d4dcdc...  (height 1366632) ← OLD  │
│                                                             │
│  ✓ Prefetch succeeds, caches these 24                      │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ Step 2: You Call getIdentity(id)                           │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  gRPC to DAPI Server: /platform/getIdentity               │
│      │                                                      │
│      └─→ Returns Identity Data:                            │
│             {                                              │
│               id: "DcoJJ3W9...",                            │
│               proof: {                                      │
│                 quorum_hash: "00000045060921a4...",         │
│                 signature: [BLS signature...]              │
│               }                                            │
│             }                                              │
│                                                             │
│  This proof is from OLD quorum Q1 (not in cache)           │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ Step 3: WASM SDK Tries to Verify Proof (Trusted Mode)      │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Extract quorum_hash: "00000045060921a4..."             │
│  2. Look in cache: [24 recent quorums from Step 1]         │
│  3. Search for "00000045060921a4..." in cache              │
│     ├─ 0000011feb76a23... ✗ NOT MATCH                      │
│     ├─ 00000063950ad7e... ✗ NOT MATCH                      │
│     ├─ 000000a7ed11422... ✗ NOT MATCH                      │
│     └─ ... [21 more, all NOT MATCH]                        │
│  4. Not found! ✗                                           │
│  5. CRASH: "Quorum not found in cache"                     │
│                                                             │
│  Reason: Quorum Q1 (hash: 00000045...) was valid at       │
│          block 1365000 but is now at block 1368200.        │
│          That's 68 rotations ago - outside cache window!   │
└────────────────────────────────────────────────────────────┘
```

---

## Cache Window Visualization

```
Time ───────────────────────────────────────────────────────→
      DEEP PAST                                        NOW

Identity Created Here:
(~1632 blocks ago)
│
├─ Block 1365000: Quorum Q1 signs identity
│                 └─ Hash: 00000045060921a4...
│
├─ Blocks 1365024: Q1 rotates to Q2
├─ Blocks 1365048: Q2 rotates to Q3
├─ ... many more rotations ...
│
├─ Block 1366632: ┐ 
├─ Block 1366656: ├─ CACHE WINDOW
├─ Block 1367000: │  (Only these ~24 are kept)
│ ...             │
├─ Block 1368192: │
└─ Block 1368216: ┘ ← Current


Q1's hash 00000045... is in DEEP PAST
        → Rotated out of cache
        → Can't verify identity's proof
```

---

## Why Testnet Doesn't Keep All Quorums

```
Storage/Performance Trade-off:

Keep All Quorums Ever (BAD):
  ├─ Testnet has run for ~1.5 years
  ├─ Quorum rotates every 24 blocks
  ├─ ~157,680 blocks total
  ├─ ~157,680 / 24 = 6,570 quorums
  ├─ Each quorum: ~1KB data
  └─ Total: ~6.6 MB + network overhead
     └─ SLOW PREFETCH (tens of seconds)
        └─ BAD for user experience

Keep Only Recent Quorums (GOOD):
  ├─ Keep only last 24 quorums
  ├─ ~24 KB total
  └─ Prefetch takes ~2-3 seconds
     └─ GOOD for user experience
     └─ But breaks old identity verification
```

---

## Non-Trusted Mode Workaround (Why It Doesn't Work)

```
Trusted Mode (Current - Can't Verify Old Identities):
  Identity → DAPI → Proof → Find Quorum in Cache
                               ↓
                          Not Found ✗
                          Cache Too Small

Non-Trusted Mode (Alternative - Not Available in WASM):
  Identity → DAPI → No Proof Verification
                    Just return data as-is ✓
                    
                    But WASM SDK Says:
                    "Not Supported" ✗
```

---

## The Different Scenarios

### Scenario 1: Fresh Identity (WORKS)

```
Create Identity at Block 1368200 (TODAY)
  ├─ Signed by Quorum Q90 (hash: 0000011feb76a23...)
  ├─ This quorum IS in cache (created today)
  └─ Proof verification SUCCEEDS ✓

Fetch Identity Later:
  ├─ Proof references Q90
  ├─ Q90 is still in cache (or recent prev quorums)
  └─ Verification: WORKS ✓✓✓
```

### Scenario 2: Old Identity (FAILS)

```
Create Identity at Block 1365000 (68 rotations ago)
  ├─ Signed by Quorum Q1 (hash: 00000045060921a4...)
  ├─ Q1 has rotated out of cache
  └─ Proof verification FAILS ✗

Fetch Identity Later:
  ├─ Proof references Q1
  ├─ Q1 is NOT in cache (too old)
  ├─ Try to fetch: Can't, WASM has no fallback
  └─ Verification: FAILS ✗✗✗
```

### Scenario 3: Very Recent Identity (WORKS)

```
Create Identity at Block 1368210 (10 blocks ago)
  ├─ Signed by Quorum Q89 (hash: xxxxxxxx...)
  ├─ Q89 is still in cache
  └─ Proof verification WORKS ✓

Fetch Identity Right After:
  ├─ Proof references Q89
  ├─ Q89 is in cache
  └─ Verification: WORKS ✓✓✓
```

---

## Summary Diagram

```
                    IDENTITY AGE
    
    0-48 blocks old:     SAFE ✓✓✓
    (Recent)             Quorum in cache
                         Verification works
    
    48-200 blocks old:   RISKY ⚠️
    (Getting old)        Quorum maybe in prev cache
                         Might work, might not
    
    200+ blocks old:     BROKEN ✗✗✗
    (Ancient)            Quorum rotated out
                         Proof verification fails
                         "Quorum not found in cache"
```

Our identity is ~1600 blocks old = WAY past the 48-block safety window.

---

## How to Check Identity Age

```bash
# Get identity from DAPI
curl grpc to DAPI: getIdentity(DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq)

# Get response metadata:
{
  identity: { ... },
  metadata: {
    blockHash: "...",
    blockHeight: 1363000  ← When was identity last updated?
  }
}

# Calculate age:
Current block height: 1368216
Identity block height: 1363000
Age: 1368216 - 1363000 = 5216 blocks

# Is it safe?
5216 blocks = (5216 / 24) = 217 quorum rotations
217 > 24 rotations = FAR OUTSIDE CACHE WINDOW = BROKEN ✗
```
