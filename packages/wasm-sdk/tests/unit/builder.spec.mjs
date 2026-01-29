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

  it('WasmSdk has prefetch quorum static methods (original API)', () => {
    // These are the original prefetch methods that populate global state
    expect(sdk.WasmSdk.prefetchTrustedQuorumsMainnet).to.be.a('function');
    expect(sdk.WasmSdk.prefetchTrustedQuorumsTestnet).to.be.a('function');
    expect(sdk.WasmSdk.prefetchTrustedQuorumsLocal).to.be.a('function');
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
