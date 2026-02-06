# js-evo-sdk Port Implementation Plan

## Phase 1: Identity (ASAP)

### Step 1: wasm-sdk Rust Changes
**Files to modify:**
- `packages/wasm-sdk/Cargo.toml` - add simple-signer dependency
- `packages/wasm-sdk/src/lib.rs` - export new functions
- `packages/wasm-sdk/src/state_transitions/mod.rs` - add identity module
- `packages/wasm-sdk/src/state_transitions/identity.rs` - NEW: prepare methods

**Functions to add:**
```rust
pub fn identityCreatePrepare(asset_lock_proof: &[u8], private_key: &str, public_keys: JsValue) -> Result<JsValue, JsError>
pub fn identityTopUpPrepare(identity_id: &str, asset_lock_proof: &[u8], private_key: &str) -> Result<JsValue, JsError>
pub fn prepareIdentityTopUp(identity_id: &str, proof_json: &str, wif: &str, network: &str) -> Result<JsValue, JsError>
```

**Verification:**
```bash
cargo check --workspace
cd packages/wasm-sdk && ./scripts/build.sh
```

### Step 2: js-evo-sdk Identity Facade Port
**Copy from:** platform-feat-js-evo-sdk-identities/packages/js-evo-sdk/
**Copy to:** platform-v3.0-dev/packages/js-evo-sdk/

**Files to copy:**
- src/identities/*.ts (16 files)
- src/utils/*.ts
- src/types/*.ts
- src/errors.ts
- src/util.ts
- workers/*.ts (11 files)

**Verification:**
```bash
cd packages/js-evo-sdk && npm install && npm run build
```

### Step 3: transaction-finder Port
**Copy entire package:**
- packages/transaction-finder/

**Verification:**
```bash
cd packages/transaction-finder && npm install && npm run build
```

### Step 4: Integration & Testing
- Update yarn workspaces in root package.json
- Run `yarn install`
- Run `yarn build`
- Run tests: `yarn test` and `cargo test --workspace`

## Phase 2: DPNS
See .ralph/specs/js-evo-sdk-port-plan.md

## Phase 3: Documents
See .ralph/specs/js-evo-sdk-port-plan.md

## Phase 4: DashPay
See .ralph/specs/js-evo-sdk-port-plan.md

## Phase 5: Tokens
See .ralph/specs/js-evo-sdk-port-plan.md

---

## Progress Tracking

### Phase 1 Checklist
- [ ] Step 1: wasm-sdk Rust changes
  - [ ] identityCreatePrepare()
  - [ ] identityTopUpPrepare()
  - [ ] prepareIdentityTopUp()
  - [ ] wasm-sdk builds
- [ ] Step 2: js-evo-sdk identity facade
  - [ ] Files copied
  - [ ] Imports fixed
  - [ ] Build passes
- [ ] Step 3: transaction-finder
  - [ ] Package copied
  - [ ] Build passes
- [ ] Step 4: Integration
  - [ ] yarn install works
  - [ ] yarn build works
  - [ ] Tests pass

### Completion Criteria
All checkboxes above checked = Phase 1 complete → Update .ralph/status.md with EXIT_SIGNAL: true
