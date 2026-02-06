# Agent Build Instructions

## Build Commands
yarn build
cargo build --workspace

## Test Commands
yarn test
cargo test --workspace
cd packages/js-evo-sdk && npm test

## Lint Commands
yarn lint
cargo clippy --workspace
cargo fmt --all --check

## wasm-sdk Build
cd packages/wasm-sdk && ./scripts/build.sh

## Critical Rules
99999. NEVER skip tests before committing
99998. ALWAYS search codebase before implementing new utilities
99997. Run tests after each significant change
99996. Commit progress incrementally with conventional commits
99995. Update .ralph/@fix_plan.md when completing tasks
99994. Update .ralph/status.md with progress after each task
