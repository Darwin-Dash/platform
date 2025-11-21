# Testnet Resilience Validation Report

Generated: 2025-11-14T20:13:50.182Z

---

## Executive Summary

**Overall Grade:** 🟢 Excellent

This report documents 107 operations executed over 1m 0s against Dash testnet DAPI nodes. The resilient DAPI client achieved an excellent 100.00% success rate, demonstrating robust handling of network failures and node unavailability.

**Key Findings:**

- Executed 107 total operations
- Recovered from 0 failures via retry/failover
- Average recovery time: 0ms
- Blacklisted 0 underperforming nodes


## Test Run Details

| Metric | Value |
|--------|-------|
| Start Time | 2025-11-14T20:12:50.173Z |
| Duration | 1m 0s |
| Total Operations | 107 |
| Successful Operations | 107 |
| Failed Operations | 0 |
| Success Rate | 100.00% |

## Resilience Statistics

### Recovery Actions

| Action | Count |
|--------|-------|
| Retries | 0 |
| Failovers | 0 |
| Degradations | 0 |
| Total Recovery Actions | 0 |

### Timing Metrics

| Metric | Value |
|--------|-------|
| Average Retry Delay | 0ms |
| Average Recovery Time | 0ms |
| Nodes Blacklisted | 0 |

### Failure Breakdown by Type

*No failures recorded*

### Node Performance

*No node failures recorded*

## Operation Latencies

| Operation | Min | Avg | Median | P95 | P99 | Max | Samples |
|-----------|-----|-----|--------|-----|-----|-----|----------|
| getBestBlockHeight | 291ms | 420ms | 300ms | 906ms | 915ms | 915ms | 93 |
| getBlockByHeight | 293ms | 388ms | 302ms | 916ms | 916ms | 916ms | 14 |

## Memory Usage

| Metric | Value |
|--------|-------|
| Initial Heap | 73.53 MB |
| Final Heap | 67.52 MB |
| Peak Heap | 73.53 MB |
| Memory Growth | -8.16% |

## Event Statistics

| Event Type | Count |
|------------|-------|
| Retry Events | 0 |
| Failover Events | 0 |
| Degradation Events | 0 |
| Restoration Events | 0 |
| Reconnection Events | 0 |

## Recommendations

✅ **Excellent Performance**

The resilient DAPI client is functioning optimally. No immediate action required.

### Next Steps

1. Review failure details for patterns
2. Monitor node performance over time
3. Adjust timeout and retry configurations if needed
4. Run extended stability tests (1+ hour) for production readiness

