#!/usr/bin/env node

/**
 * Testnet Seed Health Checker
 *
 * Checks the health of all testnet seeds from network configuration.
 * Tests DNS resolution, TCP connectivity, and latency.
 *
 * Usage:
 *   node scripts/check-testnet-health.js [--verbose] [--json]
 *   node scripts/check-testnet-health.js --verbose
 *   node scripts/check-testnet-health.js --json > report.json
 */

const dns = require('dns').promises;
const net = require('net');

// Parse arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const jsonOutput = args.includes('--json');

// Network configuration (matches DAPI client)
const TESTNET_SEEDS = [
  'seed-1.testnet.networks.dash.org:1443',
  'seed-2.testnet.networks.dash.org:1443',
  'seed-3.testnet.networks.dash.org:1443',
  'seed-4.testnet.networks.dash.org:1443',
  'seed-5.testnet.networks.dash.org:1443',
  'seed-1.pshenmic.dev:1443',
];

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, level = 'info') {
  if (jsonOutput) return; // No logging in JSON mode

  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  let prefix = '';

  switch (level) {
    case 'info':
      prefix = `${colors.blue}[INFO]${colors.reset}`;
      break;
    case 'success':
      prefix = `${colors.green}[✓]${colors.reset}`;
      break;
    case 'error':
      prefix = `${colors.red}[✗]${colors.reset}`;
      break;
    case 'warn':
      prefix = `${colors.yellow}[!]${colors.reset}`;
      break;
    case 'debug':
      if (!verbose) return;
      prefix = `${colors.dim}[DEBUG]${colors.reset}`;
      break;
  }

  console.log(`${prefix} ${message}`);
}

