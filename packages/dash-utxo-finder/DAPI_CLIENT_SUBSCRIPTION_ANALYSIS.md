# DAPI Client Subscription Issue Analysis and Solutions

## Executive Summary

**Problem:** Testnet DAPIClient blocks for 2-3 seconds on initialization waiting for masternode list subscription that always fails with grpc-js.

**Root Cause:** Testnet seed servers on port 1443 are incompatible with ALL versions of Node.js @grpc/grpc-js for streaming RPCs, while mainnet seeds on port 443 work fine.

**Impact:**
- 2.7 second delay on every testnet DAPIClient initialization
- Noisy error logs (14 UNAVAILABLE errors)
- Poor developer experience

**Current Workaround:** Hardcoded whitelist of 33 reliable DCG masternodes (works but delays startup)

---

## Detailed Analysis

### What Works vs What Doesn't

| Network | Seed Port | grpc-js Streaming | grpcurl Streaming | Unary RPCs | Initial Query Delay |
|---------|-----------|-------------------|-------------------|------------|---------------------|
| **Mainnet** | 443 | ✅ SUCCESS | ✅ SUCCESS | ✅ Works | None |
| **Testnet** | 1443 | ❌ FAILS (all versions) | ✅ SUCCESS | ❌ Fails on seeds, ✅ works on masternodes | ~2.7 seconds |

### Testnet Behavior (Current)

```
1. DAPIClient created with seeds
2. DNS: seed-1.testnet.networks.dash.org → 35.163.194.221
3. Seeds added to ListDAPIAddressProvider (initial address pool)
4. First query triggers getLiveAddress()
5. getLiveAddress() calls await getSimplifiedMNList()
6. subscribeToMasternodeList() starts
   → Subscription to 35.163.194.221:1443
   → FAILS: "14 UNAVAILABLE: No connection established"
   → Retries 3-5 times
   → All fail
7. Promise rejects OR times out
8. Falls back to hardcoded whitelist (33 IPs)
9. Query proceeds using whitelist IP
10. SUCCESS (but 2.7s delay)
```

### Mainnet Behavior (Works Fine)

```
1. DAPIClient created with seeds
2. DNS: seed-1.mainnet.networks.dash.org → 34.211.174.194
3. Seeds added to ListDAPIAddressProvider
4. First query triggers getLiveAddress()
5. getLiveAddress() calls await getSimplifiedMNList()
6. subscribeToMasternodeList() starts
   → Subscription to 34.211.174.194:443
   → SUCCESS: Receives full masternode list (diffCount: 1)
   → Promise resolves immediately
7. Query proceeds using masternode from list
8. SUCCESS (no delay)
```

### Why Testnet Can't Use Seeds for Queries

Testnet has a `dapiAddressesWhiteList` that filters addresses:

```javascript
// SimplifiedMasternodeListDAPIAddressProvider.js:54-59
let filteredAddresses = updatedAddresses;
if (this.addressWhiteStrings.length > 0) {
  filteredAddresses = updatedAddresses.filter((dapiAddress) => (
    this.addressWhiteStrings.includes(dapiAddress.toString())
  ));
}
```

**Seed IPs** (35.163.194.221, 34.209.12.72, etc.) are NOT in the whitelist, so they're filtered out even though they could handle queries.

---

## Proposed Solutions

### **Solution 1: Add Timeout with Seed Fallback** ⭐ RECOMMENDED

Make the subscription non-blocking by adding a timeout that falls back to using seed IPs directly.

**Implementation:**
```javascript
// In SimplifiedMasternodeListDAPIAddressProvider.js
async getLiveAddress() {
  try {
    // Try to get address from masternode list with 2 second timeout
    const sml = await Promise.race([
      this.smlProvider.getSimplifiedMNList(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SML timeout')), 2000)
      )
    ]);

    // ... existing filtering logic ...

    if (filteredAddresses.length === 0) {
      // Fallback to seed addresses if whitelist yields nothing
      return this.listDAPIAddressProvider.getLiveAddress();
    }

    this.listDAPIAddressProvider.setAddresses(filteredAddresses);
    return this.listDAPIAddressProvider.getLiveAddress();

  } catch (error) {
    // Subscription failed or timed out - use seed addresses directly
    this.logger.warn('Using seed fallback due to subscription failure', { error: error.message });
    return this.listDAPIAddressProvider.getLiveAddress();
  }
}
```

**Benefits:**
- Instant queries using seeds (like mainnet)
- Still tries subscription in background
- Graceful degradation
- No code changes needed elsewhere

**Drawbacks:**
- Seeds might return "wrong data" (per original whitelist comment)
- But this only affects testnet, and we already trust seeds for DNS

---

### **Solution 2: Make Whitelist Include Seed IPs**

Simply add the 3 testnet seed load balancer IPs to the whitelist.

**Implementation:**
```javascript
// In networkConfigs.js
testnet: {
  seeds: [ /* existing */ ],
  dapiAddressesWhiteList: [
    // Add seed IPs to whitelist
    '34.209.12.72:1443',      // seed-1/4/5
    '35.163.194.221:1443',    // seed-2/4
    '44.230.238.208:1443',    // seed-3/5

    // Existing 33 masternode IPs
    '34.214.48.68:1443',
    // ... rest of whitelist
  ],
}
```

**Benefits:**
- Minimal code change (3 lines)
- Seeds immediately available after DNS
- Still maintains whitelist filtering
- No subscription needed for first query

