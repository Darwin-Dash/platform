/**
 * Onboard CLI Command - Full Workflow
 */

import chalk from 'chalk';
import ora from 'ora';
import {
  createConnectedSDK,
  formatCredits,
  formatIdentityId,
  printTable,
  validateMnemonic,
  parseAmount,
  createProgressCallback,
  success,
  warn,
} from '../utils.js';

/**
 * Full onboarding workflow
 * 1. Create identity
 * 2. Register DPNS name
 * 3. Create DashPay profile (optional)
 */
export async function onboard(options, globalOpts) {
  validateMnemonic(options.mnemonic);
  const amount = parseAmount(options.amount);

  console.log(chalk.bold.cyan('\nDash Platform Onboarding'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(chalk.gray('This will:'));
  console.log(chalk.gray('  1. Create a new identity'));
  console.log(chalk.gray('  2. Register a DPNS name'));
  if (options.displayName) {
    console.log(chalk.gray('  3. Create a DashPay profile'));
  }
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  let sdk;
  let identityId;
  let privateKeyWif;

  try {
    // Step 1: Create Identity
    const createSpinner = ora('Step 1/3: Creating identity...').start();

    try {
      sdk = await createConnectedSDK(globalOpts);

      createSpinner.text = 'Finding UTXOs and creating identity...';

      const createResult = await sdk.identities.createWithWallet(
        options.mnemonic,
        amount,
        {
          onProgress: createProgressCallback(createSpinner),
        }
      );

      identityId = createResult.identityId;
      privateKeyWif = createResult.privateKeyWif;

      createSpinner.succeed(`Identity created: ${chalk.green(formatIdentityId(identityId))}`);

      printTable({
        'Identity ID': chalk.green(identityId),
        'Balance': formatCredits(amount * 1000),
      });

    } catch (err) {
      createSpinner.fail('Identity creation failed');
      throw err;
    }

    // Step 2: Register DPNS Name
    const dpnsSpinner = ora('Step 2/3: Registering DPNS name...').start();

    try {
      dpnsSpinner.text = 'Checking name availability...';
      const isAvailable = await sdk.dpns.isAvailable(options.name, 'dash');

      if (!isAvailable) {
        dpnsSpinner.warn(`Name "${options.name}.dash" is not available, skipping...`);
        warn(`You can register a different name later using: evo-sdk dpns register --name <name> --identity ${identityId}`);
      } else {
        dpnsSpinner.text = 'Registering name...';

        await sdk.dpns.register({
          label: options.name,
          identityId,
          privateKeyWif,
        });

        dpnsSpinner.succeed(`Name registered: ${chalk.green(options.name + '.dash')}`);
      }

    } catch (err) {
      dpnsSpinner.fail('Name registration failed (identity still created)');
      console.error(chalk.gray(`Error: ${err.message}`));
      console.log(chalk.gray(`You can retry later with: evo-sdk dpns register --name ${options.name} --identity ${identityId}`));
    }

    // Step 3: Create DashPay Profile (if display name provided)
    if (options.displayName) {
      const profileSpinner = ora('Step 3/3: Creating DashPay profile...').start();

      try {
        profileSpinner.text = 'Creating profile...';

        await sdk.dashpay.createProfile({
          identityId,
          displayName: options.displayName,
          publicMessage: `Hello, I'm ${options.displayName}!`,
          privateKeyWif,
        });

        profileSpinner.succeed(`Profile created with name: ${chalk.green(options.displayName)}`);

      } catch (err) {
        profileSpinner.fail('Profile creation failed (identity and name still created)');
        console.error(chalk.gray(`Error: ${err.message}`));
      }
    } else {
      console.log(chalk.gray('Step 3/3: Skipping profile creation (no --display-name provided)'));
    }

    // Summary
    console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════'));
    console.log(chalk.bold.green('Onboarding Complete!'));
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════\n'));

    printTable({
      'Identity ID': chalk.green(identityId),
      'DPNS Name': chalk.green(`${options.name}.dash`),
      'Display Name': options.displayName ? chalk.green(options.displayName) : chalk.gray('Not set'),
      'Balance': formatCredits(amount * 1000),
    }, 'Your Dash Platform Identity');

    console.log(chalk.gray('You can now:'));
    console.log(chalk.gray('  - Send and receive credits'));
    console.log(chalk.gray('  - Create documents on Dash Platform'));
    console.log(chalk.gray('  - Be found by your name: ') + chalk.cyan(`${options.name}.dash`));
    console.log();

    success(`Welcome to Dash Platform, ${options.displayName || options.name}!`);

  } catch (err) {
    console.error(chalk.red('\nOnboarding failed:'), err.message);

    if (identityId) {
      console.log(chalk.yellow('\nPartial success:'));
      console.log(chalk.gray(`  Identity was created: ${identityId}`));
      console.log(chalk.gray('  You can continue manually with:'));
      console.log(chalk.gray(`    evo-sdk dpns register --name ${options.name} --identity ${identityId} --key <key>`));
    }

    throw err;
  }
}
