// Wait for the SDK to be available globally (loaded from evo-sdk.module.js)
async function initDashboardWhenReady() {
  // DOM elements
  const statusElement = document.getElementById('status');
  const versionElement = document.getElementById('version');
  const resultsElement = document.getElementById('results');
  const logsElement = document.getElementById('logs');
  const connectBtn = document.getElementById('connectBtn');
  const queryBtn = document.getElementById('queryBtn');

  // Logging utility
  function log(message, type = 'info') {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${hours}:${minutes}:${seconds}`;
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    logsElement.appendChild(logEntry);
    logsElement.scrollTop = logsElement.scrollHeight;
  }

  // Initialize SDK
  let sdk = null;

  async function initializeSDK() {
    try {
      // Disable connect button immediately to prevent multiple clicks
      connectBtn.disabled = true;

      log('Initializing SDK...', 'info');

      // Access the EvoSDK from the global scope (loaded via script tag)
      // The SDK should be available as a module after loading evo-sdk.module.js
      const module = await import('../dist/evo-sdk.module.js');
      const { EvoSDK } = module;

      log('SDK loaded, creating testnet instance...', 'info');

      // Create SDK instance connected to testnet
      sdk = EvoSDK.testnetTrusted();

      log('SDK created, connecting to testnet...', 'info');
      statusElement.textContent = 'Connecting...';
      statusElement.className = 'status connecting';

      // Connect to the network
      await sdk.connect();

      log('Connected to Dash Platform testnet', 'success');
      statusElement.textContent = 'Connected';
      statusElement.className = 'status connected';

      // Get and display version
      const version = sdk.version();
      versionElement.textContent = version;
      log(`SDK Version: ${version}`, 'success');

      // Get platform status
      const platformStatus = await sdk.system.status();
      log(`Platform Status: ${JSON.stringify(platformStatus)}`, 'success');

      queryBtn.disabled = false;

    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      statusElement.textContent = 'Connection Failed';
      statusElement.className = 'status error';
      console.error(error);
      // Keep button disabled on error (user needs to refresh to retry)
    }
  }

  async function performQuery() {
    if (!sdk) {
      log('SDK not initialized. Click "Connect" first.', 'error');
      return;
    }

    try {
      log('Fetching platform status...', 'info');
      resultsElement.innerHTML = '<p>Loading...</p>';

      // Get system status
      const systemStatus = await sdk.system.status();

      log('Successfully fetched system information', 'success');

      // Display results
      const results = document.createElement('div');
      results.className = 'result-section';
      results.innerHTML = `
        <h3>System Information</h3>
        <pre>${JSON.stringify(systemStatus, null, 2)}</pre>
      `;
      resultsElement.innerHTML = '';
      resultsElement.appendChild(results);

    } catch (error) {
      log(`Query error: ${error.message}`, 'error');
      resultsElement.innerHTML = `<div class="error-box">
        <strong>Query Error:</strong><br>
        ${error.message}
      </div>`;
      console.error(error);
    }
  }

  // Event listeners
  connectBtn.addEventListener('click', initializeSDK);
  queryBtn.addEventListener('click', performQuery);

  // Log initial state
  log('Demo ready. Click "Connect to Dash Platform" to begin.', 'info');
  log('This demo uses the js-evo-sdk to connect to Dash Platform testnet.', 'info');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardWhenReady);
} else {
  initDashboardWhenReady();
}
