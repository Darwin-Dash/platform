import init, * as sdk from '../../dist/sdk.compressed.js';

describe('WasmSdkBuilder', () => {
  before(async () => {
    await init();
  });

  it('WasmSdkBuilder static methods exist', () => {
    expect(sdk.WasmSdkBuilder).to.be.a('function');
    expect(sdk.WasmSdkBuilder.getLatestVersionNumber).to.be.a('function');
    expect(sdk.WasmSdkBuilder.mainnet).to.be.a('function');
    expect(sdk.WasmSdkBuilder.testnet).to.be.a('function');
    expect(sdk.WasmSdkBuilder.mainnetTrusted).to.be.a('function');
    expect(sdk.WasmSdkBuilder.testnetTrusted).to.be.a('function');
  });

  it('builds testnet builder and sets version', async () => {
    let builder = sdk.WasmSdkBuilder.testnet();
    expect(builder).to.be.ok();
    // note: builder methods consume and return a new builder
    builder = builder.withVersion(1);
    const built = await builder.build();
    expect(built).to.be.ok();
    built.free();
  });

  it('applies custom settings (timeouts, retries, ban flag)', async () => {
    // withSettings(connect_timeout_ms, timeout_ms, retries, ban_failed_address)
    let builder = sdk.WasmSdkBuilder.testnet();
    builder = builder.withSettings(5000, 10000, 3, true);
    const built = await builder.build();
    expect(built).to.be.ok();
    built.free();
  });

  it('WasmSdk has new prefetch static methods', () => {
    // These are the new instance-based prefetch methods that avoid global state
    expect(sdk.WasmSdk.prefetchMainnet).to.be.a('function');
    expect(sdk.WasmSdk.prefetchTestnet).to.be.a('function');
    expect(sdk.WasmSdk.prefetchLocal).to.be.a('function');
  });

  it('WasmSdkBuilder has withPrefetchedContext method', () => {
    // This method allows using prefetched context with the builder
    expect(sdk.WasmSdkBuilder.prototype.withPrefetchedContext).to.be.a('function');
  });

  it('WasmPrefetchedContext class is exported', () => {
    // The prefetched context class should be available
    expect(sdk.WasmPrefetchedContext).to.be.a('function');
  });

  it('WasmSdk has removeCachedContract method', () => {
    // This method is part of the instance-based cache operations
    expect(sdk.WasmSdk.prototype.removeCachedContract).to.be.a('function');
  });

  it('withAddresses static method exists', () => {
    // New static method for creating builder with custom addresses
    expect(sdk.WasmSdkBuilder.withAddresses).to.be.a('function');
  });

  it('local and localTrusted builder methods exist', () => {
    expect(sdk.WasmSdkBuilder.local).to.be.a('function');
    expect(sdk.WasmSdkBuilder.localTrusted).to.be.a('function');
  });
});
