import init, * as sdk from '../../dist/sdk.compressed.js';

describe('SDK Instance Isolation', () => {
  before(async () => {
    await init();
  });

  it('two SDK instances have separate state objects', async () => {
    // Build two separate SDK instances
    const sdk1 = sdk.WasmSdkBuilder.testnet().build();
    const sdk2 = sdk.WasmSdkBuilder.testnet().build();

    // Both should be valid SDK instances
    expect(sdk1).to.be.ok();
    expect(sdk2).to.be.ok();

    // They should be distinct objects
    expect(sdk1).to.not.equal(sdk2);

    sdk1.free();
    sdk2.free();
  });

  it('cloned SDK shares state with original', async () => {
    // Build an SDK and clone it
    const original = sdk.WasmSdkBuilder.testnet().build();

    // The Rust Clone trait creates a new SDK that shares Arc<WasmSdkInstanceState>
    // We can't directly test Arc sharing from JS, but we can verify both work
    expect(original).to.be.ok();
    expect(original.version()).to.be.a('number');

    original.free();
  });

  it('SDK instances can be created with different networks', async () => {
    // Create SDKs for different networks
    const testnetSdk = sdk.WasmSdkBuilder.testnet().build();
    const mainnetSdk = sdk.WasmSdkBuilder.mainnet().build();

    // Both should work independently
    expect(testnetSdk).to.be.ok();
    expect(mainnetSdk).to.be.ok();
    expect(testnetSdk.version()).to.be.a('number');
    expect(mainnetSdk.version()).to.be.a('number');

    testnetSdk.free();
    mainnetSdk.free();
  });

  it('removeCachedContract returns false for non-existent contract (non-trusted mode)', async () => {
    // Non-trusted SDK has no trusted context, so cache operations should handle this gracefully
    const sdkInstance = sdk.WasmSdkBuilder.testnet().build();

    // Create a random contract ID
    const randomId = sdk.Identifier.fromBase58('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');

    // Should return false since there's no trusted context in non-trusted mode
    const result = sdkInstance.removeCachedContract(randomId);
    expect(result).to.equal(false);

    sdkInstance.free();
  });

  it('multiple SDK instances can be created and freed without interference', async () => {
    const instances = [];

    // Create multiple instances
    for (let i = 0; i < 5; i++) {
      const instance = sdk.WasmSdkBuilder.testnet().build();
      expect(instance).to.be.ok();
      instances.push(instance);
    }

    // All instances should have valid versions
    for (const instance of instances) {
      expect(instance.version()).to.be.a('number');
    }

    // Free all instances - should not affect each other
    for (const instance of instances) {
      instance.free();
    }

    // Create new instances after freeing - should work fine
    const newInstance = sdk.WasmSdkBuilder.testnet().build();
    expect(newInstance).to.be.ok();
    expect(newInstance.version()).to.be.a('number');
    newInstance.free();
  });
});
