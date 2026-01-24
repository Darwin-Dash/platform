# js-evo-sdk Port Fix Plan

## Completed Phases

### Phase 1: Identity (COMPLETE)
- [x] Add identityCreatePrepare() in packages/wasm-sdk/src/state_transitions/
- [x] Add identityTopUpPrepare() in packages/wasm-sdk/src/state_transitions/
- [x] Add prepareIdentityTopUp() standalone function
- [x] Update wasm-sdk Cargo.toml with simple-signer dep
- [x] Build and test wasm-sdk
- [x] Copy packages/js-evo-sdk/src/identities/ (16 files)
- [x] Copy packages/js-evo-sdk/src/utils/, types/
- [x] Copy packages/js-evo-sdk/src/errors.ts, util.ts
- [x] Copy packages/js-evo-sdk/workers/ (11 files)
- [x] Update package.json with dependencies
- [x] Fix import paths for new location
- [x] Copy packages/transaction-finder/ entirely
- [x] Copy js-evo-sdk tests
- [x] Run unit tests

### Phase 2: DPNS (COMPLETE)
- [x] DPNS facade exists with proper TypeScript types
- [x] Name registration: registerName() implemented
- [x] Name resolution: resolveName(), isNameAvailable() implemented
- [x] Username queries: usernames(), username(), usernamesWithProof() implemented
- [x] Contested names support via VotingFacade
- [x] Voting: masternodeVote(), contestedResourceVoteState() implemented
- [x] DPNS tests: tests/unit/facades/dpns.spec.mjs
- [x] Voting tests: tests/unit/facades/voting.spec.mjs
- [x] TypeScript compiles cleanly

## Phase 3: Documents (Current)
- [ ] Port Documents facade from source
- [ ] Implement CRUD operations (create, read, update, delete)
- [ ] Implement query support
- [ ] Add Documents tests
- [ ] Run tests and fix failures

## Phase 4: DashPay (Next)
- [ ] Port DashPay facade
- [ ] Profiles
- [ ] Contact requests

## Phase 5: Tokens
- [ ] Port Tokens facade
- [ ] Transfer operations
- [ ] Admin operations
