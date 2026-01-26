/**
 * Tokens CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatIdentityId,
  printTable,
  success,
} from '../utils.js';

/**
 * Get token balances for an identity
 */
export async function tokensBalance(options, globalOpts) {
  const { identity, token } = options;

  const spinner = ora('Fetching token balances...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    if (token) {
      // Get specific token balance
      const balances = await sdk.identities.tokenBalances(identity, [token]);

      spinner.succeed('Balance fetched');

      const balance = balances?.[0] || balances?.get?.(token) || 0;

      printTable({
        'Identity': formatIdentityId(identity),
        'Token ID': formatIdentityId(token),
        'Balance': chalk.green(balance.toString()),
      }, 'Token Balance');

    } else {
      // Get all token info - query known tokens
      spinner.text = 'Querying token information...';

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
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    const supply = await sdk.tokens.totalSupply(tokenId);

    spinner.succeed('Supply fetched');

    printTable({
      'Token ID': formatIdentityId(tokenId),
      'Total Supply': chalk.green(supply?.toString() || '0'),
    }, 'Token Supply');

  } catch (err) {
    spinner.fail('Failed to fetch supply');
    throw err;
  }
}
