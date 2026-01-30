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

/**
 * Get token statuses
 */
export async function tokensStatus(tokenIds, globalOpts) {
  const spinner = ora('Fetching token statuses...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'token-statuses',
      { tokenIds: Array.isArray(tokenIds) ? tokenIds : [tokenIds] },
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Statuses fetched');

    const statuses = result.statuses || {};
    const tokenList = Object.keys(statuses);

    if (tokenList.length === 0) {
      console.log(chalk.yellow('\nNo token statuses found'));
      return;
    }

    console.log(chalk.cyan('\nToken Statuses:'));
    console.log(chalk.gray('─'.repeat(60)));

    for (const [tokenId, status] of Object.entries(statuses)) {
      printTable({
        'Token ID': formatIdentityId(tokenId),
        'Status': chalk.green(status || 'Unknown'),
      }, '');
    }

  } catch (err) {
    spinner.fail('Failed to fetch statuses');
    throw err;
  }
}

/**
 * Get token contract info
 */
export async function tokensContractInfo(contractId, globalOpts) {
  const spinner = ora('Fetching token contract info...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'token-contract-info',
      { contractId },
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Contract info fetched');

    if (!result.contractInfo) {
      console.log(chalk.yellow('\nToken contract not found'));
      return;
    }

    const info = result.contractInfo;
    printTable({
      'Contract ID': formatIdentityId(contractId),
      'Owner ID': formatIdentityId(info.ownerId || 'Unknown'),
      'Token Count': chalk.green(info.tokenCount || '1'),
      ...(info.name && { 'Name': info.name }),
      ...(info.description && { 'Description': info.description }),
    }, 'Token Contract Info');

  } catch (err) {
    spinner.fail('Failed to fetch contract info');
    throw err;
  }
}

/**
 * Get direct purchase prices for tokens
 */
export async function tokensPrices(tokenIds, globalOpts) {
  const spinner = ora('Fetching direct purchase prices...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'token-direct-purchase-prices',
      { tokenIds: Array.isArray(tokenIds) ? tokenIds : [tokenIds] },
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Prices fetched');

    const prices = result.prices || {};
    const tokenList = Object.keys(prices);

    if (tokenList.length === 0) {
      console.log(chalk.yellow('\nNo price information found'));
      return;
    }

    console.log(chalk.cyan('\nDirect Purchase Prices:'));
    console.log(chalk.gray('─'.repeat(60)));

    for (const [tokenId, priceInfo] of Object.entries(prices)) {
      printTable({
        'Token ID': formatIdentityId(tokenId),
        'Price': chalk.green(priceInfo?.price?.toString() || 'N/A'),
        'Currency': priceInfo?.currency || 'Credits',
      }, '');
    }

  } catch (err) {
    spinner.fail('Failed to fetch prices');
    throw err;
  }
}

/**
 * Get token info for an identity
 */
export async function tokensIdentityInfo(options, globalOpts) {
  const { identity, tokens } = options;
  const tokenIds = tokens ? tokens.split(',').map(t => t.trim()) : [];

  if (tokenIds.length === 0) {
    console.log(chalk.red('Error: At least one token ID is required'));
    return;
  }

  const spinner = ora('Fetching identity token info...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'token-identity-token-infos',
      { identityId: identity, tokenIds },
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Token info fetched');

    const infos = result.tokenInfos || {};
    const tokenList = Object.keys(infos);

    if (tokenList.length === 0) {
      console.log(chalk.yellow('\nNo token info found for identity'));
      return;
    }

    console.log(chalk.cyan(`\nToken Info for ${formatIdentityId(identity)}:`));
    console.log(chalk.gray('─'.repeat(60)));

    for (const [tokenId, info] of Object.entries(infos)) {
      printTable({
        'Token ID': formatIdentityId(tokenId),
        'Balance': chalk.green(info?.balance?.toString() || '0'),
        'Frozen': info?.frozen ? chalk.red('Yes') : chalk.green('No'),
      }, '');
    }

  } catch (err) {
    spinner.fail('Failed to fetch token info');
    throw err;
  }
}

/**
 * Calculate token ID from contract ID and position
 */
export async function tokensCalculateId(contractId, position, globalOpts) {
  const spinner = ora('Calculating token ID...').start();

  try {
    // Use worker operation to avoid WASM reader lock
    const result = await runWasmOperation(
      'token-calculate-id',
      { contractId, tokenPosition: parseInt(position, 10) },
      { network: globalOpts.network || 'testnet' }
    );

    spinner.succeed('Token ID calculated');

    printTable({
      'Contract ID': formatIdentityId(contractId),
      'Token Position': chalk.cyan(position),
      'Token ID': chalk.green(result.tokenId),
    }, 'Calculated Token ID');

  } catch (err) {
    spinner.fail('Failed to calculate token ID');
    throw err;
  }
}
