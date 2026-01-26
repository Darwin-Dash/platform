/**
 * Documents CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatIdentityId,
  printJson,
  success,
} from '../utils.js';

/**
 * Query documents from a data contract
 */
export async function documentsQuery(options, globalOpts) {
  const { contract, type, limit, where } = options;
  const limitNum = parseInt(limit, 10) || 10;

  const spinner = ora(`Querying ${type} documents...`).start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    // Parse where clause if provided
    let whereClause = [];
    if (where) {
      try {
        whereClause = JSON.parse(where);
      } catch {
        spinner.fail('Invalid JSON in --where clause');
        return;
      }
    }

    const results = await sdk.documents.query({
      contractId: contract,
      documentType: type,
      where: whereClause,
      limit: limitNum,
    });

    spinner.succeed(`Found ${chalk.cyan(results.length)} documents`);

    if (results.length === 0) {
      console.log(chalk.gray('\nNo documents found.'));
      return;
    }

    console.log(chalk.bold.cyan('\nDocuments:'));
    console.log(chalk.gray('─'.repeat(60)));

    for (let i = 0; i < results.length; i++) {
      const doc = results[i];
      const data = doc.toJSON ? doc.toJSON() : doc;

      console.log(chalk.yellow(`\n[${i + 1}] Document ID: ${data.$id || data.id || 'N/A'}`));
      console.log(chalk.gray(`    Owner: ${formatIdentityId(data.$ownerId || 'N/A')}`));

      if (globalOpts.verbose) {
        console.log(chalk.gray('    Data:'));
        printJson(data);
      }
    }

    console.log();

  } catch (err) {
    spinner.fail('Query failed');
    throw err;
  }
}

/**
 * Get a specific document
 */
export async function documentsGet(documentId, options, globalOpts) {
  const { contract, type } = options;

  const spinner = ora('Fetching document...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const result = await sdk.documents.get({
      contractId: contract,
      documentType: type,
      documentIds: [documentId],
    });

    if (!result || result.length === 0) {
      spinner.fail('Document not found');
      return;
    }

    spinner.succeed('Document fetched');

    const doc = result[0];
    const data = doc.toJSON ? doc.toJSON() : doc;

    console.log(chalk.bold.cyan('\nDocument Details:'));
    console.log(chalk.gray('─'.repeat(60)));

    console.log(chalk.gray('  ID:'), chalk.green(data.$id || data.id || documentId));
    console.log(chalk.gray('  Owner:'), formatIdentityId(data.$ownerId || 'N/A'));
    console.log(chalk.gray('  Contract:'), formatIdentityId(contract));
    console.log(chalk.gray('  Type:'), type);
    console.log(chalk.gray('  Revision:'), data.$revision || 'N/A');
    console.log(chalk.gray('  Created:'), data.$createdAt || 'N/A');
    console.log(chalk.gray('  Updated:'), data.$updatedAt || 'N/A');

    console.log(chalk.bold.cyan('\nProperties:'));
    printJson(data);

  } catch (err) {
    spinner.fail('Failed to fetch document');
    throw err;
  }
}