**Drawbacks:**
- Doesn't fix the underlying subscription issue
- Still see error logs (but queries won't block)
- Relies on testnet infrastructure maintainers keeping seeds reliable

---

### **Solution 3: Non-Blocking Subscription** ⭐⭐ BEST LONG-TERM

Change `getSimplifiedMNList()` to NOT block on first call - start subscription in background and return empty list initially.

**Implementation:**
```javascript
// In SimplifiedMasternodeListProvider.js
async getSimplifiedMNList() {
  // Start subscription if not already started (non-blocking)
  if (this.stream === undefined && !this.subscriptionPending) {
    this.subscriptionPending = true;
    this.subscribeToMasternodeList()
      .then(() => { this.subscriptionPending = false; })
      .catch((e) => {
        this.logger.error('Subscription failed, will retry later', { error: e.message });
        this.subscriptionPending = false;
      });
  }

  // Return current list (may be empty on first call)
  return this.simplifiedMNList;
}
```

Then in `SimplifiedMasternodeListDAPIAddressProvider.getLiveAddress()`:
```javascript
async getLiveAddress() {
  const sml = await this.smlProvider.getSimplifiedMNList();

  // If SML is empty/not ready, use seed addresses
  if (!sml || sml.getValidMasternodesList().length === 0) {
    return this.listDAPIAddressProvider.getLiveAddress();
  }

  // ... existing filtering logic ...
}
```

**Benefits:**
- Never blocks - instant queries
- Subscription happens in background
- Gracefully handles subscription failures
- Works for all networks

**Drawbacks:**
- Larger code change
- Changes subscription semantics (could affect other code)
- Need to handle "list not ready yet" state

---

### **Solution 4: Use HTTP DAPI for Initial List**

Fetch initial masternode list via HTTP/REST instead of gRPC streaming.

**Implementation:**
Add an HTTP endpoint to seeds:
```
GET https://seed-1.testnet.networks.dash.org:1443/masternode-list
```

Fetch this on first `getLiveAddress()` call, then subscribe for updates.

**Benefits:**
- HTTP is more reliable than gRPC streaming
- Instant initial list
- Still get updates via subscription

**Drawbacks:**
- Requires server-side changes
- Not under our control
- Adds HTTP dependency

---

### **Solution 5: Skip Subscription Entirely for Testnet**

Just use the hardcoded whitelist without attempting subscription.

**Implementation:**
```javascript
// In createDAPIAddressProviderFromOptions.js
if (options.network === 'testnet' && dapiAddressesWhiteList.length > 0) {
  // For testnet with whitelist, skip SML subscription entirely
  return new ListDAPIAddressProvider(
    dapiAddressesWhiteList.map((addr) => new DAPIAddress(addr)),
    options,
  );
}
```

**Benefits:**
- Zero delay
- No error logs
- Simplest code change
- Whitelist already proven reliable

**Drawbacks:**
- No dynamic masternode discovery
- Stuck with hardcoded IPs until PoSe implemented
- Doesn't fix the underlying issue

---

## Recommendation

**Implement Solution 1 (Timeout with Seed Fallback) immediately** for quick wins:
- Add 2-second timeout to subscription wait
- Fallback to seed addresses
- Zero user-facing delay
- Minimal risk

**Plan Solution 3 (Non-Blocking Subscription) for long-term:**
- Properly async architecture
- Better for all networks
- More maintainable
- Eliminates blocking entirely

**File a bug report** for testnet infrastructure team about grpc-js incompatibility on port 1443.

---

## Testing Performed

### grpc-js Version Compatibility Test
Tested subscribeToMasternodeList with:
- grpc-js 1.4.4: ❌ FAILS
- grpc-js 1.10.9: ❌ FAILS
- grpc-js 1.11.3: ❌ FAILS
- grpc-js 1.12.2: ❌ FAILS

**Conclusion:** Not a grpc-js version issue. All Node.js grpc-js versions fail on testnet:1443.

### Cross-Network Comparison
- Mainnet (port 443): Subscription ✅ WORKS
- Testnet (port 1443): Subscription ❌ FAILS

**Conclusion:** Port or server configuration specific issue.

### grpcurl vs grpc-js
- grpcurl to testnet:1443: ✅ WORKS (receives full masternode list)
- grpc-js to testnet:1443: ❌ FAILS (14 UNAVAILABLE)

**Conclusion:** Go gRPC implementation works, Node.js implementation doesn't. Likely TLS/HTTP2 incompatibility.

---

## Implementation Priority

1. **Immediate (Today):** Solution 1 - Add timeout fallback
2. **Short-term (This Sprint):** Solution 2 - Add seeds to whitelist
3. **Long-term (Next Quarter):** Solution 3 - Non-blocking subscription
4. **Infrastructure (External):** File bug about port 1443 compatibility

---

## Code Locations

Files to modify for Solution 1:
- `/packages/js-dapi-client/lib/SimplifiedMasternodeListProvider/SimplifiedMasternodeListDAPIAddressProvider.js` (getLiveAddress method)

Files to modify for Solution 2:
- `/packages/js-dapi-client/lib/networkConfigs.js` (testnet.dapiAddressesWhiteList array)

Files to modify for Solution 3:
- `/packages/js-dapi-client/lib/SimplifiedMasternodeListProvider/SimplifiedMasternodeListProvider.js` (getSimplifiedMNList method)
- `/packages/js-dapi-client/lib/SimplifiedMasternodeListProvider/SimplifiedMasternodeListDAPIAddressProvider.js` (getLiveAddress method)

---

*Last Updated: 2025-10-29*
*Tested with: @grpc/grpc-js versions 1.4.4, 1.10.9, 1.11.3, 1.12.2*
