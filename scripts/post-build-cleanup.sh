#!/usr/bin/env bash

set -e

echo "Cleaning up build artifacts..."

# Remove Rust build artifacts (largest space saver ~5.2GB)
if [ -d "target" ]; then
  rm -rf target/
  echo "✓ Removed target/ directory"
fi

# Remove test artifacts
if find packages -type d \( -name "playwright-report" -o -name "test-results" \) -print -quit | grep -q .; then
  find packages -type d \( -name "playwright-report" -o -name "test-results" \) -exec rm -rf {} + 2>/dev/null || true
  echo "✓ Removed test artifacts (playwright-report, test-results)"
fi

# Remove cache files
if find . -maxdepth 4 -name ".ultra.cache.json" -print -quit | grep -q .; then
  find . -maxdepth 4 -name ".ultra.cache.json" -delete 2>/dev/null || true
  echo "✓ Removed Ultra Runner cache files"
fi

# Remove log files
if find packages -name "*.log" -type f -print -quit | grep -q .; then
  find packages -name "*.log" -type f -delete 2>/dev/null || true
  echo "✓ Removed log files"
fi

# Remove NYC coverage output if present
if [ -d ".nyc_output" ]; then
  rm -rf .nyc_output
  echo "✓ Removed NYC coverage output"
fi

echo ""
echo "✓ Build cleanup completed successfully"
echo "  Estimated space saved: ~5.2GB"
echo "  Note: All artifacts can be regenerated with 'yarn build'"
