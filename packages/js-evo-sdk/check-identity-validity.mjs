import * as dash from '@dashevo/dashcore-lib';

const identityId = 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';

console.log('Checking identity ID validity...\n');
console.log(`ID: ${identityId}`);
console.log(`Length: ${identityId.length}`);

try {
  // Try to decode as base58check (Dash addresses use base58)
  const decoded = dash.encoding.Base58.decode(identityId);
  console.log(`Decoded length: ${decoded.length} bytes`);
  
  // Identity IDs should be 32 bytes when decoded
  if (decoded.length === 32) {
    console.log('✓ Valid identity ID format (32 bytes base58)');
  } else {
    console.log(`✗ Invalid length: ${decoded.length} (should be 32)`);
  }
} catch (error) {
  console.log(`✗ Not valid base58: ${error.message}`);
}
