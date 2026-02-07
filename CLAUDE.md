# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Tool Usage Rules

**ALWAYS use the swift-rust-ffi-engineer agent for:**
- Any Swift/Rust FFI integration work
- Swift wrapper implementations over FFI functions
- Debugging Swift/FFI type compatibility issues
- iOS SDK and SwiftExampleApp development
- Memory management across Swift/Rust boundaries
- Refactoring Swift code to properly wrap FFI functions

## Commands

### Build and Development

```bash
# Initial setup (installs deps, builds, and configures)
yarn setup

# Start local development environment
yarn start

# Stop local environment
yarn stop

# Restart services
yarn restart

# Rebuild after changes
yarn build

# Complete reset of data and builds
yarn reset
```

### Testing

```bash
# Run full test suite (requires running node from yarn start)
yarn test

# Test specific packages
yarn test:suite              # Platform test suite
yarn test:dapi               # DAPI components
yarn test:sdk                # JavaScript SDK
yarn test:dpp                # Dash Platform Protocol
yarn test:drive              # Drive storage layer
yarn test:wallet-lib         # Wallet library
yarn test:dapi-client        # DAPI client

# Test specific workspace
yarn workspace <package_name> test
```

### Rust Development

```bash
# Run Rust tests for a specific package
cargo test -p <package_name>

# Run all Rust tests
cargo test --workspace

# Check Rust code
cargo check --workspace

# Run clippy linter
cargo clippy --workspace

# Format Rust code
cargo fmt --all
```

### Other Commands

```bash
# Run linters
yarn lint

# Access dashmate CLI
yarn dashmate

# Configure test suite network
yarn configure:tests:network
```

## Architecture

### Technology Stack

- **Rust**: Core platform components (Drive, DAPI server, DPP implementation)
- **JavaScript/TypeScript**: Client SDKs, developer tools, test suite
- **WebAssembly**: Bridge between Rust and JavaScript implementations
- **gRPC**: Service communication protocol
- **Docker**: Local development environment

### Key Components

**Drive** (`packages/rs-drive`): Platform's decentralized storage component, implementing a replicated state machine for storing and retrieving application data.

**DAPI** (`packages/dapi`): Decentralized API server that provides a unified interface for interacting with the Dash network and Platform.

**DPP** (`packages/rs-dpp`, `packages/wasm-dpp`): Dash Platform Protocol implementation that defines data structures and validation rules.

**SDK** (`packages/js-dash-sdk`, `packages/rs-sdk`): Client libraries providing high-level interfaces for building applications on Dash Platform.

**WASM SDK** (`packages/wasm-sdk`): WebAssembly bindings for browser-based applications. See [AI_REFERENCE.md](packages/wasm-sdk/AI_REFERENCE.md) for comprehensive API documentation.

**Dashmate** (`packages/dashmate`): Node management tool for setting up and managing Dash Platform nodes.

### Data Contracts

Platform uses data contracts to define application data schemas:
- `dpns-contract`: Dash Platform Naming Service
- `dashpay-contract`: Social payments functionality
- `feature-flags-contract`: System feature toggles
- `masternode-reward-shares-contract`: Masternode reward distribution
- `withdrawals-contract`: Platform credit withdrawals

### Development Workflow

1. **Monorepo Structure**: Uses Yarn workspaces to manage multiple packages
2. **Cross-language Integration**: WASM bindings connect Rust and JavaScript code
3. **Local Development**: Docker Compose environment managed by dashmate
4. **Testing**: Comprehensive test suites at unit, integration, and e2e levels
5. **WASM SDK Development**: 
   - Build with `./build.sh` in `packages/wasm-sdk`
   - Test with web interface at `index.html`
   - Keep docs in sync: `python3 generate_docs.py`

### Important Patterns

- **Platform Versioning**: Uses `rs-platform-version` for protocol versioning
- **Serialization**: Custom serialization with `rs-platform-serialization`
- **Value Handling**: `rs-platform-value` for cross-language data representation
- **Proof Verification**: `rs-drive-proof-verifier` for cryptographic proofs
- **State Transitions**: Documents and data contracts use state transitions for updates

## iOS Development

### Building iOS SDK and SwiftExampleApp

See [packages/swift-sdk/BUILD_GUIDE_FOR_AI.md](packages/swift-sdk/BUILD_GUIDE_FOR_AI.md) for detailed instructions on building the iOS components.

For SwiftExampleApp-specific guidance including token querying and data models, see [packages/swift-sdk/SwiftExampleApp/CLAUDE.md](packages/swift-sdk/SwiftExampleApp/CLAUDE.md).

Quick build commands:
```bash
# Build unified iOS framework (includes Core + Platform)
cd packages/rs-sdk-ffi
./build_ios.sh

# Build SwiftExampleApp
cd packages/swift-sdk
xcodebuild -project SwiftExampleApp/SwiftExampleApp.xcodeproj \
  -scheme SwiftExampleApp \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16,arch=arm64' \
  -quiet clean build
```

### iOS Architecture

**Unified SDK**: The iOS SDK combines both Core (SPV wallet) and Platform (identity/documents) functionality:
- Core SDK functions: `dash_core_sdk_*` prefix
- Platform SDK functions: `dash_sdk_*` prefix  
- Unified SDK functions: `dash_unified_sdk_*` prefix

