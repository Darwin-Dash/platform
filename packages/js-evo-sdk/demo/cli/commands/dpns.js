/**
 * DPNS CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatIdentityId,
  printTable,
  success,
  error,
} from '../utils.js';

/**
 * Resolve a DPNS name
 */
export async function dpnsResolve(name, globalOpts) {
  // Normalize name
  const normalizedName = name.endsWith('.dash') ? name : `${name}.dash`;

  const spinner = ora(`Resolving ${normalizedName}...`).start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const result = await sdk.dpns.resolve(normalizedName);

    if (!result) {
      spinner.fail(`Name "${normalizedName}" not found`);
      return;
    }

    spinner.succeed(`Name resolved: ${chalk.green(normalizedName)}`);

    // Extract document data
    const data = result.toJSON ? result.toJSON() : result;
    const properties = data.$dataContractId ? data : data.data || data;

    printTable({
      'Name': chalk.green(normalizedName),
      'Label': properties.label || normalizedName.replace('.dash', ''),
      'Owner ID': formatIdentityId(data.$ownerId || properties.$ownerId || 'N/A'),
      'Record': properties.records?.dashUniqueIdentityId || properties.records?.dashAliasIdentityId || 'N/A',
      'Normalized Label': properties.normalizedLabel || 'N/A',
      'Parent Domain': properties.normalizedParentDomainName || 'dash',
    }, 'DPNS Name');

  } catch (err) {
    spinner.fail('Resolution failed');
    throw err;
  }
}

/**
 * Search for DPNS names
 */
export async function dpnsSearch(prefix, options, globalOpts) {
  const limit = parseInt(options.limit, 10) || 10;

  const spinner = ora(`Searching for names starting with "${prefix}"...`).start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const results = await sdk.dpns.search(prefix, 'dash', { limit });

    spinner.succeed(`Found ${chalk.cyan(results.length)} names`);

    if (results.length === 0) {
      console.log(chalk.gray('\nNo names found with that prefix.'));
      return;
    }

    console.log(chalk.bold.cyan('\nMatching Names:'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const doc of results) {
      const data = doc.toJSON ? doc.toJSON() : doc;
      const properties = data.$dataContractId ? data : data.data || data;
      const label = properties.label || 'unknown';
      const ownerId = data.$ownerId || properties.$ownerId || 'N/A';

      console.log(`  ${chalk.green(label + '.dash')}`);
      console.log(`    ${chalk.gray('Owner:')} ${formatIdentityId(ownerId)}`);
    }

    console.log();

  } catch (err) {
    spinner.fail('Search failed');
    throw err;
  }
}

/**
 * Register a DPNS name
 */
export async function dpnsRegister(options, globalOpts) {
  const { name, identity, key } = options;

  // Validate name format
  if (!/^[a-z0-9-]+$/i.test(name)) {
    error('Invalid name format. Use only alphanumeric characters and hyphens.');
    return;
  }

  const spinner = ora(`Registering ${name}.dash...`).start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    // Check availability first
    spinner.text = 'Checking name availability...';
    const isAvailable = await sdk.dpns.isAvailable(name, 'dash');

    if (!isAvailable) {
      spinner.fail(`Name "${name}.dash" is not available`);
      return;
    }

    spinner.text = 'Registering name...';

    const result = await sdk.dpns.register({
      label: name,
      identityId: identity,
      privateKeyWif: key,
    });

    spinner.succeed(`Name registered: ${chalk.green(name + '.dash')}`);

    printTable({
      'Name': chalk.green(`${name}.dash`),
      'Owner': formatIdentityId(identity),
      'Status': chalk.green('Registered'),
    }, 'Registration Complete');

  } catch (err) {
    spinner.fail('Registration failed');
    throw err;
  }
}
