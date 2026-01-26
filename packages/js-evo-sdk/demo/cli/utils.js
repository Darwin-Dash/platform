/**
 * CLI Utility Functions
 */

import chalk from 'chalk';
import ora from 'ora';
import { EvoSDK } from '../../dist/evo-sdk.module.js';

/**
 * Create and connect SDK instance
 * @param {object} globalOpts - Global options from commander
 * @returns {Promise<EvoSDK>} Connected SDK instance
 */
export async function createConnectedSDK(globalOpts) {
  const spinner = ora('Connecting to Dash Platform...').start();

  try {
    const network = globalOpts.network || 'testnet';
    const sdk = new EvoSDK({
      network,
      logs: globalOpts.verbose ? 'info' : 'error',
    });

    await sdk.connect();
    spinner.succeed(`Connected to ${chalk.cyan(network)}`);
    return sdk;
  } catch (error) {
    spinner.fail('Failed to connect');
    throw error;
  }
}

/**
 * Format credits/duffs as DASH amount
 * @param {number|bigint} duffs - Amount in duffs
 * @returns {string} Formatted string
 */
export function formatDash(duffs) {
  const amount = typeof duffs === 'bigint' ? duffs : BigInt(duffs);
  const dash = Number(amount) / 100_000_000;
  return `${dash.toFixed(8)} DASH (${amount.toLocaleString()} duffs)`;
}

/**
 * Format credits (Platform credits = duffs * 1000)
 * @param {number|bigint} credits - Credits amount
 * @returns {string} Formatted string
 */
export function formatCredits(credits) {
  const amount = typeof credits === 'bigint' ? credits : BigInt(credits);
  return `${amount.toLocaleString()} credits`;
}

/**
 * Format identity ID with truncation
 * @param {string} id - Identity ID
 * @param {boolean} full - Show full ID
 * @returns {string} Formatted ID
 */
export function formatIdentityId(id, full = false) {
  if (full || id.length <= 20) return id;
  return `${id.slice(0, 8)}...${id.slice(-8)}`;
}

/**
 * Print a table-like output
 * @param {object} data - Key-value pairs to display
 * @param {string} title - Optional title
 */
export function printTable(data, title) {
  if (title) {
    console.log(chalk.bold.cyan(`\n${title}`));
    console.log(chalk.gray('─'.repeat(50)));
  }

  const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

  for (const [key, value] of Object.entries(data)) {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(`  ${chalk.gray(paddedKey)}  ${value}`);
  }

  console.log();
}

/**
 * Print JSON with syntax highlighting
 * @param {any} obj - Object to print
 */
export function printJson(obj) {
  const json = JSON.stringify(obj, null, 2);
  // Simple syntax highlighting
  const highlighted = json
    .replace(/"([^"]+)":/g, chalk.cyan('"$1":'))
    .replace(/: "([^"]+)"/g, `: ${chalk.green('"$1"')}`)
    .replace(/: (\d+)/g, `: ${chalk.yellow('$1')}`)
    .replace(/: (true|false)/g, `: ${chalk.magenta('$1')}`)
    .replace(/: (null)/g, `: ${chalk.gray('$1')}`);

  console.log(highlighted);
}

/**
 * Print success message
 * @param {string} message - Success message
 */
export function success(message) {
  console.log(chalk.green('✓'), message);
}

/**
 * Print error message
 * @param {string} message - Error message
 */
export function error(message) {
  console.log(chalk.red('✗'), message);
}

/**
 * Print warning message
 * @param {string} message - Warning message
 */
export function warn(message) {
  console.log(chalk.yellow('!'), message);
}

/**
 * Print info message
 * @param {string} message - Info message
 */
export function info(message) {
  console.log(chalk.blue('i'), message);
}

/**
 * Create a progress callback for SDK operations
 * @param {ora.Ora} spinner - Ora spinner instance
 * @returns {function} Progress callback
 */
export function createProgressCallback(spinner) {
  return (event) => {
    if (event.message) {
      spinner.text = event.message;
    }
    if (event.phase) {
      spinner.text = `[${event.phase}] ${event.message || ''}`;
    }
  };
}

/**
 * Validate mnemonic format
 * @param {string} mnemonic - Mnemonic to validate
 * @throws {Error} If invalid
 */
export function validateMnemonic(mnemonic) {
  if (!mnemonic) {
    throw new Error('Mnemonic is required. Use --mnemonic or set MNEMONIC environment variable.');
  }

  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12) {
    throw new Error(`Invalid mnemonic: expected 12 words, got ${words.length}`);
  }
}

/**
 * Parse amount (duffs) from string
 * @param {string} amount - Amount string
 * @returns {number} Amount in duffs
 */
export function parseAmount(amount) {
  const parsed = parseInt(amount, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return parsed;
}