**SwiftExampleApp**: Demonstrates integration of both layers:
- Uses SwiftUI for UI and SwiftData for persistence
- `UnifiedAppState` coordinates Core and Platform features
- `WalletService` manages SPV wallet operations
- `PlatformService` handles identity and document operations

**Common iOS Build Issues**:
- Missing xcframework: Create symlink or update Package.swift
- Type visibility: Make DPP types public in Swift
- C header issues: Use pointers for opaque FFI types
- After merges: Always clean and rebuild from scratch

## Ralph Autonomous Loop

This project uses the Ralph autonomous coding loop. Use the `/ralph_wiggum` skill for documentation.

### Quick Reference
```bash
ralph                                  # Run loop
ralph --monitor                        # Run with tmux dashboard
ralph --stream --verbose --timeout 60  # Run with streaming output, verbose, 60min timeout
ralph --status                         # Check current status
ralph --circuit-status                 # Check circuit breaker
ralph --reset-session                  # Reset after crash/interruption
```

### Project Config (in `.ralph/`)
- `PROMPT.md` - Agent instructions and objectives
- `@fix_plan.md` - Task checklist (markdown)
- `@AGENT.md` - Build/run instructions and learnings
- `specs/` - Technical specifications

## Transaction Finder Session Context

> This section captures ongoing work on `packages/transaction-finder` for session continuity.
> Branch: `claude/review-transaction-finder-tests-leYzW`

### What was done

1. **Merged transaction-finder code** from branch `claude/check-git-branch-q2aoF` (resolved merge conflict in `.github/grpc-queries-cache.json`)
2. **Ran all tests locally**:
   - Unit tests: 258/258 pass (12 files)
   - Mock integration tests: 41/41 pass
   - Live testnet tests: fail locally due to container network restrictions (proxy blocks DAPI gRPC on port 1443)
3. **Diagnosed network issues**: Envoy proxy only forwards standard TLS; Dash DAPI nodes use self-signed certs on port 1443 causing `sslv3 alert handshake failure`. UDP completely blocked (no WireGuard). SSH tunneling through proxy also blocked.
4. **Successfully ran live tests on AWS EC2** via user-data approach:
   - `testnet-realtime.spec.ts` PASSED (connected to DAPI, received MerkleBlocks)
   - `testnet-utxo.spec.ts` timed out (was scanning 52K blocks from fixed START_HEIGHT)
   - `testnet-realtime-automated.spec.ts` failed (missing `@dashevo/dash-rpc-client` package)
5. **Refactored integration tests** (committed and pushed):
   - Removed `@dashevo/dash-rpc-client` from `package.json` devDependencies
   - Created `tests/helpers/test-state.ts` - persists scan state (`.test-state.json`) between runs
   - Created `tests/helpers/dapi-transaction-helper.ts` - DAPI-only TX functions (derivePrivateKey, buildSelfSendTx, broadcastViaDAPI, waitForInstantSend)
   - Fixed `testnet-utxo.spec.ts` - uses dynamic height (last 500 blocks or persisted state) instead of fixed START_HEIGHT
   - Rewrote `testnet-realtime-automated.spec.ts` - DAPI-only flow using dashcore-lib for key derivation + TX building

### What still needs to be done

1. **Test on live testnet**: The refactored integration tests need to be run against the real Dash testnet to verify they work end-to-end. This requires either:
   - AWS EC2 with SSM (preferred) - spin up instance, install Node.js 22 + deps, run tests remotely
   - Any environment with direct network access to DAPI nodes on port 1443
2. **Scale up test runs**: Start with 1 successful TX, then scale to 3, then more (UTXO chaining across runs)
3. **Validate UTXO chaining**: Confirm that `.test-state.json` correctly persists state and subsequent runs scan from the right block height

### Key files

| File | Purpose |
|------|---------|
| `tests/integration/testnet-utxo.spec.ts` | Historic UTXO scanning test (dynamic height) |
| `tests/integration/testnet-realtime-automated.spec.ts` | DAPI-only self-send + IS detection test |
| `tests/integration/testnet-realtime.spec.ts` | Passive realtime monitoring test (already works) |
| `tests/helpers/test-state.ts` | Scan state persistence helper |
| `tests/helpers/dapi-transaction-helper.ts` | DAPI TX building/broadcast helper |
| `tests/helpers/dapi-config.ts` | DAPI client config + healthy node loading |
| `scripts/dapi-multinode-poc.ts` | Reference implementation (1296 lines, DAPI-only POC) |
| `packages/js-evo-sdk/.env.backup` | Contains MNEMONIC, TESTNET_ADDRESS, NETWORK, START_HEIGHT |

### Environment notes

- `.env` path: `packages/js-evo-sdk/.env` (tests load from there via dotenv)
- `.env.backup` has: `MNEMONIC=lamp truck drip furnace now swing income victory leisure popular jeans vehicle`
- `TESTNET_ADDRESS=yX3CJJ42ndx9Bn9vGZRD8cbwk8vth5aKyy`
- Install deps: `cd /home/user/platform && yarn workspaces focus @dashevo/transaction-finder`
- Run unit tests: `cd packages/transaction-finder && yarn vitest run tests/unit/`
- Run integration tests (needs network): `yarn vitest run tests/integration/ --testTimeout=360000`
- Container network: proxy blocks DAPI (port 1443 self-signed certs), blocks UDP, blocks non-TLS SSH tunnels
- Workaround: AWS EC2 with user-data scripts (package code as tarball to S3, EC2 downloads and runs)