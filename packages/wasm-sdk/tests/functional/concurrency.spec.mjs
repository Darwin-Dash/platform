import init, * as sdk from '../../dist/sdk.compressed.js';
import { wasmFunctionalTestRequirements } from './fixtures/requiredTestData.mjs';

describe('Concurrent Platform Queries', function describeBlock() {
  this.timeout(90000);

  const {
    identityId: TEST_IDENTITY,
    identityId2: TEST_IDENTITY_2,
    identityId3: TEST_IDENTITY_3,
    dpnsContractId: DPNS_CONTRACT,
  } = wasmFunctionalTestRequirements();

  let client;

  before(async () => {
    await init();
    await sdk.WasmSdk.prefetchTrustedQuorumsLocal();
    const builder = sdk.WasmSdkBuilder.localTrusted();
    client = await builder.build();
  });

  after(() => {
    if (client) { client.free(); }
  });

  it('multiple identity lookups in parallel succeed', async () => {
    // These are known test identities from the local network
    const identityIds = [
      TEST_IDENTITY,
      TEST_IDENTITY_2,
      TEST_IDENTITY_3,
    ];

    // Old code would fail with "already locked" when these run concurrently
    // because the Mutex in TrustedContext would be held across await points
    const results = await Promise.all(
      identityIds.map((id) => client.getIdentity(id)),
    );

    expect(results).to.have.length(3);
    for (const result of results) {
      expect(result).to.be.ok();
    }
  });

  it('multiple data contract fetches in parallel succeed', async () => {
    // Fetch the same contract multiple times concurrently
    // This tests that the contract cache (using ArcSwap) handles concurrent reads
    const fetches = [];
    for (let i = 0; i < 5; i++) {
      fetches.push(client.getDataContract(DPNS_CONTRACT));
    }

    const contracts = await Promise.all(fetches);

    expect(contracts).to.have.length(5);
    for (const contract of contracts) {
      expect(contract).to.be.ok();
    }
  });

  it('mixed identity and contract queries in parallel succeed', async () => {
    // Mix different query types to stress test concurrent access patterns
    const operations = [
      client.getIdentity(TEST_IDENTITY),
      client.getDataContract(DPNS_CONTRACT),
      client.getIdentity(TEST_IDENTITY_2),
      client.getIdentityBalance(TEST_IDENTITY),
      client.getIdentity(TEST_IDENTITY_3),
    ];

    const results = await Promise.all(operations);

    expect(results).to.have.length(5);
    // Identity results
    expect(results[0]).to.be.ok();
    expect(results[2]).to.be.ok();
    expect(results[4]).to.be.ok();
    // Contract result
    expect(results[1]).to.be.ok();
    // Balance result (bigint)
    expect(typeof results[3]).to.equal('bigint');
  });

  it('concurrent identity balance fetches succeed', async () => {
    const identityIds = [TEST_IDENTITY, TEST_IDENTITY_2, TEST_IDENTITY_3];

    const balances = await Promise.all(
      identityIds.map((id) => client.getIdentityBalance(id)),
    );

    expect(balances).to.have.length(3);
    for (const balance of balances) {
      expect(typeof balance).to.equal('bigint');
    }
  });

  it('concurrent nonce fetches succeed', async () => {
    const identityIds = [TEST_IDENTITY, TEST_IDENTITY_2, TEST_IDENTITY_3];

    const nonces = await Promise.all(
      identityIds.map((id) => client.getIdentityNonce(id)),
    );

    expect(nonces).to.have.length(3);
    for (const nonce of nonces) {
      expect(typeof nonce).to.equal('bigint');
    }
  });

  it('rapid sequential queries do not cause state corruption', async () => {
    // Perform many rapid queries sequentially to ensure state is consistent
    for (let i = 0; i < 10; i++) {
      const identity = await client.getIdentity(TEST_IDENTITY);
      expect(identity).to.be.ok();

      const balance = await client.getIdentityBalance(TEST_IDENTITY);
      expect(typeof balance).to.equal('bigint');
    }
  });

  it('concurrent contract cache operations with queries succeed', async () => {
    // Mix cache operations with actual network queries
    const contractId = sdk.Identifier.fromBase58(DPNS_CONTRACT);

    const operations = [
      // Network query
      client.getDataContract(DPNS_CONTRACT),
      // Cache operation (should be lock-free)
      Promise.resolve(client.removeCachedContract(contractId)),
      // Another network query
      client.getDataContract(DPNS_CONTRACT),
      // Another cache operation
      Promise.resolve(client.removeCachedContract(contractId)),
    ];

    const results = await Promise.all(operations);
    expect(results).to.have.length(4);
    // Contract fetches should succeed
    expect(results[0]).to.be.ok();
    expect(results[2]).to.be.ok();
  });
});

describe('SDK Instance Isolation with Network', function describeBlock() {
  this.timeout(90000);

  const { identityId: TEST_IDENTITY } = wasmFunctionalTestRequirements();

  before(async () => {
    await init();
    await sdk.WasmSdk.prefetchTrustedQuorumsLocal();
  });

  it('two SDK instances can query independently', async () => {
    // Create two independent SDK instances
    const sdk1 = await sdk.WasmSdkBuilder.localTrusted().build();
    const sdk2 = await sdk.WasmSdkBuilder.localTrusted().build();

    try {
      // Both should be able to query independently
      const [identity1, identity2] = await Promise.all([
        sdk1.getIdentity(TEST_IDENTITY),
        sdk2.getIdentity(TEST_IDENTITY),
      ]);

      expect(identity1).to.be.ok();
      expect(identity2).to.be.ok();
    } finally {
      sdk1.free();
      sdk2.free();
    }
  });

  it('freeing one SDK does not affect another', async () => {
    const sdk1 = await sdk.WasmSdkBuilder.localTrusted().build();
    const sdk2 = await sdk.WasmSdkBuilder.localTrusted().build();

    // Query with sdk1
    const identity1 = await sdk1.getIdentity(TEST_IDENTITY);
    expect(identity1).to.be.ok();

    // Free sdk1
    sdk1.free();

    // sdk2 should still work
    const identity2 = await sdk2.getIdentity(TEST_IDENTITY);
    expect(identity2).to.be.ok();

    sdk2.free();
  });
});
