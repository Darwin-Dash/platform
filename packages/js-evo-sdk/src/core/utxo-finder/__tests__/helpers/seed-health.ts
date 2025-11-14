/**
 * Seed Node Health Checking
 *
 * Utilities for verifying the health of testnet seed nodes.
 * Tests connectivity, latency, and responsiveness.
 */

import { promises as dns } from 'dns';
import { createConnection } from 'net';

/**
 * Health status of a seed node
 */
export interface SeedHealth {
  /** Seed hostname or IP */
  hostname: string;

  /** Port number */
  port: number;

  /** DNS resolution result (if hostname) */
  resolvedIPs: string[];

  /** Whether the seed is reachable */
  reachable: boolean;

  /** Latency in milliseconds to connect */
  latency: number;

  /** Timestamp of last check */
  lastChecked: Date;

  /** Error message if unreachable */
  error?: string;

  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Parse seed address into hostname and port
 *
 * @param seed Seed address (host:port format)
 * @returns {hostname, port}
 */
function parseSeedAddress(seed: string): { hostname: string; port: number } {
  const [hostname, portStr] = seed.split(':');
  const port = parseInt(portStr || '1443', 10);

  return { hostname: hostname || seed, port };
}

/**
 * Check if string is an IP address
 *
 * @param host Hostname or IP to check
 * @returns true if IP address, false if hostname
 */
function isIPAddress(host: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

  if (!ipv4Regex.test(host)) {
    return false;
  }

  // Validate each octet is 0-255
  const parts = host.split('.');
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Resolve DNS hostname to IP addresses
 *
 * @param hostname Hostname to resolve
 * @returns Array of resolved IP addresses
 */
async function resolveDNS(hostname: string): Promise<string[]> {
  // Skip DNS if already an IP
  if (isIPAddress(hostname)) {
    return [hostname];
  }

  try {
    const addresses = await dns.resolve4(hostname);
    return addresses;
  } catch (error) {
    return [];
  }
}

/**
 * Test TCP connectivity to a host:port
 *
 * @param hostname Hostname or IP to connect to
 * @param port Port number
 * @param timeoutMs Connection timeout in milliseconds
 * @returns Latency in milliseconds if successful, -1 if failed
 */
async function testTCPConnectivity(
  hostname: string,
  port: number,
  timeoutMs: number = 5000
): Promise<number> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = createConnection(port, hostname);

    // Set timeout
    socket.setTimeout(timeoutMs);

    // Success handler
    const onConnect = () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve(latency);
    };

    // Error handlers
    const onError = () => {
      socket.destroy();
      resolve(-1);
    };

