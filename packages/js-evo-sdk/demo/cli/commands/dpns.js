/**
 * DPNS CLI Commands
 *
 * Uses worker-based operations to avoid WASM reader lock issues.
 * All DPNS operations are executed in isolated Node.js child processes.
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  formatIdentityId,
  printTable,
  success,
  error,
} from '../utils.js';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

/**
 * Resolve a DPNS name
 */
export async function dpnsResolve(name, globalOpts) {
  // Normalize name
  const normalizedName = name.endsWith('.dash') ? name : `${name}.dash`;

  const spinner = ora(`Resolving ${normalizedName}...`).start();

  try {
    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'dpns-resolve',
      { name: normalizedName },
      { network: globalOpts.network || 'testnet' }
    );

    if (!result.found) {
      spinner.fail(`Name "${normalizedName}" not found`);
      return;
    }

    spinner.succeed(`Name resolved: ${chalk.green(normalizedName)}`);
    printTable({
      'Name': chalk.green(normalizedName),
      'Label': normalizedName.replace('.dash', ''),
      'Identity ID': formatIdentityId(result.identityId),
    }, 'DPNS Name');

  } catch (err) {
    spinner.fail('Resolution failed');
    throw err;
  }
}

/**
 * Search for DPNS names
 * NOTE: Search functionality is not currently available in the WASM SDK
 */
export async function dpnsSearch(prefix, options, globalOpts) {
  const spinner = ora(`Searching for names starting with "${prefix}"...`).start();
  spinner.fail('Search functionality is not currently available in the SDK');
  console.log(chalk.gray('\nNote: DPNS name search requires document queries, which are not yet implemented.'));
  console.log(chalk.gray('Use "dpns resolve <name>" to look up specific names.'));
}

/**
 * Check DPNS name availability
 */
export async function dpnsCheckAvailable(name, globalOpts) {
  const label = name.replace('.dash', '');
  const spinner = ora(`Checking if "${label}.dash" is available...`).start();

  try {
    // Use worker-based operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'dpns-is-available',
      { label },
      { network: globalOpts.network || 'testnet' }
    );

    if (result.isAvailable) {
      spinner.succeed(`Name "${chalk.green(label + '.dash')}" is available!`);
    } else {
      spinner.info(`Name "${chalk.yellow(label + '.dash')}" is taken.`);
    }

    return result.isAvailable;
  } catch (err) {
    spinner.fail('Availability check failed');
    throw err;
  }
}

/**
 * Register a DPNS name
 * NOTE: Registration requires write operations which are not yet worker-enabled
 */
export async function dpnsRegister(options, globalOpts) {
  const { name, identity, key } = options;

  // Validate name format
  if (!/^[a-z0-9-]+$/i.test(name)) {
    error('Invalid name format. Use only alphanumeric characters and hyphens.');
    return;
  }

  const spinner = ora(`Registering ${name}.dash...`).start();

  try {
    // Check availability first using worker
    spinner.text = 'Checking name availability...';
    const availResult = await runWasmOperation(
      'dpns-is-available',
      { label: name },
      { network: globalOpts.network || 'testnet' }
    );

    if (!availResult.isAvailable) {
      spinner.fail(`Name "${name}.dash" is not available`);
      return;
    }

    spinner.text = 'Registering name...';
    spinner.fail('DPNS registration is not yet implemented in CLI demo');
    console.log(chalk.gray('\nNote: Name registration requires identity key management.'));
    console.log(chalk.gray('Use the web demo or SDK directly for full registration.'));

  } catch (err) {
    spinner.fail('Registration failed');
    throw err;
  }
}
