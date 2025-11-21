# Testnet Resilience Validation Report

Generated: 2025-11-16T08:16:26.587Z

---

## Executive Summary

**Overall Grade:** 🟢 Excellent

This report documents 70 operations executed over 32m 0s against Dash testnet DAPI nodes. The resilient DAPI client achieved an excellent 100.00% success rate, demonstrating robust handling of network failures and node unavailability.

**Key Findings:**

- Executed 70 total operations
- Recovered from 66 failures via retry/failover
- Average recovery time: 0ms
- Blacklisted 22 underperforming nodes


## Test Run Details

| Metric | Value |
|--------|-------|
| Start Time | 2025-11-16T07:44:26.532Z |
| Duration | 32m 0s |
| Total Operations | 70 |
| Successful Operations | 70 |
| Failed Operations | 0 |
| Success Rate | 100.00% |

## Resilience Statistics

### Recovery Actions

| Action | Count |
|--------|-------|
| Retries | 33 |
| Failovers | 33 |
| Degradations | 0 |
| Total Recovery Actions | 66 |

### Timing Metrics

| Metric | Value |
|--------|-------|
| Average Retry Delay | 1515ms |
| Average Recovery Time | 0ms |
| Nodes Blacklisted | 22 |

### Failure Breakdown by Type

| Failure Type | Count | Percentage |
|--------------|-------|------------|
| RETRY | 33 | 50.0% |
| NODE_FAILURE | 33 | 50.0% |

### Node Performance

| Node | Failures |
|------|----------|
| core | 33 |
| 35.85.21.179:1443 | 2 |
| 34.214.48.68:1443 | 2 |
| 52.24.124.162:1443 | 2 |
| 52.13.132.146:1443 | 2 |
| 35.167.145.149:1443 | 2 |
| 54.187.14.232:1443 | 2 |
| 35.164.23.245:1443 | 2 |
| 35.163.144.230:1443 | 2 |
| 44.240.98.102:1443 | 2 |

## Operation Latencies

| Operation | Min | Avg | Median | P95 | P99 | Max | Samples |
|-----------|-----|-----|--------|-----|-----|-----|----------|
| getBestBlockHeight | 298ms | 31044ms | 920ms | 256376ms | 538522ms | 538522ms | 61 |
| getBlockByHeight | 303ms | 1015ms | 897ms | 2308ms | 2308ms | 2308ms | 9 |

## Memory Usage

| Metric | Value |
|--------|-------|
| Initial Heap | 73.07 MB |
| Final Heap | 70.44 MB |
| Peak Heap | 73.07 MB |
| Memory Growth | -3.60% |

✅ Memory usage is stable (growth < 5%).

## Event Statistics

| Event Type | Count |
|------------|-------|
| Retry Events | 33 |
| Failover Events | 33 |
| Degradation Events | 0 |
| Restoration Events | 0 |
| Reconnection Events | 0 |

## Failure Details

Showing 20 of 66 total failures:

### Failure #1

- **Time:** 2025-11-16T07:53:05.712Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: Deadline exceeded
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #2

- **Time:** 2025-11-16T07:53:05.712Z
- **Operation:** unknown
- **Node:** 35.85.21.179:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: Deadline exceeded
- **Resilience Action:** FAILOVER
- **Failover To:** 34.214.48.68:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #3

- **Time:** 2025-11-16T07:53:07.018Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 2
- **Retry Delay:** 2000ms
- **Outcome:** PENDING

### Failure #4

- **Time:** 2025-11-16T07:53:07.018Z
- **Operation:** unknown
- **Node:** 34.214.48.68:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 52.24.124.162:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #5

- **Time:** 2025-11-16T07:53:10.366Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #6

- **Time:** 2025-11-16T07:53:10.366Z
- **Operation:** unknown
- **Node:** 52.24.124.162:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 52.13.132.146:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #7

- **Time:** 2025-11-16T07:53:11.676Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 2
- **Retry Delay:** 2000ms
- **Outcome:** PENDING

### Failure #8

- **Time:** 2025-11-16T07:53:11.676Z
- **Operation:** unknown
- **Node:** 52.13.132.146:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 35.167.145.149:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #9

- **Time:** 2025-11-16T07:53:16.055Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #10

- **Time:** 2025-11-16T07:53:16.055Z
- **Operation:** unknown
- **Node:** 35.167.145.149:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 54.187.14.232:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #11

- **Time:** 2025-11-16T07:53:20.805Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #12

- **Time:** 2025-11-16T07:53:20.805Z
- **Operation:** unknown
- **Node:** 54.187.14.232:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 35.164.23.245:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #13

- **Time:** 2025-11-16T07:53:23.700Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #14

- **Time:** 2025-11-16T07:53:23.700Z
- **Operation:** unknown
- **Node:** 35.164.23.245:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 35.163.144.230:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #15

- **Time:** 2025-11-16T07:53:25.818Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #16

- **Time:** 2025-11-16T07:53:25.818Z
- **Operation:** unknown
- **Node:** 35.163.144.230:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 44.240.98.102:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #17

- **Time:** 2025-11-16T07:53:28.039Z
- **Operation:** getBlockByHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #18

- **Time:** 2025-11-16T07:53:28.039Z
- **Operation:** unknown
- **Node:** 44.240.98.102:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 54.201.32.131:1443
- **Outcome:** FAILOVER_EXECUTED

### Failure #19

- **Time:** 2025-11-16T07:53:31.407Z
- **Operation:** getBestBlockHeight
- **Node:** core
- **Type:** RETRY
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** RETRY
- **Retry Attempt:** 1
- **Retry Delay:** 1000ms
- **Outcome:** PENDING

### Failure #20

- **Time:** 2025-11-16T07:53:31.407Z
- **Operation:** unknown
- **Node:** 54.201.32.131:1443
- **Type:** NODE_FAILURE
- **Error:** Max retries reached: read ECONNRESET
- **Resilience Action:** FAILOVER
- **Failover To:** 52.33.28.47:1443
- **Outcome:** FAILOVER_EXECUTED

*... and 46 more failures*

## Recommendations

✅ **Excellent Performance**

The resilient DAPI client is functioning optimally. No immediate action required.

- **Many nodes blacklisted (22):** Review node pool quality. Consider removing persistently failing nodes from the seed list.

### Next Steps

1. Review failure details for patterns
2. Monitor node performance over time
3. Adjust timeout and retry configurations if needed
4. Run extended stability tests (1+ hour) for production readiness

