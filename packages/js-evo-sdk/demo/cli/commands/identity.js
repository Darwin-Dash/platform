/**
 * Identity CLI Commands
 *
 * Uses worker-based operations to avoid WASM reader lock issues.
 * All WASM SDK operations are executed in isolated Node.js child processes.
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  formatCredits,
  formatIdentityId,
  printTable,
  printJson,
  success,
  error,
  validateMnemonic,
  parseAmount,
  createProgressCallback,
} from '../utils.js';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

/**
 * Discover identities from mnemonic
 */
export async function identityDiscover(options, globalOpts) {
  validateMnemonic(options.mnemonic);

  const spinner = ora('Discovering identities...').start();

  try {
    const gapLimit = parseInt(options.gapLimit, 10) || 20;

    spinner.text = 'Scanning wallet for identities...';

    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'identity-discover-mnemonic',
      {
        mnemonic: options.mnemonic,
        gapLimit,
      },
      { network: globalOpts.network || 'testnet' }
    );

    const identities = result.identities || [];
    spinner.succeed(`Found ${chalk.cyan(identities.length)} identities`);

    if (identities.length === 0) {
      console.log(chalk.gray('\nNo identities found for this wallet.'));
      console.log(chalk.gray('Use "identity create" to create a new identity.'));
      return;
    }

    console.log(chalk.bold.cyan('\nDiscovered Identities:'));
    console.log(chalk.gray('─'.repeat(70)));

    for (const id of identities) {
      const balance = id.balance !== undefined ? formatCredits(id.balance) : 'N/A';
      console.log(`  ${chalk.white('Index')} ${chalk.yellow(id.index.toString().padStart(2))}: ${chalk.green(id.identityId)}`);
      console.log(`       ${chalk.gray('Balance:')} ${balance}`);
      console.log(`       ${chalk.gray('Revision:')} ${id.revision || 'N/A'}`);
      console.log();
    }

  } catch (err) {
    spinner.fail('Discovery failed');
    throw err;
  }
}

/**
 * Create a new identity
 */
export async function identityCreate(options, globalOpts) {
  validateMnemonic(options.mnemonic);
  const amount = parseAmount(options.amount);

  const spinner = ora('Creating identity...').start();

  try {
    spinner.text = 'Finding UTXOs and creating identity...';

    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'identity-create',
      {
        mnemonic: options.mnemonic,
        amount,
      },
      { network: globalOpts.network || 'testnet', timeout: 300000 }
    );

    spinner.succeed('Identity created successfully!');

    printTable({
      'Identity ID': chalk.green(result.identityId),
      'Transaction': result.transactionId || 'N/A',
      'Index': result.identityIndex?.toString() || '0',
      'Initial Balance': formatCredits(result.balance || amount * 1000),
    }, 'New Identity');

    success(`Your new identity ID: ${result.identityId}`);

  } catch (err) {
    spinner.fail('Identity creation failed');
    throw err;
  }
}

/**
 * Top up an existing identity
 */
export async function identityTopUp(options, globalOpts) {
  validateMnemonic(options.mnemonic);
  const amount = parseAmount(options.amount);

  const spinner = ora('Topping up identity...').start();

  try {
    spinner.text = 'Processing top-up...';

    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'identity-topup',
      {
        identityId: options.id,
        mnemonic: options.mnemonic,
        amount,
      },
      { network: globalOpts.network || 'testnet', timeout: 300000 }
    );

    spinner.succeed('Identity topped up successfully!');

    printTable({
      'Identity ID': formatIdentityId(options.id),
      'Previous Balance': formatCredits(result.previousBalance || 0),
      'Added': formatCredits(amount * 1000),
      'New Balance': formatCredits(result.newBalance || 0),
    }, 'Top-Up Result');

  } catch (err) {
    spinner.fail('Top-up failed');
    throw err;
  }
}

/**
 * Get identity details
 */
export async function identityGet(identityId, globalOpts) {
  const spinner = ora('Fetching identity...').start();

  try {
    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'identity-fetch',
      { identityId },
      { network: globalOpts.network || 'testnet' }
    );

    if (!result.found) {
      spinner.fail('Identity not found');
      return;
    }

    spinner.succeed('Identity fetched');

    const data = result.identity || {};

    printTable({
      'Identity ID': chalk.green(data.id || identityId),
      'Balance': formatCredits(data.balance || 0),
      'Revision': data.revision?.toString() || 'N/A',
      'Keys Count': data.publicKeys?.length?.toString() || 'N/A',
    }, 'Identity Details');

    if (globalOpts.verbose && data.publicKeys) {
      console.log(chalk.bold.cyan('Public Keys:'));
      for (const key of data.publicKeys) {
        console.log(`  Key ${chalk.yellow(key.id)}: ${chalk.gray(key.purpose || 'AUTHENTICATION')}`);
      }
    }

  } catch (err) {
    spinner.fail('Failed to fetch identity');
    throw err;
  }
}

/**
 * Get identity balance
 */
export async function identityBalance(identityId, globalOpts) {
  const spinner = ora('Fetching balance...').start();

  try {
    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'identity-fetch',
      { identityId },
      { network: globalOpts.network || 'testnet' }
    );

    if (!result.found) {
      spinner.fail('Identity not found');
      return;
    }

    spinner.succeed('Balance fetched');

    const balance = result.identity?.balance || 0;
    console.log(`\n  ${chalk.gray('Identity:')} ${formatIdentityId(identityId)}`);
    console.log(`  ${chalk.gray('Balance:')}  ${chalk.green(formatCredits(balance))}\n`);

  } catch (err) {
    spinner.fail('Failed to fetch balance');
    throw err;
  }
}
