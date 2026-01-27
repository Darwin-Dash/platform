/**
 * Documents CLI Commands
 *
 * Uses worker operations to avoid WASM reader lock issues.
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  formatIdentityId,
  printJson,
} from '../utils.js';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

/**
 * Query documents from a data contract
 */
export async function documentsQuery(options, globalOpts) {
  const { contract, type, limit, where } = options;
  const limitNum = parseInt(limit, 10) || 10;

  const spinner = ora(`Querying ${type} documents...`).start();

  try {
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

    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'document-query',
      {
        contractId: contract,
        documentType: type,
        query: {
          where: whereClause,
          limit: limitNum,
        },
      },
      { network: globalOpts.network || 'testnet' }
    );

    const documents = result.documents || [];
    spinner.succeed(`Found ${chalk.cyan(documents.length)} documents`);

    if (documents.length === 0) {
      console.log(chalk.gray('\nNo documents found.'));
      return;
    }

    console.log(chalk.bold.cyan('\nDocuments:'));
    console.log(chalk.gray('─'.repeat(60)));

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      console.log(chalk.yellow(`\n[${i + 1}] Document ID: ${doc.$id || doc.id || 'N/A'}`));
      console.log(chalk.gray(`    Owner: ${formatIdentityId(doc.$ownerId || 'N/A')}`));

      if (globalOpts.verbose) {
        console.log(chalk.gray('    Data:'));
        printJson(doc);
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

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'document-get',
      {
        contractId: contract,
        documentType: type,
        documentId: documentId,
      },
      { network: globalOpts.network || 'testnet' }
    );

    if (!result.found) {
      spinner.fail('Document not found');
      return;
    }

    spinner.succeed('Document fetched');

    const doc = result.document;

    console.log(chalk.bold.cyan('\nDocument Details:'));
    console.log(chalk.gray('─'.repeat(60)));

    console.log(chalk.gray('  ID:'), chalk.green(doc.$id || doc.id || documentId));
    console.log(chalk.gray('  Owner:'), formatIdentityId(doc.$ownerId || 'N/A'));
    console.log(chalk.gray('  Contract:'), formatIdentityId(contract));
    console.log(chalk.gray('  Type:'), type);
    console.log(chalk.gray('  Revision:'), doc.$revision || 'N/A');
    console.log(chalk.gray('  Created:'), doc.$createdAt || 'N/A');
    console.log(chalk.gray('  Updated:'), doc.$updatedAt || 'N/A');

    console.log(chalk.bold.cyan('\nProperties:'));
    printJson(doc);

  } catch (err) {
    spinner.fail('Failed to fetch document');
    throw err;
  }
}
