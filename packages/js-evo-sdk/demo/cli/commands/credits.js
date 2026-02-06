/**
 * Credits CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatCredits,
  formatIdentityId,
  printTable,
  parseAmount,
  success,
} from '../utils.js';

/**
 * Transfer credits between identities
 */
export async function creditsTransfer(options, globalOpts) {
  const { from, to, amount, key } = options;
  const amountNum = parseAmount(amount);

  const spinner = ora('Transferring credits...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    // Get balances before
    spinner.text = 'Getting current balances...';
    const [senderBefore, recipientBefore] = await Promise.all([
      sdk.identities.balance(from),
      sdk.identities.balance(to),
    ]);

    spinner.text = 'Processing transfer...';

    const result = await sdk.identities.creditTransfer({
      senderId: from,
      recipientId: to,
      amount: amountNum,
      privateKeyWif: key,
    });

    spinner.succeed('Credits transferred successfully!');

    printTable({
      'From': formatIdentityId(from),
      'To': formatIdentityId(to),
      'Amount': formatCredits(amountNum),
      'Sender Balance Before': formatCredits(senderBefore),
      'Sender Balance After': formatCredits(senderBefore - BigInt(amountNum)),
      'Recipient Balance Before': formatCredits(recipientBefore),
      'Recipient Balance After': formatCredits(recipientBefore + BigInt(amountNum)),
    }, 'Transfer Complete');

  } catch (err) {
    spinner.fail('Transfer failed');
    throw err;
  }
}

/**
 * Withdraw credits to blockchain address
 */
export async function creditsWithdraw(options, globalOpts) {
  const { identity, to, amount, key } = options;
  const amountNum = parseAmount(amount);

  const spinner = ora('Processing withdrawal...').start();
  let sdk;

  try {
    sdk = await createConnectedSDK(globalOpts);

    // Get balance before
    spinner.text = 'Getting current balance...';
    const balanceBefore = await sdk.identities.balance(identity);

    spinner.text = 'Processing withdrawal...';

    const result = await sdk.identities.creditWithdrawal({
      identityId: identity,
      toAddress: to,
      amount: amountNum,
      privateKeyWif: key,
    });

    spinner.succeed('Withdrawal submitted!');

    printTable({
      'Identity': formatIdentityId(identity),
      'To Address': to,
      'Amount': formatCredits(amountNum),
      'Balance Before': formatCredits(balanceBefore),
      'Expected Balance After': formatCredits(balanceBefore - BigInt(amountNum)),
      'Status': chalk.yellow('Pending (requires blockchain confirmations)'),
    }, 'Withdrawal Request');

    console.log(chalk.gray('\nNote: Withdrawals require multiple blockchain confirmations.'));
    console.log(chalk.gray('Monitor your address for the incoming transaction.\n'));

  } catch (err) {
    spinner.fail('Withdrawal failed');
    throw err;
  }
}
