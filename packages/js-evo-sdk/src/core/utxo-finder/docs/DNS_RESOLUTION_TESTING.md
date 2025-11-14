# DNS Resolution Testing Guide

**Purpose**: Understanding and troubleshooting DNS resolution for DAPI connections
**Last Updated**: October 27, 2025

---

## Table of Contents

1. [Why DNS Resolution Matters](#why-dns-resolution-matters)
2. [How It Works](#how-it-works)
3. [TLS Certificate Validation](#tls-certificate-validation)
4. [Testing DNS Resolution](#testing-dns-resolution)
5. [Troubleshooting](#troubleshooting)
6. [Seed Health Checking](#seed-health-checking)

---

## Why DNS Resolution Matters

### The Critical Issue

**DAPI server TLS certificates are registered to IP addresses, NOT to DNS hostnames.**

This means:
- Certificate is valid for: `34.214.48.68` (IP address)
- Seed hostname: `seed-1.testnet.networks.dash.org`
- **Mismatch**: Hostname ≠ IP in certificate
- **Result**: TLS validation fails

### The Solution

DAPIClient automatically resolves hostnames to IP addresses **before** establishing connections:

```
Hostname Input: seed-1.testnet.networks.dash.org
      ↓
DNS Resolution: 34.214.48.68
      ↓
Connection Target: 34.214.48.68 (IP)
      ↓
TLS Certificate: Valid for 34.214.48.68 ✓
      ↓
Connection Success
```

---

## How It Works

### Automatic DNS Resolution

When you create a DAPIClient with seeds:

```typescript
const client = new DAPIClient({
  network: 'testnet',
  // Seeds with hostnames
  seeds: [
    'seed-1.testnet.networks.dash.org:1443',
    'seed-2.testnet.networks.dash.org:1443',
  ]
});
```

**What happens**:

1. **DNS Resolution** (parallel):
   - `seed-1.testnet.networks.dash.org` → `34.214.48.68`
   - `seed-2.testnet.networks.dash.org` → `35.166.18.166`

2. **Connection Setup**:
   - Connects to IPs, not hostnames
   - TLS certificates match IPs
   - Validation succeeds

3. **Caching**:
   - OS-level DNS caching
   - Resolved IPs reused

### Implementation Location

The DNS resolution happens in `@dashevo/dapi-client`:

**Key Files**:
- `packages/js-dapi-client/lib/dapiAddressProvider/resolveDAPIAddress.js`
- `packages/js-dapi-client/lib/dapiAddressProvider/createDAPIAddressProviderFromOptions.js`
- `packages/js-dapi-client/lib/DAPIClient.js`

**Documentation**:
- `packages/js-dapi-client/docs/DNS_RESOLUTION.md` - Complete technical details

---

## TLS Certificate Validation

### Certificate Chain

```
Connection Target: 34.214.48.68 (IP address)
    ↓
Server presents TLS certificate:
  Subject: 34.214.48.68
  Issuer: Certificate Authority
  Valid: 2025-01-01 to 2026-01-01
    ↓
Client validates:
  ✓ Connection target matches certificate subject (34.214.48.68 = 34.214.48.68)
  ✓ Certificate signature valid
  ✓ Certificate not expired
  ✓ Certificate authority trusted
    ↓
TLS Handshake Success
```

### Without DNS Resolution

```
Connection Target: seed-1.testnet.networks.dash.org (hostname)
    ↓
Server presents TLS certificate:
  Subject: 34.214.48.68 (IP address)
    ↓
Client validates:
  ✗ Mismatch: hostname ≠ IP in certificate
    ↓
TLS Validation FAILS
```

### Known Warning (Safe to Ignore)

You may see:
```
(node:12345) [DEP0123] DeprecationWarning: Setting the TLS ServerName
to an IP address is not permitted by RFC 6066. This will be ignored in
a future version.
```

**Why**: Node.js warns about setting SNI to an IP address

**Is it a problem?**: No
- Connection still works correctly
- Certificate validation succeeds
- Will be suppressed in future Node.js versions
- This is expected behavior with current gRPC

---

## Testing DNS Resolution

### Method 1: Use Test Script (Recommended)

The DAPI client package includes a test script:

```bash
cd packages/js-dapi-client
node test-dns-resolution.js testnet --verbose
```

**Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DNS Resolution Test - TESTNET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO] Network: testnet
[INFO] Verbose Mode: ON

Phase 1: Seed Configuration
────────────────────────────
[INFO] Total Seeds: 6
[INFO] Whitelist Entries: 33

Phase 2: DAPI Client Initialization
────────────────────────────────────
[INFO] Creating DAPIClient instance...
[✓] DAPIClient initialized in 15ms

Phase 3: Address Provider Resolution
─────────────────────────────────────
[INFO] Resolving address provider...
[✓] Address provider resolved
[✓] Resolution completed in 245ms

Phase 4: Connection Information
────────────────────────────────
[INFO] Available Addresses: 33
├─ https://34.214.48.68:1443 (IP)
├─ https://35.166.18.166:1443 (IP)
└─ https://35.165.50.126:1443 (IP)

Phase 5: Testing Best Block Height Request
───────────────────────────────────────────
[✓] Successfully retrieved best block height
[INFO] Block Height: 1346789
[INFO] Response Time: 1234ms

Phase 6: DNS Resolution Summary
────────────────────────────────
Seed→IP Resolution Results:
├─ seed-1.testnet.networks.dash.org:1443 → (Resolving...)
├─ seed-2.testnet.networks.dash.org:1443 → (Resolving...)
└─ 34.214.48.68:1443 (Already IP)

Test completed successfully!
```

### Method 2: Manual DNS Testing

```bash
# Test DNS resolution
node -e "
const dns = require('dns').promises;
dns.resolve4('seed-1.testnet.networks.dash.org')
  .then(ips => console.log('Resolved IPs:', ips))
  .catch(err => console.error('DNS failed:', err.message));
"

# Test multiple seeds
node -e "
const dns = require('dns').promises;
const seeds = [
  'seed-1.testnet.networks.dash.org',
  'seed-2.testnet.networks.dash.org',
  'seed-1.pshenmic.dev',
];

Promise.all(seeds.map(s => dns.resolve4(s).catch(() => [])))
  .then(results => {
    seeds.forEach((seed, i) => {
      console.log(seed, '→', results[i].join(', ') || 'FAILED');
    });
  });
"
```

### Method 3: Use Seed Health Checker

From UTXO Finder tests:

```typescript
import { checkSeedsHealth, getHealthReport } from '../helpers/seed-health';

const seeds = [
  'seed-1.testnet.networks.dash.org:1443',
  'seed-2.testnet.networks.dash.org:1443',
];

// Check health
const health = await checkSeedsHealth(seeds, {
  resolveDNS: true,
  timeoutMs: 5000,
});

// Print report
console.log(await getHealthReport(seeds));
```

**Output**:
```
Seed Health Report
============================================================
Total Seeds: 2
Healthy: 1 (50%)
Unhealthy: 1
Total Check Time: 5234ms

Healthy Seeds (sorted by latency):
────────────────────────────────────────────────────────────
1. seed-1.testnet.networks.dash.org:1443 [34.214.48.68]
   Latency: 123ms
   Details: {"isIP":false,"connectTarget":"seed-1.testnet.networks.dash.org"}

Unhealthy Seeds:
────────────────────────────────────────────────────────────
1. seed-2.testnet.networks.dash.org:1443 [35.166.18.166]
   Error: Connection failed
   Details: {"isIP":false,"connectTarget":"seed-2.testnet.networks.dash.org"}
```

---

## Troubleshooting

### DNS Resolution Fails

**Symptom**:
```
Error: getaddrinfo ENOTFOUND seed-1.testnet.networks.dash.org
```

**Causes**:
- No internet connection
- DNS server not responding
- Hostname doesn't exist
- Firewall blocking DNS (port 53)

**Diagnose**:
```bash
# Test DNS manually
nslookup seed-1.testnet.networks.dash.org

# Test with dig
dig seed-1.testnet.networks.dash.org

# Test with Node.js
node -e "
const dns = require('dns').promises;
dns.resolve4('seed-1.testnet.networks.dash.org')
  .then(console.log)
  .catch(console.error);
"
```

**Solutions**:
1. Check internet connection
2. Try different DNS server
3. Use IP address directly (bypass DNS)
4. Check firewall rules

### Resolved IP Not Reachable

**Symptom**:
```
[DAPIClient] GRPC Request failed with error: 14 UNAVAILABLE: No connection established
```

**Causes**:
- IP address is down
- Firewall blocking connection
- Network routing issues
- Service not running on that IP

**Diagnose**:
```bash
# Test TCP connectivity
nc -zv 34.214.48.68 1443

# Test with telnet
telnet 34.214.48.68 1443

# Use seed health checker
node scripts/check-testnet-health.js
```

**Solutions**:
1. Try different seed from list
2. Check if service is running: `curl https://34.214.48.68:1443`
3. Wait and retry (service may be temporarily down)
4. Update seed list with healthy nodes

### TLS Certificate Mismatch

**Symptom**:
```
Error: Hostname/IP doesn't match certificate's altnames
```

**Causes**:
- Connecting via hostname when certificate is for IP
- Certificate expired or invalid
- Man-in-the-middle attack (rare)

**Solutions**:
1. **Verify DNS resolution is working**:
   - DAPIClient should automatically resolve hostnames
   - Check that you're using DAPIClient correctly

2. **Use IP directly** (bypass DNS):
   ```typescript
   const client = new DAPIClient({
     seeds: ['34.214.48.68:1443'], // Direct IP
   });
   ```

3. **Check certificate**:
   ```bash
   openssl s_client -connect 34.214.48.68:1443 -servername 34.214.48.68
   ```

### Slow DNS Resolution

**Symptom**: First request takes 5-10 seconds

**Causes**:
- DNS server is slow
- Many seeds to resolve
- No DNS caching

**Solutions**:
1. **Increase DNS timeout**:
   ```bash
   DNS_TIMEOUT=10000 npm test
   ```

2. **Use IP addresses** (skip DNS):
   ```typescript
   const client = new DAPIClient({
     seeds: [
       '34.214.48.68:1443',
       '35.166.18.166:1443',
     ],
   });
   ```

3. **Pre-resolve seeds** and cache:
   ```typescript
   import { checkSeedsHealth } from '../helpers/seed-health';

   // Resolve once at startup
   const health = await checkSeedsHealth(seeds);
   const ips = health
     .filter(s => s.reachable)
     .flatMap(s => s.resolvedIPs.map(ip => `${ip}:${s.port}`));

   // Use resolved IPs
   const client = new DAPIClient({ seeds: ips });
   ```

---

## Seed Health Checking

### Check All Testnet Seeds

```bash
# Create and run health check script
node scripts/check-testnet-health.js
```

**Output**:
```
Checking 6 testnet seeds...

✓ seed-1.testnet.networks.dash.org:1443
  DNS: 34.214.48.68
  TCP: Connected in 123ms
  Status: HEALTHY

✗ seed-2.testnet.networks.dash.org:1443
  DNS: 35.166.18.166
  TCP: Connection refused
  Status: UNHEALTHY

Summary:
  Healthy: 4/6 (67%)
  Unhealthy: 2/6 (33%)
  Average Latency: 156ms
```

### Programmatic Health Check

```typescript
import {
  checkSeedsHealth,
  getHealthySeeds,
  getHealthReport
} from '../helpers/seed-health';

// Get all seeds from network config
import networkConfigs from '@dashevo/dapi-client/lib/networkConfigs';
const seeds = networkConfigs.testnet.seeds;

// Check health
const health = await checkSeedsHealth(seeds, {
  timeoutMs: 5000,
  resolveDNS: true,
  concurrency: 3,
});

// Get only healthy seeds
const healthySeeds = await getHealthySeeds(seeds);

// Print detailed report
console.log(await getHealthReport(seeds));

// Use healthy seeds
const client = new DAPIClient({ seeds: healthySeeds });
```

### Continuous Monitoring

```typescript
import { SeedHealthMonitor } from '../helpers/seed-health';

const monitor = new SeedHealthMonitor(seeds, {
  timeoutMs: 5000,
  intervalMs: 60000, // Check every minute
});

// Start monitoring
monitor.start(); // Runs in background

// Get current status
const status = monitor.getStatus();
console.log('Healthy:', status.healthy);
console.log('Unhealthy:', status.unhealthy);

// Stop monitoring
monitor.stop();
```

---

## Network Configuration

### Current Testnet Seeds

From `packages/js-dapi-client/lib/networkConfigs.js`:

```javascript
testnet: {
  seeds: [
    'seed-1.testnet.networks.dash.org:1443',
    'seed-2.testnet.networks.dash.org:1443',
    'seed-3.testnet.networks.dash.org:1443',
    'seed-4.testnet.networks.dash.org:1443',
    'seed-5.testnet.networks.dash.org:1443',
    'seed-1.pshenmic.dev:1443',
  ],

  // Whitelist of known-good IPs (fallback)
  dapiAddressesWhiteList: [
    '34.214.48.68:1443',
    '35.166.18.166:1443',
    // ... 31 more IPs
  ]
}
```

### How Seed Selection Works

1. **Initial**: Try seeds in order
2. **DNS Resolution**: Resolve hostnames to IPs
3. **Connection Attempt**: Connect to resolved IP
4. **Failure**: Try next seed
5. **Whitelist**: Fall back to whitelist if all seeds fail
6. **Masternode Discovery**: Query for additional nodes

### Updating Seed Configuration

If seeds are consistently failing:

1. **Run health check**:
   ```bash
   node scripts/check-testnet-health.js > seed-health-report.txt
   ```

2. **Identify unhealthy seeds**

3. **Update configuration**:
   Edit `packages/js-dapi-client/lib/networkConfigs.js`:
   ```javascript
   testnet: {
     seeds: [
       // Remove unhealthy seeds
       // Add new healthy seeds
     ],
     dapiAddressesWhiteList: [
       // Remove unreachable IPs
       // Add verified working IPs
     ]
   }
   ```

4. **Test changes**:
   ```bash
   cd packages/js-dapi-client
   node test-dns-resolution.js testnet --verbose
   ```

---

## Common Scenarios

### Scenario 1: All Seeds Failing

**Symptoms**:
- Tests timeout
- "No connection established" errors
- Circuit breaker opens

**Diagnose**:
```bash
# Check internet
ping 8.8.8.8

# Check DNS
nslookup seed-1.testnet.networks.dash.org

# Check seed health
node scripts/check-testnet-health.js
```

**Solutions**:
1. Check internet connection
2. Try seed health check to identify working seeds
3. Use IP whitelist directly
4. Increase retries and timeouts

### Scenario 2: Intermittent Failures

**Symptoms**:
- Tests pass sometimes, fail sometimes
- Timeout errors on some runs
- "DEADLINE_EXCEEDED" errors

**This is normal** for public infrastructure!

**Solutions**:
1. **Enable retry logic** (already in place):
   ```bash
   MAX_RETRIES=7 npm test
   ```

2. **Use circuit breaker** (already in place):
   - Automatically fails fast on bad seeds
   - Self-heals when seeds recover

3. **Increase timeouts**:
   ```bash
   DAPI_TIMEOUT=300000 HOOK_TIMEOUT=90000 npm test
   ```

### Scenario 3: Slow DNS Resolution

**Symptoms**:
- First test takes 10-20 seconds
- Subsequent tests are fast
- No errors, just slow

**Causes**:
- DNS resolver is slow
- Many seeds to resolve
- No DNS caching

**Solutions**:
1. **Accept the delay** - DNS resolution is one-time cost
2. **Use IPs** to bypass DNS:
   ```typescript
   const client = new DAPIClient({
     seeds: ['34.214.48.68:1443'], // Direct IP
   });
   ```
3. **Pre-resolve** and cache in test setup

---

## Monitoring and Debugging

### Enable Debug Logging

**In tests**:
```typescript
const client = new DAPIClient({
  network: 'testnet',
  loggerOptions: {
    level: 'debug', // Show DNS resolution
  },
});
```

**Via environment**:
```bash
LOG_LEVEL=debug npm test
```

**Via verbose flag**:
```bash
VERBOSE=true npm test
```

### What You'll See

With debug logging enabled:

```
[DAPIClient] Resolving DNS name: seed-1.testnet.networks.dash.org
[DAPIClient] Successfully resolved to 34.214.48.68
[DAPIClient] Connecting to 34.214.48.68:1443
[DAPIClient] Connection established
[DAPIClient] GRPC Request: getBlockchainStatus
[DAPIClient] Response received in 234ms
```

### Debugging Tools

**1. DNS lookup**:
```bash
nslookup seed-1.testnet.networks.dash.org
dig seed-1.testnet.networks.dash.org
```

**2. TCP connectivity**:
```bash
nc -zv 34.214.48.68 1443
telnet 34.214.48.68 1443
```

**3. TLS certificate**:
```bash
openssl s_client -connect 34.214.48.68:1443 -servername 34.214.48.68 | grep -A 10 "Certificate chain"
```

**4. Full connection test**:
```bash
curl -v https://34.214.48.68:1443
```

---

## Best Practices

### 1. Use Hostnames in Configuration

```typescript
// Good - Flexible, works if IPs change
seeds: ['seed-1.testnet.networks.dash.org:1443']

// Acceptable - Direct connection, but brittle
seeds: ['34.214.48.68:1443']
```

### 2. Trust Automatic DNS Resolution

DAPIClient handles this automatically. Don't try to resolve manually unless debugging.

### 3. Monitor Seed Health Periodically

Run health checks weekly or when experiencing issues:
```bash
node scripts/check-testnet-health.js
```

### 4. Update Configuration Based on Health

Keep `networkConfigs.js` up to date with healthy seeds.

### 5. Use Retry + Circuit Breaker

Already implemented in test suite! Handles transient failures automatically.

### 6. Handle Failures Gracefully

```typescript
try {
  await withRetry(() => dapiClient.core.getStatus(), { maxRetries: 5 });
} catch (error) {
  if (error.message.includes('Circuit breaker')) {
    console.log('All seeds failed, skipping test');
  } else {
    throw error;
  }
}
```

---

## Reference

### DNS Resolution Flow

```
1. User creates DAPIClient with seeds
   ↓
2. createDAPIAddressProviderFromOptions() called
   ↓
3. Seeds are mapped to DAPIAddress objects
   ↓
4. Promise.all([
     resolveDAPIAddress(seed1),  // Parallel
     resolveDAPIAddress(seed2),  // Parallel
     resolveDAPIAddress(seed3),  // Parallel
   ])
   ↓
5. For each seed:
   - Check if already IP → Skip DNS
   - If hostname → dns.resolve4(hostname)
   - Update DAPIAddress with resolved IP
   ↓
6. Create provider with resolved IPs
   ↓
7. Store as Promise in DAPIClient
   ↓
8. First gRPC request waits for DNS (if not done)
   ↓
9. Connect to resolved IP
   ↓
10. TLS handshake with IP-based certificate
   ↓
11. Connection success
```

### Key Files

**DAPI Client**:
- `packages/js-dapi-client/lib/dapiAddressProvider/resolveDAPIAddress.js`
- `packages/js-dapi-client/docs/DNS_RESOLUTION.md`
- `packages/js-dapi-client/test-dns-resolution.js`

**UTXO Finder**:
- `packages/dash-utxo-finder/__tests__/helpers/seed-health.ts`
- `packages/dash-utxo-finder/scripts/check-testnet-health.js` (to be created)

### Environment Variables

```bash
# DNS resolution
DNS_TIMEOUT=5000           # DNS lookup timeout
DNS_RETRY_COUNT=3          # DNS retry attempts

# Custom seeds (optional)
TESTNET_SEEDS=seed-1.testnet.networks.dash.org:1443,34.214.48.68:1443

# Skip tests if seeds unavailable
SKIP_TESTNET_TESTS=true
```

---

## Further Reading

- **DAPIClient DNS Resolution**: `packages/js-dapi-client/docs/DNS_RESOLUTION.md`
- **Network Configs**: `packages/js-dapi-client/lib/networkConfigs.js`
- **Seed Health Checking**: `__tests__/helpers/seed-health.ts`
- **Testing Guide**: `docs/TESTING_GUIDE.md`

---

**Last Updated**: October 27, 2025
**Related**: TESTING_GUIDE.md, SESSION_IMPLEMENTATION_SUMMARY.md
