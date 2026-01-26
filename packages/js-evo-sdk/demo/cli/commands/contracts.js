/**
 * Contracts CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatIdentityId,
  printTable,
  printJson,
} from '../utils.js';

/**
 * Get a data contract by ID
 */
export async function contractsGet(contractId, globalOpts) {
  const spinner = ora('Fetching data contract...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const contract = await sdk.contracts.get(contractId);

    if (!contract) {
      spinner.fail('Contract not found');
      return;
    }

    spinner.succeed('Contract fetched');

    const data = contract.toJSON ? contract.toJSON() : contract;

    printTable({
      'Contract ID': chalk.green(contractId),
      'Owner ID': formatIdentityId(data.$ownerId || data.ownerId || 'N/A'),
      'Version': data.$version?.toString() || data.version?.toString() || 'N/A',
      'Revision': data.$revision?.toString() || 'N/A',
    }, 'Data Contract');

    // Show document types
    const schema = data.$defs || data.documents || data.documentSchemas || {};
    const documentTypes = Object.keys(schema);

    if (documentTypes.length > 0) {
      console.log(chalk.bold.cyan('Document Types:'));
      console.log(chalk.gray('─'.repeat(50)));

      for (const type of documentTypes) {
        const typeSchema = schema[type];
        const propCount = Object.keys(typeSchema.properties || {}).length;
        const indices = typeSchema.indices?.length || 0;

        console.log(`  ${chalk.yellow(type)}`);
        console.log(`    ${chalk.gray('Properties:')} ${propCount}`);
        console.log(`    ${chalk.gray('Indices:')} ${indices}`);
      }

      console.log();
    }

    if (globalOpts.verbose) {
      console.log(chalk.bold.cyan('Full Contract Schema:'));
      printJson(data);
    }

  } catch (err) {
    spinner.fail('Failed to fetch contract');
    throw err;
  }
}
