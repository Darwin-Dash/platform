/**
 * Markdown Report Generator
 *
 * Generates human-readable failure and resilience reports in Markdown format.
 */

import { failureLogger, type FailureRecord, type ResilienceStatistics, type TestRunSummary } from './failure-logger.js';
import { metricsCollector, type LatencyMetrics } from './metrics-collector.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ReportOptions {
  outputDir?: string;
  includeLatencies?: boolean;
  includeMemory?: boolean;
  includeFailureDetails?: boolean;
}

/**
 * Generate comprehensive Markdown report
 */
export function generateReport(options: ReportOptions = {}): string {
  const {
    outputDir = './test-results',
    includeLatencies = true,
    includeMemory = true,
    includeFailureDetails = true,
  } = options;

  const summary = failureLogger.getSummary();
  const stats = failureLogger.getStatistics();
  const failures = failureLogger.getFailures();
  const latencies = metricsCollector.getAllLatencyMetrics();
  const eventCounts = metricsCollector.getEventCounts();
  const memorySummary = metricsCollector.getMemorySummary();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `testnet-resilience-report-${timestamp}.md`;

  let report = '';

  // Header
  report += `# Testnet Resilience Validation Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;

  // Executive Summary
  report += `## Executive Summary\n\n`;
  report += generateExecutiveSummary(summary, stats);

  // Test Run Details
  report += `\n## Test Run Details\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Start Time | ${summary.timestamp} |\n`;
  report += `| Duration | ${summary.duration} |\n`;
  report += `| Total Operations | ${summary.totalOperations} |\n`;
  report += `| Successful Operations | ${summary.successfulOperations} |\n`;
  report += `| Failed Operations | ${summary.failedOperations} |\n`;
  report += `| Success Rate | ${((summary.successfulOperations / summary.totalOperations) * 100).toFixed(2)}% |\n`;
  report += `\n`;

  // Resilience Statistics
  report += `## Resilience Statistics\n\n`;
  report += `### Recovery Actions\n\n`;
  report += `| Action | Count |\n`;
  report += `|--------|-------|\n`;
  report += `| Retries | ${stats.totalRetries} |\n`;
  report += `| Failovers | ${stats.totalFailovers} |\n`;
  report += `| Degradations | ${stats.totalDegradations} |\n`;
  report += `| Total Recovery Actions | ${stats.totalRetries + stats.totalFailovers + stats.totalDegradations} |\n`;
  report += `\n`;

  report += `### Timing Metrics\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Average Retry Delay | ${stats.averageRetryDelay} |\n`;
  report += `| Average Recovery Time | ${stats.averageRecoveryTime} |\n`;
  report += `| Nodes Blacklisted | ${stats.nodesBlacklisted} |\n`;
  report += `\n`;

  // Failure Breakdown
  report += `### Failure Breakdown by Type\n\n`;
  if (Object.keys(stats.failuresByType).length > 0) {
    report += `| Failure Type | Count | Percentage |\n`;
    report += `|--------------|-------|------------|\n`;
    const totalFailures = Object.values(stats.failuresByType).reduce((a, b) => a + b, 0);
    for (const [type, count] of Object.entries(stats.failuresByType)) {
      const percentage = ((count / totalFailures) * 100).toFixed(1);
      report += `| ${type} | ${count} | ${percentage}% |\n`;
    }
  } else {
    report += `*No failures recorded*\n`;
  }
  report += `\n`;

  // Node Performance
  report += `### Node Performance\n\n`;
  if (Object.keys(stats.failuresByNode).length > 0) {
    report += `| Node | Failures |\n`;
    report += `|------|----------|\n`;
    const sortedNodes = Object.entries(stats.failuresByNode)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Top 10 failing nodes
    for (const [node, count] of sortedNodes) {
      const nodeLabel = node.substring(0, 40) + (node.length > 40 ? '...' : '');
      report += `| ${nodeLabel} | ${count} |\n`;
    }
  } else {
    report += `*No node failures recorded*\n`;
  }
  report += `\n`;

  // Operation Latencies
  if (includeLatencies && latencies.size > 0) {
    report += `## Operation Latencies\n\n`;
    report += generateLatencyTable(latencies);
  }

  // Memory Usage
  if (includeMemory && memorySummary.initial) {
    report += `## Memory Usage\n\n`;
    report += generateMemorySummary(memorySummary);
  }

  // Event Counts
  report += `## Event Statistics\n\n`;
  report += `| Event Type | Count |\n`;
  report += `|------------|-------|\n`;
  report += `| Retry Events | ${eventCounts.retries} |\n`;
  report += `| Failover Events | ${eventCounts.failovers} |\n`;
  report += `| Degradation Events | ${eventCounts.degradations} |\n`;
  report += `| Restoration Events | ${eventCounts.restorations} |\n`;
  report += `| Reconnection Events | ${eventCounts.reconnections} |\n`;
  report += `\n`;

  // Failure Details
  if (includeFailureDetails && failures.length > 0) {
    report += `## Failure Details\n\n`;
    report += generateFailureDetails(failures);
  }

  // Recommendations
  report += `## Recommendations\n\n`;
  report += generateRecommendations(summary, stats);

  // Save report
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, report);

  console.log(`\n✅ Report generated: ${filepath}`);

  return filepath;
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(summary: TestRunSummary, stats: ResilienceStatistics): string {
  let text = '';

  const successRate = (summary.successfulOperations / summary.totalOperations) * 100;
  const grade = successRate >= 95 ? '🟢 Excellent' : successRate >= 90 ? '🟡 Good' : '🔴 Needs Improvement';

  text += `**Overall Grade:** ${grade}\n\n`;
  text += `This report documents ${summary.totalOperations} operations executed over ${summary.duration} `;
  text += `against Dash testnet DAPI nodes. `;

  if (successRate >= 95) {
    text += `The resilient DAPI client achieved an excellent ${successRate.toFixed(2)}% success rate, `;
    text += `demonstrating robust handling of network failures and node unavailability.\n\n`;
  } else if (successRate >= 90) {
    text += `The resilient DAPI client achieved a ${successRate.toFixed(2)}% success rate, `;
    text += `successfully recovering from most transient failures.\n\n`;
  } else {
    text += `The success rate of ${successRate.toFixed(2)}% indicates opportunities for improvement `;
    text += `in failure recovery mechanisms.\n\n`;
  }

  text += `**Key Findings:**\n\n`;
  text += `- Executed ${summary.totalOperations} total operations\n`;
  text += `- Recovered from ${stats.totalRetries + stats.totalFailovers} failures via retry/failover\n`;
  text += `- Average recovery time: ${stats.averageRecoveryTime}\n`;
  text += `- Blacklisted ${stats.nodesBlacklisted} underperforming nodes\n`;

  if (stats.totalDegradations > 0) {
    text += `- Handled ${stats.totalDegradations} graceful degradation scenarios\n`;
  }

  text += `\n`;

  return text;
}

