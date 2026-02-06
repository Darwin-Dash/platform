#!/usr/bin/env node
/**
 * Dash Platform SDK - Interactive TUI
 *
 * An interactive terminal user interface for exploring and interacting
 * with Dash Platform using the js-evo-sdk.
 *
 * Usage:
 *   yarn demo:tui                    # Start with default testnet
 *   yarn demo:tui --network mainnet  # Connect to mainnet
 *   yarn demo:tui --help             # Show help
 */

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './App.js';

const cli = meow(`
  Usage
    $ yarn demo:tui [options]

  Options
    --network, -n    Network to connect to (testnet, mainnet, local)
                     Default: testnet
    --help           Show this help message
    --version        Show version

  Examples
    $ yarn demo:tui
    $ yarn demo:tui --network mainnet
    $ yarn demo:tui -n local

  Navigation
    - Use arrow keys to navigate menus
    - Press Enter to select an option
    - Press Escape to go back
    - Press 'q' to quit from main menu
    - Press Ctrl+C to exit at any time
`, {
  importMeta: import.meta,
  flags: {
    network: {
      type: 'string',
      shortFlag: 'n',
      default: 'testnet',
      choices: ['testnet', 'mainnet', 'local'],
    },
  },
});

// Validate network
const validNetworks = ['testnet', 'mainnet', 'local'];
if (!validNetworks.includes(cli.flags.network)) {
  console.error(`Invalid network: ${cli.flags.network}`);
  console.error(`Valid networks: ${validNetworks.join(', ')}`);
  process.exit(1);
}

// Render the TUI
const { waitUntilExit } = render(
  React.createElement(App, { network: cli.flags.network })
);

// Wait for the app to exit
waitUntilExit().then(() => {
  process.exit(0);
});