function section(title) {
  if (jsonOutput) return;
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}\n`);
}

function isIPAddress(host) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(host)) {
    return false;
  }
  const parts = host.split('.');
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

async function resolveDNS(hostname) {
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

async function testTCPConnectivity(hostname, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = net.createConnection(port, hostname);

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, latency });
    });

    socket.once('error', (error) => {
      socket.destroy();
      resolve({ success: false, error: error.message });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    });
  });
}

async function checkSeedHealth(seed) {
  const [hostname, portStr] = seed.split(':');
  const port = parseInt(portStr || '1443', 10);
  const startTime = Date.now();

  // Step 1: DNS Resolution
  let resolvedIPs = [];
  let dnsTime = 0;
  let dnsError = null;

  if (!isIPAddress(hostname)) {
    const dnsStart = Date.now();
    try {
      resolvedIPs = await resolveDNS(hostname);
      dnsTime = Date.now() - dnsStart;
      if (verbose) {
        log(`DNS: ${hostname} → ${resolvedIPs.join(', ')} (${dnsTime}ms)`, 'debug');
      }
    } catch (error) {
      dnsError = error.message;
      dnsTime = Date.now() - dnsStart;
      if (verbose) {
        log(`DNS: ${hostname} → FAILED (${error.message})`, 'debug');
      }
    }
  } else {
    resolvedIPs = [hostname];
  }

  // Step 2: TCP Connectivity
  const connectTarget = resolvedIPs[0] || hostname;
  const tcpResult = await testTCPConnectivity(connectTarget, port);

  const totalTime = Date.now() - startTime;

  return {
    hostname: seed,
    port,
    isIP: isIPAddress(hostname),
    resolvedIPs,
    dnsTime,
    dnsError,
    reachable: tcpResult.success,
    latency: tcpResult.success ? tcpResult.latency : -1,
    tcpError: tcpResult.success ? null : tcpResult.error,
    totalTime,
  };
}

async function main() {
  const startTime = Date.now();

  if (!jsonOutput) {
    section('Testnet Seed Health Checker');
    log(`Checking ${TESTNET_SEEDS.length} testnet seeds...`);
    log(`Verbose: ${verbose ? 'ON' : 'OFF'}`);
    log(`Started: ${new Date().toISOString()}`);
  }

  // Check all seeds in parallel
  const results = await Promise.all(
    TESTNET_SEEDS.map((seed) => checkSeedHealth(seed))
  );

  const totalTime = Date.now() - startTime;

  // Calculate statistics
  const healthy = results.filter((r) => r.reachable).length;
  const unhealthy = results.filter((r) => !r.reachable).length;
  const avgLatency = results
    .filter((r) => r.reachable)
    .reduce((sum, r) => sum + r.latency, 0) / (healthy || 1);
  const avgDNSTime = results
    .filter((r) => !r.isIP && r.dnsTime > 0)
    .reduce((sum, r) => sum + r.dnsTime, 0) / results.filter((r) => !r.isIP).length;

  // JSON output mode
  if (jsonOutput) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      totalSeeds: TESTNET_SEEDS.length,
      healthy,
      unhealthy,
      healthPercentage: Math.round((healthy / TESTNET_SEEDS.length) * 100),
      avgLatency: Math.round(avgLatency),
      avgDNSTime: Math.round(avgDNSTime),
      totalCheckTime: totalTime,
      results,
    }, null, 2));
    return;
  }

  // Human-readable output
  section('Health Check Results');

  // Overall statistics
  log(`Total Seeds: ${TESTNET_SEEDS.length}`);
  log(`Healthy: ${healthy} (${Math.round((healthy / TESTNET_SEEDS.length) * 100)}%)`, healthy > 0 ? 'success' : 'error');
  log(`Unhealthy: ${unhealthy}`, unhealthy > 0 ? 'warn' : 'info');
  log(`Average Latency: ${Math.round(avgLatency)}ms`);
  log(`Average DNS Time: ${Math.round(avgDNSTime)}ms`);
  log(`Total Check Time: ${totalTime}ms`);

  // Healthy seeds
  const healthySeeds = results.filter((r) => r.reachable).sort((a, b) => a.latency - b.latency);

  if (healthySeeds.length > 0) {
    section('Healthy Seeds (sorted by latency)');

    healthySeeds.forEach((result, idx) => {
      const num = `${idx + 1}.`.padEnd(4);
      const hostname = result.hostname.padEnd(50);
      const dnsInfo = result.resolvedIPs.length > 0 ? `[${result.resolvedIPs.join(', ')}]` : '';

      console.log(`${colors.green}${num}${colors.reset} ${hostname}`);
      console.log(`     ${colors.dim}DNS: ${dnsInfo || 'N/A (already IP)'}${colors.reset}`);
      console.log(`     ${colors.dim}TCP: Connected in ${result.latency}ms${colors.reset}`);
      console.log(`     ${colors.green}Status: HEALTHY${colors.reset}`);

      if (verbose) {
        console.log(`     ${colors.dim}DNS Time: ${result.dnsTime}ms${colors.reset}`);
        console.log(`     ${colors.dim}Total Time: ${result.totalTime}ms${colors.reset}`);
      }

      console.log('');
    });
  }

  // Unhealthy seeds
  const unhealthySeeds = results.filter((r) => !r.reachable);

  if (unhealthySeeds.length > 0) {
    section('Unhealthy Seeds');

    unhealthySeeds.forEach((result, idx) => {
      const num = `${idx + 1}.`.padEnd(4);
      const hostname = result.hostname.padEnd(50);
      const dnsInfo = result.resolvedIPs.length > 0 ? `[${result.resolvedIPs.join(', ')}]` : '';

      console.log(`${colors.red}${num}${colors.reset} ${hostname}`);

      if (result.resolvedIPs.length > 0) {
        console.log(`     ${colors.dim}DNS: ${dnsInfo} (${result.dnsTime}ms)${colors.reset}`);
      } else if (result.dnsError) {
        console.log(`     ${colors.red}DNS: FAILED - ${result.dnsError}${colors.reset}`);
      } else {
        console.log(`     ${colors.dim}DNS: N/A (IP address)${colors.reset}`);
      }

      if (result.tcpError) {
        console.log(`     ${colors.red}TCP: ${result.tcpError}${colors.reset}`);
      }

      console.log(`     ${colors.red}Status: UNHEALTHY${colors.reset}`);
      console.log('');
    });
  }

  // Summary and recommendations
  section('Summary & Recommendations');

  if (healthy === 0) {
    log('⚠️  All seeds are unhealthy!', 'error');
    log('Recommendations:', 'warn');
    log('  1. Check internet connection');
    log('  2. Try again later (seeds may be temporarily down)');
    log('  3. Report to Dash Platform team if persistent');
  } else if (unhealthy > 0) {
    log(`✓ ${healthy}/${TESTNET_SEEDS.length} seeds are healthy`, 'success');
    log('Recommendations:', 'info');
    log('  1. Consider removing unhealthy seeds from networkConfigs.js');
    log('  2. Monitor unhealthy seeds for recovery');
    log(`  3. ${healthy} healthy seeds is sufficient for redundancy`);
  } else {
    log('✓ All seeds are healthy!', 'success');
    log('No action needed.', 'info');
  }

  // Configuration suggestions
  if (unhealthy > TESTNET_SEEDS.length / 2) {
    log('', 'warn');
    log('⚠️  More than 50% of seeds are unhealthy', 'warn');
    log('Suggested configuration update:', 'warn');
    log('');
    log('File: packages/js-dapi-client/lib/networkConfigs.js', 'info');
    log('');
    log('testnet: {', 'dim');
    log('  seeds: [', 'dim');
    healthySeeds.forEach((r) => {
      log(`    '${r.hostname}',  // ${r.latency}ms`, 'dim');
    });
    log('  ],', 'dim');
    log('}', 'dim');
  }

  console.log('');
  log(`Health check completed in ${totalTime}ms`, 'info');
  log(`Timestamp: ${new Date().toISOString()}`, 'dim');
}

// Run
main().catch((error) => {
  if (!jsonOutput) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
    if (verbose) {
      console.error(error.stack);
    }
  } else {
    console.log(JSON.stringify({
      error: error.message,
      stack: verbose ? error.stack : undefined,
    }, null, 2));
  }
  process.exit(1);
});
