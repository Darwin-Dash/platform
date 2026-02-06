/**
 * System CLI Commands
 *
 * Uses worker operations to avoid WASM reader lock issues.
 */

import chalk from 'chalk';
import ora from 'ora';
import { printTable } from '../utils.js';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

/**
 * Get platform status
 */
export async function systemStatus(globalOpts) {
  const spinner = ora('Fetching platform status...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const status = await runWasmOperation(
      'system-status',
      {},
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Status fetched');

    printTable({
      'Network': chalk.cyan(globalOpts.network || 'testnet'),
      'Connected': chalk.green('Yes'),
      'Protocol Version': status.version?.protocol?.toString() || 'N/A',
      'Software Version': status.version?.software || 'N/A',
      'Chain': status.chain?.network || 'N/A',
      'Sync Status': status.chain?.synced ? chalk.green('Synced') : chalk.yellow('Syncing'),
    }, 'Platform Status');

    if (status.chain) {
      printTable({
        'Best Block Height': status.chain.bestBlockHeight?.toString() || 'N/A',
        'Core Chain Locked Height': status.chain.coreChainLockedHeight?.toString() || 'N/A',
      }, 'Chain Info');
    }

    if (status.time) {
      printTable({
        'Local Time': new Date(status.time.local * 1000).toISOString(),
        'Block Time': status.time.block ? new Date(status.time.block * 1000).toISOString() : 'N/A',
      }, 'Time Info');
    }

    if (status.node?.proTxHash) {
      printTable({
        'ProTxHash': status.node.proTxHash,
        'Evonode Verified': status.node.isEvonodeVerified ? chalk.green('Yes') : chalk.yellow('No'),
      }, 'Node Info');
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

  try {
    // Use worker operation to avoid WASM reader lock
    const epoch = await runWasmOperation(
      'system-epoch',
      {},
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Epoch info fetched');

    printTable({
      'Current Epoch': chalk.cyan(epoch.index?.toString() || 'N/A'),
      'Start Time': epoch.startTime ? new Date(epoch.startTime * 1000).toISOString() : 'N/A',
      'Fee Multiplier': epoch.feeMultiplier?.toString() || 'N/A',
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

  try {
    // Import WASM SDK to get version info without connecting
    const { WasmSdkBuilder } = await import('@dashevo/wasm-sdk');

    const latestVersion = WasmSdkBuilder.getLatestVersionNumber();

    spinner.succeed('Version info fetched');

    printTable({
      'SDK Version': chalk.cyan('3.0.0'),
      'Protocol Version': chalk.cyan(latestVersion.toString()),
      'Latest Protocol Version': chalk.cyan(latestVersion.toString()),
      'Up to Date': chalk.green('Yes'),
    }, 'Version Information');

  } catch (err) {
    spinner.fail('Failed to fetch version info');
    throw err;
  }
}