    const onTimeout = () => {
      socket.destroy();
      resolve(-1);
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

/**
 * Check health of a single seed node
 *
 * @param seed Seed address (host:port)
 * @param options Optional configuration
 * @returns Health status
 */
export async function checkSeedHealth(
  seed: string,
  options: {
    timeoutMs?: number;
    resolveDNS?: boolean;
  } = {}
): Promise<SeedHealth> {
  const { timeoutMs = 5000, resolveDNS: shouldResolveDNS = true } = options;

  const { hostname, port } = parseSeedAddress(seed);
  const startTime = Date.now();

  let resolvedIPs: string[] = [];

  // Step 1: Resolve DNS if hostname
  if (shouldResolveDNS && !isIPAddress(hostname)) {
    try {
      resolvedIPs = await resolveDNS(hostname);
    } catch (error) {
      // Continue anyway, will try to connect
    }
  }

  // Step 2: Test TCP connectivity
  const latency = await testTCPConnectivity(hostname, port, timeoutMs);
  const reachable = latency >= 0;

  return {
    hostname: seed,
    port,
    resolvedIPs,
    reachable,
    latency: reachable ? latency : -1,
    lastChecked: new Date(),
    error: reachable ? undefined : 'Connection failed',
    details: {
      isIP: isIPAddress(hostname),
      connectTarget: hostname,
      totalTime: Date.now() - startTime,
    },
  };
}

/**
 * Check health of multiple seed nodes in parallel
 *
 * @param seeds Array of seed addresses
 * @param options Optional configuration
 * @returns Array of health statuses
 */
export async function checkSeedsHealth(
  seeds: string[],
  options: {
    timeoutMs?: number;
    resolveDNS?: boolean;
    concurrency?: number;
  } = {}
): Promise<SeedHealth[]> {
  const { concurrency = 5 } = options;

  const results: SeedHealth[] = [];
  const queue = [...seeds];
  const inProgress = new Set<Promise<SeedHealth>>();

  while (queue.length > 0 || inProgress.size > 0) {
    // Fill up to concurrency limit
    while (inProgress.size < concurrency && queue.length > 0) {
      const seed = queue.shift()!;
      const promise = checkSeedHealth(seed, options);

      promise.then((result) => {
        results.push(result);
        inProgress.delete(promise);
      });

      inProgress.add(promise);
    }

    // Wait for at least one to complete
    if (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  }

  return results;
}

/**
 * Get healthy seeds (reachable nodes only)
 *
 * @param seeds Array of seed addresses
 * @param options Optional configuration
 * @returns Array of healthy seeds sorted by latency (fastest first)
 */
export async function getHealthySeeds(
  seeds: string[],
  options: {
    timeoutMs?: number;
    resolveDNS?: boolean;
    concurrency?: number;
  } = {}
): Promise<string[]> {
  const healthStatuses = await checkSeedsHealth(seeds, options);

  return healthStatuses
    .filter((s) => s.reachable)
    .sort((a, b) => a.latency - b.latency)
    .map((s) => s.hostname);
}

/**
 * Get health report for display
 *
 * @param seeds Array of seed addresses
 * @param options Optional configuration
 * @returns Formatted health report
 */
export async function getHealthReport(
  seeds: string[],
  options: {
    timeoutMs?: number;
    resolveDNS?: boolean;
    concurrency?: number;
  } = {}
): Promise<string> {
  const startTime = Date.now();
  const healthStatuses = await checkSeedsHealth(seeds, options);
  const totalTime = Date.now() - startTime;

  const healthy = healthStatuses.filter((s) => s.reachable).length;
  const unhealthy = healthStatuses.filter((s) => !s.reachable).length;

  let report = '';
  report += `Seed Health Report\n`;
  report += `${'='.repeat(60)}\n`;
  report += `Total Seeds: ${healthStatuses.length}\n`;
  report += `Healthy: ${healthy} (${Math.round((healthy / healthStatuses.length) * 100)}%)\n`;
  report += `Unhealthy: ${unhealthy}\n`;
  report += `Total Check Time: ${totalTime}ms\n`;
  report += `\n`;

  // Healthy seeds
  const healthySeeds = healthStatuses.filter((s) => s.reachable).sort((a, b) => a.latency - b.latency);

  if (healthySeeds.length > 0) {
    report += `Healthy Seeds (sorted by latency):\n`;
    report += `${'-'.repeat(60)}\n`;

    healthySeeds.forEach((s, idx) => {
      const dnsInfo = s.resolvedIPs.length > 0 ? ` [${s.resolvedIPs.join(', ')}]` : '';
      report += `${idx + 1}. ${s.hostname}${dnsInfo}\n`;
      report += `   Latency: ${s.latency}ms\n`;

      if (s.details) {
        report += `   Details: ${JSON.stringify(s.details)}\n`;
      }
    });
    report += `\n`;
  }

  // Unhealthy seeds
  const unhealthySeeds = healthStatuses.filter((s) => !s.reachable);

  if (unhealthySeeds.length > 0) {
    report += `Unhealthy Seeds:\n`;
    report += `${'-'.repeat(60)}\n`;

    unhealthySeeds.forEach((s, idx) => {
      const dnsInfo = s.resolvedIPs.length > 0 ? ` [${s.resolvedIPs.join(', ')}]` : '';
      report += `${idx + 1}. ${s.hostname}${dnsInfo}\n`;
      report += `   Error: ${s.error || 'Unknown'}\n`;

      if (s.details) {
        report += `   Details: ${JSON.stringify(s.details)}\n`;
      }
    });
  }

  return report;
}

/**
 * Watch seed health continuously
 *
 * Periodically checks seed health and reports changes.
 *
 * @param seeds Array of seed addresses
 * @param options Configuration
 */
export class SeedHealthMonitor {
  private seeds: string[];
  private lastStatus: Map<string, boolean> = new Map();
  private lastLatency: Map<string, number> = new Map();
  private isRunning: boolean = false;

  constructor(
    seeds: string[],
    private options: {
      timeoutMs?: number;
      resolveDNS?: boolean;
      concurrency?: number;
      intervalMs?: number;
    } = {}
  ) {
    this.seeds = seeds;
  }

  /**
   * Start continuous monitoring
   */
  async start(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      const healthStatuses = await checkSeedsHealth(this.seeds, this.options);

      // Check for changes
      for (const status of healthStatuses) {
        const wasHealthy = this.lastStatus.get(status.hostname);
        const wasLatency = this.lastLatency.get(status.hostname);

        // Health changed
        if (wasHealthy !== undefined && wasHealthy !== status.reachable) {
          const change = status.reachable ? '✓ RECOVERED' : '✗ FAILED';
          console.log(`[SeedMonitor] ${status.hostname} ${change}`);
        }

        // Latency changed significantly (>50%)
        if (
          wasLatency !== undefined &&
          Math.abs(status.latency - wasLatency) > wasLatency * 0.5 &&
          status.reachable
        ) {
          console.log(
            `[SeedMonitor] ${status.hostname} latency changed: ${wasLatency}ms → ${status.latency}ms`
          );
        }

        // Update tracking
        this.lastStatus.set(status.hostname, status.reachable);
        this.lastLatency.set(status.hostname, status.latency);
      }

      // Wait before next check
      const intervalMs = this.options.intervalMs || 60000; // Default 1 minute
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Get current status
   */
  getStatus(): {
    healthy: string[];
    unhealthy: string[];
  } {
    const healthy: string[] = [];
    const unhealthy: string[] = [];

    for (const [seed, isHealthy] of this.lastStatus) {
      if (isHealthy) {
        healthy.push(seed);
      } else {
        unhealthy.push(seed);
      }
    }

    return { healthy, unhealthy };
  }
}