/**
 * Generate latency table
 */
function generateLatencyTable(latencies: Map<string, LatencyMetrics>): string {
  let text = '';

  text += `| Operation | Min | Avg | Median | P95 | P99 | Max | Samples |\n`;
  text += `|-----------|-----|-----|--------|-----|-----|-----|----------|\n`;

  for (const [operation, metrics] of latencies) {
    text += `| ${operation} | ${metrics.min}ms | ${metrics.avg}ms | ${metrics.median}ms | `;
    text += `${metrics.p95}ms | ${metrics.p99}ms | ${metrics.max}ms | ${metrics.samples} |\n`;
  }

  text += `\n`;

  return text;
}

/**
 * Generate memory summary
 */
function generateMemorySummary(summary: ReturnType<typeof metricsCollector.getMemorySummary>): string {
  let text = '';

  if (!summary.initial) {
    text += `*No memory data available*\n\n`;
    return text;
  }

  const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

  text += `| Metric | Value |\n`;
  text += `|--------|-------|\n`;
  text += `| Initial Heap | ${formatBytes(summary.initial.heapUsed)} |\n`;
  text += `| Final Heap | ${formatBytes(summary.final!.heapUsed)} |\n`;
  text += `| Peak Heap | ${formatBytes(summary.peak!.heapUsed)} |\n`;
  text += `| Memory Growth | ${summary.growth.toFixed(2)}% |\n`;
  text += `\n`;

  if (Math.abs(summary.growth) < 5) {
    text += `✅ Memory usage is stable (growth < 5%).\n\n`;
  } else if (summary.growth > 20) {
    text += `⚠️ Significant memory growth detected (${summary.growth.toFixed(2)}%). Monitor for leaks.\n\n`;
  }

  return text;
}

