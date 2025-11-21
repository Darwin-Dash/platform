# Testnet Resilience Validation Report

Generated: 2025-11-15T08:55:26.310Z

---

## Executive Summary

**Overall Grade:** 🟢 Excellent

This report documents 3988 operations executed over 30m 0s against Dash testnet DAPI nodes. The resilient DAPI client achieved an excellent 100.00% success rate, demonstrating robust handling of network failures and node unavailability.

**Key Findings:**

- Executed 3988 total operations
- Recovered from 0 failures via retry/failover
- Average recovery time: 0ms
- Blacklisted 0 underperforming nodes


## Test Run Details

| Metric | Value |
|--------|-------|
| Start Time | 2025-11-15T08:25:26.294Z |
| Duration | 30m 0s |
| Total Operations | 3988 |
| Successful Operations | 3988 |
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
| getBestBlockHeight | 288ms | 308ms | 300ms | 307ms | 887ms | 963ms | 3456 |
| getBlockByHeight | 290ms | 309ms | 300ms | 307ms | 891ms | 912ms | 532 |

## Memory Usage

| Metric | Value |
|--------|-------|
| Initial Heap | 73.37 MB |
| Final Heap | 110.14 MB |
| Peak Heap | 110.14 MB |
| Memory Growth | 50.10% |

⚠️ Significant memory growth detected (50.10%). Monitor for leaks.

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

