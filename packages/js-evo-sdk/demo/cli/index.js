#!/usr/bin/env node
/**
 * js-evo-sdk CLI Demo
 *
 * Interactive CLI for demonstrating all SDK features.
 *
 * Usage:
 *   node demo/cli/index.js --help
 *   node demo/cli/index.js identity discover --mnemonic "..."
 *   node demo/cli/index.js dpns resolve --name "alice.dash"
 *
 * Environment Variables (loaded from .env file):
 *   MNEMONIC - Default mnemonic for wallet operations
 *   NETWORK  - Network to use (testnet, mainnet, local). Default: testnet
 */

// Load environment variables from .env file
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from package root (two levels up from demo/cli/)
config({ path: join(__dirname, '..', '..', '.env') });

import { Command } from 'commander';
import chalk from 'chalk';

// Command modules (lazy loaded)
const program = new Command();

// ASCII art banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('Dash Platform SDK')} ${chalk.gray('(js-evo-sdk)')} ${chalk.yellow('v3.0.0')}               ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('A comprehensive JavaScript SDK for Dash Platform')}        ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}
`;

// Program metadata
program
  .name('evo-sdk')
  .version('3.0.0')
  .description('Dash Platform SDK CLI Demo - Interact with Dash Platform from the command line')
  .option('-n, --network <network>', 'Network to use (testnet, mainnet, local)', 'testnet')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--no-banner', 'Disable banner display')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().banner !== false && !process.env.NO_BANNER) {
      console.log(banner);
    }
  });

// ============================================================================
// Identity Commands
// ============================================================================

const identity = program
  .command('identity')
  .alias('id')
  .description('Identity management operations');

identity
  .command('discover')
  .description('Discover all identities associated with a mnemonic')
  .requiredOption('-m, --mnemonic <mnemonic>', 'BIP39 mnemonic (12 words)', process.env.MNEMONIC)
  .option('--gap-limit <number>', 'Gap limit for discovery', '20')
  .action(async (options) => {
    const { identityDiscover } = await import('./commands/identity.js');
    await identityDiscover(options, program.opts());
  });

identity
  .command('create')
  .description('Create a new identity with wallet funding')
  .requiredOption('-m, --mnemonic <mnemonic>', 'BIP39 mnemonic (12 words)', process.env.MNEMONIC)
  .option('-a, --amount <duffs>', 'Amount in duffs to fund identity', '200000')
  .action(async (options) => {
    const { identityCreate } = await import('./commands/identity.js');
    await identityCreate(options, program.opts());
  });

identity
  .command('topup')
  .description('Top up an existing identity')
  .requiredOption('-i, --id <identityId>', 'Identity ID to top up')
  .requiredOption('-m, --mnemonic <mnemonic>', 'BIP39 mnemonic (12 words)', process.env.MNEMONIC)
  .option('-a, --amount <duffs>', 'Amount in duffs to add', '50000')
  .action(async (options) => {
    const { identityTopUp } = await import('./commands/identity.js');
    await identityTopUp(options, program.opts());
  });

identity
  .command('get <identityId>')
  .description('Get identity details by ID')
  .action(async (identityId, options) => {
    const { identityGet } = await import('./commands/identity.js');
    await identityGet(identityId, program.opts());
  });

identity
  .command('balance <identityId>')
  .description('Get identity balance')
  .action(async (identityId) => {
    const { identityBalance } = await import('./commands/identity.js');
    await identityBalance(identityId, program.opts());
  });

// ============================================================================
// DPNS Commands
// ============================================================================

const dpns = program
  .command('dpns')
  .alias('names')
  .description('Dash Platform Naming Service operations');

dpns
  .command('resolve <name>')
  .description('Resolve a DPNS name to an identity')
  .action(async (name) => {
    const { dpnsResolve } = await import('./commands/dpns.js');
    await dpnsResolve(name, program.opts());
  });

dpns
  .command('search <prefix>')
  .description('Search for DPNS names by prefix')
  .option('-l, --limit <number>', 'Maximum results', '10')
  .action(async (prefix, options) => {
    const { dpnsSearch } = await import('./commands/dpns.js');
    await dpnsSearch(prefix, options, program.opts());
  });

dpns
  .command('register')
  .description('Register a DPNS name')
  .requiredOption('-n, --name <name>', 'Name to register (without .dash)')
  .requiredOption('-i, --identity <identityId>', 'Identity ID to register name for')
  .requiredOption('-k, --key <privateKeyWif>', 'Private key WIF for signing')
  .action(async (options) => {
    const { dpnsRegister } = await import('./commands/dpns.js');
    await dpnsRegister(options, program.opts());
  });

// ============================================================================
// Documents Commands
// ============================================================================

const documents = program
  .command('documents')
  .alias('docs')
  .description('Document operations');

documents
  .command('query')
  .description('Query documents from a data contract')
  .requiredOption('-c, --contract <contractId>', 'Data contract ID')
  .requiredOption('-t, --type <documentType>', 'Document type')
  .option('-l, --limit <number>', 'Maximum results', '10')
  .option('-w, --where <json>', 'Where clause as JSON')
  .action(async (options) => {
    const { documentsQuery } = await import('./commands/documents.js');
    await documentsQuery(options, program.opts());
  });

documents
  .command('get <documentId>')
  .description('Get a specific document by ID')
  .requiredOption('-c, --contract <contractId>', 'Data contract ID')
  .requiredOption('-t, --type <documentType>', 'Document type')
  .action(async (documentId, options) => {
    const { documentsGet } = await import('./commands/documents.js');
    await documentsGet(documentId, options, program.opts());
  });

// ============================================================================
// Tokens Commands
// ============================================================================

const tokens = program
  .command('tokens')
  .description('Token operations');

tokens
  .command('balance')
  .description('Get token balances for an identity')
  .requiredOption('-i, --identity <identityId>', 'Identity ID')
  .option('-t, --token <tokenId>', 'Specific token ID (optional)')
  .action(async (options) => {
    const { tokensBalance } = await import('./commands/tokens.js');
    await tokensBalance(options, program.opts());
  });

tokens
  .command('supply <tokenId>')
  .description('Get total supply of a token')
  .action(async (tokenId) => {
    const { tokensSupply } = await import('./commands/tokens.js');
    await tokensSupply(tokenId, program.opts());
  });

// ============================================================================
// Credits Commands
// ============================================================================

const credits = program
  .command('credits')
  .description('Credit transfer and withdrawal operations');

credits
  .command('transfer')
  .description('Transfer credits between identities')
  .requiredOption('-f, --from <identityId>', 'Sender identity ID')
  .requiredOption('-t, --to <identityId>', 'Recipient identity ID')
  .requiredOption('-a, --amount <duffs>', 'Amount in duffs')
  .requiredOption('-k, --key <privateKeyWif>', 'Private key WIF for signing')
  .action(async (options) => {
    const { creditsTransfer } = await import('./commands/credits.js');
    await creditsTransfer(options, program.opts());
  });

credits
  .command('withdraw')
  .description('Withdraw credits to a blockchain address')
  .requiredOption('-i, --identity <identityId>', 'Source identity ID')
  .requiredOption('-t, --to <address>', 'Destination address')
  .requiredOption('-a, --amount <duffs>', 'Amount in duffs')
  .requiredOption('-k, --key <privateKeyWif>', 'Private key WIF for signing')
  .action(async (options) => {
    const { creditsWithdraw } = await import('./commands/credits.js');
    await creditsWithdraw(options, program.opts());
  });

// ============================================================================
// System Commands
// ============================================================================

const system = program
  .command('system')
  .alias('sys')
  .description('System status and information');

system
  .command('status')
  .description('Get platform status')
  .action(async () => {
    const { systemStatus } = await import('./commands/system.js');
    await systemStatus(program.opts());
  });

system
  .command('epoch')
  .description('Get current epoch information')
  .action(async () => {
    const { systemEpoch } = await import('./commands/system.js');
    await systemEpoch(program.opts());
  });

system
  .command('version')
  .description('Get protocol version')
  .action(async () => {
    const { systemVersion } = await import('./commands/system.js');
    await systemVersion(program.opts());
  });

// ============================================================================
// DashPay Commands
// ============================================================================

const dashpay = program
  .command('dashpay')
  .alias('dp')
  .description('DashPay profile and contact operations');

dashpay
  .command('profile <identityId>')
  .description('Get DashPay profile for an identity')
  .action(async (identityId) => {
    const { dashpayProfile } = await import('./commands/dashpay.js');
    await dashpayProfile(identityId, program.opts());
  });

dashpay
  .command('contacts <identityId>')
  .description('Get contacts for an identity')
  .action(async (identityId) => {
    const { dashpayContacts } = await import('./commands/dashpay.js');
    await dashpayContacts(identityId, program.opts());
  });

// ============================================================================
// Onboard Command (Full Workflow)
// ============================================================================

program
  .command('onboard')
  .description('Full onboarding workflow: create identity, register name, create profile')
  .requiredOption('-m, --mnemonic <mnemonic>', 'BIP39 mnemonic (12 words)', process.env.MNEMONIC)
  .requiredOption('-n, --name <name>', 'DPNS name to register')
  .option('-d, --display-name <displayName>', 'Display name for profile')
  .option('-a, --amount <duffs>', 'Amount in duffs to fund identity', '500000')
  .action(async (options) => {
    const { onboard } = await import('./commands/onboard.js');
    await onboard(options, program.opts());
  });

// ============================================================================
// Contracts Command
// ============================================================================

const contracts = program
  .command('contracts')
  .description('Data contract operations');

contracts
  .command('get <contractId>')
  .description('Get a data contract by ID')
  .action(async (contractId) => {
    const { contractsGet } = await import('./commands/contracts.js');
    await contractsGet(contractId, program.opts());
  });

// ============================================================================
// Error Handling & Execution
// ============================================================================

// Global error handler
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(0);
  }

  console.error(chalk.red('\nError:'), err.message);

  if (program.opts().verbose) {
    console.error(chalk.gray('\nStack trace:'));
    console.error(chalk.gray(err.stack));
  }

  process.exit(1);
}
