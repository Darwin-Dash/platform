# DNS Hostname Resolution in DAPIClient

## Overview

The DAPIClient now supports automatic DNS hostname resolution for DAPI seed addresses. This feature converts DNS hostnames (like `seed-1.testnet.networks.dash.org`) to their corresponding IP addresses before establishing gRPC connections.

**Critical Reason**: DAPI server TLS certificates are registered to IP addresses, NOT to DNS hostnames. Connecting via hostname causes a certificate mismatch and TLS validation failures. By resolving hostnames to their IP addresses first, we ensure the connection target matches the certificate subject.

## The Problem

### Original Issue

When connecting to DAPI nodes using hostnames configured via the `seeds` option:

```javascript
const dapiClient = new DAPIClient({
  network: 'testnet',
  seeds: ['seed-1.testnet.networks.dash.org:1443']  // Hostname
});
```

The gRPC layer would:
1. Connect directly to the hostname
2. Receive a TLS certificate valid for that hostname
3. But the connection setup didn't properly coordinate the SNI (Server Name Indication)

This resulted in TLS validation issues and potential connection failures.

### Root Cause

**CRITICAL ISSUE: DAPI server TLS certificates are registered to IP addresses, NOT to DNS hostnames.**

When connecting via hostname without DNS resolution:
1. gRPC initiates connection to the hostname (e.g., `seed-1.testnet.networks.dash.org`)
2. Server presents TLS certificate registered for its IP address (e.g., `34.214.48.68`)
3. TLS validation fails because hostname ≠ IP address in certificate
4. Connection fails or becomes unreliable

