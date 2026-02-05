# js-evo-sdk Production-Ready PRD

**Version:** 3.0.0-rc.1
**Last Updated:** 2026-01-27
**Status:** In Progress

---

## Executive Summary

The js-evo-sdk is a JavaScript/TypeScript SDK for Dash Platform operations. This PRD defines the desired end state for production readiness.

---

## Current State Analysis

### Working Components
- **381 unit tests passing** (Vitest, ~3s execution)
- TypeScript compilation succeeds
- Yarn PnP dependencies resolved
- Facade pattern implemented for all operations

### Known Issues

| Issue | Priority | Affected Area |
|-------|----------|---------------|
| Token integration tests use non-existent API | HIGH | Tests |
| Integration tests timeout on testnet | MEDIUM | Network |
| Demo apps not fully verified on testnet | HIGH | Demos |
| WASM SDK has unauthorized changes | LOW | Audit |
| No .env in repo (now fixed) | FIXED | Config |

### WASM SDK Changes Audit
**Status:** Requires detailed diff audit

Changes found beyond authorized scope (identity create/topup):
- Document operations: 787 lines NEW
- Token operations: 2458 lines NEW
- Contract operations: 239 lines NEW
- Address state transitions: 1042 lines NEW
- Query refactoring: 5000+ lines

**Decision:** Audit first, document changes, proceed with SDK work

---

## Desired End State

### 1. SDK Test Suite
- Unit tests: 381+ tests passing
- Integration tests: All connect to real testnet
  - Identity: create, get, topup, creditTransfer, discover
  - DPNS: register, resolve, search
  - Documents: create, get, query, update, delete
  - Tokens: balance queries, info queries
- E2E tests: Playwright against web demo
- Coverage: 80%+ on critical paths

### 2. Demo Applications

#### CLI Demo (`demo/cli/`)
- All commands work against testnet
- Commands: identity, dpns, documents, tokens, credits, onboard
- Progress indicators with ora
- Error handling with clear messages

#### TUI Demo (`demo/tui/`)
- React+Ink terminal interface
- All menu screens functional
- Real-time testnet operations

#### Web Demo (`demo/web/`)
- Webpack-bundled SPA
- All features work:
  - Identity discovery/creation/topup
  - DPNS name resolution/registration
  - DashPay profile/contacts
  - Document viewing
  - Network switching

### 3. Documentation
- API reference (auto-generated)
- Usage examples for each facade
- TESTING.md with test commands
- IDENTITY_ARCHITECTURE.md updated
- README.md comprehensive

### 4. CI/CD
- GitHub Actions workflows:
  - Unit tests on every PR
  - Integration tests (with secrets)
  - E2E tests with Playwright
  - Coverage reporting
- npm publish workflow
- GitHub Pages for web demo

---

## API Contract

### TokensFacade (Actual vs Expected)

| Method | Signature | Status |
|--------|-----------|--------|
| `calculateId` | `(contractId, position) => string` | EXISTS |
| `priceByContract` | `(contractId, position) => TokenPriceInfo` | EXISTS |
| `totalSupply` | `(tokenId) => TokenTotalSupply` | EXISTS |
| `statuses` | `(tokenIds[]) => Map` | EXISTS |
| `balances` | `(identityIds[], tokenId) => Map` | EXISTS |
| `identityBalances` | `(identityId, tokenIds[]) => Map` | EXISTS |
| `identityTokenInfos` | `(identityId, tokenIds[]) => Map` | EXISTS |
| `mint` | `(options) => MintResult` | EXISTS |
| `burn` | `(options) => BurnResult` | EXISTS |
| `transfer` | `(options) => TransferResult` | EXISTS |
| `balance` | `(tokenId, identityId) => bigint` | MISSING - tests expect |
| `get` | `(tokenId) => Token` | MISSING - tests expect |
| `list` | `({contractId}) => Token[]` | MISSING - tests expect |
| `holders` | `(tokenId) => Holder[]` | MISSING - tests expect |

**Decision:** Fix integration tests to use existing API methods.

---

## Success Criteria

### Phase 0: Q&A & Spec (COMPLETE)
- [x] Explore codebase
- [x] Q&A session
- [x] Create PRD

### Phase 1: Core Fixes
- [ ] All TypeScript compiles
- [ ] Dependencies installed
- [ ] Test scripts work
- [ ] .env configured

### Phases 2-4: Demo Apps
- [ ] CLI demo connects to testnet
- [ ] TUI demo navigates all screens
- [ ] Web demo loads and operates

### Phase 5: Integration Tests
- [ ] Fix Token API mismatch
- [ ] All read tests pass on testnet
- [ ] Write tests pass with funded wallet

### Phase 6: E2E Tests
- [ ] Playwright runs against web demo
- [ ] All E2E specs pass

### Phases 7-8: Docs & CI
- [ ] Documentation complete
- [ ] CI pipeline green

### Phase 9: Verification
- [ ] All tests green
- [ ] Demos work on testnet
- [ ] Package publishable

---

## Technical Decisions

### Node Resilience Strategy
- **Whitelist Script:** Run `scripts/build-healthy-nodes.js` to create node list
- **Retry Logic:** All network operations have retry with exponential backoff
- **Fallback:** Try multiple nodes on failure

### Test Environment
```bash
# Required environment variables
MNEMONIC=lamp truck drip furnace now swing income victory leisure popular jeans vehicle
TEST_IDENTITY_ID=DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq
NETWORK=testnet
START_HEIGHT=1380190
```

### WASM Concurrency
- Identity operations use prepare-then-broadcast pattern (avoids RwLock)
- Document/Token operations may need similar treatment
- Worker isolation in Vitest config for tests

---

## Task Summary

| Phase | Tasks | Dependencies |
|-------|-------|--------------|
| P0: Q&A | #91-93 | None |
| P1: Core | #1-8 | P0 |
| P2: CLI | #9-18 | P1 |
| P3: Web | #19-33 | P1 |
| P4: TUI | #34-45 | P1 |
| P5: Integration | #46-55 | P1 |
| P6: E2E | #56-67 | P3 |
| P7: Docs | #68-73 | P5 |
| P8: CI | #74-81 | P6 |
| V: Verify | #82-90 | P8 |

**Total: 93 tasks**

---

## Risk Mitigation

1. **Testnet flakiness:** Whitelist + retry + longer timeouts
2. **WASM concurrency:** Documented workaround, may need SDK-level fix
3. **API mismatches:** Fix tests to match actual API
4. **Browser compatibility:** Test Chrome, document limitations

---

## Timeline

Estimated completion: 1-2 weeks with parallel execution of P2-P5 phases.

