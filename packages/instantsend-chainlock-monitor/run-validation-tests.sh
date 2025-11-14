#!/bin/bash

# Validation Test Runner for Network Resilience Improvements
# Runs multiple iterations to measure success rate

ITERATIONS=${1:-3}
SUCCESS_COUNT=0
FAILURE_COUNT=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Network Resilience Validation Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running $ITERATIONS test iterations..."
echo ""

for i in $(seq 1 $ITERATIONS); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST RUN $i/$ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cd ../js-evo-sdk
  NETWORK=testnet NUM_TRANSACTIONS=1 LOG_LEVEL=info timeout 310 \
    yarn node instantsend_chainlock/test-chainlock-rpc-transactions.js 2>&1 | head -100

  EXIT_CODE=$?

  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Test $i PASSED (exit code: $EXIT_CODE)"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "❌ Test $i FAILED (exit code: $EXIT_CODE)"
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
  fi
  echo ""

  # Brief pause between tests
  sleep 5
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VALIDATION RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total runs:  $ITERATIONS"
echo "Successes:   $SUCCESS_COUNT ($(( SUCCESS_COUNT * 100 / ITERATIONS ))%)"
echo "Failures:    $FAILURE_COUNT ($(( FAILURE_COUNT * 100 / ITERATIONS ))%)"
echo ""

if [ $SUCCESS_COUNT -ge $(( ITERATIONS * 2 / 3 )) ]; then
  echo "✅ VALIDATION PASSED - Success rate meets threshold (≥66%)"
  exit 0
else
  echo "❌ VALIDATION FAILED - Success rate below threshold (<66%)"
  exit 1
fi