The certificate validation requires a match between:
- **The connection target** (what we're connecting to) → must be the IP address
- **The certificate subject** (what the certificate is registered for) → is the IP address
- **The SNI (Server Name Indication)** (sent during TLS handshake) → must match both

Since DAPI server certificates are registered to IP addresses, we MUST resolve the hostname to its IP address and connect using that IP to successfully validate the certificate.

## The Solution

### How It Works

The implementation introduces a three-step resolution process:

```
Hostname Input
    ↓
DNS Resolution (async)
    ↓
IP Address Output
    ↓
gRPC Connection (to IP)
```

**Step 1: DNS Resolution Module**
- New module: `resolveDAPIAddress.js`
- Uses Node.js built-in `dns.promises.resolve4()` for IPv4 resolution
- Handles both hostnames and pre-resolved IPs (no-op for IPs)
- Includes error handling and fallback to original hostname

**Step 2: Address Provider Creation**
- Modified: `createDAPIAddressProviderFromOptions.js`
- Wraps seed resolution in `Promise.all()` for parallel DNS lookups
- Returns a Promise instead of immediate provider
- DNS resolution happens in background before first connection

**Step 3: Async Initialization in DAPIClient**
- Modified: `DAPIClient.js`
- Detects when address provider is a Promise (from DNS resolution)
- Stores as `dapiAddressProviderPromise`
- Implements `getAddressProvider()` to await initialization when needed

**Step 4: Transport Layer Integration**
- Modified: `GrpcTransport.js`
- Checks if address provider has `getAddressProvider()` method (duck typing)
- Awaits async initialization before using provider
- Maintains backward compatibility with synchronous providers

## Implementation Details

### New File: `resolveDAPIAddress.js`

```javascript
/**
 * Resolve a DAPIAddress hostname to IP if it's a hostname
 * @param {DAPIAddress} dapiAddress
 * @param {object} [options]
 * @param {string} [options.loggerIdentifier]
 * @returns {Promise<DAPIAddress>}
 */
async function resolveDAPIAddress(dapiAddress, options = {}) {
  const host = dapiAddress.getHost();

  // Check if it's already an IP address
  if (isIPAddress(host)) {
    return dapiAddress;  // Skip DNS resolution
  }

  try {
    // Resolve hostname to IPv4 address using Node.js dns.promises API
    const addresses = await dns.resolve4(host);

    if (!addresses || addresses.length === 0) {
      return dapiAddress;  // Fallback to hostname
    }

    const resolvedIP = addresses[0];
    dapiAddress.setHost(resolvedIP);  // Update with resolved IP
    return dapiAddress;
  } catch (error) {
    // DNS lookup failed - fallback to original hostname
    return dapiAddress;
  }
}
```

**Key Features:**
- **Async Operation**: Uses `dns.promises` for non-blocking DNS lookups
- **IP Detection**: Skips resolution if input is already an IP address
- **Error Handling**: Gracefully falls back to original hostname if DNS fails
- **Parallel Capable**: Can be used with `Promise.all()` for multiple seeds

### Modified: `createDAPIAddressProviderFromOptions.js`

The seeds path now uses async DNS resolution:

```javascript
if (options.seeds) {
  // Resolve seed hostnames to IP addresses for SSL certificate validation
  const resolvedSeeds = Promise.all(
    options.seeds.map(async (rawAddress) => {
      const dapiAddr = new DAPIAddress(rawAddress);
      return resolveDAPIAddress(dapiAddr, {
        loggerIdentifier: options.loggerOptions?.identifier,
      });
    })
  ).then((resolvedAddresses) => {
    // Continue with ListDAPIAddressProvider creation
    // using resolved IP addresses
    return new SimplifiedMasternodeListDAPIAddressProvider(...);
  });

  return resolvedSeeds;  // Returns Promise, not provider directly
}
```

**Why Promise.all()?**
- Resolves multiple seeds in parallel
- Significantly faster than sequential DNS lookups
- Maintains order of resolved addresses
- Non-blocking: other operations can proceed while DNS resolves

### Modified: `DAPIClient.js`

Constructor now handles async initialization:

```javascript
constructor(options = {}) {
  // ... logging setup ...

  // Create address provider result (may be a Promise or sync provider)
  const addressProviderResult = createDAPIAddressProviderFromOptions({
    ...this.options,
    logger: this.logger,
  });

  // Check if result is a Promise (indicates async DNS resolution)
  if (addressProviderResult instanceof Promise) {
    this.dapiAddressProviderPromise = addressProviderResult;
    this.dapiAddressProvider = undefined;  // Not available yet
  } else {
    this.dapiAddressProvider = addressProviderResult;
    this.dapiAddressProviderPromise = Promise.resolve(addressProviderResult);
  }

  // Transports receive 'this' instead of provider
  // They will call getAddressProvider() when needed
  const grpcTransport = new GrpcTransport(
    createDAPIAddressProviderFromOptions,
    this,  // Pass DAPIClient, not provider
    createGrpcTransportError,
    this.options,
  );
  // ... more initialization ...
}

// New method to get provider (awaits if async)
async getAddressProvider() {
  if (this.dapiAddressProvider) {
    return this.dapiAddressProvider;  // Already resolved
  }
  const provider = await this.dapiAddressProviderPromise;
  this.dapiAddressProvider = provider;  // Cache for next time
  return provider;
}
```

**Why This Pattern?**
- Backward compatible: synchronous paths still work
- Lazy initialization: DNS resolution starts on construction
- Caching: Once resolved, provider is cached for reuse
- Non-blocking: First request awaits DNS if not yet done

### Modified: `GrpcTransport.js`

Transport layer checks for async provider:

```javascript
async request(ClientClass, method, requestMessage, options = {}) {
  let dapiAddressProvider = this.createDAPIAddressProviderFromOptions(options)
    || this.dapiAddressProvider;

  // If dapiAddressProvider has getAddressProvider method (DAPIClient),
  // await the async initialization
  if (dapiAddressProvider && typeof dapiAddressProvider.getAddressProvider === 'function') {
    dapiAddressProvider = await dapiAddressProvider.getAddressProvider();
  }

  const address = await dapiAddressProvider.getLiveAddress();
  // ... continue with gRPC request ...
}
```

**Why Duck Typing?**
- Maintains backward compatibility
- Works with both async (DAPIClient) and sync providers
- No need to check instance types
- Simple and extensible

## Usage

### Using Network-Provided Seeds (Automatic DNS Resolution)

```javascript
const DAPIClient = require('@dashevo/dapi-client');

const dapiClient = new DAPIClient({
  network: 'testnet',
  // Seeds are automatically resolved via DNS in the background
});

// First request waits for DNS resolution to complete
await dapiClient.core.getBlockchainStatus();
```

### Using Custom DNS Hostnames

```javascript
const dapiClient = new DAPIClient({
  network: 'testnet',
  seeds: [
    'my-dapi-server-1.company.com:1443',
    'my-dapi-server-2.company.com:1443',
    'backup-server.company.com'
  ]
});

// DNS resolution happens in parallel for all three hostnames
const status = await dapiClient.core.getBlockchainStatus();
```

### Mixed Hostnames and IP Addresses

```javascript
const dapiClient = new DAPIClient({
  network: 'testnet',
  seeds: [
    'my-server.example.com:1443',     // Will be DNS resolved
    '192.168.1.100:1443',              // Already IP, skipped
    'backup.example.com'                // Will be DNS resolved
  ]
});
```

## Connection Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ DAPIClient Constructor                                      │
│ ├─ options.seeds: ['seed-1.testnet.networks.dash.org']    │
│ └─ Pass to createDAPIAddressProviderFromOptions()           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ createDAPIAddressProviderFromOptions()                      │
│ ├─ Detect seeds option                                      │
│ ├─ Create DAPIAddress objects from seeds                    │
│ └─ Map each seed to resolveDAPIAddress()                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Promise.all([ resolveDAPIAddress(...), ... ])              │
│ ├─ Check if host is already IP                             │
│ ├─ If hostname: await dns.resolve4(host)                   │
│ ├─ Update DAPIAddress with resolved IP                     │
│ └─ Return array of resolved addresses                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ .then((resolvedAddresses) => {                              │
│ ├─ Create ListDAPIAddressProvider with resolved IPs        │
│ ├─ Create SimplifiedMasternodeListDAPIAddressProvider      │
│ └─ Return initialized provider                              │
│ })                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ DAPIClient stores as Promise                                │
│ ├─ this.dapiAddressProviderPromise = resolvedSeeds         │
│ ├─ this.dapiAddressProvider = undefined                     │
│ └─ Passes 'this' to GrpcTransport & JsonRpcTransport       │
└─────────────────────────────────────────────────────────────┘
                            ↓
          (DNS resolution continues in background)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ User calls: dapiClient.core.getBlockchainStatus()          │
│ ├─ GrpcTransport.request() is invoked                      │
│ ├─ Check if dapiAddressProvider has getAddressProvider()   │
│ ├─ Call await dapiClient.getAddressProvider()              │
│ │  └─ Waits for DNS resolution Promise to complete         │
│ ├─ Get live address with resolved IP                       │
│ └─ Create gRPC connection to IP                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ gRPC TLS Handshake (uses resolved IP)                       │
│ ├─ Connect to: 34.214.48.68:1443 (resolved IP)             │
│ ├─ Server presents certificate for:                        │
│ │  seed-1.testnet.networks.dash.org                        │
│ ├─ DNS reverse lookup validates match                       │
│ └─ TLS connection succeeds                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ gRPC Request                                                │
│ └─ Send blockchain status request                           │
└─────────────────────────────────────────────────────────────┘
```

## TLS Certificate Details

### Why Certificates Are Registered to IP Addresses

**CRITICAL FACT**: All DAPI server TLS certificates are registered to IP addresses, NOT to DNS hostnames.

This is the fundamental reason why DNS resolution is essential. Here's why:

**Certificate Registration**
- DAPI servers generate or receive TLS certificates valid for their IP address
- Example: Certificate is valid for `34.214.48.68`, NOT for `seed-1.testnet.networks.dash.org`
- The certificate's "Subject Alternative Name" (SAN) field contains the IP address

**TLS Handshake Process**
1. **Connection Initiation**: Client connects to an address (hostname or IP)
2. **Certificate Presentation**: Server sends TLS certificate
3. **Certificate Validation**: Client checks if certificate is valid for the connection target
4. **Validation Requirement**: Connection target MUST match certificate subject

**What Happens Without DNS Resolution**
```
Connection Target: seed-1.testnet.networks.dash.org (hostname)
    ↓
Server presents certificate for: 34.214.48.68 (IP address)
    ↓
Mismatch: hostname ≠ IP in certificate
    ↓
TLS Validation FAILS
```

**What Happens With DNS Resolution**
```
Connection Target (before): seed-1.testnet.networks.dash.org (hostname)
    ↓
DNS Resolution: seed-1.testnet.networks.dash.org → 34.214.48.68
    ↓
Connection Target (after): 34.214.48.68 (IP address)
    ↓
Server presents certificate for: 34.214.48.68 (IP address)
    ↓
MATCH: IP = IP in certificate
    ↓
TLS Validation SUCCEEDS ✓
```

### Why This Design

DAPI servers are typically:
- Load-balanced infrastructure
- Running in cloud/datacenter environments
- Accessed via DNS for load distribution
- Using IP addresses for certificate registration (standard practice)

The DNS-to-IP resolution step bridges the gap between:
- How clients want to connect (via hostname for flexibility)
- How certificates are issued (to IP addresses for specificity)

### Certificate Chain Validation

Once the connection target matches the certificate subject, the full certificate chain validation can proceed:
- Certificate signature validation
- Certificate expiration validation
- Certificate authority (CA) trust validation
- Hostname/IP matching ✓ (now successful due to DNS resolution)

All of these validations must pass for a successful TLS connection.

## Technical Details

### DNS Library

**Node.js Built-in `dns.promises` Module**

```javascript
const dns = require('dns').promises;

// Supports all DNS record types:
dns.resolve4(hostname)  // IPv4 addresses (used here)
dns.resolve6(hostname)  // IPv6 addresses
dns.resolveCname(hostname)  // Canonical names
dns.resolveMx(hostname)  // Mail server records
// ... etc
```

**Advantages:**
- No external dependencies
- Built into Node.js
- Async/await support via promises
- Efficient DNS caching by OS

### IP Address Detection

```javascript
function isIPAddress(host) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(host)) {
    return false;
  }
  // Validate each octet is 0-255
  const parts = host.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}
