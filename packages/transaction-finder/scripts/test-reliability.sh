#!/usr/bin/env bash
# On-Demand Detection Reliability Test
# Tests the ONLY supported flow: monitor → detect → callbacks provide all data
#
# Usage: bash scripts/test-reliability.sh [RUNS]  (default: 10)

set -uo pipefail

# Source environment from js-evo-sdk
ENV_FILE="$(dirname "$0")/../../js-evo-sdk/.env"
if [ -f "$ENV_FILE" ]; then
  set -a  # Export all variables
  source "$ENV_FILE"
  set +a
  echo "Loaded environment from $ENV_FILE"
else
  echo "Warning: $ENV_FILE not found - ensure TESTNET_RPC_* vars are set"
fi

RUNS="${1:-10}"
PASS=0
FAIL=0
HEX_DELIVERED=0
HEX_NOT_DELIVERED=0

LOG_FILE="/tmp/ondemand-reliability-$(date +%s).log"

echo "=== On-Demand Detection Reliability Test ==="
echo "Running yarn vitest run tests/integration/testnet-realtime-automated.spec.ts  $RUNS times..."
echo "Log file: $LOG_FILE"
echo ""

for i in $(seq 1 "$RUNS"); do
  echo -n "Run $i/$RUNS ... "

  # Run test and capture output
  # Use single thread to prevent memory accumulation from parallel workers
  OUTPUT=$(yarn vitest run tests/integration/testnet-realtime-automated.spec.ts --testTimeout=120000 --pool=forks --poolOptions.forks.singleFork 2>&1)
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
  if echo "$OUTPUT" | grep -q "IS hex delivered via multi-node"; then
    HEX_DELIVERED=$((HEX_DELIVERED + 1))
    HEX_STATUS="HEX ✓"
  elif echo "$OUTPUT" | grep -q "IS hex not delivered"; then
    HEX_NOT_DELIVERED=$((HEX_NOT_DELIVERED + 1))
    HEX_STATUS="HEX ✗"
  else
    # Test might have failed before IS check
    HEX_STATUS="N/A"
  fi

  echo "$RESULT  $HEX_STATUS"

  # Delay between runs to ensure gRPC connections are fully cleaned up
  # gRPC cleanup can take several seconds after process exit
  sleep 5
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
