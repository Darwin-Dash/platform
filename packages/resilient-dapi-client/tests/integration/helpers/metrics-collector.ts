/**
 * Metrics Collector for Performance Analysis
 *
 * Tracks latencies, event counts, and resource usage during testing.
 */

export interface LatencyMetrics {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
  p99: number;
  samples: number;
}

export interface EventCounts {
  retries: number;
  failovers: number;
  degradations: number;
  restorations: number;
  reconnections: number;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface EventRecord {
  type: string;
  name: string;
  timestamp: number;
}

export interface MetricValue {
  name: string;
  value: number;
  timestamp: number;
}

/**
 * Metrics collector singleton
 */
export class MetricsCollector {
  private latencies: Map<string, number[]> = new Map();
  private eventCounts: EventCounts = {
    retries: 0,
    failovers: 0,
    degradations: 0,
    restorations: 0,
    reconnections: 0,
  };
  private memorySnapshots: MemorySnapshot[] = [];
  private memoryIntervalId?: NodeJS.Timeout;
  private events: EventRecord[] = [];
  private metrics: MetricValue[] = [];

  /**
   * Start collecting metrics
   */
  start(): void {
    this.clear();
    this.startMemoryMonitoring();
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    this.stopMemoryMonitoring();
  }

  /**
   * Record operation latency
   */
  recordLatency(operation: string, latencyMs: number): void {
    if (!this.latencies.has(operation)) {
      this.latencies.set(operation, []);
    }
    this.latencies.get(operation)!.push(latencyMs);
  }

  /**
   * Get latency metrics for an operation
   */
  getLatencyMetrics(operation: string): LatencyMetrics | null {
    const samples = this.latencies.get(operation);
    if (!samples || samples.length === 0) {
      return null;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round(sum / sorted.length),
      median: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      samples: sorted.length,
    };
  }

  /**
   * Get all latency metrics
   */
  getAllLatencyMetrics(): Map<string, LatencyMetrics> {
    const result = new Map<string, LatencyMetrics>();
    for (const [operation, _] of this.latencies) {
      const metrics = this.getLatencyMetrics(operation);
      if (metrics) {
        result.set(operation, metrics);
      }
    }
    return result;
  }

  /**
   * Increment event counter
   */
  incrementEvent(event: keyof EventCounts): void {
    this.eventCounts[event]++;
  }

  /**
   * Get event counts
   */
  getEventCounts(): EventCounts {
    return { ...this.eventCounts };
  }

  /**
   * Record an event
   */
  recordEvent(type: string, name: string): void {
    this.events.push({
      type,
      name,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number): void {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all metrics (events and metric values)
   */
  getMetrics(): { events: EventRecord[]; metrics: MetricValue[] } {
    return {
      events: [...this.events],
      metrics: [...this.metrics],
    };
  }

  /**
   * Get memory usage snapshots
   */
  getMemorySnapshots(): MemorySnapshot[] {
    return [...this.memorySnapshots];
  }

  /**
   * Get memory usage summary
   */
  getMemorySummary(): {
    initial: MemorySnapshot | null;
    final: MemorySnapshot | null;
    peak: MemorySnapshot | null;
    growth: number;
  } {
    if (this.memorySnapshots.length === 0) {
      return {
        initial: null,
        final: null,
        peak: null,
        growth: 0,
      };
    }

    const initial = this.memorySnapshots[0];
    const final = this.memorySnapshots[this.memorySnapshots.length - 1];
    const peak = this.memorySnapshots.reduce((max, snap) =>
      snap.heapUsed > max.heapUsed ? snap : max
    );

    const growth = ((final.heapUsed - initial.heapUsed) / initial.heapUsed) * 100;

    return {
      initial,
      final,
      peak,
      growth: Math.round(growth * 100) / 100,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.latencies.clear();
    this.eventCounts = {
      retries: 0,
      failovers: 0,
      degradations: 0,
      restorations: 0,
      reconnections: 0,
    };
    this.memorySnapshots = [];
    this.events = [];
    this.metrics = [];
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Start monitoring memory usage
   */
  private startMemoryMonitoring(): void {
    // Take initial snapshot
    this.captureMemorySnapshot();

    // Capture snapshot every 30 seconds
    this.memoryIntervalId = setInterval(() => {
      this.captureMemorySnapshot();
    }, 30000);
  }

  /**
   * Stop monitoring memory usage
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryIntervalId) {
      clearInterval(this.memoryIntervalId);
      this.memoryIntervalId = undefined;
    }
    // Take final snapshot
    this.captureMemorySnapshot();
  }

  /**
   * Capture current memory usage
   */
  private captureMemorySnapshot(): void {
    const mem = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
    });
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

/**
 * Helper to measure operation latency
 */
export async function measureLatency<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const latency = Date.now() - start;
    metricsCollector.recordLatency(operation, latency);
    return result;
  } catch (error) {
    const latency = Date.now() - start;
    metricsCollector.recordLatency(operation, latency);
    throw error;
  }
}