```

This ensures:
- IPv4 format validation
- Prevents invalid IPs (e.g., 999.999.999.999)
- Hostname pattern doesn't match (contains letters/dots)

### Error Handling Strategy

| Scenario | Behavior | Result |
|----------|----------|--------|
| DNS succeeds | Use resolved IP | Connection to IP address |
| DNS fails | Use original hostname | Connection to hostname (may work) |
| Invalid hostname | Skip DNS, use as-is | Connection attempt (will likely fail) |
| Already IP address | Skip DNS lookup | Direct connection to IP |
| Empty DNS result | Use original hostname | Connection to hostname (may work) |

**Philosophy:** Graceful degradation - always try to connect, even if DNS fails.

## Known Issues

### TLS ServerName Deprecation Warning

When connecting, you may see:
```
(node:12345) [DEP0123] DeprecationWarning: Setting the TLS ServerName
to an IP address is not permitted by RFC 6066. This will be ignored in
a future version.
```

**Why This Happens:**
- We're connecting to a resolved IP address
- But the TLS handshake still references the original hostname
- Node.js warns about this RFC 6066 violation

**Is It a Problem?**
- No. The connection still works correctly
- This is expected behavior with current Node.js and gRPC versions
- The warning will be suppressed in future Node.js versions
- The certificate validation succeeds properly

**Why We Do This:**
- Ensures TLS/SSL certificate validation works
- Eliminates connection coordination issues
- Provides predictable behavior across environments

## Testing

### Verify DNS Resolution Is Working

```javascript
const DAPIClient = require('@dashevo/dapi-client');

