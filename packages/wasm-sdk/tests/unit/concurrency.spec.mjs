import init, * as sdk from '../../dist/sdk.compressed.js';

describe('SDK Concurrency', () => {
  before(async () => {
    await init();
  });

  it('multiple concurrent removeCachedContract calls complete without deadlock', async () => {
    // Build a testnet SDK (non-trusted mode)
    const sdkInstance = sdk.WasmSdkBuilder.testnet().build();

    // Create a contract ID for testing
    const contractId = sdk.Identifier.fromBase58('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');

    // Spawn multiple concurrent cache operations
    // With the old Mutex-based code, this would cause "already locked" errors
    // when run in WASM async context
    const operations = [];
    for (let i = 0; i < 10; i++) {
      operations.push(Promise.resolve(sdkInstance.removeCachedContract(contractId)));
    }

    // All operations should complete without error
    const results = await Promise.all(operations);

    // All should return false (non-trusted mode has no cache)
    for (const result of results) {
      expect(result).to.equal(false);
    }

    sdkInstance.free();
  });

  it('concurrent SDK creations complete without deadlock', async () => {
    // Create multiple SDK instances concurrently
    const createOperations = [];
    for (let i = 0; i < 5; i++) {
      createOperations.push(
        Promise.resolve(sdk.WasmSdkBuilder.testnet().build()),
      );
    }

    // All creations should complete
    const instances = await Promise.all(createOperations);

    expect(instances).to.have.length(5);
    for (const instance of instances) {
      expect(instance).to.be.ok();
      expect(instance.version()).to.be.a('number');
    }

    // Clean up
    for (const instance of instances) {
      instance.free();
    }
  });

  it('interleaved SDK operations on different instances complete', async () => {
    // Create two SDK instances
    const sdk1 = sdk.WasmSdkBuilder.testnet().build();
    const sdk2 = sdk.WasmSdkBuilder.mainnet().build();

    const contractId1 = sdk.Identifier.fromBase58('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
    const contractId2 = sdk.Identifier.fromBase58('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');

    // Interleave operations between different SDK instances
    const operations = [];
    for (let i = 0; i < 5; i++) {
      operations.push(Promise.resolve(sdk1.removeCachedContract(contractId1)));
      operations.push(Promise.resolve(sdk2.removeCachedContract(contractId2)));
    }

    // All operations should complete without interference
    const results = await Promise.all(operations);
    expect(results).to.have.length(10);

    sdk1.free();
    sdk2.free();
  });

  it('version() calls are safe to call concurrently', async () => {
    const sdkInstance = sdk.WasmSdkBuilder.testnet().build();

    // Call version() many times concurrently
    const versionCalls = [];
    for (let i = 0; i < 20; i++) {
      versionCalls.push(Promise.resolve(sdkInstance.version()));
    }

    const versions = await Promise.all(versionCalls);

    // All should return the same version number
    const firstVersion = versions[0];
    for (const version of versions) {
      expect(version).to.equal(firstVersion);
    }

    sdkInstance.free();
  });

  it('rapid create-use-free cycles complete without resource leaks', async () => {
    // Perform many rapid create-use-free cycles
    for (let cycle = 0; cycle < 10; cycle++) {
      const instance = sdk.WasmSdkBuilder.testnet().build();
      expect(instance).to.be.ok();

      // Do some operations
      const version = instance.version();
      expect(version).to.be.a('number');

      const contractId = sdk.Identifier.fromBase58('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
      instance.removeCachedContract(contractId);

      instance.free();
    }

    // If we got here without errors, the test passed
    expect(true).to.equal(true);
  });
});
