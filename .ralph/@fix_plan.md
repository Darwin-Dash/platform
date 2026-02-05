# Fix InstantSend Detection — Multi-Node Resilience

## CRITICAL CONSTRAINT
**TransactionFinder uses DAPI exclusively — it NEVER uses Core RPC.**
Do NOT add coreRpcClient, getislocks, or any RPC fallback to the library.
RPC is only for funding in tests. End users don't have local dashd nodes.

## Root Cause (CONFIRMED)
Most DAPI testnet nodes don't have ZMQ `rawtxlocksig` enabled in their Dash Core
configuration. When connected to a node WITH this enabled, IS hex delivery works.
The solution is multi-node resilience: connect to multiple nodes simultaneously
and use the first one that delivers valid IS hex.

## Phase 1: Multi-Node IS Hex Hunting (HIGH PRIORITY)
- [x] Implement `NodeHealthTracker` class to track which nodes deliver IS hex
- [x] Add DNS seed discovery integration (use DAPI's built-in seeds)
- [x] Implement parallel stream connections (3 nodes simultaneously)
- [x] Open parallel streams on `preRegisterTransaction()` call
- [x] First valid IS hex wins — use whichever node delivers first
- [x] Immediate session blacklist for nodes that fail IS hex delivery
- [x] In-memory health tracking (no persistence, resets on restart)
- [x] Default ON — multi-node enabled by default, can be disabled via config
- [x] Speed priority: 2-3s max wait across all nodes before ChainLock fallback

## Phase 2: Configuration & API
- [x] Add `multiNodeIsHunting` config option (default: true)
- [x] Add `isHuntingNodes` config option (default: 3)
- [x] Add `isHuntingTimeoutMs` config option (default: 3000)
- [x] Add `getNodeHealth()` method to expose node reputation
- [x] Update TypeScript types for new config options

## Phase 3: Testing & Verification
- [x] Unit tests for NodeHealthTracker (26 tests)
- [x] Unit tests for parallel stream management (17 tests for MultiNodeIsHunter)
- [ ] Integration test: verify IS hex received from at least one node
- [x] TypeScript compiles cleanly
- [x] All unit tests pass (263 tests)

## Phase 4: Documentation
- [ ] Update CLAUDE.md with multi-node architecture
- [ ] Update API.md with new config options
- [ ] Document node health tracking behavior

## Completed (Previous Work)
- [x] Diagnosis: confirmed testnet nodes lack ZMQ rawtxlocksig
- [x] Diagnosis: IS hex works when connected to properly configured node
- [x] Extended scan approach (200 blocks back)
- [x] Grace period for IS delivery window
- [x] Poller detects IS boolean reliably
- [x] ChainLock fallback works
- [x] 252 unit tests passing
- [x] RPC-based fix reverted (violated DAPI-only constraint)

## Architecture

### Multi-Node IS Hunting Flow
```
preRegisterTransaction(txid)
    │
    ├─► Open 3 parallel streams to different DAPI nodes (DNS seeds)
    │   Each stream: subscribeToTransactionsWithProofs(bloomFilter, fromHeight)
    │
    ├─► Broadcast transaction
    │
    ├─► Race: wait for IS hex from ANY of the 3 streams
    │   ├─ Node A delivers IS hex ─► USE IT, close other streams
    │   ├─ Node B delivers IS hex ─► USE IT, close other streams
    │   ├─ Node C delivers IS hex ─► USE IT, close other streams
    │   └─ 3s timeout, no hex ─► fall back to ChainLock
    │
    └─► Track node health:
        - Node delivered IS hex ─► mark as "good"
        - Node failed/timeout ─► blacklist for session
```

### NodeHealthTracker API
```typescript
class NodeHealthTracker {
  // Track successful IS hex delivery
  recordSuccess(nodeAddress: string): void;

  // Blacklist node for session
  blacklist(nodeAddress: string): void;

  // Check if node is blacklisted
  isBlacklisted(nodeAddress: string): boolean;

  // Get healthy nodes (not blacklisted)
  getHealthyNodes(): string[];

  // Get all node stats
  getStats(): Map<string, NodeStats>;
}
```

## Notes

### Why 3 Nodes?
- Provides redundancy without excessive resource usage
- If 1 in 3 testnet nodes has rawtxlocksig enabled, we have good odds
- Parallel connections are cheap (just gRPC streams)

### Why First-Wins (No Consensus)?
- IS hex is cryptographically signed by LLMQ — can't be faked
- All nodes should return the same hex for a given txid
- Speed matters more than consensus for this use case
- If hex is invalid, it will fail at SDK proof creation anyway

### Why Immediate Blacklist?
- Nodes without rawtxlocksig are deterministically broken
- No point retrying — they will never deliver IS hex
- Fast learning = better experience for subsequent transactions

### Key Files
- src/finders/RealtimeFinder.ts — add parallel stream logic
- src/monitoring/NodeHealthTracker.ts — NEW: node health tracking
- src/types/finder-types.ts — new config options
- tests/unit/monitoring/NodeHealthTracker.test.ts — NEW: unit tests
