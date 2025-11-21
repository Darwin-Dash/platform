import init, * as sdk from '@dashevo/wasm-sdk/compressed';

console.log('Debugging quorum fetch...\n');

await init();
console.log('✓ WASM initialized');

// Try fetching quorum data manually
console.log('\nFetching quorum data from testnet...');

const response = await fetch('https://quorums.testnet.networks.dash.org/quorums');
const data = await response.json();

console.log(`Total quorums available: ${data.data.length}`);
console.log('Quorum hashes (first 5):');
data.data.slice(0, 5).forEach((q, i) => {
  console.log(`  ${i+1}. ${q.quorum_hash}`);
});

// Check if our failing hash is present
const failingHash = '00000045060921a49c3f1c83964b3709c979e46da3cb5cbe9912204d2e05eef3';
const found = data.data.find(q => q.quorum_hash === failingHash);

if (found) {
  console.log(`\n✓ Found failing hash in quorum list!`);
  console.log(`  Height: ${found.height}, Members: ${found.valid_members_count}`);
} else {
  console.log(`\n✗ Failing hash NOT in current quorum list`);
  console.log(`\nLooks like the identity references an OLD quorum that's been rotated out.`);
  console.log(`Current quorums are at heights: ${data.data[0].height} to ${data.data[data.data.length-1].height}`);
}
