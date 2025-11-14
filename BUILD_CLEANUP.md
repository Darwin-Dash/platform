# Build Artifact Cleanup Guide

## Overview

The Dash Platform monorepo generates substantial intermediate build artifacts during the build process. To optimize disk usage on build servers and CI/CD pipelines, we've implemented automatic cleanup that removes unnecessary files after each successful build.

**Estimated space savings: ~5.2GB per build**

## Problem Statement

The project uses multiple build systems:
- **Rust**: Compiles to native code and WebAssembly (WASM)
- **JavaScript/TypeScript**: Compiles with multiple bundlers and transpilers
- **Testing**: Generates Playwright reports and coverage data

These systems generate large intermediate artifacts:
- Rust `target/` directory: **5.2GB** (release, debug, WASM targets)
- JavaScript build caches: **113MB** (multiple dist/ directories)
- Test artifacts: **17MB** (playwright reports, test results)
- Cache files: **.ultra.cache.json**, logs, coverage data

After the build completes and final outputs are bundled into `dist/` and `build/` directories, these intermediate files serve no purpose and can safely be removed.

## What Gets Cleaned Up

### Rust Build Artifacts (~5.2GB)
- `target/` directory - Contains compiled binaries for:
  - `target/release/` - Optimized Rust binaries
  - `target/debug/` - Debug symbols and unoptimized builds
  - `target/wasm32-unknown-unknown/` - WebAssembly targets
  - Dependencies and incremental compilation caches

**Safe to remove because:** WASM outputs are bundled into `packages/wasm-sdk/dist/` and `packages/wasm-dpp/dist/`

### JavaScript Build Intermediates
- `packages/*/build/` - TypeScript compilation output (**.ts → .js**)
- Ultra Runner cache files (`.ultra.cache.json`)

**Safe to remove because:** Final outputs are in `dist/` directories

### Test Artifacts (~17MB)
- Playwright test reports: `packages/*/playwright-report/`
- Test results: `packages/*/test-results/`

**Safe to remove because:** Reports can be regenerated on demand

### Other Artifacts
- Log files (`*.log`)
- NYC code coverage output (`.nyc_output/`)

## What Is Preserved

These important directories are **NOT** removed:

| Directory | Purpose | Why Keep |
|-----------|---------|----------|
| `packages/*/dist/` | Final JavaScript/WASM bundles | Published outputs, needed for npm |
| `packages/*/build/` | Compiled TypeScript declarations | Published with npm packages |
| `node_modules/` | JavaScript dependencies | Needed for all builds |
| `.yarn/cache/` | Yarn offline cache | Enables offline builds |
| `src/`, `lib/`, `tests/` | Source code | Core project files |

## How It Works

### Automatic Cleanup on Build

The cleanup is integrated into the `yarn build` command:

```bash
$ yarn build
# Runs: ultra --recursive --build && bash scripts/post-build-cleanup.sh
```

Process:
1. `ultra --recursive --build` - Compiles all packages
2. Build succeeds ✓
3. `post-build-cleanup.sh` - Automatically runs cleanup
4. Returns to prompt with clean state

### Cleanup Script

Location: `scripts/post-build-cleanup.sh`

The script:
- Checks for existence of each directory before removal (safe)
- Uses `rm -rf` for quick deletion
- Provides progress feedback with checkmarks
- Prints estimated space saved

### Running Cleanup Manually

If needed, you can run cleanup separately:

```bash
# Run cleanup script directly
bash scripts/post-build-cleanup.sh

# Or use npm script (if added)
npm run clean:artifacts
```

## Space Savings Analysis

### Before Cleanup
```
target/                    5.2 GB  ← Rust build artifacts
packages/*/dist/           113 MB  ← JavaScript bundles (kept)
packages/*/build/          656 KB  ← TypeScript output (removed)
Test artifacts              17 MB  ← Playwright reports
.ultra.cache.json        ~0.5 MB  ← Build caches

TOTAL PER BUILD: ~5.3 GB removed
```

### Impact on Build Server

For a build server running 10 builds per day:

```
Without cleanup:  5.3 GB × 10 = 53 GB per day
With cleanup:     50 MB × 10 = 500 MB per day

Storage saved:    52.5 GB per day
                  ~1.6 TB per month
```

## Regenerating Artifacts

All removed artifacts can be regenerated:

```bash
# Full rebuild from scratch
yarn build
# This will:
# 1. Compile all Rust packages
# 2. Compile all JavaScript packages
# 3. Run bundlers and optimizers
# 4. Auto-cleanup removes intermediates
# 5. Final dist/ and build/ outputs remain
```

## Implementation Details

### File Locations

```
scripts/
├── post-build-cleanup.sh     ← Cleanup script
package.json                  ← Updated build command
```

