import wasmSdkInit, { DashPlatformSDK } from '@dashevo/wasm-sdk';

async function main() {
  await wasmSdkInit();
  
  const sdk = new DashPlatformSDK();
  sdk.setNetwork('testnet');
  await sdk.initialize();
  
  const identity = await sdk.identities.get('DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq');
  const json = identity.toJSON();
  
  console.log('Identity:', json.id);
  console.log('Balance:', json.balance);
  console.log('Public Keys:');
  const secLevels = ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'];
  json.publicKeys.forEach(k => {
    console.log('  Key ID', k.id, '- Security Level:', k.securityLevel, '(' + secLevels[k.securityLevel] + ')', '- Purpose:', k.purpose);
  });
  
  process.exit(0);
}

main().catch(console.error);
