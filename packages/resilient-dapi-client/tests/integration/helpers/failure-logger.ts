/**
 * Failure Logger for Testnet Validation Suite
 *
 * Captures all failures, resilience actions, and recovery outcomes
 * during integration testing against real testnet DAPI nodes.
 */

export interface FailureRecord {
  timestamp: string;
  operation: string;
  node: string;
  failureType: 'TIMEOUT' | 'CONNECTION_REFUSED' | 'HTTP_ERROR' | 'PLATFORM_ERROR' | 'INVALID_RESPONSE' | 'UNKNOWN';
  errorMessage: string;
  resilienceAction: 'RETRY' | 'FAILOVER' | 'DEGRADATION' | 'ABORT';
  retryAttempt?: number;
  retryDelay?: string;
  newNode?: string;
  outcome: 'SUCCESS_AFTER_RETRY' | 'SUCCESS_AFTER_FAILOVER' | 'DEGRADED' | 'FAILED';
  recoveryTime?: string;
}

export interface ResilienceStatistics {
  totalRetries: number;
  totalFailovers: number;
  totalDegradations: number;
  averageRetryDelay: string;
  averageRecoveryTime: string;
  nodesBlacklisted: number;
  failuresByType: Record<string, number>;
  failuresByNode: Record<string, number>;
}

export interface TestRunSummary {
  timestamp: string;
  duration: string;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
}

/**
 * Singleton failure logger
 */
export class FailureLogger {
  private failures: FailureRecord[] = [];
  private startTime: number = 0;
  private totalOps: number = 0;
  private successfulOps: number = 0;
  private blacklistedNodes: Set<string> = new Set();

  /**
   * Start a new test run
   */
  startTestRun(): void {
    this.failures = [];
    this.startTime = Date.now();
    this.totalOps = 0;
    this.successfulOps = 0;
    this.blacklistedNodes.clear();
  }

  /**
   * Log a failure event
   */
  logFailure(record: FailureRecord): void {
    this.failures.push(record);
  }

  /**
   * Increment operation counters
   */
  recordOperation(success: boolean): void {
    this.totalOps++;
    if (success) {
      this.successfulOps++;
    }
  }

  /**
   * Track blacklisted node
   */
  recordBlacklistedNode(node: string): void {
    this.blacklistedNodes.add(node);
  }

  /**
   * Get all failure records
   */
  getFailures(): FailureRecord[] {
    return [...this.failures];
  }

  /**
   * Calculate resilience statistics
   */
  getStatistics(): ResilienceStatistics {
    const retries = this.failures.filter(f => f.resilienceAction === 'RETRY');
    const failovers = this.failures.filter(f => f.resilienceAction === 'FAILOVER');
    const degradations = this.failures.filter(f => f.resilienceAction === 'DEGRADATION');

    // Calculate average retry delay
    const retryDelays = retries
      .filter(r => r.retryDelay)
      .map(r => parseInt(r.retryDelay!.replace('ms', '')));
    const avgRetryDelay = retryDelays.length > 0
      ? Math.round(retryDelays.reduce((a, b) => a + b, 0) / retryDelays.length)
      : 0;

    // Calculate average recovery time
    const recoveryTimes = this.failures
      .filter(f => f.recoveryTime)
      .map(f => parseInt(f.recoveryTime!.replace('ms', '')));
    const avgRecoveryTime = recoveryTimes.length > 0
      ? Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length)
      : 0;

    // Count failures by type
    const failuresByType: Record<string, number> = {};
    this.failures.forEach(f => {
      failuresByType[f.failureType] = (failuresByType[f.failureType] || 0) + 1;
    });

    // Count failures by node
    const failuresByNode: Record<string, number> = {};
    this.failures.forEach(f => {
      failuresByNode[f.node] = (failuresByNode[f.node] || 0) + 1;
    });

    return {
      totalRetries: retries.length,
      totalFailovers: failovers.length,
      totalDegradations: degradations.length,
      averageRetryDelay: `${avgRetryDelay}ms`,
      averageRecoveryTime: `${avgRecoveryTime}ms`,
      nodesBlacklisted: this.blacklistedNodes.size,
      failuresByType,
      failuresByNode,
    };
  }

  /**
   * Get test run summary
   */
  getSummary(): TestRunSummary {
    const duration = Date.now() - this.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    return {
      timestamp: new Date(this.startTime).toISOString(),
      duration: `${minutes}m ${seconds}s`,
      totalOperations: this.totalOps,
      successfulOperations: this.successfulOps,
      failedOperations: this.totalOps - this.successfulOps,
    };
  }

  /**
   * Clear all recorded data
   */
  clear(): void {
    this.failures = [];
    this.startTime = 0;
    this.totalOps = 0;
    this.successfulOps = 0;
    this.blacklistedNodes.clear();
  }
}

// Singleton instance
export const failureLogger = new FailureLogger();
