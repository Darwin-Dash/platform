// Check if it looks like a valid Dash identity (base58check format)
const identityId = 'DcoJJ3W9JauwLD51vzNuXJ9vnaZT7mprVm7wbgVYifNq';

console.log('Identity ID Analysis:');
console.log('Value:', identityId);
console.log('Length:', identityId.length);
console.log('Starts with D:', identityId.startsWith('D'));

// Base58 alphabet check
const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let isValidBase58 = true;
for (const char of identityId) {
  if (!base58Alphabet.includes(char)) {
    console.log('Invalid character:', char);
    isValidBase58 = false;
  }
}

if (isValidBase58) {
  console.log('✓ All characters are valid base58');
}

// Typical Dash identity IDs start with D and are 44 characters
if (identityId.startsWith('D') && identityId.length === 44) {
  console.log('✓ Format matches Dash identity ID pattern (D + 43 chars)');
} else {
  console.log('✗ Format does not match pattern');
}
