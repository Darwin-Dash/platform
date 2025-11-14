#!/usr/bin/env node

/**
 * SSH Tunnel Creation Script
 * Creates SSH tunnels for accessing remote regtest DAPI and RPC services
 *
 * Usage: npm run tunnel:create
 */

const { execSync } = require('child_process');
const path = require('path');

// Configuration
const DASHMATE_SSH_HOST = process.env.DASHMATE_SSH_HOST || 'ruald@10.0.0.119';
const TUNNELS = {
  dapi: {
    name: 'DAPI',
    localPort: 2443,
    remoteHost: '127.0.0.1',
    remotePort: 2443,
  },
  rpc: {
    name: 'RPC',
    localPort: 20002,
    remoteHost: '127.0.0.1',
    remotePort: 20002,
  },
};

/**
 * Check if a port is already in use
 */
function isPortInUse(port) {
  try {
    execSync(`lsof -i :${port} 2>/dev/null | grep -q LISTEN`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an SSH tunnel
 */
function createTunnel(config, sshHost) {
  if (isPortInUse(config.localPort)) {
    console.log(`✓ ${config.name} tunnel already active on port ${config.localPort}`);
    return true;
  }

  const cmd = `ssh -f -N -L ${config.localPort}:${config.remoteHost}:${config.remotePort} ${sshHost}`;

  try {
    console.log(`Creating ${config.name} tunnel on port ${config.localPort}...`);
    execSync(cmd, { timeout: 10000, stdio: 'pipe' });

    // Wait for tunnel to establish
    for (let i = 0; i < 5; i++) {
      if (isPortInUse(config.localPort)) {
        console.log(`✓ ${config.name} tunnel created successfully`);
        return true;
      }
      // Sleep 200ms
      require('child_process').execSync('sleep 0.2');
    }

    console.error(`✗ ${config.name} tunnel created but not listening`);
    return false;
  } catch (error) {
    console.error(
      `✗ Failed to create ${config.name} tunnel:\n` +
      `  SSH Host: ${sshHost}\n` +
      `  Command: ${cmd}\n` +
      `  Error: ${error.message}\n\n` +
      `To fix, try:\n` +
      `1. Verify SSH access: ssh ${sshHost} "echo OK"\n` +
      `2. Set up SSH key auth: ssh-add ~/.ssh/id_rsa\n` +
      `3. Or manually create the tunnel:\n` +
      `   ssh -L ${config.localPort}:${config.remoteHost}:${config.remotePort} ${sshHost}`
    );
    return false;
  }
}

// Main
console.log('Setting up SSH tunnels for regtest integration tests...\n');

let allSuccess = true;
Object.values(TUNNELS).forEach(tunnel => {
  if (!createTunnel(tunnel, DASHMATE_SSH_HOST)) {
    allSuccess = false;
  }
});

if (allSuccess) {
  console.log('\n✓ All SSH tunnels are ready!');
  console.log(`\nYou can now run integration tests:\n  npm run test:integration\n`);
  process.exit(0);
} else {
  console.log('\n⚠ Some tunnels failed. Integration tests may not work.');
  console.log('See errors above for more details.\n');
  process.exit(1);
}