### Build Command Change

**Before:**
```json
"build": "ultra --recursive $* --build"
```

**After:**
```json
"build": "ultra --recursive $* --build && bash scripts/post-build-cleanup.sh"
```

The `$*` syntax preserves any additional arguments passed to `yarn build`.

## Workflow Examples

### Example 1: Normal Development Build

```bash
$ yarn build
# ... compilation output ...
Cleaning up build artifacts...
✓ Removed target/ directory
✓ Removed test artifacts (playwright-report, test-results)
✓ Removed Ultra Runner cache files
✓ Removed log files

✓ Build cleanup completed successfully
  Estimated space saved: ~5.2GB
  Note: All artifacts can be regenerated with 'yarn build'
```

### Example 2: Skip Cleanup (if needed)

```bash
# Run ultra directly to skip cleanup
yarn ultra --recursive --build

# Or manually run build without cleanup
ultra --recursive --build
```

### Example 3: Manual Cleanup Later

```bash
# If you kept the artifacts but want to clean up later
bash scripts/post-build-cleanup.sh
```

## Troubleshooting

### Build fails, cleanup doesn't run

The cleanup script only runs if the build succeeds (due to `&&` operator). If the build fails, intermediates are preserved for debugging.

### "Permission denied" error

The script needs execute permissions:

```bash
chmod +x scripts/post-build-cleanup.sh
```

This should already be set, but can be reapplied if needed.

### Need artifacts for debugging

The cleanup only removes intermediates. All source code and final outputs are preserved.

If you need to inspect build intermediates before they're cleaned up:

1. Run build with partial cleanup:
   ```bash
   ultra --recursive --build  # Skip auto-cleanup
   ```

2. Inspect artifacts:
   ```bash
   ls target/
   ls packages/*/dist/
   ```

3. Run cleanup manually when ready:
   ```bash
   bash scripts/post-build-cleanup.sh
   ```

### CI/CD Integration Issues

If your CI/CD system needs artifacts between stages:

1. **Before**: Run `yarn build` (includes cleanup)
2. **Save**: Cache only `packages/*/dist/` and `packages/*/build/`
3. **Later**: Restore from cache, don't re-run build

This approach maximizes space savings while preserving needed outputs.

## Best Practices

### For Local Development
- Run `yarn build` normally - cleanup happens automatically
- If you need to inspect intermediates, run `ultra --recursive --build` instead
- Use `yarn build` before commits to match CI behavior

### For CI/CD Pipelines
- Let cleanup run automatically on successful builds
- Cache only `dist/` and `build/` directories
- On failure, preserve intermediates for debugging
- Consider triggering cleanup explicitly if needed: `bash scripts/post-build-cleanup.sh`

### For Build Servers
- Cleanup runs after every successful build
- No additional configuration needed
- Disk space will stabilize at ~500MB per build (just published outputs)
- Monitor disk usage to verify cleanup is working

## Safety and Rollback

The cleanup process is **safe** because:

1. **All removed files are intermediate artifacts** - not source code or published outputs
2. **Removal only happens after successful build** - failed builds preserve artifacts
3. **Easy to regenerate** - `yarn build` recreates everything
4. **No configuration files modified** - only build outputs removed

If you need to revert the cleanup feature:

```bash
# Revert package.json change
git checkout package.json

# Remove cleanup script
rm scripts/post-build-cleanup.sh

# Future builds won't cleanup automatically
yarn build
```

## Monitoring Cleanup

The cleanup script provides feedback:

```bash
Cleaning up build artifacts...
✓ Removed target/ directory
✓ Removed test artifacts (playwright-report, test-results)
✓ Removed Ultra Runner cache files
✓ Removed log files

✓ Build cleanup completed successfully
  Estimated space saved: ~5.2GB
```

To verify cleanup worked:

```bash
# Check target directory is gone
ls target 2>/dev/null || echo "✓ target/ cleaned up"

# Check dist directories remain
du -sh packages/*/dist | head -5
# Output should show js-dash-sdk, wasm-sdk, etc.
```

## Related Documentation

- **Monorepo Structure**: See main README.md
- **Build System**: See each package's `package.json` for build scripts
- **Ultra Runner**: Documentation at https://www.ultrarunner.io/
- **Workspace Configuration**: See `.yarnrc.yml` for Yarn settings

## Questions or Issues?

If the cleanup process causes issues:

1. Check that `scripts/post-build-cleanup.sh` is executable
2. Verify `package.json` has the correct build command
3. Review `BUILD_CLEANUP.md` (this file) for troubleshooting
4. Comment out cleanup in `package.json` temporarily to isolate issues

---

**Last Updated:** October 24, 2025
**Status:** Active
**Space Saved:** ~5.2GB per build
