/**
 * System CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  printTable,
  success,
} from '../utils.js';

/**
 * Get platform status
 */
export async function systemStatus(globalOpts) {
  const spinner = ora('Fetching platform status...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const status = await sdk.system.status();

    spinner.succeed('Status fetched');

    // Extract status info
    const data = status?.toJSON?.() || status || {};

    printTable({
      'Network': chalk.cyan(globalOpts.network || 'testnet'),
      'Connected': chalk.green('Yes'),
      'Protocol Version': data.version?.protocol?.toString() || 'N/A',
      'Software Version': data.version?.software || 'N/A',
      'Chain': data.chain?.network || 'N/A',
      'Sync Status': data.chain?.synced ? chalk.green('Synced') : chalk.yellow('Syncing'),
    }, 'Platform Status');

    if (data.chain) {
      printTable({
        'Best Block Height': data.chain.bestBlockHeight?.toString() || 'N/A',
        'Core Chain Locked Height': data.chain.coreChainLockedHeight?.toString() || 'N/A',
      }, 'Chain Info');
    }

    if (data.time) {
      printTable({
        'Local Time': new Date(data.time.local * 1000).toISOString(),
        'Block Time': data.time.block ? new Date(data.time.block * 1000).toISOString() : 'N/A',
      }, 'Time Info');
    }

  } catch (err) {
    spinner.fail('Failed to fetch status');
    throw err;
  }
}

/**
 * Get current epoch information
 */
export async function systemEpoch(globalOpts) {
  const spinner = ora('Fetching epoch info...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const epoch = await sdk.epoch.current();

    spinner.succeed('Epoch info fetched');

    const data = epoch?.toJSON?.() || epoch || {};

    printTable({
      'Current Epoch': chalk.cyan(data.index?.toString() || data.epochIndex?.toString() || 'N/A'),
      'Start Time': data.startTime ? new Date(data.startTime * 1000).toISOString() : 'N/A',
      'Fee Multiplier': data.feeMultiplier?.toString() || 'N/A',
    }, 'Epoch Information');

  } catch (err) {
    spinner.fail('Failed to fetch epoch info');
    throw err;
  }
}

/**
 * Get protocol version
 */
export async function systemVersion(globalOpts) {
  const spinner = ora('Fetching version info...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const version = sdk.version();
    const latestVersion = await sdk.constructor.getLatestVersionNumber();

    spinner.succeed('Version info fetched');

    printTable({
      'SDK Version': chalk.cyan('3.0.0'),
      'Protocol Version': chalk.cyan(version.toString()),
      'Latest Protocol Version': chalk.cyan(latestVersion.toString()),
      'Up to Date': version >= latestVersion ? chalk.green('Yes') : chalk.yellow('No'),
    }, 'Version Information');

  } catch (err) {
    spinner.fail('Failed to fetch version info');
    throw err;
  }
}
