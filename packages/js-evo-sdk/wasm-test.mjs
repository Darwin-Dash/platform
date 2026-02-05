// Simple test to verify WASM SDK lock behavior
import { EvoSDK } from './dist/sdk.js';

async function test() {
  console.log('Creating SDK instance...');
  const sdk = new EvoSDK({ network: 'testnet', logs: 'error' });

  console.log('Getting WASM SDK (will connect)...');
  const wasmSdk = await sdk.getWasmSdkConnected();
  console.log('WASM SDK connected');

  console.log('\nTest 1: Calling dpnsResolveName for alice...');
  try {
    const result = await wasmSdk.dpnsResolveName('alice');
    console.log('Result:', result);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test().catch(console.error);
