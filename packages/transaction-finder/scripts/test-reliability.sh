#!/usr/bin/env bash
# Run the IS integration test multiple times and report pass rate AND hex delivery rate.
# Usage: bash scripts/test-reliability.sh [RUNS]  (default: 10)

set -uo pipefail

RUNS="${1:-10}"
PASS=0
FAIL=0
HEX_DELIVERED=0
HEX_NOT_DELIVERED=0

LOG_FILE="/tmp/is-reliability-$(date +%s).log"

echo "=== InstantSend Reliability Test ==="
echo "Running yarn run test:realtime:auto:is  $RUNS times..."
echo "Log file: $LOG_FILE"
echo ""

for i in $(seq 1 "$RUNS"); do
  echo -n "Run $i/$RUNS ... "

  # Run test and capture output
  OUTPUT=$(TEST_MODE=instantsend yarn vitest run tests/integration/testnet-realtime-automated.spec.ts 2>&1)
  EXIT_CODE=$?

  # Log output
  echo "=== Run $i ===" >> "$LOG_FILE"
  echo "$OUTPUT" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"

  # Check test result
  if [ $EXIT_CODE -eq 0 ]; then
    PASS=$((PASS + 1))
    RESULT="PASS"
  else
    FAIL=$((FAIL + 1))
    RESULT="FAIL"
  fi

  # Check hex delivery (look for the specific log messages)
  if echo "$OUTPUT" | grep -q "InstantLock hex delivered"; then
    HEX_DELIVERED=$((HEX_DELIVERED + 1))
    HEX_STATUS="HEX ✓"
  elif echo "$OUTPUT" | grep -q "hex NOT delivered"; then
    HEX_NOT_DELIVERED=$((HEX_NOT_DELIVERED + 1))
    HEX_STATUS="HEX ✗"
  else
    # Test might have failed before IS check
    HEX_STATUS="N/A"
  fi

  echo "$RESULT  $HEX_STATUS"

  # Small delay between runs
  sleep 2
done

PASS_RATE=$((PASS * 100 / RUNS))
HEX_RATE=$((HEX_DELIVERED * 100 / RUNS))

echo ""
echo "=== Results ==="
echo "Test Passes:    $PASS / $RUNS ($PASS_RATE%)"
echo "Test Fails:     $FAIL / $RUNS"
echo ""
echo "Hex Delivered:  $HEX_DELIVERED / $RUNS ($HEX_RATE%)"
echo "Hex NOT Delivered: $HEX_NOT_DELIVERED / $RUNS"
echo ""
echo "Log file: $LOG_FILE"

# Success criteria: >=70% hex delivery rate
if [ "$HEX_RATE" -ge 70 ]; then
  echo "VERDICT: PASS (>=70% hex delivery rate)"
  exit 0
else
  echo "VERDICT: FAIL (<70% hex delivery rate)"
  exit 1
fi