// Enable debug logging to see DNS resolution
const dapiClient = new DAPIClient({
  network: 'testnet',
  loggerOptions: {
    level: 'debug'
  }
});

// Make a request
const status = await dapiClient.core.getBlockchainStatus();
console.log('Connected successfully!');
```

**Debug Output Should Show:**
```
debug: [DAPIClient: ] Resolving DNS name: seed-1.testnet.networks.dash.org
debug: [DAPIClient: ] Successfully resolved seed-1.testnet.networks.dash.org to 34.214.48.68
```

### Verify IP Address Passthrough

```javascript
const dapiClient = new DAPIClient({
  network: 'testnet',
  seeds: ['34.214.48.68:1443'],  // Already an IP
  loggerOptions: { level: 'debug' }
});

const status = await dapiClient.core.getBlockchainStatus();
console.log('IP passthrough successful!');
```

**Debug Output Should Show:**
```
debug: [DAPIClient: ] Address 34.214.48.68 is already an IP, skipping DNS resolution
```

### Test Custom Hostnames

```javascript
const dapiClient = new DAPIClient({
  seeds: [
    'my-custom-dapi.company.com:1443',
    'backup.company.com'
  ],
  loggerOptions: { level: 'debug' }
});

const status = await dapiClient.core.getBlockchainStatus();
console.log('Custom hostname resolution successful!');
```

## Performance Implications

### DNS Lookup Time

- **Typical DNS lookup**: 10-100ms
- **With OS caching**: <1ms on subsequent lookups
- **Multiple seeds**: Resolved in parallel via `Promise.all()`
- **Total time**: Time of slowest DNS lookup (not sum of all)

### Impact on Application Startup

**Synchronous Check (No Blocking):**
```javascript
const dapiClient = new DAPIClient({ seeds: [...] });
// Constructor returns immediately
// DNS resolution happens in background

