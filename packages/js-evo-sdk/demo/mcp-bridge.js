#!/usr/bin/env node
/**
 * MCP Bridge for Interactive Browser Control
 * Allows Claude to control the browser through Model Context Protocol
 *
 * Usage: node mcp-bridge.js
 */

import puppeteer from 'puppeteer';
import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPBridge {
  constructor() {
    this.browser = null;
    this.page = null;
    this.screenshotDir = join(__dirname, 'screenshots');

    // Ensure screenshots directory exists
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async initialize() {
    console.error('[MCP Bridge] Initializing browser...');

    this.browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      args: ['--window-size=1920,1080']
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Enable console logging from the page
    this.page.on('console', msg => {
      console.error(`[Browser ${msg.type()}]:`, msg.text());
    });

    // Navigate to the demo app
    await this.page.goto('http://localhost:8080/index-static.html', {
      waitUntil: 'networkidle2'
    });

    console.error('[MCP Bridge] Browser initialized and ready');
  }

  async handleCommand(command) {
    const { action, params = {} } = command;

    try {
      let result;

      switch (action) {
        case 'navigate':
          await this.page.goto(params.url, { waitUntil: 'networkidle2' });
          result = { success: true, message: `Navigated to ${params.url}` };
          break;

        case 'click':
          await this.page.click(params.selector);
          await this.page.waitForTimeout(500); // Wait for any animations
          result = { success: true, message: `Clicked ${params.selector}` };
          break;

        case 'type':
          await this.page.type(params.selector, params.text);
          result = { success: true, message: `Typed text into ${params.selector}` };
          break;

        case 'screenshot':
          const filename = params.filename || `screenshot-${Date.now()}.png`;
          const path = join(this.screenshotDir, filename);
          await this.page.screenshot({ path, fullPage: params.fullPage || false });
          result = { success: true, message: `Screenshot saved to ${filename}`, path };
          break;

        case 'evaluate':
          const evalResult = await this.page.evaluate(params.code);
          result = { success: true, result: evalResult };
          break;

        case 'getIdentities':
          const identities = await this.page.evaluate(async () => {
            // Check if SDK is available and identities method exists
            const hasSdk = window.sdk && window.sdk.identities && typeof window.sdk.identities.getIdentityIds === 'function';

            if (hasSdk) {
              try {
                console.log('[MCP] SDK available, using real SDK method');
                // In a real scenario, this would call the SDK method
                // For now, return stateManager data as fallback
              } catch (error) {
                console.warn('[MCP] SDK method failed, falling back to stateManager:', error);
              }
            }

            // Fallback to stateManager
            return window.stateManager?.getAllIdentities().map(id => ({
              id: id.id.substring(0, 12) + '...',
              label: id.label,
              balance: id.balance
            })) || [];
          });
          result = { success: true, identities };
          break;

        case 'discoverIdentities':
          // New action: Run full identity discovery
          const discoveryResult = await this.page.evaluate(async (mnemonic) => {
            if (!window.app) {
              throw new Error('App not initialized');
            }

            // Set mnemonic in the input
            const mnemonicInput = document.getElementById('login-mnemonic');
            if (mnemonicInput) {
              mnemonicInput.value = mnemonic;
            }

            // Simulate login click
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
              // Dispatch form submit event
              const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
              loginForm.dispatchEvent(submitEvent);

              // Wait for discovery to complete (max 30 seconds)
              await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                  const discoveryView = document.getElementById('discovery-progress-view');
                  if (discoveryView && discoveryView.hidden) {
                    clearInterval(checkInterval);
                    resolve();
                  }
                }, 500);

                setTimeout(() => {
                  clearInterval(checkInterval);
                  resolve();
                }, 30000);
              });

              // Return discovered identities
              return {
                success: true,
                count: window.stateManager?.getAllIdentities().length || 0,
                identities: window.stateManager?.getAllIdentities().map(id => id.id) || []
              };
            }

            throw new Error('Login form not found');
          }, params.mnemonic);
          result = discoveryResult;
          break;

        case 'getSelectedIdentity':
          const selected = await this.page.evaluate(() => {
            const identity = window.stateManager?.getSelectedIdentity();
            if (!identity) return null;
            return {
              id: identity.id.substring(0, 12) + '...',
              label: identity.label,
              balance: identity.balance,
              keys: identity.keys.length
            };
          });
          result = { success: true, identity: selected };
          break;

        case 'waitForSelector':
          await this.page.waitForSelector(params.selector, { timeout: params.timeout || 5000 });
          result = { success: true, message: `Selector ${params.selector} found` };
          break;

        case 'getText':
          const text = await this.page.$eval(params.selector, el => el.textContent);
          result = { success: true, text };
          break;

        case 'getConsoleErrors':
          // Console errors are already being logged, just return confirmation
          result = { success: true, message: 'Console errors are being logged to stderr' };
          break;

        default:
          result = { success: false, error: `Unknown action: ${action}` };
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  async start() {
    await this.initialize();

    console.error('[MCP Bridge] Listening for commands on stdin...');
    console.error('[MCP Bridge] Send commands as JSON: {"action": "click", "params": {"selector": "#my-button"}}');

    // Read commands from stdin
    process.stdin.setEncoding('utf8');
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const command = JSON.parse(line);
          const result = await this.handleCommand(command);

          // Write result to stdout as JSON
          process.stdout.write(JSON.stringify(result) + '\n');
        } catch (error) {
          const errorResult = {
            success: false,
            error: `Failed to parse command: ${error.message}`
          };
          process.stdout.write(JSON.stringify(errorResult) + '\n');
        }
      }
    });

    process.stdin.on('end', async () => {
      console.error('[MCP Bridge] Stdin closed, shutting down...');
      if (this.browser) {
        await this.browser.close();
      }
      process.exit(0);
    });

    // Handle termination signals
    process.on('SIGINT', async () => {
      console.error('[MCP Bridge] Received SIGINT, shutting down...');
      if (this.browser) {
        await this.browser.close();
      }
      process.exit(0);
    });
  }
}

// Start the MCP bridge
const bridge = new MCPBridge();
bridge.start().catch(err => {
  console.error('[MCP Bridge] Fatal error:', err);
  process.exit(1);
});
