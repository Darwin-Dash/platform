#!/bin/bash

# grpc-js Version Testing Script
# Tests subscribeToMasternodeList with different @grpc/grpc-js versions
#
# Usage: ./scripts/test-grpc-versions.sh
#
# This script will:
# 1. Test current version (1.4.4)
# 2. Test newer versions (1.10.x, 1.11.x, 1.12.x)
# 3. Report which versions work
# 4. Restore original version

# Don't use set -e - we want to continue testing even if one version fails

SEED_IP="34.209.12.72:1443"
PROTO_PATH="../../packages/dapi-grpc/protos/core/v0/core.proto"
GRPC_MODULE="../../node_modules/@grpc/grpc-js"
BACKUP_DIR="/tmp/grpc-js-backup-$$"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "grpc-js Version Testing for subscribeToMasternodeList"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Target: $SEED_IP"
echo "Method: org.dash.platform.dapi.v0.Core/subscribeToMasternodeList"
echo ""

# Function to get current version
get_current_version() {
  if [ -f "$GRPC_MODULE/package.json" ]; then
    grep '"version"' "$GRPC_MODULE/package.json" | head -1 | sed 's/.*: "\(.*\)".*/\1/'
  else
    echo "unknown"
  fi
}

# Function to backup current grpc-js
backup_grpc() {
  echo "📦 Backing up current @grpc/grpc-js..."
  if [ -d "$GRPC_MODULE" ]; then
    mkdir -p "$BACKUP_DIR"
    cp -R "$GRPC_MODULE" "$BACKUP_DIR/"
    echo "✅ Backed up to $BACKUP_DIR"
  fi
}

# Function to restore original grpc-js
restore_grpc() {
  echo ""
  echo "🔄 Restoring original @grpc/grpc-js..."
  if [ -d "$BACKUP_DIR/@grpc/grpc-js" ]; then
    rm -rf "$GRPC_MODULE"
    cp -R "$BACKUP_DIR/grpc-js" "$GRPC_MODULE"
    echo "✅ Restored"
  fi
  rm -rf "$BACKUP_DIR"
}

# Function to test subscription with grpcurl
test_subscription() {
  local version=$1
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Testing grpc-js $version"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Skip grpcurl baseline test (transient network timeouts)
  # Previous testing showed grpcurl works when network is stable
  # We'll test Node.js/DAPIClient directly to compare grpc-js versions

  # Test with Node.js / DAPIClient
  echo "🔍 Testing with Node.js DAPIClient..."
  # Set LOG_LEVEL=debug to enable DAPIClient internal logging
  LOG_LEVEL=debug node - <<'EOF'
const DAPIClient = require('@dashevo/dapi-client');
const fs = require('fs');

// Debug logging to stderr
const debug = (msg) => fs.writeSync(2, `[DEBUG] ${msg}\n`);

debug('Creating DAPIClient with debug logging enabled...');
// Use seeds to trigger masternode list subscription (what we're actually testing)
const client = new DAPIClient({
  seeds: ['seed-1.testnet.networks.dash.org:1443'],
  network: 'testnet',
  timeout: 15000,
  retries: 3,
});

let subscriptionAttempted = false;
let subscriptionSucceeded = false;
let errorCount = 0;

// Monitor for subscription attempts
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.join(' ');

  // Also output to stderr so we can see what's happening
  debug(`Console: ${msg.substring(0, 100)}`);

  if (msg.includes('subscribeToMasternodeList')) {
    subscriptionAttempted = true;
    debug('Subscription attempted!');
  }
  if (msg.includes('Masternode list diff') || msg.includes('diffCount')) {
    subscriptionSucceeded = true;
    debug('Subscription succeeded!');
  }
  if (msg.includes('14 UNAVAILABLE') || msg.includes('No connection established')) {
    errorCount++;
    debug(`Error detected (count: ${errorCount})`);
  }
};

debug('Waiting 5 seconds for subscription attempts and fallback...');
setTimeout(() => {
  debug(`After 5s: attempted=${subscriptionAttempted}, succeeded=${subscriptionSucceeded}, errors=${errorCount}`);

  debug('Now calling getBlockchainStatus to verify client works...');

  // Hard timeout for the whole test
  const hardTimeout = setTimeout(() => {
    console.log = originalLog;
    debug('HARD TIMEOUT - Test hung for 25+ seconds');
    console.log('❌ Node.js: TIMEOUT');
    process.exit(1);
  }, 25000);

  client.core.getBlockchainStatus()
    .then(() => {
      clearTimeout(hardTimeout);
      debug('getBlockchainStatus succeeded');

      console.log = originalLog;
      debug(`RESULT: attempted=${subscriptionAttempted}, succeeded=${subscriptionSucceeded}, errors=${errorCount}`);

      if (subscriptionSucceeded) {
        console.log('✅ Node.js: SUCCESS (subscription worked!)');
        process.exit(0);
      } else if (subscriptionAttempted && errorCount > 0) {
        console.log('❌ Node.js: FAILED (subscription tried but failed)');
        process.exit(1);
      } else {
        console.log('⚠️  Node.js: UNCLEAR (no subscription attempt detected)');
        process.exit(1);
      }
    })
    .catch((e) => {
      clearTimeout(hardTimeout);
      console.log = originalLog;
      debug(`getBlockchainStatus failed: ${e.message}`);
      console.log(`❌ Node.js: ERROR (${e.message})`);
      process.exit(1);
    });
}, 5000);
EOF

  if [ $? -eq 0 ]; then
    echo "Result: ✅ WORKING with grpc-js $version"
    return 0
  else
    echo "Result: ❌ FAILING with grpc-js $version"
    return 1
  fi
}

# Main execution
CURRENT_VERSION=$(get_current_version)
echo "Current @grpc/grpc-js version: $CURRENT_VERSION"
echo ""

# Backup current version
backup_grpc

# Test current version
test_subscription "$CURRENT_VERSION"
CURRENT_RESULT=$?

# Test with newer versions
VERSIONS_TO_TEST=("1.10.9" "1.11.3" "1.12.2")

for VERSION in "${VERSIONS_TO_TEST[@]}"; do
  echo ""
  echo "Installing @grpc/grpc-js@$VERSION temporarily..."
  cd ../../
  npm install @grpc/grpc-js@$VERSION --no-save --legacy-peer-deps > /dev/null 2>&1
  cd packages/dash-utxo-finder

  test_subscription "$VERSION"
done

# Restore original
restore_grpc

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Current version ($CURRENT_VERSION): $([ $CURRENT_RESULT -eq 0 ] && echo '✅ WORKS' || echo '❌ FAILS')"
echo ""
echo "💡 Recommendation:"
if [ $CURRENT_RESULT -ne 0 ]; then
  echo "   Upgrade @grpc/grpc-js to version 1.10.9 or later"
  echo "   This should fix the subscribeToMasternodeList streaming issues"
else
  echo "   Current version works fine - no upgrade needed"
fi
echo ""