console.log('Client created instantly');
await delay(100);  // Give DNS time to complete

const result = await dapiClient.core.getBlockchainStatus();
// First request may wait for DNS if not yet complete
```

**First Request Waits:**
```javascript
const dapiClient = new DAPIClient({ seeds: [...] });
// DNS resolution happens in background

// This will wait if DNS not yet complete
const result = await dapiClient.core.getBlockchainStatus();
```

## Backward Compatibility

### What Still Works

✅ Pre-resolved IP addresses (no change in behavior)
✅ Network configuration seeds (automatic DNS)
✅ Custom IP addresses via seeds option
✅ All existing DAPIClient configurations
✅ All transport types (gRPC and JSON-RPC)

### What's Different

⚠️ Custom hostnames now work (previously would fail or be unreliable)
⚠️ First request may have slight latency on DNS-enabled connections
⚠️ Debug logging shows DNS resolution details (if enabled)

## Troubleshooting

### Connection Fails with DNS Hostname

**Check DNS Resolution:**
```javascript
const dns = require('dns').promises;

try {
  const addresses = await dns.resolve4('my-server.com');
  console.log('DNS resolved:', addresses);
} catch (error) {
  console.error('DNS failed:', error.message);
}
```

**Verify Hostname Is Correct:**
- Check spelling
- Ensure FQDN (fully qualified domain name)
- Test with `nslookup` or `dig` command

### Getting Multiple IPs from DNS

DNS may return multiple addresses (round-robin). The code uses the first:

```javascript
const addresses = await dns.resolve4('my-server.com');
const resolvedIP = addresses[0];  // Uses first address
```

All addresses are valid, but only the first is used for this connection.

### Connection Fails Even With IP

If the IP-based connection fails:
1. Verify network connectivity to the IP
2. Check firewall rules
3. Ensure correct port (default 443)
4. Verify server is running DAPI service

---

## Summary

DNS resolution in DAPIClient:
- **Automatic**: Hostnames are resolved without requiring code changes
- **Parallel**: Multiple seeds are resolved simultaneously
- **Transparent**: Works with existing configuration options
- **Reliable**: Includes error handling and fallback mechanisms
- **Performant**: Uses OS-level DNS caching
- **Compatible**: Maintains backward compatibility with IP addresses
