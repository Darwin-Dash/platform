/**
 * Tokens CLI Commands
 *
 * Uses worker operations to avoid WASM reader lock issues.
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  formatIdentityId,
  printTable,
} from '../utils.js';
import { runWasmOperation } from '../../../dist/identities/utils/wasm-worker-runner.js';

/**
 * Get token balances for an identity
 */
export async function tokensBalance(options, globalOpts) {
  const { identity, token } = options;

  const spinner = ora('Fetching token balances...').start();

  try {
    if (token) {
      // Use worker operation to avoid WASM reader lock
      const result = await runWasmOperation(
        'token-identity-balances',
        {
          identityId: identity,
          tokenIds: [token],
        },
        { network: globalOpts.network || 'testnet' }
      );

      spinner.succeed('Balance fetched');

      const balance = result.balances?.[token] || '0';

      printTable({
        'Identity': formatIdentityId(identity),
        'Token ID': formatIdentityId(token),
        'Balance': chalk.green(balance),
      }, 'Token Balance');

    } else {
      // For now, show a message about querying specific tokens
      spinner.info('Specify a token ID with --token to get balance');

      console.log(chalk.gray('\nUsage example:'));
      console.log(chalk.cyan('  evo-sdk tokens balance -i <identityId> -t <tokenId>'));
    }

  } catch (err) {
    spinner.fail('Failed to fetch balances');
    throw err;
  }
}

/**
 * Get total supply of a token
 */
export async function tokensSupply(tokenId, globalOpts) {
  const spinner = ora('Fetching token supply...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'token-total-supply',
      { tokenId },
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Supply fetched');

    printTable({
      'Token ID': formatIdentityId(tokenId),
      'Total Supply': chalk.green(result.totalSupply || '0'),
    }, 'Token Supply');

  } catch (err) {
    spinner.fail('Failed to fetch supply');
    throw err;
  }
}