/**
 * Generate failure details
 */
function generateFailureDetails(failures: FailureRecord[]): string {
  let text = '';

  // Show first 20 failures
  const displayFailures = failures.slice(0, 20);

  text += `Showing ${displayFailures.length} of ${failures.length} total failures:\n\n`;

  for (const [index, failure] of displayFailures.entries()) {
    text += `### Failure #${index + 1}\n\n`;
    text += `- **Time:** ${failure.timestamp}\n`;
    text += `- **Operation:** ${failure.operation}\n`;
    text += `- **Node:** ${failure.node.substring(0, 50)}${failure.node.length > 50 ? '...' : ''}\n`;
    text += `- **Type:** ${failure.failureType}\n`;
    text += `- **Error:** ${failure.errorMessage}\n`;
    text += `- **Resilience Action:** ${failure.resilienceAction}\n`;

    if (failure.retryAttempt) {
      text += `- **Retry Attempt:** ${failure.retryAttempt}\n`;
      text += `- **Retry Delay:** ${failure.retryDelay}\n`;
    }

    if (failure.newNode) {
      text += `- **Failover To:** ${failure.newNode.substring(0, 50)}${failure.newNode.length > 50 ? '...' : ''}\n`;
    }

    text += `- **Outcome:** ${failure.outcome}\n`;

    if (failure.recoveryTime) {
      text += `- **Recovery Time:** ${failure.recoveryTime}\n`;
    }

    text += `\n`;
  }

  if (failures.length > 20) {
    text += `*... and ${failures.length - 20} more failures*\n\n`;
  }

  return text;
}

/**
 * Generate recommendations
 */
function generateRecommendations(summary: TestRunSummary, stats: ResilienceStatistics): string {
  let text = '';

  const successRate = (summary.successfulOperations / summary.totalOperations) * 100;

  if (successRate >= 95) {
    text += `✅ **Excellent Performance**\n\n`;
    text += `The resilient DAPI client is functioning optimally. No immediate action required.\n\n`;
  } else if (successRate >= 90) {
    text += `🟡 **Good Performance with Minor Issues**\n\n`;
    text += `Consider the following improvements:\n\n`;
  } else {
    text += `🔴 **Performance Needs Improvement**\n\n`;
    text += `Action items:\n\n`;
  }

  // Node-specific recommendations
  if (stats.nodesBlacklisted > 5) {
    text += `- **Many nodes blacklisted (${stats.nodesBlacklisted}):** Review node pool quality. `;
    text += `Consider removing persistently failing nodes from the seed list.\n\n`;
  }

  // Retry recommendations
  if (stats.totalRetries > summary.totalOperations * 0.5) {
    text += `- **High retry rate:** ${stats.totalRetries} retries for ${summary.totalOperations} operations. `;
    text += `Investigate network stability or consider increasing initial timeout values.\n\n`;
  }

  // Degradation recommendations
  if (stats.totalDegradations > 0) {
    text += `- **Platform degradation events:** ${stats.totalDegradations} platform failures detected. `;
    text += `Ensure platform services are operational on testnet nodes.\n\n`;
  }

  text += `### Next Steps\n\n`;
  text += `1. Review failure details for patterns\n`;
  text += `2. Monitor node performance over time\n`;
  text += `3. Adjust timeout and retry configurations if needed\n`;
  text += `4. Run extended stability tests (1+ hour) for production readiness\n\n`;

  return text;
}
