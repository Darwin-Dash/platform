/**
 * Identity CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
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

/**
 * Discover identities from mnemonic
 */
export async function identityDiscover(options, globalOpts) {
  validateMnemonic(options.mnemonic);

  const spinner = ora('Discovering identities...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const gapLimit = parseInt(options.gapLimit, 10) || 20;

    spinner.text = 'Scanning wallet for identities...';

    const identities = await sdk.identities.getIdentityIds(options.mnemonic, {
      gapLimit,
      onProgress: (state) => {
        spinner.text = `Scanning index ${state.currentIndex}, found ${state.foundCount} identities...`;
      },
    });

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
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    spinner.text = 'Finding UTXOs and creating identity...';

    const result = await sdk.identities.createWithWallet(
      options.mnemonic,
      amount,
      {
        onProgress: createProgressCallback(spinner),
      }
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
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    // Get current balance
    spinner.text = 'Getting current balance...';
    const currentBalance = await sdk.identities.balance(options.id);

    spinner.text = 'Processing top-up...';

    const result = await sdk.identities.topUpWithWallet(
      options.id,
      amount,
      options.mnemonic,
      {
        onProgress: createProgressCallback(spinner),
      }
    );

    spinner.succeed('Identity topped up successfully!');

    printTable({
      'Identity ID': formatIdentityId(options.id),
      'Previous Balance': formatCredits(currentBalance),
      'Added': formatCredits(amount * 1000),
      'New Balance': formatCredits(result.newBalance || (currentBalance + BigInt(amount * 1000))),
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
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const identity = await sdk.identities.get(identityId);

    spinner.succeed('Identity fetched');

    // Convert to JSON for display
    const data = identity.toJSON ? identity.toJSON() : identity;

    printTable({
      'Identity ID': chalk.green(data.id),
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
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const balance = await sdk.identities.balance(identityId);

    spinner.succeed('Balance fetched');

    console.log(`\n  ${chalk.gray('Identity:')} ${formatIdentityId(identityId)}`);
    console.log(`  ${chalk.gray('Balance:')}  ${chalk.green(formatCredits(balance))}\n`);

  } catch (err) {
    spinner.fail('Failed to fetch balance');
    throw err;
  }
}
