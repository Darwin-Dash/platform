/**
 * DashPay CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatIdentityId,
  printTable,
  printJson,
  success,
} from '../utils.js';

/**
 * Get DashPay profile for an identity
 */
export async function dashpayProfile(identityId, globalOpts) {
  const spinner = ora('Fetching DashPay profile...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const profile = await sdk.dashpay.getProfile(identityId);

    if (!profile) {
      spinner.fail('No DashPay profile found for this identity');
      return;
    }

    spinner.succeed('Profile fetched');

    const data = profile.toJSON ? profile.toJSON() : profile;
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
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    // Get both sent and received contact requests
    spinner.text = 'Fetching contact requests...';

    const [sentRequests, receivedRequests] = await Promise.all([
      sdk.dashpay.getContactRequestsSent(identityId, { limit: 50 }),
      sdk.dashpay.getContactRequestsReceived(identityId, { limit: 50 }),
    ]);

    const sentCount = sentRequests?.length || 0;
    const receivedCount = receivedRequests?.length || 0;

    spinner.succeed(`Found ${chalk.cyan(sentCount + receivedCount)} contact requests`);

    if (sentCount === 0 && receivedCount === 0) {
      console.log(chalk.gray('\nNo contacts found for this identity.'));
      return;
    }

    if (sentCount > 0) {
      console.log(chalk.bold.cyan('\nSent Contact Requests:'));
      console.log(chalk.gray('─'.repeat(50)));

      for (const req of sentRequests) {
        const data = req.toJSON ? req.toJSON() : req;
        const props = data.data || data;
        console.log(`  ${chalk.gray('To:')} ${formatIdentityId(props.toUserId || 'N/A')}`);
        console.log(`    ${chalk.gray('Status:')} ${chalk.yellow('Pending')}`);
      }
    }

    if (receivedCount > 0) {
      console.log(chalk.bold.cyan('\nReceived Contact Requests:'));
      console.log(chalk.gray('─'.repeat(50)));

      for (const req of receivedRequests) {
        const data = req.toJSON ? req.toJSON() : req;
        const props = data.data || data;
        console.log(`  ${chalk.gray('From:')} ${formatIdentityId(data.$ownerId || 'N/A')}`);
        console.log(`    ${chalk.gray('Status:')} ${chalk.yellow('Pending')}`);
      }
    }

    console.log();

  } catch (err) {
    spinner.fail('Failed to fetch contacts');
    throw err;
  }
}
