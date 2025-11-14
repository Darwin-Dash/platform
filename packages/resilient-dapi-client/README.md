# @dashevo/resilient-dapi-client

Production-ready DAPI client wrapper with comprehensive resilience features extracted from payment-monitor.

## Features

- **Automatic Retry** - Exponential backoff (1s → 2s → 4s → ... up to 30s)
- **Node Failover** - Automatic rotation through DAPI node pool
- **Graceful Degradation** - Continue on platform failures
- **Observable Events** - Retry, failover, and degradation events
- **Structured Logging** - Multi-level logging (error/warn/info/debug)
- **Drop-in Replacement** - Compatible with `@dashevo/dapi-client` API

## Installation

```bash
npm install @dashevo/resilient-dapi-client
```

## Quick Start

```typescript
import { ResilientDAPIClient } from '@dashevo/resilient-dapi-client';

// Create client (drop-in replacement for DAPIClient)
const client = new ResilientDAPIClient({
  network: 'testnet',
  dapiAddresses: [
    'https://seed-1.evonet.networks.dash.org:1443',
    'https://seed-2.evonet.networks.dash.org:1443',
    'https://seed-3.evonet.networks.dash.org:1443',
  ],
  logLevel: 'info',  // Optional: error, warn, info, debug
});

// Use exactly like regular DAPIClient
const height = await client.core.getBestBlockHeight();
const identity = await client.platform.getIdentity(identityId);

// Listen to resilience events
client.on('retry', ({ method, attempt, delay }) => {
  console.log(`Retrying ${method} (attempt ${attempt}) in ${delay}ms`);
});

client.on('failover', ({ oldNode, newNode }) => {
  console.log(`Failed over from ${oldNode} to ${newNode}`);
});

client.on('degradation', ({ service, error }) => {
  console.warn(`${service} degraded:`, error.message);
});
```

## Configuration Reference

```typescript
interface ResilientConfig {
  // Required
  network: 'mainnet' | 'testnet' | 'regtest';

  // Standard DAPIClient config
  dapiAddresses?: string[];              // Direct addresses
  seeds?: string[];                      // DNS seeds
  timeout?: number;                      // default: 60000ms
  retries?: number;                      // default: 5
  baseBanTime?: number;                  // default: 60000ms

  // Resilience features
  logLevel?: 'error' | 'warn' | 'info' | 'debug';  // default: 'error'
  enableObservability?: boolean;         // default: true
  enableGracefulDegradation?: boolean;   // default: true
  enableAdaptiveRetry?: boolean;         // default: true
  maxRetryDelay?: number;                // default: 30000ms
  retryBaseDelay?: number;               // default: 1000ms
  nodeRetryDelay?: number;               // default: 300000ms (5 min)
  maxRetryAttempts?: number;             // default: 10
}
```

## Event API

```typescript
// Retry events
client.on('retry', (event: RetryEvent) => {
  // event.namespace: 'core' | 'platform'
  // event.method: string (e.g., 'getBestBlockHeight')
  // event.attempt: number
  // event.error: Error
  // event.delay: number (ms)
});

// Failover events
client.on('failover', (event: FailoverEvent) => {
  // event.oldNode: string
  // event.newNode: string
  // event.reason: string
});

// Degradation events
client.on('degradation', (event: DegradationEvent) => {
  // event.service: 'core' | 'platform'
  // event.error: Error
  // event.timestamp: number
});
```

## Status API

```typescript
const status = client.getStatus();

console.log(status.coreAvailable);      // boolean
console.log(status.platformAvailable);  // boolean
console.log(status.currentNode);        // string | null
console.log(status.nodePoolSize);       // number
console.log(status.failureCount);       // number
```

## Migration from DAPIClient

```typescript
// Before
import DAPIClient from '@dashevo/dapi-client';
const client = new DAPIClient({ network: 'testnet' });

// After
import { ResilientDAPIClient } from '@dashevo/resilient-dapi-client';
const client = new ResilientDAPIClient({
  network: 'testnet',
  logLevel: 'info'  // Optional: add resilience features
});

// All existing code works unchanged!
const height = await client.core.getBestBlockHeight();
```

## How It Works

### Automatic Retry with Exponential Backoff

