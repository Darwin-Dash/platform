/**
 * DashPay CLI Commands
 *
 * Uses worker operations to avoid WASM reader lock issues.
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  formatIdentityId,
  printTable,
  printJson,
} from '../utils.js';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

/**
 * Get DashPay profile for an identity
 */
export async function dashpayProfile(identityId, globalOpts) {
  const spinner = ora('Fetching DashPay profile...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'dashpay-profile',
      { identityId },
      { network: globalOpts.network || 'testnet' }
    );

    if (!result.found) {
      spinner.fail('No DashPay profile found for this identity');
      return;
    }

    spinner.succeed('Profile fetched');

    const data = result.profile;
    const props = data.data || data;

    printTable({
      'Identity ID': formatIdentityId(identityId),
      'Display Name': chalk.green(props.displayName || 'Not set'),
      'Public Message': props.publicMessage || 'Not set',
      'Avatar URL': props.avatarUrl || 'Not set',
      'Avatar Hash': props.avatarHash ? props.avatarHash.slice(0, 16) + '...' : 'Not set',
      'Created': data.$createdAt || 'N/A',
      'Updated': data.$updatedAt || 'N/A',
    }, 'DashPay Profile');

    if (globalOpts.verbose) {
      console.log(chalk.bold.cyan('Full Profile Data:'));
      printJson(data);
    }

  } catch (err) {
    spinner.fail('Failed to fetch profile');
    throw err;
  }
}

/**
 * Get contacts for an identity
 */
export async function dashpayContacts(identityId, globalOpts) {
  const spinner = ora('Fetching contacts...').start();

  try {
    // Get both sent and received contact requests using worker operations
    spinner.text = 'Fetching contact requests...';

    const [sentResult, receivedResult] = await Promise.all([
      runWasmOperation(
        'dashpay-contacts-sent',
        { identityId, limit: 50 },
        { network: globalOpts.network || 'testnet' }
      ),
      runWasmOperation(
        'dashpay-contacts-received',
        { identityId, limit: 50 },
        { network: globalOpts.network || 'testnet' }
      ),
    ]);

    const sentCount = sentResult.count || 0;
    const receivedCount = receivedResult.count || 0;

    spinner.succeed(`Found ${chalk.cyan(sentCount + receivedCount)} contact requests`);

    if (sentCount === 0 && receivedCount === 0) {
      console.log(chalk.gray('\nNo contacts found for this identity.'));
      return;
    }

    if (sentCount > 0) {
      console.log(chalk.bold.cyan('\nSent Contact Requests:'));
      console.log(chalk.gray('─'.repeat(50)));

      for (const req of sentResult.requests) {
        const props = req.data || req;
        console.log(`  ${chalk.gray('To:')} ${formatIdentityId(props.toUserId || 'N/A')}`);
        console.log(`    ${chalk.gray('Status:')} ${chalk.yellow('Pending')}`);
      }
    }

    if (receivedCount > 0) {
      console.log(chalk.bold.cyan('\nReceived Contact Requests:'));
      console.log(chalk.gray('─'.repeat(50)));

      for (const req of receivedResult.requests) {
        console.log(`  ${chalk.gray('From:')} ${formatIdentityId(req.$ownerId || 'N/A')}`);
        console.log(`    ${chalk.gray('Status:')} ${chalk.yellow('Pending')}`);
      }
    }

    console.log();

  } catch (err) {
    spinner.fail('Failed to fetch contacts');
    throw err;
  }
}