```typescript
// Attempt 1: immediate
// Attempt 2: 1s delay
// Attempt 3: 2s delay
// Attempt 4: 4s delay
// Attempt 5: 8s delay
// Attempt 6: 16s delay
// Attempt 7+: 30s delay (capped)
```

### Node Failover

```typescript
// Config with 3 nodes
const client = new ResilientDAPIClient({
  network: 'testnet',
  dapiAddresses: ['node1', 'node2', 'node3'],
});

// Behavior on failure:
// 1. Request to node1 fails
// 2. Mark node1 as failed
// 3. Rotate to node2
// 4. Emit 'failover' event
// 5. Recreate DAPI client
// 6. Reset retry counter
// 7. Retry request with node2
```

### Graceful Degradation

```typescript
// Platform fails but core still works
await client.platform.getIdentity(id);  // Returns null (degraded)
await client.core.getBestBlockHeight(); // Still works!

const status = client.getStatus();
console.log(status.platformAvailable);  // false
console.log(status.coreAvailable);      // true
```

## Architecture

```
ResilientDAPIClient (EventEmitter)
├── DAPIClient (underlying)
├── AdaptiveRetryStrategy (exponential backoff)
├── NodePoolManager (rotation + blacklist)
├── GracefulDegradation (partial failure handling)
└── Logger (structured logging)
```

## Advanced Usage

### Access Underlying Client

```typescript
const underlying = client.getUnderlyingClient();
// Direct access to @dashevo/dapi-client instance
```

### Reset Resilience State

```typescript
client.resetResilience();
// Clears: retry counter, degradation state, failed nodes
```

### Custom Retry Configuration

```typescript
const client = new ResilientDAPIClient({
  network: 'testnet',
  dapiAddresses: ['...'],

  // Aggressive retry
  maxRetryAttempts: 20,
  retryBaseDelay: 500,   // Start at 500ms
  maxRetryDelay: 60000,  // Max 60s

  // Longer node blacklist
  nodeRetryDelay: 600000,  // 10 minutes
});
```

## Comparison with DAPIClient

| Feature | @dashevo/dapi-client | ResilientDAPIClient |
|---------|---------------------|---------------------|
| Basic retry | ✅ 5 retries | ✅ 10 retries (configurable) |
| Node failover | ✅ Built-in | ✅ Enhanced with blacklist |
| Exponential backoff | ❌ Immediate retry | ✅ 1s → 30s adaptive |
| Event emission | ❌ No events | ✅ retry, failover, degradation |
| Structured logging | ❌ No logging | ✅ error/warn/info/debug |
| Graceful degradation | ❌ All-or-nothing | ✅ Platform failures tolerated |
| Stream reconnection | ✅ Built-in | ✅ Inherited |

## Production Best Practices

```typescript
// Production configuration
const client = new ResilientDAPIClient({
  network: 'mainnet',
  dapiAddresses: [
    'https://seed-1.evonet.networks.dash.org:1443',
    'https://seed-2.evonet.networks.dash.org:1443',
    'https://seed-3.evonet.networks.dash.org:1443',
    'https://seed-4.evonet.networks.dash.org:1443',
  ],
  logLevel: 'warn',                  // Production: warn or error only
  timeout: 30000,                    // 30s timeout for reliability
  maxRetryAttempts: 10,              // Persistent retries
  nodeRetryDelay: 300000,            // 5min node blacklist
  enableObservability: true,         // Monitor events
  enableGracefulDegradation: true,   // Continue on platform failure
});

// Monitor health
client.on('failover', ({ oldNode, newNode }) => {
  metrics.increment('dapi.failover');
  logger.warn(`DAPI failover: ${oldNode} → ${newNode}`);
});

client.on('degradation', ({ service }) => {
  metrics.increment(`dapi.degradation.${service}`);
  alerts.send(`DAPI ${service} degraded`);
});

// Regular health check
setInterval(() => {
  const status = client.getStatus();
  if (!status.coreAvailable) {
    alerts.critical('DAPI core unavailable');
  }
}, 60000);
```

## Testing

```bash
npm test              # Run unit tests
npm run test:coverage # With coverage report
npm run test:watch    # Watch mode
```

## License

MIT

## Credits

Resilience patterns extracted from [@dashevo/payment-monitor](../payment-monitor) Phase 4-5 implementation.
